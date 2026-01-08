'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { useAIStoryboard } from '@/hooks/useAIStoryboard';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import { useParams } from 'next/navigation';
import { ChatMessage, Character, Location } from '@/types/project';

// Sub-components
import PlanningHeader from './PlanningHeader';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import PlanningChat from './PlanningChat';

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

    // UI State
    // const [activeTab, setActiveTab] = useState<'storyboard' | 'characters' | 'locations'>('storyboard');
    // const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

    // Agent state
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
        if (!text.trim() || isSubmitting || isGenerating) return;
        if (!project) {
            toast.error('请先创建或打开一个项目');
            return;
        }
        if (!user) {
            toast.error('请先登录以使用 AI 功能');
            return;
        }

        const userContent = text.trim();
        setInputText('');
        setIsSubmitting(true);

        const hasScript = !!project.script?.trim();
        const scriptToUse = hasScript ? project.script.trim() : userContent;

        // 立即添加用户消息到本地状态（乐观更新）
        const userMessage: ChatMessage = {
            id: generateMessageId(),
            userId: user?.id || '',
            projectId: project?.id || '',
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
                    isProcessing={isSubmitting}
                    isGenerating={isGenerating}
                    thinkingSteps={[]}
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
        </div>
    );
}
