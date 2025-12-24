'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Film, Clock, Trash2, LogOut, Coins, Folder, Sparkles, User, Image as ImageIcon } from 'lucide-react';
import { UserNav } from '@/components/layout/UserNav';
import { useI18n } from '@/components/providers/I18nProvider';
import NewProjectDialog from '@/components/project/NewProjectDialog';
import NewSeriesDialog from '@/components/project/NewSeriesDialog';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import type { Project, Series } from '@/types/project';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSeriesId = searchParams.get('seriesId');

  const { createNewProject, project } = useProjectStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewSeriesDialog, setShowNewSeriesDialog] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // AI Director Input State
  const [aiDirectorInput, setAiDirectorInput] = useState('');
  const [isAiBrainstorming, setIsAiBrainstorming] = useState(false);
  const [aiProposal, setAiProposal] = useState<{
    title?: string;
    description?: string;
    artStyle?: string;
    aspectRatio?: string;
  } | null>(null);

  const { user, profile, signOut, loading: authLoading } = useRequireWhitelist();

  // 加载数据
  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [user, authLoading, currentSeriesId]);

  const loadData = async () => {
    console.log('[HomePage] 🔄 开始加载数据...');
    setIsLoading(true);
    setLoadError(null);

    if (!user) {
      setProjects([]);
      setSeries([]);
      setIsLoading(false);
      return;
    }

    try {
      const [allProjects, allSeries] = await Promise.all([
        dataService.getAllProjects(user.id),
        dataService.getAllSeries()
      ]);
      console.log('[HomePage] Raw projects:', allProjects);
      console.log('[HomePage] Raw series:', allSeries);

      setProjects(allProjects);
      setSeries(allSeries);
      console.log('[HomePage] ✅ 数据加载完成', { projects: allProjects.length, series: allSeries.length });
    } catch (error) {
      console.error('[HomePage] ❌ 加载失败:', error);
      setLoadError(error instanceof Error ? error.message : '加载失败');
      toast.error('加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const activeSeries = currentSeriesId ? series.find(s => s.id === currentSeriesId) : null;

  // Filter items for display
  const displayedItems = (() => {
    if (currentSeriesId) {
      return projects.filter(p => p.seriesId === currentSeriesId).map(p => ({ type: 'project' as const, data: p }));
    } else {
      const seriesItems = series.map(s => ({ type: 'series' as const, data: s }));
      const projectItems = projects.filter(p => !p.seriesId).map(p => ({ type: 'project' as const, data: p }));
      return [...seriesItems, ...projectItems];
    }
  })();

  const handleAiDirectorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiDirectorInput.trim()) return;

    setIsAiBrainstorming(true);
    setAiProposal(null); // Reset previous proposal

    try {
      const response = await fetch('/api/ai/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: aiDirectorInput })
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();

      // Map simple aspect ratio strings to our enum values if strictly needed,
      // but NewProjectDialog handles validation.
      let mappedAspectRatio = data.recommendedAspectRatio;
      if (mappedAspectRatio === "16:9") mappedAspectRatio = "WIDE";
      if (mappedAspectRatio === "9:16") mappedAspectRatio = "MOBILE";
      if (mappedAspectRatio === "1:1") mappedAspectRatio = "SQUARE";
      if (mappedAspectRatio === "4:3") mappedAspectRatio = "STANDARD";
      if (mappedAspectRatio === "21:9") mappedAspectRatio = "CINEMA";

      setAiProposal({
        title: data.title,
        description: data.description,
        artStyle: data.artStyle,
        aspectRatio: mappedAspectRatio
      });

      setShowNewProjectDialog(true);
    } catch (error) {
      console.error('Brainstorming failed:', error);
      toast.error('AI 构思失败，请直接手动创建');
      // Fallback: open dialog with raw input as description
      setAiProposal({ description: aiDirectorInput });
      setShowNewProjectDialog(true);
    } finally {
      setIsAiBrainstorming(false);
    }
  };

  const handleCreateProject = async (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => {
    try {
      createNewProject(title, description, artStyle, aspectRatio);
      await new Promise(resolve => setTimeout(resolve, 100));
      const currentProject = useProjectStore.getState().project;

      if (!currentProject) throw new Error('Project creation failed');

      if (currentSeriesId) {
        currentProject.seriesId = currentSeriesId;
      }

      await dataService.saveProject(currentProject, user?.id);

      setShowNewProjectDialog(false);
      router.push(`/project/${currentProject.id}`);
    } catch (error) {
      console.error('[HomePage] ❌ Create failed:', error);
      toast.error('创建项目失败');
    }
  };

  const handleCreateSeries = async (title: string, description: string) => {
    if (!user) return;
    try {
      const newSeries: Series = {
        id: crypto.randomUUID(),
        userId: user.id,
        title,
        description,
        created: new Date(),
        updated: new Date()
      };
      await dataService.saveSeries(newSeries);
      toast.success('剧集创建成功');
      setShowNewSeriesDialog(false);
      loadData();
    } catch (error) {
      console.error('Failed to create series:', error);
      toast.error('创建剧集失败');
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('确定要删除这个项目吗？')) {
      try {
        await dataService.deleteProject(projectId);
        loadData();
      } catch (error) {
        toast.error('删除失败');
      }
    }
  };

  const handleDeleteSeries = async (seriesId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('删除剧集将只删除剧集容器，内部项目将移至根目录。确定吗？')) {
      try {
        await dataService.deleteSeries(seriesId);
        loadData();
      } catch (error) {
        toast.error('删除剧集失败');
      }
    }
  };

  const formatDate = (date: Date) => new Date(date).toLocaleDateString('zh-CN');

  return (
    <main className="min-h-screen bg-light-bg dark:bg-cine-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                alt="Logo"
                width={40}
                height={40}
                className="object-contain"
              />
              <h1 className="text-2xl font-bold text-light-text dark:text-white hidden md:block">
                {t('common.appName')}
              </h1>
            </Link>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

            <Link
              href="/assets"
              className="flex items-center gap-2 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent transition-colors"
            >
              <ImageIcon size={18} />
              <span className="text-sm font-medium">素材库</span>
            </Link>
          </div>
          <UserNav />
        </header>

        {/* AI Director Hero Section */}
        {!currentSeriesId && (
          <section className="mb-12 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-light-text dark:text-white mb-6">
              What&apos;s your story today?
            </h2>
            <div className="max-w-3xl mx-auto relative">
              <form onSubmit={handleAiDirectorSubmit} className="relative">
                <input
                  type="text"
                  value={aiDirectorInput}
                  onChange={(e) => setAiDirectorInput(e.target.value)}
                  placeholder="描述你的创意，AI 导演将为你生成策划案..."
                  className="w-full bg-white dark:bg-cine-panel border-2 border-light-border dark:border-cine-border rounded-full py-4 px-8 pr-32 text-lg focus:outline-none focus:border-light-accent dark:focus:border-cine-accent shadow-lg transition-all"
                />
                <button
                  type="submit"
                  disabled={isAiBrainstorming}
                  className="absolute right-2 top-2 bottom-2 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-bg px-6 rounded-full font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isAiBrainstorming ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>思考中...</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>开始</span>
                    </>
                  )}
                </button>
              </form>
              <p className="mt-4 text-light-text-muted dark:text-cine-text-muted text-sm">
                试一试: &ldquo;一个赛博朋克风格的侦探故事&rdquo; 或 &ldquo;关于咖啡制作的纪录片&rdquo;
              </p>
            </div>
          </section>
        )}

        {/* Breadcrumb if in Series */}
        {currentSeriesId && activeSeries && (
          <div className="mb-6 flex items-center gap-2 text-lg">
            <Link href="/" className="text-light-text-muted hover:text-light-text dark:text-cine-text-muted dark:hover:text-white transition-colors">首页</Link>
            <span className="text-gray-400">/</span>
            <span className="font-bold text-light-text dark:text-white flex items-center gap-2">
              <Folder size={20} className="text-light-accent dark:text-cine-accent" />
              {activeSeries.title}
            </span>
          </div>
        )}

        {/* Content Controls */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-light-text dark:text-white">
            {currentSeriesId ? '剧集列表' : '最近项目'}
          </h3>
          <div className="flex gap-2">
            {!currentSeriesId && (
              <button
                onClick={() => setShowNewSeriesDialog(true)}
                className="inline-flex items-center gap-2 bg-white dark:bg-cine-panel text-light-text dark:text-white border border-light-border dark:border-cine-border px-4 py-2 rounded-lg font-bold hover:border-light-accent dark:hover:border-cine-accent transition-colors"
              >
                <Folder size={18} />
                新建剧集
              </button>
            )}
            <button
              onClick={() => setShowNewProjectDialog(true)}
              className="inline-flex items-center gap-2 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-bg px-4 py-2 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors"
            >
              <Plus size={18} />
              {currentSeriesId ? '新建分集' : '新建项目'}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            <div className="col-span-full py-20 text-center text-light-text-muted dark:text-cine-text-muted">加载中...</div>
          ) : displayedItems.length === 0 ? (
            <div className="col-span-full py-20 border-2 border-dashed border-light-border dark:border-cine-border rounded-lg text-center">
              <p className="text-light-text-muted dark:text-cine-text-muted">没有项目</p>
            </div>
          ) : (
            displayedItems.map((item) => {
              if (item.type === 'series') {
                const s = item.data as Series;
                return (
                  <Link
                    key={`series-${s.id}`}
                    href={`/?seriesId=${s.id}`}
                    className="group bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-4 hover:border-light-accent dark:hover:border-cine-accent transition-all relative"
                  >
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                      {s.coverImage ? (
                        <img src={s.coverImage} alt={s.title} className="w-full h-full object-cover" />
                      ) : (
                        <Folder size={48} className="text-light-accent dark:text-cine-accent opacity-50" />
                      )}
                      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded max-w-full truncate">
                        剧集
                      </div>
                    </div>
                    <h4 className="font-bold text-light-text dark:text-white truncate">{s.title}</h4>
                    <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">{formatDate(s.updated)}</p>

                    <button
                      onClick={(e) => handleDeleteSeries(s.id, e)}
                      className="absolute top-2 right-2 p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded hover:bg-black/40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </Link>
                );
              } else {
                const p = item.data as Project;
                return (
                  <Link
                    key={`proj-${p.id}`}
                    href={`/project/${p.id}`}
                    className="group bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl overflow-hidden hover:border-light-accent dark:hover:border-cine-accent transition-all relative"
                  >
                    <div className="aspect-video bg-gray-100 dark:bg-black relative">
                      {p.shots && p.shots.length > 0 && p.shots[0].referenceImage ? (
                        <img src={p.shots[0].referenceImage} alt={p.metadata.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film size={32} className="text-gray-400" />
                        </div>
                      )}

                      <button
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="p-3">
                      <h4 className="font-bold text-sm text-light-text dark:text-white truncate mb-1">{p.metadata.title}</h4>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatDate(p.metadata.modified)}</span>
                        <span className="flex items-center gap-1"><Film size={10} /> {p.shots?.length || 0}</span>
                      </div>
                    </div>
                  </Link>
                )
              }
            })
          )}
        </div>

        {showNewProjectDialog && (
          <NewProjectDialog
            onConfirm={handleCreateProject}
            onClose={() => setShowNewProjectDialog(false)}
            initialDescription={aiProposal?.description || aiDirectorInput}
            initialTitle={aiProposal?.title}
            initialArtStyle={aiProposal?.artStyle}
            initialAspectRatio={aiProposal?.aspectRatio}
          />
        )}

        {showNewSeriesDialog && (
          <NewSeriesDialog
            onConfirm={handleCreateSeries}
            onClose={() => setShowNewSeriesDialog(false)}
          />
        )}
      </div>
    </main>
  );
}
