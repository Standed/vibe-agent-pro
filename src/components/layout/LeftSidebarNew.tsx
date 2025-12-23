'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Home,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Loader2,
  Download,
  Film,
  FileText,
  FolderOpen,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { batchDownloadAssets } from '@/utils/batchDownload';
import AddShotDialog from '@/components/shot/AddShotDialog';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { toast } from 'sonner';
import { Shot, Scene, Project, ShotSize, CameraMovement, Character, Location, SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS } from '@/types/project';
import { translateShotSize, translateCameraMovement } from '@/utils/translations';
import { createPortal } from 'react-dom';
import { useAIStoryboard } from '@/hooks/useAIStoryboard';
import { StoryboardTab } from './sidebar/StoryboardTab';
import { AssetsTab } from './sidebar/AssetsTab';
import { ShotEditor } from './sidebar/ShotEditor';
import ShotTableEditor from '../project/ShotTableEditor'; // Added import for ShotTableEditor
import DirectorMode from '../director/DirectorMode';

type Tab = 'planning' | 'storyboard' | 'assets';

export default function LeftSidebarNew() {
  const router = useRouter();
  const {
    project,
    leftSidebarCollapsed,
    toggleLeftSidebar,
    selectedShotId,
    selectShot,
    selectScene,
    updateScript,
    addScene,
    addShot,
    deleteShot,
    deleteScene,
    updateScene,
    addCharacter,
    addLocation,
    setControlMode,
    updateShot,
    reorderShots,
    updateCharacter,
    isSaving,
    deleteCharacter,
    deleteLocation,
    updateLocation
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<Tab>('storyboard');
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  // isGenerating is now handled by useAIStoryboard
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string>('');
  const [showAddCharacterDialog, setShowAddCharacterDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [sceneIdHandlingLocation, setSceneIdHandlingLocation] = useState<string | null>(null);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [shotImagePreview, setShotImagePreview] = useState<string | null>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);
  const [shotInsertIndex, setShotInsertIndex] = useState<number | null>(null);
  const [charactersCollapsed, setCharactersCollapsed] = useState(false);
  const [locationsCollapsed, setLocationsCollapsed] = useState(false);
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

  const shotSizeOptions = SHOT_SIZE_OPTIONS;
  const cameraMovementOptions = CAMERA_MOVEMENT_OPTIONS;
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [resizing, setResizing] = useState(false);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  const { isGenerating, handleAIStoryboard } = useAIStoryboard();

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
  const liveEditingShot = editingShot ? project?.shots.find((s) => s.id === editingShot.id) || editingShot : null;

  useEffect(() => {
    if (liveEditingShot?.referenceImage) {
      setSelectedHistoryImage(liveEditingShot.referenceImage);
    } else {
      setSelectedHistoryImage(null);
    }
  }, [liveEditingShot?.referenceImage, editingShot?.id]);

  const shotHistoryImages = useMemo(() => {
    if (!liveEditingShot) return [];
    const urls = new Set<string>();
    if (liveEditingShot.referenceImage) urls.add(liveEditingShot.referenceImage);
    if (liveEditingShot.gridImages?.length) {
      liveEditingShot.gridImages.forEach((u) => u && urls.add(u));
    }
    if (liveEditingShot.generationHistory?.length) {
      liveEditingShot.generationHistory.forEach((h) => {
        if (h.type === 'image' && typeof h.result === 'string') {
          urls.add(h.result);
        }
        if (h.parameters && (h.parameters as any)?.fullGridUrl) {
          urls.add((h.parameters as any).fullGridUrl);
        }
      });
    }
    return Array.from(urls);
  }, [liveEditingShot]);

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

  const handleAddShotClick = (sceneId: string, insertIndex?: number) => {
    setSelectedSceneForNewShot(sceneId);
    setShotInsertIndex(insertIndex ?? null);
    setShowAddShotDialog(true);
  };

  const handleAddShot = (shotData: any) => {
    const scene = scenes.find(s => s.id === shotData.sceneId);
    const sceneShots = shots.filter(s => s.sceneId === shotData.sceneId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const targetIndex = shotInsertIndex !== null ? shotInsertIndex : sceneShots.length;
    const order = targetIndex + 1;

    const newShot = {
      id: crypto.randomUUID(),
      ...shotData,
      order,
      status: 'draft' as const,
    };

    addShot(newShot);
    // 更新场景 shotIds 顺序并重排 order
    if (scene) {
      const newShotIds = [...sceneShots.map(s => s.id)];
      newShotIds.splice(targetIndex, 0, newShot.id);
      reorderShots(scene.id, newShotIds);
    }

    setShotInsertIndex(null);
    toast.success('镜头添加成功！', {
      description: `已添加到 ${scene?.name || ''}`
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

    // 直接按 sceneId 统计镜头数量，避免 shotIds 不准确
    const shotCount = shots.filter(s => s.sceneId === sceneId).length;
    toast.warning(`删除场景 "${sceneName}"？`, {
      description: `该场景包含 ${shotCount} 个镜头，删除后无法恢复`,
      action: {
        label: '删除',
        onClick: () => {
          deleteScene(sceneId);
          toast.success('场景已删除', {
            description: `已删除场景 "${sceneName}" 及其所有镜头`
          });
        }
      }
    });
  };

  const handleAddScene = () => {
    const order = scenes.length + 1;
    const scene = {
      id: crypto.randomUUID(),
      name: `场景 ${order}`,
      location: '',
      description: '',
      shotIds: [],
      position: { x: order * 200, y: 100 },
      order,
      status: 'draft' as const,
      created: new Date(),
      modified: new Date(),
    };
    addScene(scene);
    selectScene(scene.id);
    toast.success('已添加新场景', { description: scene.name });
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
      <div className="w-16 glass-panel flex flex-col items-center py-6 z-20">
        <button
          onClick={toggleLeftSidebar}
          className="p-3 glass-button rounded-xl group"
          title="展开侧边栏"
        >
          <ChevronRightIcon size={20} className="text-gray-500 dark:text-gray-400 group-hover:text-black dark:group-hover:text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-panel flex flex-col relative shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
        >
          <Home size={16} />
          <span>返回首页</span>
        </button>
        <button
          onClick={toggleLeftSidebar}
          className="p-1 glass-button rounded-lg"
          title="收起侧边栏"
        >
          <ChevronLeft size={16} className="text-gray-500 dark:text-gray-400" />
        </button>
      </div>
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${resizing ? 'bg-light-accent/30 dark:bg-cine-accent/30' : 'bg-transparent hover:bg-light-border dark:hover:bg-cine-border'}`}
        onMouseDown={startResize}
      />

      {/* Project Info */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg text-light-text dark:text-white truncate">
            {project?.metadata.title || '未命名项目'}
          </h2>
          {isSaving && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 border border-light-accent/20 dark:border-cine-accent/20 animate-pulse">
              <Loader2 size={10} className="animate-spin text-light-accent dark:text-cine-accent" />
              <span className="text-[10px] font-medium text-light-accent dark:text-cine-accent">同步中</span>
            </div>
          )}
        </div>
        {project?.metadata.description && (
          <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 line-clamp-2">
            {project.metadata.description}
          </p>
        )}
        {/* Batch Download Button */}
        <button
          onClick={handleBatchDownload}
          disabled={isDownloading}
          className="w-full mt-3 glass-button rounded-xl px-3 py-2 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="px-6 pb-2">
        <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'planning'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <FileText size={14} />
            <span>策划</span>
          </button>
          <button
            onClick={() => setActiveTab('storyboard')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'storyboard'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <Film size={14} />
            <span>分镜</span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'assets'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <FolderOpen size={14} />
            <span>资源</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'planning' && (
          <DirectorMode
            isOpen={true}
            onClose={() => setActiveTab('storyboard')}
          />
        )}

        {activeTab === 'storyboard' && (
          <StoryboardTab
            shots={shots}
            scenes={scenes}
            collapsedScenes={collapsedScenes}
            toggleSceneCollapse={toggleSceneCollapse}
            handleAddScene={handleAddScene}
            editingSceneId={editingSceneId}
            editingSceneName={editingSceneName}
            setEditingSceneName={setEditingSceneName}
            handleSaveSceneName={handleSaveSceneName}
            handleCancelEditScene={handleCancelEditScene}
            handleStartEditScene={handleStartEditScene}
            handleEditSceneDetails={(sceneId) => {
              const scene = scenes.find(s => s.id === sceneId);
              if (!scene) return;

              setSceneIdHandlingLocation(sceneId);

              const linkedLocation = project?.locations.find(l =>
                l.name.toLowerCase() === (scene.location || scene.name).toLowerCase()
              );

              const initialLocationData = linkedLocation || {
                id: '',
                name: scene.location || scene.name,
                description: scene.description,
                type: 'interior',
                referenceImages: []
              };

              setEditingLocation(initialLocationData as any);
            }}
            handleDeleteScene={handleDeleteScene}
            handleAddShotClick={handleAddShotClick}
            setShowScriptEditor={setShowTableEditor}
            selectedShotId={selectedShotId}
            handleShotClick={handleShotClick}
            openShotEditor={openShotEditor}
            handleDeleteShot={handleDeleteShot}
            handleShotImageClick={(shot) => {
              // 1. 设置生成请求 (先设置，以免被后续的副作用清除)
              const scene = scenes.find(s => s.id === shot.sceneId);
              const sceneContext = scene?.description ? `\n场景环境: ${scene.description}` : '';
              const fullPrompt = `镜头画面: ${shot.description || ''}${sceneContext}`;

              useProjectStore.getState().setGenerationRequest({
                prompt: fullPrompt,
                model: 'jimeng',
                jimengModel: 'jimeng-4.5',
                jimengResolution: '2k'
              });

              // 2. 选中镜头
              selectShot(shot.id);

              // 3. 切换到 Pro 模式并确保侧边栏展开
              setControlMode('pro');
              if (useProjectStore.getState().rightSidebarCollapsed) {
                useProjectStore.getState().toggleRightSidebar();
              }
            }}
          />
        )}

        {activeTab === 'assets' && (
          <AssetsTab
            project={project}
            charactersCollapsed={charactersCollapsed}
            setCharactersCollapsed={setCharactersCollapsed}
            setShowAddCharacterDialog={setShowAddCharacterDialog}
            setEditingCharacter={setEditingCharacter}
            deleteCharacter={deleteCharacter}
            locationsCollapsed={locationsCollapsed}
            setLocationsCollapsed={setLocationsCollapsed}
            setShowAddLocationDialog={setShowAddLocationDialog}
            setEditingLocation={setEditingLocation}
            deleteLocation={deleteLocation}
          />
        )}
      </div>

      {showTableEditor && (
        <ShotTableEditor
          isOpen={showTableEditor}
          onClose={() => setShowTableEditor(false)}
        />
      )}

      {shotImagePreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4" onClick={() => setShotImagePreview(null)}>
          <div className="max-w-5xl w-full max-h-[90vh]">
            <img src={shotImagePreview} alt="预览" className="w-full h-full object-contain rounded-lg" />
          </div>
        </div>
      )}

      <ShotEditor
        editingShot={editingShot}
        setEditingShot={setEditingShot}
        shotForm={shotForm}
        setShotForm={setShotForm}
        saveShotEdit={saveShotEdit}
        shotHistoryImages={shotHistoryImages}
        selectedHistoryImage={selectedHistoryImage}
        setSelectedHistoryImage={setSelectedHistoryImage}
        liveEditingShot={liveEditingShot}
        updateShot={updateShot}
        setShotImagePreview={setShotImagePreview}
      />

      {showAddShotDialog && selectedSceneForNewShot && (
        <AddShotDialog
          sceneId={selectedSceneForNewShot}
          sceneName={scenes.find(s => s.id === selectedSceneForNewShot)?.name || ''}
          existingShotsCount={shots.filter(s => s.sceneId === selectedSceneForNewShot).length}
          insertIndex={shotInsertIndex ?? undefined}
          onAdd={handleAddShot}
          onClose={() => {
            setShowAddShotDialog(false);
            setShotInsertIndex(null);
          }}
        />
      )}

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
            updateCharacter(editingCharacter.id, updated);
          }}
          onClose={() => setEditingCharacter(null)}
        />
      )}

      {showAddLocationDialog && (
        <AddLocationDialog
          onAdd={addLocation}
          onClose={() => setShowAddLocationDialog(false)}
        />
      )}
      {editingLocation && (
        <AddLocationDialog
          mode={editingLocation.id ? "edit" : "add"}
          initialLocation={editingLocation}
          onAdd={(updated) => {
            // 1. Update/Add Location Asset
            if (editingLocation.id) {
              updateLocation(editingLocation.id, updated);
            } else {
              addLocation(updated);
            }

            // 2. Sync back to Scene (Critical for prompt generation)
            if (sceneIdHandlingLocation) {
              updateScene(sceneIdHandlingLocation, {
                location: updated.name,
                description: updated.description
              });
            }

            setEditingLocation(null);
            setSceneIdHandlingLocation(null);
          }}
          onClose={() => {
            setEditingLocation(null);
            setSceneIdHandlingLocation(null);
          }}
        />
      )}
    </div>
  );
}
