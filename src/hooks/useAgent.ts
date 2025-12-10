/**
 * useAgent Hook - Agent 核心逻辑
 *
 * 整合所有优化：
 * - 上下文预注入
 * - 并行工具执行
 * - 会话管理
 * - 思考过程追踪
 */

import { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { processUserCommand, continueWithToolResults, AgentMessage } from '@/services/agentService';
import { buildEnhancedContext } from '@/services/contextBuilder';
import { ParallelExecutor, ExecutionProgress } from '@/services/parallelExecutor';
import { SessionManager } from '@/services/sessionManager';
import { ThinkingStep } from '@/components/agent/ThinkingProcess';
import { StoreCallbacks } from '@/services/agentTools';
import { toast } from 'sonner';

export interface UseAgentResult {
  isProcessing: boolean;
  thinkingSteps: ThinkingStep[];
  summary: string;
  sendMessage: (message: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

export function useAgent(): UseAgentResult {
  const {
    project,
    currentSceneId,
    selectedShotId,
    addScene,
    addShot,
    updateShot,
    addGenerationHistory,
    addGridHistory,
    renumberScenesAndShots,
    addChatMessage,
    clearChatHistory
  } = useProjectStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [summary, setSummary] = useState('');
  const [sessionManager] = useState(() =>
    new SessionManager(project?.id || 'default')
  );
  const [lastMessageHash, setLastMessageHash] = useState<string>('');

  // Auto-update session manager when project changes
  useEffect(() => {
    if (project?.id) {
      sessionManager['projectId'] = project.id;
    }
  }, [project?.id, sessionManager]);

  // Add thinking step
  const addStep = useCallback((step: Omit<ThinkingStep, 'id' | 'timestamp'>) => {
    const newStep: ThinkingStep = {
      ...step,
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
    };
    setThinkingSteps(prev => [...prev, newStep]);
    return newStep.id;
  }, []);

  // Update thinking step
  const updateStep = useCallback((stepId: string, updates: Partial<ThinkingStep>) => {
    setThinkingSteps(prev =>
      prev.map(step => step.id === stepId ? { ...step, ...updates } : step)
    );
  }, []);

  // Send message
  const sendMessage = useCallback(async (message: string) => {
    if (!project) {
      toast.error('请先创建或打开一个项目');
      return;
    }

    // 防重复提交：计算消息哈希
    const messageHash = `${message}_${Date.now()}`;
    const simpleHash = message.trim().toLowerCase();

    // 检查是否在处理中或与上次消息相同（2秒内）
    if (isProcessing) {
      toast.warning('正在处理中，请稍候...');
      return;
    }

    // 简单的去重：如果上次消息相同且时间间隔小于2秒，忽略
    const now = Date.now();
    const lastHash = lastMessageHash.split('_')[0] || '';
    const lastTime = parseInt(lastMessageHash.split('_')[1] || '0');
    if (lastHash === simpleHash && now - lastTime < 2000) {
      toast.warning('请勿重复提交');
      return;
    }

    setLastMessageHash(messageHash);
    setIsProcessing(true);
    setThinkingSteps([]);
    setSummary('');

    const startTime = Date.now();

    try {
      // Step 1: Build enhanced context (预注入)
      const stepId1 = addStep({
        type: 'thinking',
        content: '正在构建增强上下文...',
        status: 'running',
      });

      const enhancedContext = buildEnhancedContext(project, currentSceneId ?? undefined, selectedShotId ?? undefined);

      updateStep(stepId1, {
        status: 'completed',
        duration: Date.now() - startTime,
        details: `场景: ${enhancedContext.sceneCount}, 镜头: ${enhancedContext.shotCount}`,
      });

      // Step 2: Get or create session
      const stepId2 = addStep({
        type: 'thinking',
        content: '正在获取会话...',
        status: 'running',
      });

      const session = await sessionManager.startOrResume(enhancedContext);

      updateStep(stepId2, {
        status: 'completed',
        duration: Date.now() - startTime,
        details: `会话ID: ${session.id.slice(0, 16)}...`,
      });

      // Step 3: Add user message to session
      const userMessage: AgentMessage = {
        role: 'user',
        content: message,
      };
      await sessionManager.addMessage(userMessage);

      // ⭐ 保存用户消息到项目聊天历史
      addChatMessage({
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      });

      // Step 4: Call AI with enhanced context
      const stepId3 = addStep({
        type: 'thinking',
        content: '正在调用 AI 分析...',
        status: 'running',
      });

      const chatHistory = sessionManager.getMessages();
      let action = await processUserCommand(message, chatHistory, enhancedContext);

      updateStep(stepId3, {
        status: 'completed',
        duration: Date.now() - startTime,
        details: `动作类型: ${action.type}`,
      });

      // Step 5: Execute tools if needed (并行执行)
      let allToolResults: any[] = [];
      let maxIterations = 5;
      let iteration = 0;
      const allCreatedScenes = new Set<string>(); // 跟踪所有创建的场景
      const allScenesWithShots = new Set<string>(); // 跟踪所有已添加分镜的场景

      while (action.requiresToolExecution && action.toolCalls && iteration < maxIterations) {
        iteration++;

        const stepId4 = addStep({
          type: 'tool',
          content: `正在执行工具 (第${iteration}轮): ${action.toolCalls.map(t => t.name).join(', ')}`,
          status: 'running',
        });

        // 准备 Store 回调
        const storeCallbacks: StoreCallbacks = {
          addScene,
          addShot,
          updateShot,
          addGenerationHistory,
          addGridHistory,
          renumberScenesAndShots,
        };

        // ⭐ 关键修复：每次迭代都获取最新的 project 状态
        // 因为上一轮可能通过 createScene/addShot 等修改了 store
        const currentProject = useProjectStore.getState().project;

        // 使用并行执行器
        const executor = new ParallelExecutor(
          currentProject,
          storeCallbacks,
          (progress: ExecutionProgress) => {
            updateStep(stepId4, {
              details: `${progress.currentStep} (${progress.completed}/${progress.total})`,
            });
          }
        );

        const iterationStart = Date.now();
        const results = await executor.execute(action.toolCalls);
        allToolResults.push(...results);

        // 跟踪创建的场景和已添加分镜的场景
        results.forEach(r => {
          if (r.tool === 'createScene' && r.result?.sceneId) {
            allCreatedScenes.add(r.result.sceneId);
          }
          if (r.tool === 'addShots' && r.result?.sceneId) {
            allScenesWithShots.add(r.result.sceneId);
          }
        });

        // 检查是否有失败的工具调用
        const failedTools = results.filter(r => r.success === false || r.error);
        if (failedTools.length > 0) {
          console.error('失败的工具调用:', failedTools);
          failedTools.forEach(ft => {
            addStep({
              type: 'error',
              content: `工具 ${ft.tool} 失败: ${ft.error || '未知错误'}`,
              status: 'failed',
            });
          });
        }

        updateStep(stepId4, {
          status: 'completed',
          duration: Date.now() - iterationStart,
          details: `完成 ${results.length} 个工具调用${failedTools.length > 0 ? ` (${failedTools.length} 个失败)` : ''}`,
        });

        // Continue with tool results
        const stepId5 = addStep({
          type: 'thinking',
          content: '正在处理工具结果...',
          status: 'running',
        });

        const continueStart = Date.now();

        // 检查是否有未添加分镜的场景
        const pendingScenes = Array.from(allCreatedScenes).filter(id => !allScenesWithShots.has(id));

        // ⭐ 重新构建最新的上下文，确保 AI 看到最新的项目状态
        const updatedProject = useProjectStore.getState().project;
        const updatedSceneId = useProjectStore.getState().currentSceneId;
        const updatedShotId = useProjectStore.getState().selectedShotId;
        const updatedContext = buildEnhancedContext(
          updatedProject,
          updatedSceneId ?? undefined,
          updatedShotId ?? undefined
        );

        action = await continueWithToolResults(
          results.map(r => ({ tool: r.tool, result: r.result || r.error })),
          chatHistory,
          updatedContext,
          pendingScenes // 传递待处理的场景列表
        );

        updateStep(stepId5, {
          status: 'completed',
          duration: Date.now() - continueStart,
        });
      }

      // Step 6: Generate summary
      const stepId6 = addStep({
        type: 'result',
        content: '生成最终总结...',
        status: 'running',
      });

      let finalSummary = action.message || '处理完成';

      // Add tool execution summary
      if (allToolResults.length > 0) {
        const successCount = allToolResults.filter(r => r.success !== false).length;
        const failCount = allToolResults.length - successCount;
        finalSummary += `\n\n执行了 ${allToolResults.length} 个工具调用`;
        if (failCount > 0) {
          finalSummary += ` (${failCount} 个失败)`;
        }
      }

      updateStep(stepId6, {
        status: 'completed',
        duration: Date.now() - startTime,
      });

      setSummary(finalSummary);

      // Add assistant message to session
      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: finalSummary,
      };
      await sessionManager.addMessage(assistantMessage);

      // ⭐ 保存 assistant 消息到项目聊天历史（包含思考过程和工具结果）
      const thinkingStepsSummary = thinkingSteps
        .filter(step => step.type === 'thinking' || step.type === 'tool')
        .map(step => step.content)
        .join(' → ');

      addChatMessage({
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: finalSummary,
        timestamp: new Date(),
        thought: thinkingStepsSummary || undefined,
        toolResults: allToolResults.map(r => ({
          tool: r.tool,
          result: r.result,
          error: r.error,
        })),
      });

      toast.success('处理完成');

    } catch (error: any) {
      console.error('Agent error:', error);

      addStep({
        type: 'error',
        content: error.message || '处理失败',
        status: 'failed',
      });

      setSummary(`错误: ${error.message}`);
      toast.error('处理失败: ' + error.message);

    } finally {
      setIsProcessing(false);
    }
  }, [
    project,
    currentSceneId,
    selectedShotId,
    sessionManager,
    addStep,
    updateStep,
    addScene,
    addShot,
    updateShot,
    addGenerationHistory,
    addGridHistory,
    renumberScenesAndShots,
    addChatMessage,
    isProcessing,
    lastMessageHash,
  ]);

  // Clear session
  const clearSession = useCallback(async () => {
    await sessionManager.clear();
    clearChatHistory();
    setThinkingSteps([]);
    setSummary('');
    toast.info('会话已清除');
  }, [sessionManager, clearChatHistory]);

  return {
    isProcessing,
    thinkingSteps,
    summary,
    sendMessage,
    clearSession,
  };
}
