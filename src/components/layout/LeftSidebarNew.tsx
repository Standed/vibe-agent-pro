'use client';

import { useState } from 'react';
import {
  FileText,
  Film,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Plus,
  Home,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Loader2,
  Download,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { generateStoryboardFromScript, analyzeScript, groupShotsIntoScenes } from '@/services/storyboardService';
import { batchDownloadAssets } from '@/utils/batchDownload';
import AddShotDialog from '@/components/shot/AddShotDialog';
import { toast } from 'sonner';

type Tab = 'script' | 'storyboard' | 'assets';

export default function LeftSidebarNew() {
  const router = useRouter();
  const { project, leftSidebarCollapsed, toggleLeftSidebar, selectedShotId, selectShot, currentSceneId, selectScene, updateScript, addScene, addShot, deleteShot } = useProjectStore();
  const [activeTab, setActiveTab] = useState<Tab>('storyboard');
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');

  const scenes = project?.scenes || [];
  const shots = project?.shots || [];

  const toggleSceneCollapse = (sceneId: string) => {
    setCollapsedScenes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sceneId)) {
        newSet.delete(sceneId);
      } else {
        newSet.add(sceneId);
      }
      return newSet;
    });
  };

  const handleShotClick = (shotId: string) => {
    selectShot(shotId);
  };

  const handleAddShotClick = (sceneId: string) => {
    setSelectedSceneForNewShot(sceneId);
    setShowAddShotDialog(true);
  };

  const handleAddShot = (shotData: any) => {
    const newShot = {
      id: `shot_${Date.now()}`,
      ...shotData,
      status: 'pending' as const,
    };

    addShot(newShot);
    toast.success('镜头添加成功！', {
      description: `已添加到 ${scenes.find(s => s.id === shotData.sceneId)?.name}`
    });
  };

  const handleDeleteShot = (shotId: string, shotOrder: number, sceneName: string) => {
    const confirmed = confirm(
      `确定要删除镜头 #${shotOrder} 吗？\n\n此操作将同时删除该镜头的所有生成内容（图片、视频、历史记录等），且无法恢复。`
    );

    if (confirmed) {
      deleteShot(shotId);
      toast.success('镜头已删除', {
        description: `已从 ${sceneName} 中删除`
      });
    }
  };

  const handleAIStoryboard = async () => {
    if (!project?.script || !project.script.trim()) {
      toast.error('请先输入剧本内容');
      return;
    }

    setIsGenerating(true);
    try {
      // 1. Analyze script for metadata
      const analysis = await analyzeScript(project.script);

      // 2. Generate storyboard shots with project art style
      const generatedShots = await generateStoryboardFromScript(
        project.script,
        project.metadata.artStyle // 传入用户设置的画风
      );

      // 3. Group shots into scenes
      const sceneGroups = await groupShotsIntoScenes(generatedShots);

      // 4. Add scenes and shots to store
      sceneGroups.forEach((sceneGroup, idx) => {
        const scene = {
          id: `scene_${Date.now()}_${idx}`,
          name: sceneGroup.name,
          location: sceneGroup.location,
          description: '',
          shotIds: [],
          position: { x: idx * 300, y: 100 },
        };

        addScene(scene);

        // Add shots for this scene
        sceneGroup.shotIds.forEach((shotId) => {
          const shot = generatedShots.find(s => s.id === shotId);
          if (shot) {
            addShot({ ...shot, sceneId: scene.id });
          }
        });
      });

      toast.success(`成功生成 ${sceneGroups.length} 个场景，${generatedShots.length} 个镜头！`);
      // 自动切换到分镜脚本标签页
      setActiveTab('storyboard');
    } catch (error) {
      console.error('AI分镜失败:', error);
      toast.error('AI分镜生成失败', {
        description: '请检查API配置或网络连接'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchDownload = async () => {
    if (!project) {
      toast.error('没有可下载的项目');
      return;
    }

    // 检查是否有素材
    const hasAssets = project.shots.some(
      shot => shot.referenceImage || shot.gridImages?.length || shot.videoClip || shot.generationHistory?.length
    ) || project.audioAssets?.length || project.characters?.some(c => c.referenceImages?.length) || project.locations?.some(l => l.referenceImages?.length);

    if (!hasAssets) {
      toast.warning('项目中还没有任何素材', {
        description: '请先生成图片或视频'
      });
      return;
    }

    setIsDownloading(true);
    const downloadToast = toast.loading('正在打包下载...');

    try {
      const result = await batchDownloadAssets(project);
      toast.success('下载完成！', {
        id: downloadToast,
        description: `图片: ${result.imageCount} 个 | 视频: ${result.videoCount} 个 | 音频: ${result.audioCount} 个`
      });
    } catch (error) {
      console.error('批量下载失败:', error);
      toast.error('下载失败', {
        id: downloadToast,
        description: '请重试'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (leftSidebarCollapsed) {
    return (
      <div className="w-12 bg-light-panel dark:bg-cine-dark border-r border-light-border dark:border-cine-border flex flex-col items-center py-4">
        <button
          onClick={toggleLeftSidebar}
          className="p-2 hover:bg-light-bg dark:hover:bg-cine-panel rounded transition-colors"
          title="展开侧边栏"
        >
          <ChevronRightIcon size={20} className="text-light-text-muted dark:text-cine-text-muted" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-light-panel dark:bg-cine-dark border-r border-light-border dark:border-cine-border flex flex-col">
      {/* Header */}
      <div className="border-b border-light-border dark:border-cine-border p-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
        >
          <Home size={16} />
          <span>返回首页</span>
        </button>
        <button
          onClick={toggleLeftSidebar}
          className="p-1 hover:bg-light-bg dark:hover:bg-cine-panel rounded transition-colors"
          title="收起侧边栏"
        >
          <ChevronLeft size={16} className="text-light-text-muted dark:text-cine-text-muted" />
        </button>
      </div>

      {/* Project Info */}
      <div className="p-4 border-b border-light-border dark:border-cine-border">
        <h2 className="font-bold text-lg text-light-text dark:text-white truncate">
          {project?.metadata.title || '未命名项目'}
        </h2>
        {project?.metadata.description && (
          <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 line-clamp-2">
            {project.metadata.description}
          </p>
        )}
        {/* Batch Download Button */}
        <button
          onClick={handleBatchDownload}
          disabled={isDownloading}
          className="w-full mt-3 bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDownloading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>打包下载中...</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>批量下载素材</span>
            </>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-light-border dark:border-cine-border">
        <button
          onClick={() => setActiveTab('script')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${
            activeTab === 'script'
              ? 'bg-light-bg dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
              : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
          }`}
        >
          <FileText size={16} />
          <span>剧本</span>
        </button>
        <button
          onClick={() => setActiveTab('storyboard')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${
            activeTab === 'storyboard'
              ? 'bg-light-bg dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
              : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
          }`}
        >
          <Film size={16} />
          <span>分镜脚本</span>
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${
            activeTab === 'assets'
              ? 'bg-light-bg dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
              : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
          }`}
        >
          <FolderOpen size={16} />
          <span>资源</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'script' && (
          <div className="p-4 space-y-4">
            {/* Project Overview */}
            <div>
              <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                项目概要
              </h3>
              <div className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 space-y-2 text-xs">
                <div>
                  <span className="text-light-text-muted dark:text-cine-text-muted">项目名称：</span>
                  <span className="text-light-text dark:text-white">{project?.metadata.title}</span>
                </div>
                {project?.settings.aspectRatio && (
                  <div>
                    <span className="text-light-text-muted dark:text-cine-text-muted">画面比例：</span>
                    <span className="text-light-text dark:text-white">{project.settings.aspectRatio}</span>
                  </div>
                )}
                {project?.metadata.artStyle && (
                  <div>
                    <span className="text-light-text-muted dark:text-cine-text-muted">画风：</span>
                    <span className="text-light-text dark:text-white">{project.metadata.artStyle}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Script Content */}
            <div>
              <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                剧本文本
              </h3>
              <textarea
                value={project?.script || ''}
                onChange={(e) => updateScript(e.target.value)}
                placeholder="在此输入剧本内容..."
                className="w-full h-64 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted"
              />
            </div>

            {/* AI Storyboard Button */}
            <button
              onClick={handleAIStoryboard}
              disabled={isGenerating || !project?.script?.trim()}
              className="w-full bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>AI 分镜生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>AI 自动分镜</span>
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === 'storyboard' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-light-text dark:text-white">
                分镜脚本 ({shots.length} 个镜头)
              </h3>
            </div>

            {/* Scene List */}
            <div className="space-y-3">
              {scenes.map((scene) => {
                const sceneShots = shots.filter((s) => s.sceneId === scene.id);
                const isCollapsed = collapsedScenes.has(scene.id);

                return (
                  <div
                    key={scene.id}
                    className="bg-light-bg dark:bg-cine-black/30 rounded-lg overflow-hidden"
                  >
                    {/* Scene Header */}
                    <div className="flex items-center justify-between p-3 hover:bg-light-border/50 dark:hover:bg-cine-panel/50 transition-colors">
                      <button
                        onClick={() => toggleSceneCollapse(scene.id)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {isCollapsed ? (
                            <ChevronRight size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                          ) : (
                            <ChevronDown size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-light-text dark:text-white truncate">
                              {scene.name}
                            </div>
                            <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                              {sceneShots.length} 个镜头
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Add Shot Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddShotClick(scene.id);
                        }}
                        className="p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 rounded transition-colors flex-shrink-0"
                        title="添加镜头"
                      >
                        <Plus size={16} className="text-light-accent dark:text-cine-accent" />
                      </button>
                    </div>

                    {/* Shot List */}
                    {!isCollapsed && (
                      <div className="px-3 pb-3 space-y-2">
                        {sceneShots.map((shot) => (
                          <div
                            key={shot.id}
                            className={`relative rounded-lg transition-all ${
                              selectedShotId === shot.id
                                ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-2 border-light-accent dark:border-cine-accent'
                                : 'bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
                            }`}
                          >
                            {/* Shot Content - Clickable */}
                            <button
                              onClick={() => handleShotClick(shot.id)}
                              className="w-full text-left p-3"
                            >
                              <div className="flex items-start gap-3">
                                {/* Thumbnail */}
                                <div className="w-16 h-16 flex-shrink-0 bg-light-bg dark:bg-cine-black rounded overflow-hidden">
                                  {shot.referenceImage ? (
                                    <img
                                      src={shot.referenceImage}
                                      alt={`Shot ${shot.order}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-light-text-muted dark:text-cine-text-muted">
                                      <Film size={20} className="opacity-50" />
                                    </div>
                                  )}
                                </div>

                                {/* Shot Info */}
                                <div className="flex-1 min-w-0 pr-8">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-light-accent dark:text-cine-accent">
                                      #{shot.order}
                                    </span>
                                    <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                      {shot.shotSize}
                                    </span>
                                    <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                      {shot.duration}s
                                    </span>
                                    {shot.status === 'done' && (
                                      <span className="text-xs text-green-400">✓</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-light-text dark:text-white line-clamp-2">
                                    {shot.description}
                                  </p>
                                  {/* 显示对白（如果有） */}
                                  {shot.dialogue && (
                                    <p className="text-xs text-light-accent dark:text-cine-accent mt-1 line-clamp-1 italic">
                                      💬 "{shot.dialogue}"
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Delete Button - Absolute positioned */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteShot(shot.id, shot.order, scene.name);
                              }}
                              className="absolute top-2 right-2 p-1.5 hover:bg-red-500/10 rounded transition-colors group"
                              title="删除镜头"
                            >
                              <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover:text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {scenes.length === 0 && (
                <div className="text-center py-12 text-light-text-muted dark:text-cine-text-muted">
                  <Film size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">还没有分镜</p>
                  <p className="text-xs mt-1">在剧本标签页使用 AI 自动分镜</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="p-4 space-y-6">
            {/* Characters */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-light-text dark:text-white">
                  角色 ({project?.characters.length || 0})
                </h3>
                <button className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1">
                  <Plus size={14} />
                  <span>添加</span>
                </button>
              </div>
              <div className="space-y-2">
                {project?.characters.map((character) => (
                  <div
                    key={character.id}
                    className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3"
                  >
                    <div className="font-medium text-sm text-light-text dark:text-white">
                      {character.name}
                    </div>
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 line-clamp-2">
                      {character.description}
                    </div>
                  </div>
                ))}
                {(!project?.characters || project.characters.length === 0) && (
                  <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                    暂无角色
                  </div>
                )}
              </div>
            </div>

            {/* Locations */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-light-text dark:text-white">
                  场景地点 ({project?.locations.length || 0})
                </h3>
                <button className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1">
                  <Plus size={14} />
                  <span>添加</span>
                </button>
              </div>
              <div className="space-y-2">
                {project?.locations.map((location) => (
                  <div
                    key={location.id}
                    className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3"
                  >
                    <div className="font-medium text-sm text-light-text dark:text-white">
                      {location.name}
                    </div>
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                      {location.type === 'interior' ? '室内' : '室外'}
                    </div>
                  </div>
                ))}
                {(!project?.locations || project.locations.length === 0) && (
                  <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                    暂无场景地点
                  </div>
                )}
              </div>
            </div>

            {/* Audio (Coming Soon) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-light-text-muted dark:text-cine-text-muted opacity-50">
                  音频（后期功能）
                </h3>
              </div>
              <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4 opacity-50">
                音频功能即将上线
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Shot Dialog */}
      {showAddShotDialog && selectedSceneForNewShot && (
        <AddShotDialog
          sceneId={selectedSceneForNewShot}
          sceneName={scenes.find(s => s.id === selectedSceneForNewShot)?.name || ''}
          existingShotsCount={shots.filter(s => s.sceneId === selectedSceneForNewShot).length}
          onAdd={handleAddShot}
          onClose={() => setShowAddShotDialog(false)}
        />
      )}
    </div>
  );
}
