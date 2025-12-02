'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { loadProject } from '@/lib/db';
import LeftSidebarNew from '@/components/layout/LeftSidebarNew';
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas';
import RightPanel from '@/components/layout/RightPanel';
import Timeline from '@/components/layout/Timeline';
import { useI18n } from '@/components/providers/I18nProvider';

export default function ProjectEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { project, loadProject: loadProjectToStore, createNewProject } = useProjectStore();

  useEffect(() => {
    const loadOrCreateProject = async () => {
      const projectId = params.id as string;

      if (projectId === 'new') {
        // 新项目：从 store 中获取刚创建的项目
        // 如果 store 中没有项目，重定向回首页
        if (!project) {
          router.push('/');
        }
      } else {
        // 加载现有项目
        const loadedProject = await loadProject(projectId);
        if (loadedProject) {
          loadProjectToStore(loadedProject);
        } else {
          // 项目不存在，返回首页
          router.push('/');
        }
      }
    };

    loadOrCreateProject();
  }, [params.id, project, loadProjectToStore, router]);

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

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <InfiniteCanvas />
        </div>

        {/* Right Panel */}
        <RightPanel />
      </div>

      {/* Timeline */}
      <Timeline />
    </div>
  );
}
