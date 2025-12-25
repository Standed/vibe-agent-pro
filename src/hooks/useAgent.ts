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
import { logger } from '@/lib/logService';
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
  pendingConfirmation: {
    credits: number;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null;
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
    setGenerationProgress,
  } = useProjectStore();

  const { isAuthenticated, user, loading } = useAuth();

  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [summary, setSummary] = useState('');
  const [sessionManager] = useState(() =>
    new SessionManager(project?.id || 'default')
  );
  const [lastMessageHash, setLastMessageHash] = useState<string>('');
  const cancelRef = useRef(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ credits: number; message: string } | null>(null);
  const confirmationResolverRef = useRef<((value: boolean) => void) | null>(null);

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
    if (loading) {
      toast.info('登录状态恢复中，请稍后再试');
      return;
    }

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
        void dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'user',
          content: message,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }).catch((err) => {
          console.warn('[useAgent] 保存用户消息失败，已忽略', err);
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
      // 为了增强鲁棒性，增加简单的网络重试（最多 2 次）
      const callProcessUserCommandWithRetry = async () => {
        let lastError: any = null;
        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // @ts-ignore - 我们稍后会更新 processUserCommand 的签名
            return await processUserCommand(message, chatHistory, enhancedContext, abortControllerRef.current?.signal);
          } catch (err: any) {
            lastError = err;
            const msg = `${err?.message || ''}`.toLowerCase();
            const retriable = err?.name !== 'AbortError' && /network|fetch failed|timeout|socket|econn|503|502|overload|gateway/.test(msg);
            if (cancelRef.current || attempt >= maxRetries || !retriable) {
              throw err;
            }
            // 线性退避
            await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
          }
        }
        throw lastError;
      };

      let action = await callProcessUserCommandWithRetry();

      updateStep(stepId3, {
        status: 'completed',
        duration: Date.now() - startTime,
        details: `动作类型: ${action.type}`,
      });

      if (cancelRef.current) {
        throw new Error('USER_CANCELLED');
      }

      // ⭐ 积分确认逻辑：如果预计消耗积分 > 0，暂停执行并等待用户确认
      if (action.requiresToolExecution && action.estimatedCredits && action.estimatedCredits > 0) {
        const stepIdConfirm = addStep({
          type: 'thinking',
          content: `等待积分确认 (预计消耗 ${action.estimatedCredits} 积分)...`,
          status: 'running',
        });

        setPendingConfirmation({
          credits: action.estimatedCredits,
          message: action.message || '该操作将消耗积分'
        });

        const confirmed = await new Promise<boolean>((resolve) => {
          confirmationResolverRef.current = resolve;
        });

        if (!confirmed) {
          updateStep(stepIdConfirm, {
            status: 'failed',
            content: '用户取消了积分扣费操作',
          });
          throw new Error('USER_CANCELLED');
        }

        updateStep(stepIdConfirm, {
          status: 'completed',
          content: '积分确认成功，开始执行...',
        });
      }

      // Step 5: Execute tools if needed (并行执行)
      let allToolResults: any[] = [];
      let maxIterations = 5;
      let iteration = 0;
      const allCreatedScenes = new Set<string>(); // 跟踪所有创建的场景
      const allScenesWithShots = new Set<string>(); // 跟踪所有已添加分镜的场景
      const executedToolSignatures = new Set<string>(); // 避免重复执行同一工具调用

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
          setGenerationProgress,
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
          },
          user?.id
        );

        // 去重：如果同一个工具 + 参数已执行过，跳过，防止死循环重复执行
        const dedupedToolCalls = action.toolCalls.filter(tc => {
          const sig = `${tc.name}:${JSON.stringify(tc.arguments || {})}`;
          if (executedToolSignatures.has(sig)) return false;
          executedToolSignatures.add(sig);
          return true;
        });

        if (dedupedToolCalls.length === 0) {
          // 没有新的工具可执行，跳出循环
          break;
        }

        const iterationStart = Date.now();
        const results = await executor.execute(dedupedToolCalls);
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
          status: failedTools.length === results.length ? 'failed' : (failedTools.length > 0 ? 'completed' : 'completed'), // If ALL failed, status is failed
          duration: Date.now() - iterationStart,
          details: `完成 ${results.length} 个工具调用${failedTools.length > 0 ? ` (${failedTools.length} 个失败)` : ''}`,
        });

        // ⭐ 关键错误检查 (Critical Error Check)
        // 如果任何工具返回了明确的业务阻断错误（如缺少参考图），立即终止循环并返回结果
        const criticalError = results.find(r =>
          r.result?.status === 'error' &&
          r.result?.code === 'missing_character_reference'
        );

        if (criticalError || (failedTools.length > 0 && failedTools.length === results.length)) {
          const errMsg = criticalError
            ? (criticalError.result?.suggestion || criticalError.result?.message || '操作被阻断')
            : '所有工具调用均失败。';

          addStep({
            type: 'error',
            content: criticalError ? `检测到阻断性错误: ${errMsg}` : `执行提前终止: ${errMsg}`,
            status: 'failed',
          });

          // 强制构造一个终止 Action
          action = {
            type: 'none',
            message: `🛑 无法继续执行。\n\n${errMsg}`,
            requiresToolExecution: false
          };

          // 跳出 action 循环，进入最终 summary 阶段
          break;
        }

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

        // 给 continueWithToolResults 加超时保护，避免一直卡在总结前
        const CONTINUE_TIMEOUT_MS = 45000;
        const continueController = new AbortController();
        const continuePromise =
          // @ts-ignore - 我们稍后会更新 continueWithToolResults 的签名
          continueWithToolResults(
            results.map(r => {
              // 简化结果，避免大 payload 导致 LLM 处理超时
              let simplifiedResult = r.result || r.error;
              if (r.tool === 'batchGenerateSceneImages' || r.tool === 'batchGenerateProjectImages') {
                simplifiedResult = {
                  successCount: r.result?.successCount,
                  failedCount: r.result?.failedCount,
                  total: r.result?.totalShots || r.result?.totalScenes,
                  mode: r.result?.mode,
                  // 仅保留失败的详情，成功的省略
                  failures: r.result?.results?.filter((i: any) => !i.success).map((i: any) => ({ shotId: i.shotId, error: i.error }))
                };
              }
              return { tool: r.tool, result: simplifiedResult };
            }),
            chatHistory,
            updatedContext,
            pendingScenes, // 传递待处理的场景列表
            continueController.signal // 传递 signal
          );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => {
            continueController.abort();
            reject(new Error('继续处理超时，已跳过'));
          }, CONTINUE_TIMEOUT_MS)
        );

        try {
          action = await Promise.race([continuePromise, timeoutPromise]) as any;
        } catch (e: any) {
          console.warn('[useAgent] continueWithToolResults 超时/失败，直接结束工具链', e);
          action = { type: 'none', message: '生成完成', requiresToolExecution: false };
        }

        // 如果下一轮没有工具需要执行，提前终止循环，防止卡住
        if (!action.toolCalls || action.toolCalls.length === 0) {
          action.requiresToolExecution = false;
        }

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

      // 构建用户视角的简洁生成结果摘要
      const projectSnapshot = useProjectStore.getState().project;
      const shotLabel = (shotId: string) => {
        if (!projectSnapshot) return shotId;
        const shot = projectSnapshot.shots.find(s => s.id === shotId);
        if (!shot) return shotId;
        const scene = projectSnapshot.scenes.find(sc => sc.id === shot.sceneId);
        const scenePrefix = scene ? `${scene.name || '场景'} ` : '';
        return `${scenePrefix}镜头${shot.order}`;
      };

      const generated = new Set<string>();
      const overwritten = new Set<string>();
      const skipped = new Set<string>();

      const markShot = (shotId?: string, opts?: { overwritten?: boolean; skipped?: boolean }) => {
        if (!shotId) return;
        if (opts?.skipped) {
          skipped.add(shotId);
          return;
        }
        generated.add(shotId);
        if (opts?.overwritten) {
          overwritten.add(shotId);
        }
      };

      const handleResult = (toolResult: any) => {
        const res = toolResult?.result;
        if (!res) return;
        switch (toolResult.tool) {
          case 'generateShotImage':
            markShot(res.shotId, { overwritten: !!res.overwritten, skipped: !!res.skipped });
            break;
          case 'batchGenerateSceneImages':
            if (Array.isArray(res.results)) {
              res.results.forEach((r: any) =>
                markShot(r?.result?.shotId, { overwritten: !!r?.result?.overwritten, skipped: !!r?.result?.skipped })
              );
            }
            if (res.assignments) {
              Object.keys(res.assignments).forEach((id: string) =>
                markShot(id, { overwritten: Array.isArray(res.overwrittenShotIds) && res.overwrittenShotIds.includes(id) })
              );
            }
            break;
          case 'batchGenerateProjectImages':
            if (Array.isArray(res.results)) {
              res.results.forEach((r: any) =>
                markShot(r?.result?.shotId, { overwritten: !!r?.result?.overwritten, skipped: !!r?.result?.skipped })
              );
            }
            if (Array.isArray(res.sceneResults)) {
              res.sceneResults.forEach((sr: any) => {
                const srRes = sr?.result;
                if (!srRes) return;
                if (srRes.assignments) {
                  Object.keys(srRes.assignments).forEach((id: string) =>
                    markShot(
                      id,
                      { overwritten: Array.isArray(srRes.overwrittenShotIds) && srRes.overwrittenShotIds.includes(id) }
                    )
                  );
                }
                if (Array.isArray(srRes.results)) {
                  srRes.results.forEach((r: any) =>
                    markShot(r?.result?.shotId, { overwritten: !!r?.result?.overwritten, skipped: !!r?.result?.skipped })
                  );
                }
              });
            }
            break;
          default:
            break;
        }
      };

      allToolResults.forEach(handleResult);

      const formatGroupedShots = (ids: Set<string>) => {
        if (!projectSnapshot) return Array.from(ids).map(shotLabel);
        const byScene = new Map<string, { sceneOrder: number; sceneLabel: string; shots: number[] }>();

        ids.forEach(id => {
          const shot = projectSnapshot.shots.find(s => s.id === id);
          if (!shot) return;
          const scene = projectSnapshot.scenes.find(sc => sc.id === shot.sceneId);
          const sceneOrder = scene?.order ?? 9999;
          const sceneLabel = scene?.name || `场景${sceneOrder}`;
          const entry = byScene.get(sceneLabel) || { sceneOrder, sceneLabel, shots: [] };
          entry.shots.push(shot.order ?? 0);
          byScene.set(sceneLabel, entry);
        });

        return Array.from(byScene.values())
          .sort((a, b) => a.sceneOrder - b.sceneOrder)
          .map(group => {
            const shotOrders = group.shots.sort((a, b) => a - b).map(o => (o || o === 0 ? o : '')).join('、');
            return `${group.sceneLabel} 镜头${shotOrders}`;
          });
      };

      const generatedLabels = formatGroupedShots(generated);
      const overwrittenLabels = formatGroupedShots(overwritten);
      const skippedLabels = formatGroupedShots(skipped);

      let finalSummary = action.message || '处理完成';
      const lines: string[] = [];
      if (generatedLabels.length > 0) {
        lines.push(`生成：${generatedLabels.join('、')}`);
      }
      if (overwrittenLabels.length > 0) {
        lines.push(`覆盖：${overwrittenLabels.join('、')}`);
      }
      if (skippedLabels.length > 0) {
        lines.push(`跳过：${skippedLabels.join('、')}`);
      }
      if (lines.length > 0) {
        // Append execution summary instead of overwriting
        finalSummary = `${finalSummary}\n\n📊 执行统计：\n${lines.join('；')}`;
      }

      // 系统日志：记录本次 Agent 生成结果（不写入聊天记录）
      void logger.info('ai_generation', 'Agent batch generation summary', {
        projectId: project?.id,
        generatedShotIds: Array.from(generated),
        overwrittenShotIds: Array.from(overwritten),
        skippedShotIds: Array.from(skipped),
        actionType: action.type,
      }).catch((e) => {
        // 日志失败不影响主流程
        console.debug('[AgentLog] failed to log summary', e);
      });

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

      if (user && project) {
        void dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'assistant',
          content: finalSummary,
          metadata: {
            thinkingSteps: thinkingSteps, // Persist thinking steps for UI expansion
          },
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }).catch((err) => {
          console.warn('[useAgent] 保存 assistant 消息失败，已忽略', err);
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
    isAuthenticated,
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
    setPendingConfirmation(null);
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(false);
      confirmationResolverRef.current = null;
    }
  }, []);

  const confirmAction = useCallback(() => {
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(true);
      confirmationResolverRef.current = null;
      setPendingConfirmation(null);
    }
  }, []);

  const cancelAction = useCallback(() => {
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(false);
      confirmationResolverRef.current = null;
      setPendingConfirmation(null);
    }
  }, []);

  return {
    isProcessing,
    thinkingSteps,
    summary,
    sendMessage,
    clearSession,
    stop,
    pendingConfirmation: pendingConfirmation ? {
      ...pendingConfirmation,
      onConfirm: confirmAction,
      onCancel: cancelAction,
    } : null,
  };
}
