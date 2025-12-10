'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas';
import RightPanel from '@/components/layout/RightPanel';
import Timeline from '@/components/layout/Timeline';
import { useI18n } from '@/components/providers/I18nProvider';

export function ProjectEditorClient() {
    const params = useParams();
    const router = useRouter();
    const { t } = useI18n();
    const { project, loadProject: loadProjectToStore } = useProjectStore();

    useEffect(() => {
        const loadOrCreateProject = async () => {
            const projectId = params.id as string;

            // 从数据库加载项目（自动选择 IndexedDB 或 Supabase）
            const loadedProject = await dataService.loadProject(projectId);
            if (loadedProject) {
                loadProjectToStore(loadedProject);
                console.log('✅ 项目已加载:', projectId);
            } else {
                // 项目不存在，返回首页
                console.warn('⚠️ 项目不存在，返回首页');
                router.push('/');
            }
        };

        loadOrCreateProject();
    }, [params.id, loadProjectToStore, router]);

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

            {/* Timeline */}
            <Timeline />
        </div>
    );
}
