'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Film, Clock, Trash2 } from 'lucide-react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useI18n } from '@/components/providers/I18nProvider';
import NewProjectDialog from '@/components/project/NewProjectDialog';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import { MigrationPrompt } from '@/components/migration/MigrationPrompt';
import type { Project } from '@/types/project';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const { createNewProject, project } = useProjectStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 加载所有项目
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const allProjects = await dataService.getAllProjects();
      setProjects(allProjects);
      console.log('✅ 已加载项目列表:', allProjects.length);
    } catch (error) {
      console.error('❌ 加载项目失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => {
    // 1. 在 store 中创建项目
    createNewProject(title, description, artStyle, aspectRatio);
    setShowNewProjectDialog(false);

    // 2. 立即保存到数据库（使用 setTimeout 确保 store 已更新）
    setTimeout(async () => {
      const currentProject = useProjectStore.getState().project;
      if (currentProject) {
        await dataService.saveProject(currentProject);
        console.log('✅ 项目已保存:', currentProject.id);
        // 3. 跳转到项目编辑页（使用实际的项目 ID）
        router.push(`/project/${currentProject.id}`);
      }
    }, 0);
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirm('确定要删除这个项目吗？此操作不可恢复。')) {
      try {
        await dataService.deleteProject(projectId);
        console.log('✅ 项目已删除:', projectId);
        // 重新加载项目列表
        loadProjects();
      } catch (error) {
        console.error('❌ 删除项目失败:', error);
        alert('删除项目失败，请重试');
      }
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <main className="min-h-screen bg-light-bg dark:bg-cine-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <Image
                  src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                  alt="西羊石AI视频"
                  width={48}
                  height={48}
                  className="h-12 w-auto object-contain"
                />
                <h1 className="text-4xl font-bold text-light-text dark:text-white">
                  {t('common.appName')}
                </h1>
              </div>
              <p className="text-light-text-muted dark:text-cine-text-muted text-lg">
                西羊石 AI 影视创作工具
              </p>
            </div>
            {/* Settings Button */}
            <SettingsPanel />
          </div>
        </header>

        {/* Create New Project Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowNewProjectDialog(true)}
            className="inline-flex items-center gap-2 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-black px-6 py-3 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors"
          >
            <Plus size={20} />
            {t('home.createProject')}
          </button>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            /* Loading State */
            <div className="col-span-full text-center py-20">
              <div className="text-light-text-muted dark:text-cine-text-muted">
                加载中...
              </div>
            </div>
          ) : projects.length === 0 ? (
            /* Empty State */
            <div className="col-span-full text-center py-20 border-2 border-dashed border-light-border dark:border-cine-border rounded-lg">
              <Film size={48} className="mx-auto mb-4 text-light-text-muted dark:text-cine-text-muted" />
              <h3 className="text-xl font-bold mb-2 text-light-text dark:text-white">
                {t('home.noProjects')}
              </h3>
              <p className="text-light-text-muted dark:text-cine-text-muted mb-4">
                {t('home.noProjectsDescription')}
              </p>
            </div>
          ) : (
            /* Project Cards */
            projects.map((proj) => (
              <Link
                key={proj.id}
                href={`/project/${proj.id}`}
                className="group bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg overflow-hidden hover:border-light-accent dark:hover:border-cine-accent transition-all"
              >
                {/* Project Thumbnail */}
                <div className="aspect-video bg-light-bg dark:bg-cine-black flex items-center justify-center relative">
                  {proj.shots && proj.shots.length > 0 && proj.shots[0].referenceImage ? (
                    <img
                      src={proj.shots[0].referenceImage}
                      alt={proj.metadata.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Film size={48} className="text-light-text-muted dark:text-cine-text-muted opacity-30" />
                  )}
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDeleteProject(proj.id, e)}
                    className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除项目"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Project Info */}
                <div className="p-4">
                  <h3 className="font-bold text-lg text-light-text dark:text-white mb-2 truncate">
                    {proj.metadata.title}
                  </h3>
                  {proj.metadata.description && (
                    <p className="text-sm text-light-text-muted dark:text-cine-text-muted mb-3 line-clamp-2">
                      {proj.metadata.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-light-text-muted dark:text-cine-text-muted">
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      <span>{formatDate(proj.metadata.modified)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {proj.scenes && <span>{proj.scenes.length} 场景</span>}
                      {proj.shots && <span>{proj.shots.length} 镜头</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Migration Prompt */}
      <MigrationPrompt onComplete={loadProjects} />

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          onConfirm={handleCreateProject}
          onClose={() => setShowNewProjectDialog(false)}
        />
      )}
    </main>
  );
}
