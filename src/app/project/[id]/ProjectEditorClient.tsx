'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas';
import RightPanel from '@/components/layout/RightPanel';
import TimelineView from '@/components/layout/TimelineView';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import { Film } from 'lucide-react';
import ViewSwitcher, { ViewType } from '@/components/layout/ViewSwitcher';
import { createPortal } from 'react-dom';
import PlanningView from '@/components/director/PlanningView';
import { AspectRatio } from '@/types/project';

export function ProjectEditorClient() {
    const params = useParams();
    const router = useRouter();
    const { t } = useI18n();
    const project = useProjectStore(s => s.project);
    const loadProjectToStore = useProjectStore(s => s.loadProject);
    const { user, profile, signOut, loading: authLoading } = useRequireWhitelist();
    const [isLoadingProject, setIsLoadingProject] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showTimelineView, setShowTimelineView] = useState(false);
    const [showDirectorMode, setShowDirectorMode] = useState(false);

    const activeView: ViewType = showTimelineView ? 'timeline' : showDirectorMode ? 'planning' : 'canvas';

    const handleViewChange = (view: ViewType) => {
        if (view === 'timeline') {
            setShowTimelineView(true);
            setShowDirectorMode(false);
        } else if (view === 'planning') {
            setShowDirectorMode(true);
            setShowTimelineView(false);
        } else {
            setShowTimelineView(false);
            setShowDirectorMode(false);
        }
    };


    useEffect(() => {
        // 等待认证完成后再加载项目
        if (authLoading) {
            console.log('[ProjectEditorClient] ⏳ 等待认证完成...');
            return;
        }

        // 检查用户是否已登录
        if (!user) {
            console.warn('[ProjectEditorClient] ⚠️ 用户未登录，立即重定向到登录页');
            setLoadError('请先登录后访问');
            // 立即重定向，不等待（避免在无痕模式下触发不必要的错误）
            router.push('/auth/login');
            return;
        }

        const loadOrCreateProject = async () => {
            const projectId = params.id as string;
            console.log('[ProjectEditorClient] 🔄 开始加载项目:', projectId);
            console.log('[ProjectEditorClient] 👤 当前用户:', user.email);

            // Avoid re-loading if already loaded
            if (project && project.id === projectId) {
                console.log('[ProjectEditorClient] ⚡ 项目已加载，跳过重新加载');
                setIsLoadingProject(false);
                return;
            }

            setIsLoadingProject(true);
            setLoadError(null);

            try {
                // 从数据库加载项目（自动选择 IndexedDB 或 Supabase）
                const loadedProject = await dataService.loadProject(projectId, user.id);
                if (loadedProject) {
                    loadProjectToStore(loadedProject);
                    console.log('[ProjectEditorClient] ✅ 项目已加载:', projectId);
                } else {
                    // 项目不存在，立即返回首页
                    console.warn('[ProjectEditorClient] ⚠️ 项目不存在，返回首页');
                    setLoadError('项目不存在');
                    router.push('/');
                }
            } catch (error) {
                console.error('[ProjectEditorClient] ❌ 加载项目失败:', error);
                const errorMessage = error instanceof Error ? error.message : '加载失败';
                setLoadError(errorMessage);

                // 如果是认证相关错误，立即重定向到登录页
                if (errorMessage.includes('认证') || errorMessage.includes('登录') || errorMessage.includes('未登录')) {
                    router.push('/auth/login');
                }
            } finally {
                setIsLoadingProject(false);
            }
        };

        loadOrCreateProject();
    }, [params.id, loadProjectToStore, router, user, authLoading]);

    // 显示加载状态
    if (authLoading || isLoadingProject) {
        return (
            <div className="min-h-screen bg-light-bg dark:bg-cine-black flex items-center justify-center">
                <div className="text-center">
                    <div className="text-light-text-muted dark:text-cine-text-muted mb-2">
                        {authLoading ? '正在验证身份...' : t('common.loading')}
                    </div>
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted opacity-60">
                        {authLoading ? '请稍候' : '加载项目中'}
                    </div>
                </div>
            </div>
        );
    }

    // 显示错误状态
    if (loadError) {
        const isAuthError = loadError.includes('认证') || loadError.includes('登录');

        return (
            <div className="min-h-screen bg-light-bg dark:bg-cine-black flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-red-500 mb-2 text-xl font-bold">
                        {isAuthError ? '认证失败' : '加载失败'}
                    </div>
                    <div className="text-sm text-light-text-muted dark:text-cine-text-muted mb-6">
                        {loadError}
                    </div>
                    <div className="flex gap-3 justify-center">
                        {isAuthError ? (
                            <button
                                onClick={() => router.push('/auth/login')}
                                className="px-6 py-3 bg-light-accent dark:bg-cine-accent text-white rounded-lg hover:opacity-90 font-medium"
                            >
                                重新登录
                            </button>
                        ) : (
                            <button
                                onClick={() => router.push('/')}
                                className="px-6 py-3 bg-light-accent dark:bg-cine-accent text-white rounded-lg hover:opacity-90 font-medium"
                            >
                                返回首页
                            </button>
                        )}
                    </div>
                    {isAuthError && (
                        <div className="mt-4 text-xs text-light-text-muted dark:text-cine-text-muted">
                            {loadError.includes('超时') ? '认证超时，可能是网络问题或浏览器限制' : ''}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 项目未加载
    if (!project) {
        return (
            <div className="min-h-screen bg-light-bg dark:bg-cine-black flex items-center justify-center">
                <div className="text-light-text-muted dark:text-cine-text-muted">
                    {t('common.loading')}
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-light-bg dark:bg-cine-black flex flex-col overflow-hidden">
            {/* View Switcher */}
            <ViewSwitcher activeView={activeView} onViewChange={handleViewChange} />

            {/* Fullscreen Timeline View */}
            {showTimelineView && (
                <TimelineView onClose={() => setShowTimelineView(false)} />
            )}

            {/* Planning View (Director Mode) */}
            {showDirectorMode && createPortal(
                <div className="fixed inset-0 z-[100]">
                    <PlanningView
                        onClose={() => setShowDirectorMode(false)}
                        showExitButton={true}
                        showHomeButton={true}
                        activeView="planning"
                        onSwitchToCanvas={() => setShowDirectorMode(false)}
                        onSwitchToTimeline={() => {
                            setShowDirectorMode(false);
                            setShowTimelineView(true);
                        }}
                        onOpenGridSelection={(fullGridUrl, slices) => {
                            // We can use the store to set the grid result, which might be picked up by a global modal or we need to handle it here.
                            // Since GridPreviewModal is in ChatPanel, and ChatPanel is in RightPanel.
                            // If we are in PlanningView, RightPanel is not the main focus, but it might be visible if we toggle it.
                            // However, for now, let's assume we want to use the store to trigger the modal.
                            // But wait, GridPreviewModal is inside ChatPanel. If ChatPanel is not mounted or active, it won't show.
                            // We might need to move GridPreviewModal to a higher level or ProjectEditorClient.

                            // For now, let's try setting it in the store and see if it works if ChatPanel is active.
                            // If not, we might need to move GridPreviewModal.
                            useProjectStore.getState().setGridResult({
                                fullImage: fullGridUrl,
                                slices: slices,
                                sceneId: useProjectStore.getState().currentSceneId || '', // We might need a better way to get sceneId
                                gridRows: 2, // Default or infer
                                gridCols: 2, // Default or infer
                                gridSize: slices.length === 9 ? '3x3' : '2x2',
                                prompt: '', // We might not have this easily
                                aspectRatio: AspectRatio.WIDE // Default
                            });
                            // Also ensure RightPanel is open and in Pro mode if we want to show it there?
                            // Or maybe we should move GridPreviewModal to ProjectEditorClient.
                        }}
                    />
                </div>,
                document.body
            )}

            {/* Main Layout */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Sidebar (Now Floating) */}
                <LeftSidebarNew
                    activeView={activeView}
                    onSwitchToTimeline={() => setShowTimelineView(true)}
                />

                {/* Canvas Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <InfiniteCanvas />
                </div>

                {/* Right Panel */}
                <RightPanel />
            </div>

            {/* View Switch Button - Hidden but kept for potential legacy triggers */}
            <button
                id="timeline-view-trigger"
                onClick={() => setShowTimelineView(true)}
                className="hidden"
                title="时间轴视图"
            >
                <Film size={16} />
                <span className="text-sm font-medium">时间轴视图</span>
            </button>
        </div>
    );
}
