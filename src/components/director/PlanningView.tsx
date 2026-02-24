'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { useAIStoryboard } from '@/hooks/generation/useAIStoryboard';
import { useAssetGeneration } from '@/hooks/generation/useAssetGeneration';
import { useAgent } from '@/hooks/agent/useAgent';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import { useParams, useSearchParams } from 'next/navigation';
import { ChatMessage, Character, Location } from '@/types/project';
import { Trash2, AlertTriangle } from 'lucide-react';

// Sub-components
import PlanningHeader from './PlanningHeader';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import PlanningChat from './PlanningChat';
import {
    detectPlanningIntent,
} from '@/services/planningIntentService';
import { useRouter } from 'next/navigation';

interface PlanningViewProps {
    onClose?: () => void;
    showHomeButton?: boolean;
    onSwitchToCanvas?: () => void;
    onSwitchToTimeline?: () => void;
}

export default function PlanningView({
    onClose,
    showHomeButton = true,
    onSwitchToCanvas,
    onSwitchToTimeline,
}: PlanningViewProps) {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const {
        project,
        addCharacter,
        updateCharacter,
        deleteCharacter,
        addLocation,
        updateLocation,
        deleteLocation,
        deleteShot,
        deleteScene,
        updateScene,
        updateShot,
        addScene,
        addShot,
        updateScript,
        setControlMode,
        rightSidebarCollapsed,
        toggleRightSidebar
    } = useProjectStore();

    const generateMessageId = useCallback(() => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }, []);

    // Agent hook
    const {
        isProcessing: isAgentProcessing,
        sendMessage: sendAgentMessage,
        thinkingSteps,
        pendingConfirmation: agentPendingConfirmation,
        stop: stopAgent
    } = useAgent({ chatChannel: 'planning' });

    // UI State
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesTopRef = useRef<HTMLDivElement | null>(null);

    // Dialog states
    const [showAddCharacter, setShowAddCharacter] = useState(false);
    const [showAddLocation, setShowAddLocation] = useState(false);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);

    // 确认弹窗状态（用于删除等需要确认的操作）
    const [pendingAction, setPendingAction] = useState<{
        type: 'delete' | 'replace';
        message: string;
        onConfirm: () => void;
        onCancel?: () => void;
    } | null>(null);

    // 监听 Agent 的确认请求
    useEffect(() => {
        if (agentPendingConfirmation) {
            setPendingAction({
                type: 'delete', // 使用 delete 样式作为通用确认样式
                message: agentPendingConfirmation.message,
                onConfirm: agentPendingConfirmation.onConfirm,
                onCancel: agentPendingConfirmation.onCancel
            });
        } else {
            // 如果 agent 确认消失（例如已确认或取消），清除本地弹窗
            // 但要注意不要清除其他非 agent 的弹窗（虽然目前主要是 agent）
            // 简单起见，如果 pendingAction 是 agent 的，则清除
            // 这里我们无法区分，但通常同一时间只有一个弹窗
            // 改进：我们可以检查 pendingAction.message 是否匹配
        }
    }, [agentPendingConfirmation]);

    // 记录是否是首次消息
    // 是否处于“未生成分镜脚本”的阶段：用于本地意图识别
    // 只要已经有 scenes/shots，就不应再把用户消息当成“重新生成分镜脚本”。
    const isStoryboardEmpty = (project?.scenes?.length ?? 0) === 0 && (project?.shots?.length ?? 0) === 0;

    // 🔒 防止自动分镜重复触发的标记（方案 A：内存标记）
    const autoStoryboardExecutedRef = useRef(false);
    const autoGenerateTimeoutRef = useRef<number | null>(null);

    // 🔒 防止资产生成重复触发的标记（按项目ID存储）
    const assetGenerationExecutedMap = useRef(new Map<string, boolean>());

    // AI Storyboard hook
    const { isGenerating, currentStep, handleAIStoryboard } = useAIStoryboard();

    // Asset Generation hook
    const {
        isGenerating: isGeneratingAssets,
        currentStep: assetGenerationStep,
        generateAssetsForImportedStoryboard
    } = useAssetGeneration();

    const filterPlanningMessages = useCallback(
        (history: ChatMessage[]) => history.filter((msg) => msg.metadata?.channel === 'planning'),
        []
    );

    // 从云端加载聊天历史
    useEffect(() => {
        const planningProjectId = project?.id;

        const loadHistory = async () => {
            if (!planningProjectId || !user) {
                setMessages([]);
                return;
            }

            try {
                const history = await dataService.getChatMessages({
                    projectId: planningProjectId,
                    scope: 'project',
                });
                setMessages(filterPlanningMessages(history));
            } catch (error) {
                console.error('加载聊天历史失败:', error);
                setMessages([]);
            }
        };

        loadHistory();
    }, [project?.id, user?.id, filterPlanningMessages]);

    // Scroll to bottom when new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);


    // 🔒 自动触发资产生成：当项目有scenes/shots但缺少资产时（从分镜导入的场景）
    // 方案B: 只监听项目ID变化，避免频繁触发
    useEffect(() => {
        if (!project?.id || project.id !== (params?.id as string)) {
            return;
        }

        // ⭐ 防止冲突：如果已经触发了 AI 分镜生成（说明是新项目/灵感流程），则不触发资产生成
        if (autoStoryboardExecutedRef.current) {
            return;
        }

        const projectId = project.id;

        // 如果这个项目已经执行过资产生成，跳过
        if (assetGenerationExecutedMap.current.get(projectId)) {
            return;
        }

        // 检查是否需要生成资产
        const needsAssets =
            project.scenes?.length > 0 &&
            project.shots?.length > 0 &&
            (!project.characters?.length || !project.locations?.length) &&
            !project.metadata?.hasAutoGeneratedAssets; // 检查持久化标记

        if (needsAssets) {
            // 标记为已执行
            assetGenerationExecutedMap.current.set(projectId, true);

            // 更新持久化标记
            useProjectStore.getState().updateProjectMetadata({ hasAutoGeneratedAssets: true });

            // ⭐ 延迟执行,让React先更新UI显示进度
            setTimeout(() => {
                generateAssetsForImportedStoryboard();
            }, 100);
        }
    }, [
        project?.id,
        params?.id,
        generateAssetsForImportedStoryboard,
        project?.metadata?.hasAutoGeneratedAssets,
        project?.scenes?.length,
        project?.shots?.length,
        project?.characters?.length,
        project?.locations?.length
    ]);

    // 自动切换到分镜选项卡逻辑已移除，由 Sidebar 内部管理
    // const prevIsGenerating = useRef(isGenerating);
    // useEffect(() => {
    //     if (!project) return;
    //     if (prevIsGenerating.current && !isGenerating && project.shots && project.shots.length > 0 && activeTab !== 'storyboard') {
    //         setActiveTab('storyboard');
    //         setIsSidebarCollapsed(false);
    //     }
    //     prevIsGenerating.current = isGenerating;
    // }, [isGenerating, project?.shots?.length, activeTab, project]);

    const handleSendMessage = async (textOverride?: string) => {
        const text = textOverride || inputText;
        if (!text.trim() || isSubmitting || isGenerating || isAgentProcessing) return;
        if (!project) {
            toast.error('请先创建或打开一个项目');
            return;
        }
        if (!user) {
            toast.error('请先登录以使用 AI 功能');
            return;
        }

        const userContent = text.trim();

        // 本地快速预检：判断是否是分镜生成请求
        const localIntent = detectPlanningIntent(userContent, {
            hasScript: !!project.script?.trim(),
            hasScenes: (project.scenes?.length ?? 0) > 0,
            hasShots: (project.shots?.length ?? 0) > 0,
            isFirstMessage: isStoryboardEmpty,
            previousScript: project.script,
        });

        console.log('[PlanningView] 本地预检结果:', localIntent);

        // 如果是分镜生成请求（create 意图），使用原有流程
        if (localIntent.intent === 'create') {
            // 继续到默认创作流程
            proceedWithStoryboardGeneration(userContent);
            return;
        }

        // 其他意图（增删改查、对话等），使用统一的 Agent 服务
        setInputText('');

        // 立即添加用户消息到本地状态（乐观更新）
        const userMessage: ChatMessage = {
            id: generateMessageId(),
            userId: user?.id || '',
            projectId: project.id,
            scope: 'project',
            role: 'user',
            content: userContent,
            metadata: { channel: 'planning' },
            timestamp: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        try {
            // 保存用户消息
            await dataService.saveChatMessage(userMessage);

            // 发送给 Agent
            await sendAgentMessage(userContent);

            // 重新加载聊天历史以获取 Agent 回复
            const history = await dataService.getChatMessages({
                projectId: project.id,
                scope: 'project',
            });
            setMessages(filterPlanningMessages(history));
        } catch (error) {
            console.error('[PlanningView] Agent 处理错误:', error);
            // useAgent 内部已处理错误提示，这里无需额外 toast
        }
    };

    // 分镜生成流程
    const proceedWithStoryboardGeneration = async (userContent: string) => {
        if (!project) return;

        // If user manually triggers generation while auto-run is scheduled, cancel the pending timer
        // to avoid double storyboard generation.
        if (autoGenerateTimeoutRef.current) {
            window.clearTimeout(autoGenerateTimeoutRef.current);
            autoGenerateTimeoutRef.current = null;
        }

        // Persist a short-lived lock to avoid duplicate generation across refresh.
        try {
            sessionStorage.setItem(`planning:autoStoryboard:started:${project.id}`, String(Date.now()));
        } catch {
            // ignore
        }

        // ⭐ 标记为已执行 AI 分镜，防止资产生成逻辑重复触发
        autoStoryboardExecutedRef.current = true;

        setInputText('');
        setIsSubmitting(true);

        const hasScript = !!project.script?.trim();
        const scriptToUse = hasScript ? project.script!.trim() : userContent;

        // 立即添加用户消息到本地状态（乐观更新）
        const userMessage: ChatMessage = {
            id: generateMessageId(),
            userId: user?.id || '',
            projectId: project.id,
            scope: 'project',
            role: 'user',
            content: userContent,
            metadata: { channel: 'planning' },
            timestamp: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        try {
            await dataService.saveChatMessage(userMessage);
        } catch (error) {
            console.warn('保存聊天消息失败:', error);
        }

        if (!hasScript) {
            updateScript(userContent);
        }

        try {
            await handleAIStoryboard(scriptToUse);
        } finally {
            // 重新加载聊天历史（包含 AI 回复）
            try {
                const history = await dataService.getChatMessages({
                    projectId: project.id,
                    scope: 'project',
                });
                setMessages(filterPlanningMessages(history));
            } catch (error) {
                console.error('加载聊天历史失败:', error);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    // ✅ 自动触发 AI 分镜生成（回归原有“有 script/description 且无 scenes/shots 则自动跑”的体验）
    // 规则：
    // - 仅当项目还没有 scenes/shots 时才会自动触发，避免重复写入
    // - 使用 sessionStorage 锁避免刷新/StrictMode 导致重复触发
    // - 若 URL 带 autoGenerate=true，会在真正执行时移除该参数（兼容旧入口）
    useEffect(() => {
        if (!project?.id || project.id !== (params?.id as string)) return;
        if (!user?.id) return;
        if (isGenerating || isSubmitting || isAgentProcessing) return;

        const autoGenerateParam = searchParams.get('autoGenerate') === 'true';

        const removeAutoGenerateParam = () => {
            if (!autoGenerateParam) return;
            if (typeof window === 'undefined') return;
            const next = new URLSearchParams(searchParams.toString());
            next.delete('autoGenerate');
            const qs = next.toString();
            const nextUrl = qs ? `?${qs}` : window.location.pathname;
            router.replace(nextUrl, { scroll: false });
        };

        const hasScenes = (project.scenes?.length ?? 0) > 0;
        const hasShots = (project.shots?.length ?? 0) > 0;
        if (hasScenes || hasShots) {
            removeAutoGenerateParam();
            return;
        }

        const seedText =
            project.script?.trim() ||
            project.metadata?.description?.trim();

        if (!seedText) {
            return;
        }

        const autoUserContent = project.script?.trim()
            ? '已导入剧本，开始自动分镜。'
            : seedText;

        const sessionKey = `planning:autoStoryboard:started:${project.id}`;
        try {
            if (typeof window !== 'undefined') {
                const raw = sessionStorage.getItem(sessionKey);
                if (raw) {
                    const startedAt = Number(raw);
                    // Avoid duplicate storyboard generation across refresh/StrictMode.
                    // If user refreshes mid-generation, allow retry after a reasonable TTL.
                    const TTL_MS = 5 * 60 * 1000;
                    if (Number.isFinite(startedAt) && Date.now() - startedAt < TTL_MS) {
                        return;
                    }
                    sessionStorage.removeItem(sessionKey);
                }
            }
        } catch {
            // ignore
        }

        if (autoGenerateTimeoutRef.current) {
            window.clearTimeout(autoGenerateTimeoutRef.current);
            autoGenerateTimeoutRef.current = null;
        }

        autoGenerateTimeoutRef.current = window.setTimeout(() => {
            autoGenerateTimeoutRef.current = null;
            try {
                sessionStorage.setItem(sessionKey, String(Date.now()));
            } catch {
                // ignore
            }

            removeAutoGenerateParam();

            void proceedWithStoryboardGeneration(autoUserContent).catch((e) => {
                console.warn('[PlanningView] Auto storyboard failed:', e);
                try {
                    sessionStorage.removeItem(sessionKey);
                } catch {
                    // ignore
                }
            });
        }, 150);

        return () => {
            if (autoGenerateTimeoutRef.current) {
                window.clearTimeout(autoGenerateTimeoutRef.current);
                autoGenerateTimeoutRef.current = null;
            }
        };
    }, [
        project?.id,
        project?.script,
        project?.metadata?.description,
        project?.scenes?.length,
        project?.shots?.length,
        params?.id,
        user?.id,
        isGenerating,
        isSubmitting,
        isAgentProcessing,
        router,
        searchParams,
    ]);

    const handleDeleteCharacter = (id: string, name: string) => {
        if (isSubmitting || isGenerating) return;
        if (confirm(`确定要删除角色 "${name}" 吗？`)) {
            deleteCharacter(id);
            toast.success('角色已删除');
        }
    };

    const handleDeleteLocation = (id: string, name: string) => {
        if (isSubmitting || isGenerating) return;
        if (confirm(`确定要删除场景 "${name}" 吗？`)) {
            deleteLocation(id);
            toast.success('场景已删除');
        }
    };

    if (!project) return null;

    return (
        <div className="h-screen w-full bg-[#f8f9fa] dark:bg-[#0a0a0a] flex overflow-hidden relative">
            <LeftSidebarNew
                activeView="planning"
                onSwitchToTimeline={onSwitchToTimeline}
            />

            <div className="flex-1 flex flex-col relative bg-white dark:bg-[#0a0a0a]">
                <PlanningHeader
                    project={project}
                    isSidebarCollapsed={false}
                    setIsSidebarCollapsed={() => { }}
                    onClose={onClose}
                    onSwitchToCanvas={onSwitchToCanvas}
                    onSwitchToTimeline={onSwitchToTimeline}
                    onAiAssistantClick={() => {
                        setControlMode('agent');
                        if (rightSidebarCollapsed) toggleRightSidebar();
                        if (onClose) onClose();
                    }}
                    onHistoryClick={() => {
                        messagesTopRef.current?.scrollIntoView({ behavior: 'smooth' });
                        toast.info('已滚动到历史记录顶部');
                    }}
                />

                <PlanningChat
                    messages={messages}
                    inputText={inputText}
                    setInputText={setInputText}
                    isProcessing={isSubmitting || isAgentProcessing}
                    isGenerating={isGenerating}
                    isGeneratingAssets={isGeneratingAssets}
                    assetGenerationStep={assetGenerationStep}
                    thinkingSteps={thinkingSteps}
                    handleSendMessage={handleSendMessage}
                    currentStep={currentStep}
                    messagesEndRef={messagesEndRef}
                    messagesTopRef={messagesTopRef}
                />
            </div>

            {/* Dialogs */}
            {(showAddCharacter || !!editingCharacter) && (
                <AddCharacterDialog
                    onClose={() => {
                        setShowAddCharacter(false);
                        setEditingCharacter(null);
                    }}
                    onAdd={(char) => {
                        if (editingCharacter) {
                            updateCharacter(editingCharacter.id, char);
                            toast.success('角色已更新');
                        } else {
                            addCharacter(char);
                            toast.success('角色已添加');
                        }
                        setShowAddCharacter(false);
                        setEditingCharacter(null);
                    }}
                    mode={editingCharacter ? 'edit' : 'add'}
                    initialCharacter={editingCharacter}
                />
            )}

            {(showAddLocation || !!editingLocation) && (
                <AddLocationDialog
                    onClose={() => {
                        setShowAddLocation(false);
                        setEditingLocation(null);
                    }}
                    onAdd={(loc) => {
                        if (editingLocation) {
                            updateLocation(editingLocation.id, loc);
                            toast.success('场景已更新');
                        } else {
                            addLocation(loc);
                            toast.success('场景已添加');
                        }
                        setShowAddLocation(false);
                        setEditingLocation(null);
                    }}
                    mode={editingLocation ? 'edit' : 'add'}
                    initialLocation={editingLocation}
                />
            )}

            {/* 确认弹窗 */}
            {pendingAction && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-md mx-4 shadow-2xl border border-black/5 dark:border-white/10">
                        <div className="flex items-center gap-3 mb-4">
                            {pendingAction.type === 'delete' ? (
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                                </div>
                            )}
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                                {pendingAction.type === 'delete' ? '确认删除' : '操作确认'}
                            </h3>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-400 mb-6 whitespace-pre-line">
                            {pendingAction.message}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingAction(null)}
                                className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={pendingAction.onConfirm}
                                className={`px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90 ${pendingAction.type === 'delete'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-light-accent dark:bg-cine-accent text-white dark:text-black'
                                    }`}
                            >
                                {pendingAction.type === 'delete' ? '确认删除' : '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
