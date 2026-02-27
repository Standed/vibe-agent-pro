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
import { sendMessage as sendAgentMessage, continueWithToolResults, AgentMessage, AgentAction, estimateCreditsOnServer, estimateCredits as estimateAgentCredits } from '@/services/agentService';
import { AGENT_TOOLS, ToolDefinition } from '@/services/agentToolDefinitions';
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

// Tools allowed in Planning Mode (Story Conception)
// Exclude image and video generation tools to prevent premature asset creation
const PLANNING_MODE_TOOLS = AGENT_TOOLS.filter(tool =>
  !['generateShotImage', 'batchGenerateSceneImages', 'batchGenerateProjectImages', 'generateSceneVideo', 'batchGenerateProjectVideosSora', 'generateShotsVideo'].includes(tool.name)
);

const extractEstimatedCreditsFromMessage = (message?: string): number | null => {
  if (!message) return null;

  const patterns = [
    /(?:预计|預計|估计|估計|大约|約|将|將|会|會)?\s*(?:消耗|扣除|花费|花費|耗费|耗費|需要|需)\s*(\d+)\s*(?:积分|積分|credits?|點)/i,
    /(\d+)\s*(?:积分|積分|credits?|點)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const credits = Number.parseInt(match[1], 10);
    if (Number.isFinite(credits) && credits > 0) {
      return credits;
    }
  }

  return null;
};

const isCreditConfirmationPrompt = (message?: string): boolean => {
  if (!message) return false;

  const hasCreditInfo = /(积分|積分|credits?|消耗|花费|花費|扣除)/i.test(message);
  const asksForConfirmation = /(是否|确认|確認|继续|繼續|同意|取消|yes|no|confirm|proceed)/i.test(message);

  return hasCreditInfo && asksForConfirmation;
};

const hasToolExecutionIntent = (message: string): boolean => {
  if (!message) return false;
  return /(生成|创建|新增|添加|修改|更新|删除|移除|重写|重做|批量|出图|生图|出视频|做视频|应用|套用|generate|create|add|update|delete|remove|batch)/i.test(message);
};

const BILLABLE_TOOL_NAMES = new Set([
  'generateShotImage',
  'batchGenerateSceneImages',
  'batchGenerateProjectImages',
  'generateSceneVideo',
  'generateShotsVideo',
  'batchGenerateProjectVideosSora',
  'generateCharacterThreeView',
  'generateLocationImages',
  'generateViduVideo',
]);

const hasBillableToolCalls = (action: AgentAction): boolean =>
  !!(action.requiresToolExecution && Array.isArray(action.toolCalls) && action.toolCalls.some(toolCall => BILLABLE_TOOL_NAMES.has(toolCall.name)));

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

export interface UseAgentOptions {
  chatChannel?: string;
}

