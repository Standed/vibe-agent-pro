'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Film, Clock, Trash2, LogOut, Coins } from 'lucide-react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { UserNav } from '@/components/layout/UserNav';
import { useI18n } from '@/components/providers/I18nProvider';
import NewProjectDialog from '@/components/project/NewProjectDialog';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import type { Project } from '@/types/project';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const { createNewProject, project } = useProjectStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user, profile, signOut, loading: authLoading } = useRequireWhitelist();

  // 加载所有项目（当用户状态变化时重新加载）
  useEffect(() => {
    // ⚠️ 只在认证初始化完成后才加载项目
    if (!authLoading) {
      loadProjects();
    }
  }, [user, authLoading]); // 依赖user和authLoading，登录/退出/初始化完成时重新加载

  const loadProjects = async () => {
    console.log('[HomePage] 🔄 开始加载项目列表...');
    setIsLoading(true);
    setLoadError(null);

    // 如果用户未登录，直接显示空列表
    if (!user) {
      console.log('[HomePage] ℹ️ 用户未登录，显示空项目列表');
      setProjects([]);
      setIsLoading(false);
      return;
    }

    try {
      // 传递 userId 给 dataService，避免重新获取用户超时
      const allProjects = await dataService.getAllProjects(user.id);
      setProjects(allProjects);
      console.log('[HomePage] ✅ 已加载项目列表:', allProjects.length, '个项目');
    } catch (error) {
      console.error('[HomePage] ❌ 加载项目失败:', error);
      const errorMessage = error instanceof Error ? error.message : '加载失败';
      setLoadError(errorMessage);

      // 如果是认证失败，提示用户重新登录
      if (errorMessage.includes('认证') || errorMessage.includes('登录')) {
        toast.error('认证失败', {
          description: '请重新登录以访问云端项目',
        });
      } else {
        toast.error('加载项目失败', {
          description: errorMessage,
        });
      }
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
    console.log('[HomePage] 📝 创建新项目:', { title, description, artStyle, aspectRatio });

    try {
      // 1. 在 store 中创建项目
      createNewProject(title, description, artStyle, aspectRatio);

      // 2. 等待 React 更新完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. 获取新创建的项目
      const currentProject = useProjectStore.getState().project;
      console.log('[HomePage] 当前项目状态:', currentProject);

      if (!currentProject) {
        console.error('[HomePage] ❌ 项目创建失败：currentProject 为空');
        toast.error('项目创建失败');
        throw new Error('项目创建失败');
      }

      // 4. 保存项目到数据库
      console.log('[HomePage] 💾 保存项目到数据库:', currentProject.id);
      await dataService.saveProject(currentProject, user?.id);
      console.log('[HomePage] ✅ 项目已保存:', currentProject.id);

      // 5. 保存成功后关闭弹窗
      setShowNewProjectDialog(false);

      // 6. 使用 window.location.href 强制导航（避免 router.push 失败）
      const targetUrl = `/project/${currentProject.id}`;
      console.log('[HomePage] 🔄 准备跳转到:', targetUrl);

      // 先尝试 router.push，如果 500ms 后还没跳转，使用 window.location.href
      const navigated = router.push(targetUrl);
      console.log('[HomePage] router.push 返回值:', navigated);

      // 设置一个安全超时，确保导航发生
      setTimeout(() => {
        if (window.location.pathname === '/') {
          console.log('[HomePage] ⚠️ router.push 未生效，使用 window.location.href 强制跳转');
          window.location.href = targetUrl;
        }
      }, 500);

    } catch (error) {
      console.error('[HomePage] ❌ 创建项目失败:', error);
      toast.error('创建项目失败，请重试');
      throw error; // 重新抛出错误，让 NewProjectDialog 处理
    }
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

  const handleSignOut = async () => {
    try {
      console.log('[HomePage] 开始退出登录...');
      await signOut();
      toast.info('已退出登录');
      // 强制跳转到登录页
      window.location.href = '/auth/login';
    } catch (err) {
      console.error('[HomePage] 退出失败:', err);
      window.location.href = '/auth/login';
    }
  };

  const clearLocalAuth = async () => {
    try {
      if (typeof document !== 'undefined') {
        // 清理正确的 cookie 名称：supabase-session
        document.cookie = 'supabase-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      if (typeof window !== 'undefined') {
        try {
          const { supabase } = await import('@/lib/supabase/client');
          await supabase.auth.signOut();
        } catch (err) {
          console.warn('[HomePage] 清理 Supabase 会话失败，忽略:', err);
        }
        try {
          window.localStorage?.clear?.();
          window.sessionStorage?.clear?.();
        } catch (err) {
          console.warn('[HomePage] 清理 Storage 失败（可能被阻止），忽略:', err);
        }
        try {
          window.indexedDB.deleteDatabase('VideoAgentDB');
        } catch (err) {
          console.warn('[HomePage] 删除 IndexedDB 失败，忽略:', err);
        }
      }
      toast.success('已清理本地缓存，请重新登录');
      router.push('/auth/login');
    } catch (err) {
      console.error('[HomePage] 清理本地缓存失败:', err);
      toast.error('清理本地缓存失败，请手动刷新后重试');
    }
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
            {/* User Navigation */}
            <UserNav />
          </div>
        </header>

        {/* Create New Project Button */}
        <div className="mb-8 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowNewProjectDialog(true)}
            className="inline-flex items-center gap-2 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-black px-6 py-3 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors"
          >
            <Plus size={20} />
            {t('home.createProject')}
          </button>
          {!user && (
            <div className="flex flex-wrap items-center gap-2 text-sm px-3 py-2 rounded-lg border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted">
              <span>当前为本地模式，登录后可同步到云端</span>
              <button
                className="text-light-accent dark:text-cine-accent underline"
                onClick={() => router.push('/auth/login')}
              >
                去登录
              </button>
            </div>
          )}
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            /* Loading State */
            <div className="col-span-full text-center py-20">
              <div className="text-light-text-muted dark:text-cine-text-muted">
                加载中...
              </div>
              <button
                onClick={loadProjects}
                className="mt-4 inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent transition-colors"
              >
                重试
              </button>
            </div>
          ) : loadError ? (
            <div className="col-span-full text-center py-20 border-2 border-dashed border-red-400/50 dark:border-red-500/50 rounded-lg">
              <h3 className="text-xl font-bold mb-2 text-light-text dark:text-white">
                项目加载失败
              </h3>
              <p className="text-light-text-muted dark:text-cine-text-muted mb-4">
                {loadError}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={loadProjects}
                  className="px-4 py-2 bg-light-accent dark:bg-cine-accent text-white rounded-lg hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors"
                >
                  重试加载
                </button>
                {user && (
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 border border-light-border dark:border-cine-border rounded-lg text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent transition-colors"
                  >
                    退出登录
                  </button>
                )}
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

      <div className="mt-12 text-center text-xs text-light-text-muted dark:text-cine-text-muted">
        Copyright ©2026 xysai.ai All rights reserved.
      </div>

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
