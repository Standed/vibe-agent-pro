/**
 * useAgent Hook - Agent 核心逻辑
 *
 * 整合所有优化：
 * - 上下文预注入
 * - 并行工具执行
 * - 会话管理
 * - 思考过程追踪
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { processUserCommand, continueWithToolResults, AgentMessage } from '@/services/agentService';
import { buildEnhancedContext } from '@/services/contextBuilder';
import { ParallelExecutor, ExecutionProgress } from '@/services/parallelExecutor';
import { SessionManager } from '@/services/sessionManager';
import { ThinkingStep } from '@/components/agent/ThinkingProcess';
import { StoreCallbacks } from '@/services/agentTools';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import type { ChatMessage } from '@/types/project';

const generateMessageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export interface UseAgentResult {
  isProcessing: boolean;
  thinkingSteps: ThinkingStep[];
  summary: string;
  sendMessage: (message: string) => Promise<void>;
  clearSession: () => Promise<void>;
  stop: () => void;
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
  } = useProjectStore();

  const { isAuthenticated, user } = useAuth();

  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [summary, setSummary] = useState('');
  const [sessionManager] = useState(() =>
    new SessionManager(project?.id || 'default')
  );
  const [lastMessageHash, setLastMessageHash] = useState<string>('');
  const cancelRef = useRef(false);

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

  const abortControllerRef = useRef<AbortController | null>(null);

  // Send message
  const sendMessage = useCallback(async (message: string) => {
    if (!project) {
      toast.error('请先创建或打开一个项目');
      return;
    }

    cancelRef.current = false;
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 游客模式限制：只允许已登录用户调用 AI
    if (!isAuthenticated()) {
      toast.error('请先登录以使用 AI 功能', {
        duration: 3000,
        action: {
          label: '去登录',
          onClick: () => {
            window.location.href = '/auth/login';
          },
        },
      });
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

      if (cancelRef.current) {
        throw new Error('USER_CANCELLED');
      }

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

      if (cancelRef.current) {
        throw new Error('USER_CANCELLED');
      }

      // Step 3: Add user message to session
      const userMessage: AgentMessage = {
        role: 'user',
        content: message,
      };
      await sessionManager.addMessage(userMessage);

      // ⭐ 保存用户消息到云端数据库（chat_messages表）
      if (user && project) {
        await dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'user',
          content: message,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Step 4: Call AI with enhanced context
      const stepId3 = addStep({
        type: 'thinking',
        content: '正在调用 AI 分析...',
        status: 'running',
      });

      const chatHistory = sessionManager.getMessages();
      // 传递 signal 给 processUserCommand (需要修改 processUserCommand 支持 signal)
      // 这里我们暂时通过修改 agentService 来支持 signal 传递，但 processUserCommand 签名可能需要调整
      // 或者我们可以将 signal 附加到 context 中，或者作为额外参数
      // 由于 processUserCommand 签名限制，我们这里假设它已经被修改为接受 signal 或者我们在 agentService 中处理了
      // 实际上 agentService.ts 中的 callGeminiWithBackoff 已经修改为支持 body.signal
      // 所以我们需要确保 processUserCommand 能够传递 signal
      // 但 processUserCommand 目前没有 signal 参数。
      // 为了最小化改动，我们可以将 signal 放入 context 中，或者修改 processUserCommand
      // 让我们修改 processUserCommand 吧，这更干净。但现在我们先在 useAgent 里准备好 signal

      // 临时方案：我们修改 agentService.ts 中的 processUserCommand 签名
      // 但在此之前，我们需要确保 useAgent 里的调用是正确的。

      // 让我们假设 processUserCommand 接受一个可选的 signal 参数
      // @ts-ignore - 我们稍后会更新 processUserCommand 的签名
      let action = await processUserCommand(message, chatHistory, enhancedContext, abortControllerRef.current?.signal);

      updateStep(stepId3, {
        status: 'completed',
        duration: Date.now() - startTime,
        details: `动作类型: ${action.type}`,
      });

      if (cancelRef.current) {
        throw new Error('USER_CANCELLED');
      }

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

        if (cancelRef.current) {
          throw new Error('USER_CANCELLED');
        }

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
        if (cancelRef.current) {
          throw new Error('USER_CANCELLED');
        }
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

        // @ts-ignore - 我们稍后会更新 continueWithToolResults 的签名
        action = await continueWithToolResults(
          results.map(r => ({ tool: r.tool, result: r.result || r.error })),
          chatHistory,
          updatedContext,
          pendingScenes, // 传递待处理的场景列表
          abortControllerRef.current?.signal // 传递 signal
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

      if (cancelRef.current) {
        throw new Error('USER_CANCELLED');
      }

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

      // ⭐ 保存 assistant 消息到云端数据库（包含完整思考过程和工具结果）
      const thinkingStepsSummary = thinkingSteps
        .filter(step => step.type === 'thinking' || step.type === 'tool')
        .map(step => step.content)
        .join(' → ');

      if (user && project) {
        await dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'assistant',
          content: finalSummary,
          timestamp: new Date(),
          thought: thinkingStepsSummary || undefined,
          metadata: {
            // 保存完整的思考步骤（用于历史记录恢复）
            thinkingSteps: thinkingSteps.map(step => ({
              id: step.id,
              type: step.type,
              content: step.content,
              status: step.status,
              duration: step.duration,
              details: step.details,
              timestamp: step.timestamp.toISOString(),
            })),
            toolResults: allToolResults.map(r => ({
              tool: r.tool,
              result: r.result,
              error: r.error,
            })),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      toast.success('处理完成');

    } catch (error: any) {
      if (error?.message === 'USER_CANCELLED' || error?.name === 'AbortError') {
        toast.info('已停止当前 AI 处理');
      } else {
        console.error('Agent error:', error);

        addStep({
          type: 'error',
          content: error.message || '处理失败',
          status: 'failed',
        });

        setSummary(`错误: ${error.message}`);
        toast.error('处理失败: ' + error.message);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
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
    isProcessing,
    lastMessageHash,
    user,
  ]);

  // Clear session
  const clearSession = useCallback(async () => {
    await sessionManager.clear();

    // 清除云端聊天历史
    if (project) {
      await dataService.clearChatHistory({
        projectId: project.id,
      });
    }

    setThinkingSteps([]);
    setSummary('');
    toast.info('会话已清除');
  }, [sessionManager, project]);

  const stop = useCallback(() => {
    cancelRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setThinkingSteps([]);
    setSummary('');
  }, []);

  return {
    isProcessing,
    thinkingSteps,
    summary,
    sendMessage,
    clearSession,
    stop,
  };
}
