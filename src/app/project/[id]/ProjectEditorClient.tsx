'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas';
import RightPanel from '@/components/layout/RightPanel';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/auth/AuthProvider';

export function ProjectEditorClient() {
    const params = useParams();
    const router = useRouter();
    const { t } = useI18n();
    const { project, loadProject: loadProjectToStore } = useProjectStore();
    const { user, loading: authLoading } = useAuth();
    const [isLoadingProject, setIsLoadingProject] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        // 等待认证完成后再加载项目
        if (authLoading) {
            console.log('[ProjectEditorClient] ⏳ 等待认证完成...');
            return;
        }

        // 检查用户是否已登录
        if (!user) {
            console.warn('[ProjectEditorClient] ⚠️ 用户未登录，重定向到登录页');
            setLoadError('请先登录后访问');
            setTimeout(() => router.push('/auth/login'), 2000);
            return;
        }

        const loadOrCreateProject = async () => {
            const projectId = params.id as string;
            console.log('[ProjectEditorClient] 🔄 开始加载项目:', projectId);
            console.log('[ProjectEditorClient] 👤 当前用户:', user.email);

            setIsLoadingProject(true);
            setLoadError(null);

            try {
                // 从数据库加载项目（自动选择 IndexedDB 或 Supabase）
                const loadedProject = await dataService.loadProject(projectId);
                if (loadedProject) {
                    loadProjectToStore(loadedProject);
                    console.log('[ProjectEditorClient] ✅ 项目已加载:', projectId);
                } else {
                    // 项目不存在，返回首页
                    console.warn('[ProjectEditorClient] ⚠️ 项目不存在，返回首页');
                    setLoadError('项目不存在');
                    setTimeout(() => router.push('/'), 2000);
                }
            } catch (error) {
                console.error('[ProjectEditorClient] ❌ 加载项目失败:', error);
                const errorMessage = error instanceof Error ? error.message : '加载失败';
                setLoadError(errorMessage);

                // 如果是认证相关错误，重定向到登录页
                if (errorMessage.includes('认证') || errorMessage.includes('登录')) {
                    setTimeout(() => router.push('/auth/login'), 3000);
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
            {/* Main Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <LeftSidebarNew />

                {/* Canvas Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Canvas */}
                    <div className="flex-1 relative overflow-hidden">
                        <InfiniteCanvas />
                    </div>
                </div>

                {/* Right Panel */}
                <RightPanel />
            </div>

            {/* Timeline - 暂时隐藏，此版本未启用 */}
            {/* <Timeline /> */}
        </div>
    );
}
