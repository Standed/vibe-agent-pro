'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { useAIStoryboard } from '@/hooks/useAIStoryboard';
import { useAgent } from '@/hooks/useAgent';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import { useParams } from 'next/navigation';
import { ChatMessage, Character, Location } from '@/types/project';
import { Trash2, AlertTriangle } from 'lucide-react';

// Sub-components
import PlanningHeader from './PlanningHeader';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import PlanningChat from './PlanningChat';
import {
    detectPlanningIntent,
} from '@/services/planningIntentService';

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
    const isFirstMessageRef = useRef(true);

    // AI Storyboard hook
    const { isGenerating, currentStep, handleAIStoryboard } = useAIStoryboard();

    const filterPlanningMessages = useCallback(
        (history: ChatMessage[]) => history.filter((msg) => msg.metadata?.channel === 'planning'),
        []
    );

    // 从云端加载聊天历史
    useEffect(() => {
        const loadHistory = async () => {
            if (!project || !user) {
                setMessages([]);
                return;
            }

            try {
                const history = await dataService.getChatMessages({
                    projectId: project.id,
                    scope: 'project',
                });
                setMessages(filterPlanningMessages(history));
            } catch (error) {
                console.error('加载聊天历史失败:', error);
                setMessages([]);
            }
        };

        loadHistory();
    }, [project?.id, user, filterPlanningMessages]);

    // Scroll to bottom when new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 自动触发 AI 分镜生成：当项目有剧本但没有场景/镜头时
    useEffect(() => {
        if (!project || !project.id || project.id !== (params?.id as string)) return;
        if (isGenerating || isSubmitting) return;

        const hasScenes = project.scenes && project.scenes.length > 0;
        const hasShots = project.shots && project.shots.length > 0;
        const hasScript = project.script && project.script.trim().length > 0;

        const shouldAutoGenerate = hasScript && !hasScenes && !hasShots;

        if (shouldAutoGenerate) {
            const timer = setTimeout(() => {
                const latestProject = useProjectStore.getState().project;
                if (latestProject?.id === project.id &&
                    latestProject.script?.trim() &&
                    (!latestProject.scenes || latestProject.scenes.length === 0)) {
                    handleAIStoryboard();
                }
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [project?.id, project?.script, project?.scenes?.length, isGenerating, isSubmitting, params?.id, handleAIStoryboard]);

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
            isFirstMessage: isFirstMessageRef.current,
            previousScript: project.script,
        });

        console.log('[PlanningView] 本地预检结果:', localIntent);
        isFirstMessageRef.current = false;

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
    // 分镜生成流程
    const proceedWithStoryboardGeneration = async (userContent: string) => {
        if (!project) return;

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
