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
import { toast } from 'sonner';

export interface UseAgentResult {
  isProcessing: boolean;
  thinkingSteps: ThinkingStep[];
  summary: string;
  sendMessage: (message: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

export function useAgent(): UseAgentResult {
  const { project, currentSceneId, selectedShotId } = useProjectStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [summary, setSummary] = useState('');
  const [sessionManager] = useState(() =>
    new SessionManager(project?.id || 'default')
  );

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

      const enhancedContext = buildEnhancedContext(project, currentSceneId, selectedShotId);

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

      while (action.requiresToolExecution && action.toolCalls && iteration < maxIterations) {
        iteration++;

        const stepId4 = addStep({
          type: 'tool',
          content: `正在执行工具 (第${iteration}轮): ${action.toolCalls.map(t => t.name).join(', ')}`,
          status: 'running',
        });

        // 使用并行执行器
        const executor = new ParallelExecutor(
          project,
          (progress: ExecutionProgress) => {
            updateStep(stepId4, {
              details: `${progress.currentStep} (${progress.completed}/${progress.total})`,
            });
          }
        );

        const iterationStart = Date.now();
        const results = await executor.execute(action.toolCalls);
        allToolResults.push(...results);

        updateStep(stepId4, {
          status: 'completed',
          duration: Date.now() - iterationStart,
          details: `完成 ${results.length} 个工具调用`,
        });

        // Continue with tool results
        const stepId5 = addStep({
          type: 'thinking',
          content: '正在处理工具结果...',
          status: 'running',
        });

        const continueStart = Date.now();
        action = await continueWithToolResults(
          results.map(r => ({ tool: r.tool, result: r.result || r.error })),
          chatHistory,
          enhancedContext
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
  }, [project, currentSceneId, selectedShotId, sessionManager, addStep, updateStep]);

  // Clear session
  const clearSession = useCallback(async () => {
    await sessionManager.clear();
    setThinkingSteps([]);
    setSummary('');
    toast.info('会话已清除');
  }, [sessionManager]);

  return {
    isProcessing,
    thinkingSteps,
    summary,
    sendMessage,
    clearSession,
  };
}
