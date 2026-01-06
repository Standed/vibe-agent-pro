'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import { useRequireWhitelist } from '@/components/auth/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import {
    Home,
    FileText,
    Users,
    MapPin,
    Sparkles,
    Send,
    Loader2,
    Plus,
    ArrowRight,
    ChevronLeft,
    MessageSquare,
    History,
    Settings,
    Trash2,
    Edit3
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAIStoryboard } from '@/hooks/useAIStoryboard';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatBubble } from '@/components/chat/ChatBubble';
import PlanningView from '@/components/director/PlanningView';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function PlanningPage() {
    const params = useParams();
    const router = useRouter();
    const { t } = useI18n();
    const { project, loadProject: loadProjectToStore, updateScript, addCharacter, addLocation, updateProjectMetadata } = useProjectStore();
    const { user, loading: authLoading } = useRequireWhitelist();
    const [isLoadingProject, setIsLoadingProject] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // UI State
    const [activeTab, setActiveTab] = useState<'script' | 'characters' | 'locations'>('script');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Dialog states
    const [showAddCharacter, setShowAddCharacter] = useState(false);
    const [showAddLocation, setShowAddLocation] = useState(false);

    // AI Storyboard hook
    const { isGenerating, handleAIStoryboard } = useAIStoryboard();

    // Load project
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/auth/login');
            return;
        }

        const loadProject = async () => {
            const projectId = params.id as string;
            setIsLoadingProject(true);

            try {
                const loadedProject = await dataService.loadProject(projectId, user.id);
                if (loadedProject) {
                    loadProjectToStore(loadedProject);
                    // Load chat history from metadata
                    if (loadedProject.metadata?.planningHistory) {
                        setMessages(loadedProject.metadata.planningHistory as ChatMessage[]);
                    }
                } else {
                    setLoadError('项目不存在');
                    router.push('/');
                }
            } catch (error) {
                console.error('Load project error:', error);
                setLoadError(error instanceof Error ? error.message : '加载失败');
            } finally {
                setIsLoadingProject(false);
            }
        };

        loadProject();
    }, [params.id, user, authLoading, loadProjectToStore, router]);

    // Scroll to bottom when new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (textOverride?: string) => {
        const text = textOverride || inputText;
        if (!text.trim() || isSending) return;

        const userMessage: ChatMessage = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date(),
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInputText('');
        setIsSending(true);

        try {
            const response = await fetch('/api/ai/planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    projectId: project?.id,
                    context: {
                        script: project?.script,
                        characters: project?.characters,
                        locations: project?.locations,
                    }
                }),
            });

            if (!response.ok) throw new Error('AI 响应失败');

            const data = await response.json();

            const assistantMessage: ChatMessage = {
                id: `assistant_${Date.now()}`,
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };

            const finalMessages = [...newMessages, assistantMessage];
            setMessages(finalMessages);

            // Save chat history to project metadata
            if (project) {
                updateProjectMetadata({
                    ...project.metadata,
                    planningHistory: finalMessages
                });
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('发送失败，请重试');
        } finally {
            setIsSending(false);
        }
    };

    const handleGenerateShots = async () => {
        if (!project?.script) {
            toast.error('请先输入剧本');
            return;
        }

        await handleAIStoryboard();
    };

    if (authLoading || isLoadingProject) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-light-accent/20 dark:border-cine-accent/20"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-t-light-accent dark:border-t-cine-accent animate-spin"></div>
                    </div>
                    <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 animate-pulse">
                        {authLoading ? '正在验证身份...' : '正在准备导演工作室...'}
                    </div>
                </div>
            </div>
        );
    }

    if (loadError || !project) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0a0a0a] flex items-center justify-center p-4">
                <div className="max-w-md w-full glass-panel p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                        <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">加载失败</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{loadError || '项目加载失败，请检查网络连接'}</p>
                    </div>
                    <button onClick={() => router.push('/')} className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:scale-[1.02] transition-transform">
                        返回首页
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full overflow-hidden">
            <PlanningView
                showExitButton={false}
                showHomeButton={true}
            />
        </div>
    );
}
