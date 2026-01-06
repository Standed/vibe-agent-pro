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
  Settings,
  X,
  Plus,
  ArrowRight,
  Layout,
  Clock
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
import ShotTableEditor from '../project/ShotTableEditor';
import PlanningView from '../director/PlanningView';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Tab = 'storyboard' | 'assets';

interface LeftSidebarNewProps {
  activeView?: 'planning' | 'canvas' | 'timeline' | 'drafts';
  onSwitchToTimeline?: () => void;
}

export default function LeftSidebarNew({
  activeView = 'canvas',
  onSwitchToTimeline,
}: LeftSidebarNewProps) {
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

  const { isGenerating, handleAIStoryboard } = useAIStoryboard();

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
      if (newSet.has(sceneId)) newSet.delete(sceneId);
      else newSet.add(sceneId);
      return newSet;
    });
  };

  const handleShotClick = (shotId: string) => {
    selectShot(shotId);
    setControlMode('pro');
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
    updateShot(editingShot.id, {
      ...shotForm,
      shotSize: shotForm.shotSize as ShotSize,
      cameraMovement: shotForm.cameraMovement as CameraMovement,
    });
    setEditingShot(null);
    toast.success('分镜已更新');
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
    if (scene) {
      const newShotIds = [...sceneShots.map(s => s.id)];
      newShotIds.splice(targetIndex, 0, newShot.id);
      reorderShots(scene.id, newShotIds);
    }

    setShotInsertIndex(null);
    toast.success('镜头添加成功！');
  };

  const handleDeleteShot = (shotId: string, shotOrder: number, sceneName: string) => {
    if (confirm(`确定要删除镜头 #${shotOrder} 吗？`)) {
      deleteShot(shotId);
      toast.success('镜头已删除');
    }
  };

  const handleDeleteScene = (sceneId: string, sceneName: string) => {
    if (confirm(`确定要删除场景 "${sceneName}" 吗？`)) {
      deleteScene(sceneId);
      toast.success('场景已删除');
    }
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
    toast.success('已添加新场景');
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
    if (!project) return;
    setIsDownloading(true);
    const downloadToast = toast.loading('正在打包下载...');
    try {
      const result = await batchDownloadAssets(project, {
        onProgress: (progress) => {
          toast.loading(progress.message || '正在打包下载...', { id: downloadToast });
        }
      });
      toast.success('下载完成！', { id: downloadToast });
    } catch (error) {
      toast.error('下载失败', { id: downloadToast });
    } finally {
      setIsDownloading(false);
    }
  };



  return (
    <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 flex items-center gap-4 pointer-events-none">
      {/* Floating Icon Bar */}
      <div className="flex flex-col items-center p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-full border border-black/5 dark:border-white/10 shadow-2xl pointer-events-auto">
        {/* Home Logo */}
        <button
          onClick={() => router.push('/')}
          className="mb-2 group"
          title="返回首页"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg border border-black/5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 overflow-hidden">
            <img
              src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
              alt="Logo"
              className="w-7 h-7 object-contain"
            />
          </div>
        </button>

        <div className="w-8 h-px bg-black/5 dark:bg-white/10 my-2" />

        {/* Storyboard */}
        <button
          onClick={() => {
            if (activeTab === 'storyboard' && !leftSidebarCollapsed) {
              toggleLeftSidebar();
            } else {
              setActiveTab('storyboard');
              if (leftSidebarCollapsed) toggleLeftSidebar();
            }
          }}
          className={cn(
            "p-3 rounded-full transition-all duration-300 mb-1 group relative",
            activeTab === 'storyboard' && !leftSidebarCollapsed
              ? "bg-light-accent dark:bg-cine-accent text-white dark:text-black shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20"
              : "text-zinc-400 dark:text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-zinc-200"
          )}
          title="分镜"
        >
          <Film size={20} strokeWidth={activeTab === 'storyboard' && !leftSidebarCollapsed ? 2.5 : 2} />
        </button>

        {/* Assets */}
        <button
          onClick={() => {
            if (activeTab === 'assets' && !leftSidebarCollapsed) {
              toggleLeftSidebar();
            } else {
              setActiveTab('assets');
              if (leftSidebarCollapsed) toggleLeftSidebar();
            }
          }}
          className={cn(
            "p-3 rounded-full transition-all duration-300 mb-1 group relative",
            activeTab === 'assets' && !leftSidebarCollapsed
              ? "bg-light-accent dark:bg-cine-accent text-white dark:text-black shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20"
              : "text-zinc-400 dark:text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-zinc-200"
          )}
          title="资源"
        >
          <FolderOpen size={20} strokeWidth={activeTab === 'assets' && !leftSidebarCollapsed ? 2.5 : 2} />
        </button>

        <div className="w-8 h-px bg-black/5 dark:bg-white/10 my-2" />

        <button className="p-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 mt-auto">
          <Settings size={20} />
        </button>
      </div>

      {/* Content Panel */}
      <AnimatePresence>
        {!leftSidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            className="w-[400px] h-[80vh] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-[32px] border border-black/5 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col pointer-events-auto self-center"
          >
            {/* Header */}
            <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-black text-zinc-900 dark:text-white truncate tracking-tight uppercase">
                  {project?.metadata.title || '未命名项目'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  {isSaving && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10">
                      <Loader2 size={10} className="animate-spin text-light-accent dark:text-cine-accent" />
                      <span className="text-[8px] font-bold text-light-accent dark:text-cine-accent uppercase">Saving</span>
                    </div>
                  )}
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {activeTab === 'storyboard' ? '分镜脚本' : '资源库'}
                  </span>
                </div>
              </div>
              <button
                onClick={toggleLeftSidebar}
                className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            {/* Batch Download */}
            <div className="px-6 py-4 border-b border-black/5 dark:border-white/5">
              <button
                onClick={handleBatchDownload}
                disabled={isDownloading}
                className="w-full h-10 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>批量下载项目素材</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                    setEditingLocation((linkedLocation || {
                      id: '',
                      name: scene.location || scene.name,
                      description: scene.description,
                      type: 'interior',
                      referenceImages: []
                    }) as any);
                  }}
                  handleDeleteScene={handleDeleteScene}
                  handleAddShotClick={handleAddShotClick}
                  setShowScriptEditor={setShowTableEditor}
                  selectedShotId={selectedShotId}
                  handleShotClick={handleShotClick}
                  openShotEditor={openShotEditor}
                  handleDeleteShot={handleDeleteShot}
                  handleShotImageClick={(shot) => {
                    const scene = scenes.find(s => s.id === shot.sceneId);
                    const sceneContext = scene?.description ? `\n场景环境: ${scene.description}` : '';
                    const fullPrompt = `镜头画面: ${shot.description || ''}${sceneContext}`;
                    useProjectStore.getState().setGenerationRequest({
                      prompt: fullPrompt,
                      model: 'jimeng',
                      jimengModel: 'jimeng-4.5',
                      jimengResolution: '2k'
                    });
                    selectShot(shot.id);
                    setControlMode('pro');
                    if (useProjectStore.getState().rightSidebarCollapsed) {
                      useProjectStore.getState().toggleRightSidebar();
                    }
                  }}
                />
              )}

              {activeTab === 'assets' && (
                <AssetsTab
                  project={project!}
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
          </motion.div>
        )}
      </AnimatePresence>

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
            if (editingLocation.id) {
              updateLocation(editingLocation.id, updated);
            } else {
              addLocation(updated);
            }
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