export function useAgent(options: UseAgentOptions = {}): UseAgentResult {
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

  const { isAuthenticated, user, loading, profile } = useAuth();
  const chatChannel = options.chatChannel;

  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const thinkingStepsRef = useRef<ThinkingStep[]>([]);
  const [summary, setSummary] = useState('');
  const [sessionManager] = useState(() =>
    new SessionManager(project?.id || 'default')
  );
  const [lastMessageHash, setLastMessageHash] = useState<string>('');
  const cancelRef = useRef(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ credits: number; message: string } | null>(null);
  const confirmationResolverRef = useRef<((value: boolean) => void) | null>(null);
  // 同一次 sendMessage 调用期间，用户确认一次后不再重复询问
  const hasConfirmedCreditsRef = useRef(false);
  const confirmedBillableSignatureRef = useRef<string | null>(null);

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
    setThinkingSteps(prev => {
      const next = [...prev, newStep];
      thinkingStepsRef.current = next;
      return next;
    });
    return newStep.id;
  }, []);

  // Update thinking step
  const updateStep = useCallback((stepId: string, updates: Partial<ThinkingStep>) => {
    setThinkingSteps(prev => {
      const next = prev.map(step => step.id === stepId ? { ...step, ...updates } : step);
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Send message
  const sendMessage = useCallback(async (message: string) => {
    if (!project) {
      toast.error('请先创建或打开一个项目');
      return;
    }

    cancelRef.current = false;
    // 每次新的用户操作重置积分确认状态
    hasConfirmedCreditsRef.current = false;
    confirmedBillableSignatureRef.current = null;
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
    thinkingStepsRef.current = [];
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

      // 智能重复检测：检测分镜生成类请求
      let enhancedMessage = message;
      const hasExistingContent = (project.scenes?.length || 0) > 0 || (project.shots?.length || 0) > 0;
      const isStoryboardRequest = /生成.*分镜|创建.*镜头|写.*脚本|拆分.*分镜|分析.*剧本/i.test(message);

      if (hasExistingContent && isStoryboardRequest) {
        const sessionHistory = session.messages || [];
        const hasSimilarRecentRequest = sessionHistory.slice(-5).some(
          (m: { role: string; content: string }) =>
            m.role === 'user' && /生成.*分镜|创建.*镜头|写.*脚本/.test(m.content)
        );

        if (hasSimilarRecentRequest) {
          enhancedMessage = `${message}\n\n【系统提示】当前项目已有 ${project.scenes?.length || 0} 个场景、${project.shots?.length || 0} 个镜头。请基于现有内容进行编辑或补充，避免生成重复内容。`;
          console.log('[useAgent] 检测到重复分镜请求，已附加上下文提示');
        }
      }

      // Step 3: Add user message to session
      const userMessage: AgentMessage = {
        role: 'user',
        content: enhancedMessage,
      };
      await sessionManager.addMessage(userMessage);

      // ⭐ 保存用户消息到云端数据库（chat_messages表）
      if (user && project) {
        const metadata = chatChannel ? { channel: chatChannel } : undefined;
        void dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'user',
          content: message,
          metadata,
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

      const activeTools = chatChannel === 'planning' ? PLANNING_MODE_TOOLS : AGENT_TOOLS;

      // 让我们假设 processUserCommand 接受一个可选的 signal 参数
      // 为了增强鲁棒性，增加简单的网络重试（最多 2 次）
      const callProcessUserCommandWithRetry = async () => {
        let lastError: any = null;
        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await sendAgentMessage(
              chatHistory,
              enhancedContext,
              undefined,
              abortControllerRef.current?.signal,
              activeTools
            );
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

      const actionHasToolCalls = !!(action.requiresToolExecution && action.toolCalls && action.toolCalls.length > 0);
      const shouldTriggerTools = hasToolExecutionIntent(message);
      if (shouldTriggerTools && !actionHasToolCalls && !isCreditConfirmationPrompt(action.message)) {
        const stepIdRetryToolAction = addStep({
          type: 'thinking',
          content: '检测到执行型指令但未返回工具调用，正在自动重试...',
          status: 'running',
        });
        const retryStart = Date.now();

        try {
          action = await sendAgentMessage(
            [
              ...sessionManager.getMessages(),
              {
                role: 'user',
                content: `系统校验：上一步未返回任何工具调用。请针对原始请求返回 tool_use 并附上 toolCalls，不要仅返回文本总结。原始请求：${message}`,
              },
            ],
            enhancedContext,
            undefined,
            abortControllerRef.current?.signal,
            activeTools
          );

          updateStep(stepIdRetryToolAction, {
            status: 'completed',
            duration: Date.now() - retryStart,
            details: `重试动作类型: ${action.type}`,
          });
        } catch (retryError) {
          updateStep(stepIdRetryToolAction, {
            status: 'failed',
            duration: Date.now() - retryStart,
            content: '自动重试获取工具调用失败',
          });
          throw retryError;
        }
      }

      const resolveEstimateInputs = () => {
        const latestStore = useProjectStore.getState();
        const latestProject = latestStore.project;
        const estimateContext = buildEnhancedContext(
          latestProject,
          latestStore.currentSceneId ?? undefined,
          latestStore.selectedShotId ?? undefined
        );
        const projectSnapshot = latestProject ? {
          scenes: latestProject.scenes.map(scene => ({
            id: scene.id,
            soraStatus: scene.soraGeneration?.status || null,
          })),
          shots: latestProject.shots.map(shot => ({
            id: shot.id,
            sceneId: shot.sceneId,
            duration: shot.duration,
            order: shot.order,
            globalOrder: shot.globalOrder,
            referenceImage: shot.referenceImage || null,
          })),
          locations: latestProject.locations.map(location => ({
            id: location.id,
            referenceImages: location.referenceImages || [],
          })),
        } : null;

        return { estimateContext, projectSnapshot };
      };

      const currentUserRole: 'user' | 'admin' | 'vip' = profile?.role === 'admin' || profile?.role === 'vip'
        ? profile.role
        : 'user';

      const reconcileCreditEstimate = async (incomingAction: AgentAction): Promise<AgentAction> => {
        if (!incomingAction.requiresToolExecution || !incomingAction.toolCalls || incomingAction.toolCalls.length === 0) {
          return incomingAction;
        }
        if (!hasBillableToolCalls(incomingAction)) {
          return incomingAction;
        }

        const { estimateContext, projectSnapshot } = resolveEstimateInputs();
        const localEstimate = estimateAgentCredits(
          incomingAction.toolCalls,
          currentUserRole,
          estimateContext
        );

        const serverEstimate = await estimateCreditsOnServer(
          incomingAction.toolCalls,
          estimateContext,
          projectSnapshot,
          abortControllerRef.current?.signal
        );

        if (typeof serverEstimate === 'number' && Number.isFinite(serverEstimate) && serverEstimate > 0) {
          return { ...incomingAction, estimatedCredits: serverEstimate };
        }

        if (typeof serverEstimate === 'number' && serverEstimate === 0 && localEstimate > 0) {
          console.warn('[useAgent] server estimate is 0 for billable action, fallback to local estimate', {
            toolNames: incomingAction.toolCalls.map(toolCall => toolCall.name),
            localEstimate,
          });
          return { ...incomingAction, estimatedCredits: localEstimate };
        }

        if (typeof serverEstimate === 'number' && Number.isFinite(serverEstimate) && serverEstimate >= 0) {
          return { ...incomingAction, estimatedCredits: serverEstimate };
        }

        if (localEstimate > 0) {
          return { ...incomingAction, estimatedCredits: localEstimate };
        }

        return incomingAction;
      };

      const buildBillableToolSignature = (incomingAction: AgentAction): string | null => {
        if (!incomingAction.requiresToolExecution || !incomingAction.toolCalls || incomingAction.toolCalls.length === 0) {
          return null;
        }
        const billableCalls = incomingAction.toolCalls.filter(toolCall => BILLABLE_TOOL_NAMES.has(toolCall.name));
        if (billableCalls.length === 0) return null;
        return billableCalls
          .map(toolCall => `${toolCall.name}:${JSON.stringify(toolCall.arguments || {})}`)
          .join('|');
      };

      const shouldAskForBillableConfirmation = (incomingAction: AgentAction, credits: number | null | undefined): boolean => {
        if (!incomingAction.requiresToolExecution || !hasBillableToolCalls(incomingAction) || !credits || credits <= 0) {
          return false;
        }
        const signature = buildBillableToolSignature(incomingAction);
        if (!signature) return !hasConfirmedCreditsRef.current;
        return confirmedBillableSignatureRef.current !== signature;
      };

      const requestCreditConfirmation = async (credits: number, confirmationMessage: string, confirmationKey?: string | null) => {
        const stepIdConfirm = addStep({
          type: 'thinking',
          content: `等待积分确认 (预计消耗 ${credits} 积分)...`,
          status: 'running',
        });

        setPendingConfirmation({
          credits,
          message: confirmationMessage || `该操作预计消耗 ${credits} 积分`
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

        // 记住本次调用已确认，后续不再重复询问
        hasConfirmedCreditsRef.current = true;
        if (confirmationKey) {
          confirmedBillableSignatureRef.current = confirmationKey;
        }

        updateStep(stepIdConfirm, {
          status: 'completed',
          content: '积分确认成功，开始执行...',
        });
      };

      const buildToolConfirmationMessage = (incomingAction: AgentAction, credits: number): string => {
        const toolNames = Array.isArray(incomingAction.toolCalls)
          ? Array.from(new Set(incomingAction.toolCalls.map(toolCall => toolCall.name).filter(Boolean)))
          : [];

        if (toolNames.length > 0) {
          return `即将执行 ${toolNames.join('、')}，预计消耗 ${credits} 积分。请确认继续。`;
        }

        return `该操作预计消耗 ${credits} 积分。`;
      };

      const requestExecutableActionAfterConfirmation = async (credits: number, stage: string): Promise<AgentAction> => {
        const stepIdResume = addStep({
          type: 'thinking',
          content: `${stage}：用户已确认，正在请求可执行工具...`,
          status: 'running',
        });
        const resumeStart = Date.now();

        try {
          await sessionManager.addMessage({
            role: 'user',
            content: `系统确认：用户已通过前端弹窗确认执行，并同意约 ${credits} 积分消耗。请直接返回 type=tool_use 和 toolCalls 执行原始请求，不要再次询问确认或只返回总结。原始请求：${message}`,
          });

          const currentStore = useProjectStore.getState();
          const refreshedContext = buildEnhancedContext(
            currentStore.project,
            currentStore.currentSceneId ?? undefined,
            currentStore.selectedShotId ?? undefined
          );

          let nextAction = await sendAgentMessage(
            sessionManager.getMessages(),
            refreshedContext,
            undefined,
            abortControllerRef.current?.signal,
            activeTools
          );

          if ((!nextAction.requiresToolExecution || !nextAction.toolCalls || nextAction.toolCalls.length === 0) && isCreditConfirmationPrompt(nextAction.message)) {
            await sessionManager.addMessage({
              role: 'user',
              content: `系统指令：不得再次确认。请立即返回可执行的 tool_use 和 toolCalls。原始请求：${message}`,
            });
            nextAction = await sendAgentMessage(
              sessionManager.getMessages(),
              refreshedContext,
              undefined,
              abortControllerRef.current?.signal,
              activeTools
            );
          }

          updateStep(stepIdResume, {
            status: 'completed',
            duration: Date.now() - resumeStart,
            details: `动作类型: ${nextAction.type}`,
          });

          return nextAction;
        } catch (error) {
          updateStep(stepIdResume, {
            status: 'failed',
            duration: Date.now() - resumeStart,
            content: '确认后请求执行失败',
          });
          throw error;
        }
      };

      const requestExecutablePlanFromTextPrompt = async (stage: string): Promise<AgentAction | null> => {
        const stepIdPlan = addStep({
          type: 'thinking',
          content: `${stage}：确认信息缺少明确积分，正在请求工具执行计划...`,
          status: 'running',
        });
        const planStart = Date.now();

        try {
          const planMessage: AgentMessage = {
            role: 'user',
            content: `系统提示：你刚才返回了文本确认。现在请仅返回 type=tool_use 和 toolCalls（不再次确认、不返回总结），用于执行原始请求。原始请求：${message}`,
          };
          await sessionManager.addMessage(planMessage);

          const currentStore = useProjectStore.getState();
          const refreshedContext = buildEnhancedContext(
            currentStore.project,
            currentStore.currentSceneId ?? undefined,
            currentStore.selectedShotId ?? undefined
          );

          const plannedAction = await sendAgentMessage(
            sessionManager.getMessages(),
            refreshedContext,
            undefined,
            abortControllerRef.current?.signal,
            activeTools
          );

          updateStep(stepIdPlan, {
            status: 'completed',
            duration: Date.now() - planStart,
            details: `动作类型: ${plannedAction.type}`,
          });

          if (plannedAction.requiresToolExecution && plannedAction.toolCalls && plannedAction.toolCalls.length > 0) {
            return plannedAction;
          }
          return null;
        } catch (error) {
          updateStep(stepIdPlan, {
            status: 'failed',
            duration: Date.now() - planStart,
            content: '请求工具执行计划失败',
          });
          return null;
        }
      };

      const resolveTextOnlyCreditConfirmation = async (incomingAction: AgentAction, stage: string): Promise<AgentAction> => {
        const isTextOnlyCreditConfirmation =
          !incomingAction.requiresToolExecution &&
          (!incomingAction.toolCalls || incomingAction.toolCalls.length === 0) &&
          isCreditConfirmationPrompt(incomingAction.message);

        if (!isTextOnlyCreditConfirmation) {
          return incomingAction;
        }

        let credits = incomingAction.estimatedCredits ?? extractEstimatedCreditsFromMessage(incomingAction.message) ?? 0;
        let plannedAction: AgentAction | null = null;

        if (credits <= 0) {
          plannedAction = await requestExecutablePlanFromTextPrompt(stage);
          if (plannedAction) {
            plannedAction = await reconcileCreditEstimate(plannedAction);
            credits = plannedAction.estimatedCredits ?? extractEstimatedCreditsFromMessage(incomingAction.message) ?? 0;
          }
        }

        if (credits <= 0) {
          throw new Error('无法计算本次操作积分，已停止执行。请重试并明确模型或目标范围。');
        }

        const plannedSignature = plannedAction ? buildBillableToolSignature(plannedAction) : null;
        const shouldAskForTextFallback = plannedAction
          ? shouldAskForBillableConfirmation(plannedAction, credits)
          : !hasConfirmedCreditsRef.current;

        if (shouldAskForTextFallback) {
          await requestCreditConfirmation(
            credits,
            plannedAction
              ? buildToolConfirmationMessage(plannedAction, credits)
              : incomingAction.message,
            plannedSignature
          );
        }

        if (plannedAction) {
          return plannedAction;
        }

        const resumedAction = await requestExecutableActionAfterConfirmation(credits, stage);
        return await reconcileCreditEstimate(resumedAction);
      };

      action = await resolveTextOnlyCreditConfirmation(action, '初始阶段');
      action = await reconcileCreditEstimate(action);
      const actionCredits = action.estimatedCredits ?? extractEstimatedCreditsFromMessage(action.message);
      // ⭐ 积分确认逻辑：如果预计消耗积分 > 0 且本次调用尚未确认，暂停执行并等待用户确认
      if (shouldAskForBillableConfirmation(action, actionCredits)) {
        await requestCreditConfirmation(
          actionCredits as number,
          buildToolConfirmationMessage(action, actionCredits as number),
          buildBillableToolSignature(action)
        );
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
          updateScene: useProjectStore.getState().updateScene,
          deleteScene: useProjectStore.getState().deleteScene,
          addShot,
          updateShot,
          deleteShot: useProjectStore.getState().deleteShot,
          addCharacter: useProjectStore.getState().addCharacter,
          updateCharacter: useProjectStore.getState().updateCharacter,
          deleteCharacter: useProjectStore.getState().deleteCharacter,
          addLocation: useProjectStore.getState().addLocation,
          updateLocation: useProjectStore.getState().updateLocation,
          deleteLocation: useProjectStore.getState().deleteLocation,
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
          const duplicateTools = Array.from(new Set(action.toolCalls.map(tc => tc.name)));
          const hasExecutedAnyTool = allToolResults.length > 0;

          addStep({
            type: hasExecutedAnyTool ? 'thinking' : 'error',
            content: hasExecutedAnyTool
              ? `检测到重复工具调用（${duplicateTools.join('、')}），已自动结束避免重复扣费`
              : '检测到重复工具调用，未执行新的操作，已中止本轮工具链',
            status: hasExecutedAnyTool ? 'completed' : 'failed',
          });

          action = hasExecutedAnyTool
            ? {
              ...action,
              type: 'none',
              requiresToolExecution: false,
              message: '已完成本轮操作，自动跳过重复工具调用。',
            }
            : {
              ...action,
              type: 'none',
              requiresToolExecution: false,
              message: '⚠️ AI 返回了重复工具调用，本轮未执行新的操作，请重试。',
            };
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
        const CONTINUE_TIMEOUT_MS = 90000;
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
            continueController.signal, // 传递 signal
            chatChannel === 'planning' ? PLANNING_MODE_TOOLS : AGENT_TOOLS // Pass filtered tools
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

        action = await resolveTextOnlyCreditConfirmation(action, `第${iteration}轮后续阶段`);
        action = await reconcileCreditEstimate(action);
        const nextActionCredits = action.estimatedCredits ?? extractEstimatedCreditsFromMessage(action.message);
        if (shouldAskForBillableConfirmation(action, nextActionCredits)) {
          await requestCreditConfirmation(
            nextActionCredits as number,
            buildToolConfirmationMessage(action, nextActionCredits as number),
            buildBillableToolSignature(action)
          );
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
      const noToolExecuted = allToolResults.length === 0;
      const expectedExecutionButNoTools = hasToolExecutionIntent(message) && noToolExecuted;

      let finalSummary = action.message || '处理完成';
      if (expectedExecutionButNoTools) {
        finalSummary = `⚠️ 本次请求未执行任何工具操作。\n请重试一次，或明确指定目标（例如“为场景1批量生成 2x2 Grid”）。\n\n模型回复：${action.message || '（空）'}`;
      }
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
        const metadata = {
          ...(chatChannel ? { channel: chatChannel } : {}),
          thinkingSteps: thinkingStepsRef.current, // Persist thinking steps for UI expansion
        };
        void dataService.saveChatMessage({
          id: generateMessageId(),
          userId: user.id,
          projectId: project.id,
          scope: 'project',
          role: 'assistant',
          content: finalSummary,
          metadata,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }).catch((err) => {
          console.warn('[useAgent] 保存 assistant 消息失败，已忽略', err);
        });
      }

      const endedOnConfirmationText = noToolExecuted && isCreditConfirmationPrompt(finalSummary);
      if (endedOnConfirmationText) {
        toast.warning('检测到积分确认请求，尚未执行任务');
      } else if (expectedExecutionButNoTools) {
        toast.warning('未检测到工具执行，任务未真正落地');
      } else {
        toast.success('处理完成');
      }

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
    setGenerationProgress,
    isProcessing,
    lastMessageHash,
    user,
    profile,
    loading,
    isAuthenticated,
    chatChannel,
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
    thinkingStepsRef.current = [];
    setSummary('');
    hasConfirmedCreditsRef.current = false;
    confirmedBillableSignatureRef.current = null;
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
    thinkingStepsRef.current = [];
    setSummary('');
    hasConfirmedCreditsRef.current = false;
    confirmedBillableSignatureRef.current = null;
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
