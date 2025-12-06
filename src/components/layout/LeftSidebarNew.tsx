'use client';

import { useEffect, useRef, useState } from 'react';
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
  Edit2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { generateStoryboardFromScript, analyzeScript, groupShotsIntoScenes } from '@/services/storyboardService';
import { batchDownloadAssets } from '@/utils/batchDownload';
import AddShotDialog from '@/components/shot/AddShotDialog';
import ShotListItem from '@/components/shot/ShotListItem';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { toast } from 'sonner';
import type { Shot, ShotSize, CameraMovement, Character, Location } from '@/types/project';

type Tab = 'script' | 'storyboard' | 'assets';

export default function LeftSidebarNew() {
  const router = useRouter();
  const { project, leftSidebarCollapsed, toggleLeftSidebar, selectedShotId, selectShot, currentSceneId, selectScene, updateScript, addScene, addShot, deleteShot, deleteScene, updateScene, addCharacter, addLocation, setControlMode, updateShot } = useProjectStore();
  const [activeTab, setActiveTab] = useState<Tab>('storyboard');
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string>('');
  const [showAddCharacterDialog, setShowAddCharacterDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [shotForm, setShotForm] = useState<{
    description: string;
    narration: string;
    dialogue: string;
    shotSize: ShotSize | '';
    cameraMovement: CameraMovement | '';
    duration: number;
  }>({
    description: '',
    narration: '',
    dialogue: '',
    shotSize: '',
    cameraMovement: '',
    duration: 3,
  });

  const shotSizeOptions: ShotSize[] = ['Extreme Wide Shot', 'Wide Shot', 'Medium Shot', 'Close-Up', 'Extreme Close-Up'];
  const cameraMovementOptions: CameraMovement[] = ['Static', 'Pan Left', 'Pan Right', 'Tilt Up', 'Tilt Down', 'Dolly In', 'Dolly Out', 'Zoom In', 'Zoom Out', 'Handheld'];
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [resizing, setResizing] = useState(false);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing || !resizeState.current) return;
      const delta = e.clientX - resizeState.current.startX;
      const next = Math.min(Math.max(resizeState.current.startWidth + delta, 260), 520);
      setSidebarWidth(next);
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const startResize = (e: React.MouseEvent) => {
    setResizing(true);
    resizeState.current = { startX: e.clientX, startWidth: sidebarWidth };
  };

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
    setControlMode('pro'); // 点击镜头直接进入 Pro 模式，配合右侧上下文
  };

  const openShotEditor = (shot: Shot) => {
    setEditingShot(shot);
    setShotForm({
      description: shot.description || '',
      narration: shot.narration || '',
      dialogue: shot.dialogue || '',
      shotSize: shot.shotSize || '',
      cameraMovement: shot.cameraMovement || '',
      duration: shot.duration || 3,
    });
  };

  const saveShotEdit = () => {
    if (!editingShot) return;
    if (!shotForm.description.trim()) {
      toast.error('分镜描述不能为空');
      return;
    }
    if (!shotForm.shotSize || !shotForm.cameraMovement) {
      toast.error('请选择镜头景别和镜头运动');
      return;
    }
    updateShot(editingShot.id, {
      description: shotForm.description.trim(),
      narration: shotForm.narration.trim(),
      dialogue: shotForm.dialogue.trim(),
      shotSize: shotForm.shotSize,
      cameraMovement: shotForm.cameraMovement,
      duration: shotForm.duration,
    });
    toast.success('分镜已更新');
    setEditingShot(null);
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

  const handleDeleteScene = (sceneId: string, sceneName: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const shotCount = scene.shotIds.length;
    const confirmed = confirm(
      `确定要删除场景 "${sceneName}" 吗？\n\n该场景包含 ${shotCount} 个镜头，删除场景将同时删除所有镜头及其生成内容，此操作无法恢复。`
    );

    if (confirmed) {
      deleteScene(sceneId);
      toast.success('场景已删除', {
        description: `已删除场景 "${sceneName}" 及其所有镜头`
      });
    }
  };

  const handleStartEditScene = (sceneId: string, currentName: string) => {
    setEditingSceneId(sceneId);
    setEditingSceneName(currentName);
  };

  const handleSaveSceneName = (sceneId: string) => {
    if (!editingSceneName.trim()) {
      toast.error('场景名称不能为空');
      return;
    }

    updateScene(sceneId, { name: editingSceneName.trim() });
    setEditingSceneId(null);
    setEditingSceneName('');
    toast.success('场景名称已更新');
  };

  const handleCancelEditScene = () => {
    setEditingSceneId(null);
    setEditingSceneName('');
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
          order: idx + 1,
          status: 'draft' as const,
          created: new Date(),
          modified: new Date(),
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

      // 5. 根据分镜推断主要角色/场景并创建资源占位，方便后续上传图片
      const characterSet = new Map<string, string>(); // name -> description
      const locationSet = new Map<string, string>(); // name -> description
      generatedShots.forEach((shot) => {
        (shot.mainCharacters || []).forEach((name) => {
          if (!characterSet.has(name)) {
            characterSet.set(name, shot.description || '');
          }
        });
        (shot.mainScenes || []).forEach((name) => {
          if (!locationSet.has(name)) {
            locationSet.set(name, shot.description || '');
          }
        });
      });

      characterSet.forEach((desc, name) => {
        const exists = project.characters.some((c) => c.name === name);
        if (!exists) {
          addCharacter({
            id: `char_${Date.now()}_${name}`,
            name,
            description: desc || '待补充角色描述',
            referenceImages: [],
            gender: 'unknown' as any,
            appearance: '',
          });
        }
      });

      locationSet.forEach((desc, name) => {
        const exists = project.locations.some((l) => l.name === name);
        if (!exists) {
          addLocation({
            id: `loc_${Date.now()}_${name}`,
            name,
            description: desc || '待补充场景描述',
            type: 'interior',
            referenceImages: [],
          });
        }
      });

      toast.success(`成功生成 ${sceneGroups.length} 个场景，${generatedShots.length} 个镜头！`);
      // 自动切换到分镜脚本标签页
      setActiveTab('storyboard');
    } catch (error: any) {
      console.error('AI分镜失败:', error);
      toast.error('AI分镜生成失败', {
        description: error.message || '请检查API配置或网络连接'
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
    <div
      className="bg-light-panel dark:bg-cine-dark border-r border-light-border dark:border-cine-border flex flex-col relative"
      style={{ width: sidebarWidth }}
    >
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
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${resizing ? 'bg-light-accent/30 dark:bg-cine-accent/30' : 'bg-transparent hover:bg-light-border dark:hover:bg-cine-border'}`}
        onMouseDown={startResize}
      />

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
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${activeTab === 'script'
            ? 'bg-light-bg dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
            : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
            }`}
        >
          <FileText size={16} />
          <span>剧本</span>
        </button>
        <button
          onClick={() => setActiveTab('storyboard')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${activeTab === 'storyboard'
            ? 'bg-light-bg dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
            : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
            }`}
        >
          <Film size={16} />
          <span>分镜脚本</span>
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs transition-colors ${activeTab === 'assets'
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
              <button
                onClick={() => setShowScriptEditor(true)}
                className="flex items-center gap-1 text-xs px-2 py-1 border border-light-border dark:border-cine-border rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              >
                <Edit2 size={12} />
                <span>编辑分镜脚本</span>
              </button>
            </div>

            {/* Scene List */}
              <div className="space-y-3">
                {scenes.map((scene) => {
                // Get shots - try scene.shotIds first for correct order, fallback to filter
                let sceneShots: Shot[];
                if (scene.shotIds && scene.shotIds.length > 0) {
                  // Use scene.shotIds for correct drag-and-drop order
                  sceneShots = scene.shotIds
                    .map(shotId => shots.find(s => s.id === shotId))
                    .filter((shot): shot is Shot => shot !== undefined);

                  // 如果通过 shotIds 没找到任何 shot，fallback 到 sceneId
                  if (sceneShots.length === 0) {
                    sceneShots = shots.filter(s => s.sceneId === scene.id);
                  }
                } else {
                  // Fallback: filter by sceneId (for scenes where shotIds isn't maintained)
                  sceneShots = shots.filter(s => s.sceneId === scene.id);
                }
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
                            {editingSceneId === scene.id ? (
                              <input
                                type="text"
                                value={editingSceneName}
                                onChange={(e) => setEditingSceneName(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') {
                                    handleSaveSceneName(scene.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEditScene();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-sm font-bold bg-light-panel dark:bg-cine-panel border border-light-accent dark:border-cine-accent rounded px-2 py-1 focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              <>
                                <div className="text-sm font-bold text-light-text dark:text-white truncate">
                                  {scene.name}
                                </div>
                                <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                  {sceneShots.length} 个镜头
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        {editingSceneId === scene.id ? (
                          <>
                            {/* Save Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveSceneName(scene.id);
                              }}
                              className="p-1.5 hover:bg-green-500/10 rounded transition-colors flex-shrink-0"
                              title="保存"
                            >
                              <span className="text-green-500 text-xs font-bold">✓</span>
                            </button>
                            {/* Cancel Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelEditScene();
                              }}
                              className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                              title="取消"
                            >
                              <span className="text-red-500 text-xs font-bold">✕</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Edit Scene Name Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditScene(scene.id, scene.name);
                              }}
                              className="p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 rounded transition-colors flex-shrink-0"
                              title="编辑场景名称"
                            >
                              <Edit2 size={14} className="text-light-text-muted dark:text-cine-text-muted" />
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

                            {/* Delete Scene Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteScene(scene.id, scene.name);
                              }}
                              className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0 group"
                              title="删除场景"
                            >
                              <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover:text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Shot List */}
                    {!isCollapsed && (
                      <div className="px-3 pb-3 space-y-2">
                        {sceneShots.map((shot) => (
                          <ShotListItem
                            key={shot.id}
                            shot={shot}
                            isSelected={selectedShotId === shot.id}
                            onSelect={() => handleShotClick(shot.id)}
                            onEdit={() => openShotEditor(shot)}
                            onDelete={() => handleDeleteShot(shot.id, shot.order, scene.name)}
                          />
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
                <button
                  onClick={() => setShowAddCharacterDialog(true)}
                  className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>添加</span>
                </button>
              </div>
              <div className="space-y-2">
                {project?.characters.map((character) => (
                  <div
                    key={character.id}
                    className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-light-text dark:text-white">
                          {character.name}
                        </div>
                        <div className="text-[11px] text-light-text-muted dark:text-cine-text-muted mt-0.5">
                          {character.gender || '未设置'}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingCharacter(character)}
                          className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                          title="编辑角色"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`确定删除角色「${character.name}」？`)) {
                              useProjectStore.getState().deleteCharacter(character.id);
                              toast.success('角色已删除');
                            }
                          }}
                          className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                          title="删除角色"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 line-clamp-2">
                      {character.description}
                    </div>
                    {/* Reference Images */}
                    {character.referenceImages && character.referenceImages.length > 0 && (
                      <div className="flex gap-1 mt-2 overflow-x-auto">
                        {character.referenceImages.map((imageUrl, idx) => (
                          <div
                            key={idx}
                            className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                          >
                            <img
                              src={imageUrl}
                              alt={`${character.name} 参考图 ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
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
                <button
                  onClick={() => setShowAddLocationDialog(true)}
                  className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>添加</span>
                </button>
              </div>
              <div className="space-y-2">
                {project?.locations.map((location) => (
                  <div
                    key={location.id}
                    className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-light-text dark:text-white">
                          {location.name}
                        </div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                          {location.type === 'interior' ? '室内' : '室外'}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingLocation(location)}
                          className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                          title="编辑场景"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`确定删除场景地点「${location.name}」？`)) {
                              useProjectStore.getState().deleteLocation(location.id);
                              toast.success('场景地点已删除');
                            }
                          }}
                          className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                          title="删除场景"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Reference Images */}
                    {location.referenceImages && location.referenceImages.length > 0 && (
                      <div className="flex gap-1 mt-2 overflow-x-auto">
                        {location.referenceImages.map((imageUrl, idx) => (
                          <div
                            key={idx}
                            className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                          >
                            <img
                              src={imageUrl}
                              alt={`${location.name} 参考图 ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
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

      {showScriptEditor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl shadow-xl w-[800px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-cine-border">
              <div className="flex items-center gap-2">
                <Film size={16} className="text-light-accent dark:text-cine-accent" />
                <span className="text-sm font-bold text-light-text dark:text-white">分镜脚本编辑</span>
              </div>
              <button
                onClick={() => setShowScriptEditor(false)}
                className="p-1 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              >
                <ChevronRightIcon size={16} className="text-light-text-muted dark:text-cine-text-muted" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto space-y-3">
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted">
                直接在此修改完整分镜脚本内容，保存后右侧 Pro 模式将按镜头/场景上下文展示历史。
              </p>
              <textarea
                value={project?.script || ''}
                onChange={(e) => updateScript(e.target.value)}
                className="w-full h-full min-h-[400px] bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted"
                placeholder="在此粘贴或编写分镜脚本..."
              />
            </div>
          </div>
        </div>
      )}

      {editingShot && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl shadow-xl w-[900px] max-w-[96vw] max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-cine-border">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-light-accent dark:text-cine-accent" />
                <span className="text-sm font-bold text-light-text dark:text-white">分镜详情编辑</span>
                <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  #{editingShot.order} • {editingShot.shotSize}
                </span>
              </div>
              <button
                onClick={() => setEditingShot(null)}
                className="p-1 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              >
                <X size={16} className="text-light-text-muted dark:text-cine-text-muted" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 overflow-auto">
              <div className="space-y-3">
                <label className="text-xs text-light-text-muted dark:text-cine-text-muted">镜头描述</label>
                <textarea
                  value={shotForm.description}
                  onChange={(e) => setShotForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full h-40 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                  placeholder="写下镜头内容..."
                />
                <label className="text-xs text-light-text-muted dark:text-cine-text-muted">旁白</label>
                <textarea
                  value={shotForm.narration}
                  onChange={(e) => setShotForm((prev) => ({ ...prev, narration: e.target.value }))}
                  className="w-full h-24 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                  placeholder="旁白/场景说明"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs text-light-text-muted dark:text-cine-text-muted">对白</label>
                <textarea
                  value={shotForm.dialogue}
                  onChange={(e) => setShotForm((prev) => ({ ...prev, dialogue: e.target.value }))}
                  className="w-full h-24 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                  placeholder="角色对白（可选）"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-light-text-muted dark:text-cine-text-muted">镜头景别</label>
                    <select
                      value={shotForm.shotSize}
                      onChange={(e) => setShotForm((prev) => ({ ...prev, shotSize: e.target.value as ShotSize }))}
                      className="w-full mt-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                    >
                      <option value="">选择景别</option>
                      {shotSizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-light-text-muted dark:text-cine-text-muted">镜头运动</label>
                    <select
                      value={shotForm.cameraMovement}
                      onChange={(e) => setShotForm((prev) => ({ ...prev, cameraMovement: e.target.value as CameraMovement }))}
                      className="w-full mt-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                    >
                      <option value="">选择运动</option>
                      {cameraMovementOptions.map((move) => (
                        <option key={move} value={move}>
                          {move}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-light-text-muted dark:text-cine-text-muted">时长 (秒)</label>
                  <input
                    type="number"
                    min={1}
                    value={shotForm.duration}
                    onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                    className="w-full mt-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-light-border dark:border-cine-border">
              <button
                onClick={() => setEditingShot(null)}
                className="px-3 py-2 text-sm rounded-lg border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveShotEdit}
                className="px-3 py-2 text-sm rounded-lg bg-light-accent dark:bg-cine-accent text-white hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors"
              >
                保存并应用
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Add Character Dialog */}
      {showAddCharacterDialog && (
        <AddCharacterDialog
          onAdd={addCharacter}
          onClose={() => setShowAddCharacterDialog(false)}
        />
      )}
      {editingCharacter && (
        <AddCharacterDialog
          mode="edit"
          initialCharacter={editingCharacter}
          onAdd={(updated) => {
            useProjectStore.getState().updateCharacter(editingCharacter.id, updated);
          }}
          onClose={() => setEditingCharacter(null)}
        />
      )}

      {/* Add Location Dialog */}
      {showAddLocationDialog && (
        <AddLocationDialog
          onAdd={addLocation}
          onClose={() => setShowAddLocationDialog(false)}
        />
      )}
      {editingLocation && (
        <AddLocationDialog
          mode="edit"
          initialLocation={editingLocation}
          onAdd={(updated) => {
            useProjectStore.getState().updateLocation(editingLocation.id, updated);
          }}
          onClose={() => setEditingLocation(null)}
        />
      )}
    </div>
  );
}
