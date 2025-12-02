'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { loadProject } from '@/lib/db';
import LeftSidebar from '@/components/layout/LeftSidebar';
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas';
import RightPanel from '@/components/layout/RightPanel';
import Timeline from '@/components/layout/Timeline';

export default function ProjectEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { project, loadProject: loadProjectToStore, createNewProject } = useProjectStore();

  useEffect(() => {
    const loadOrCreateProject = async () => {
      const projectId = params.id as string;

      if (projectId === 'new') {
        // 创建新项目
        createNewProject('新项目', '');
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
  }, [params.id, createNewProject, loadProjectToStore, router]);

  if (!project) {
    return (
      <div className="min-h-screen bg-cine-black flex items-center justify-center">
        <div className="text-cine-text-muted">加载项目中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-cine-black flex flex-col overflow-hidden">
      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar />

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
