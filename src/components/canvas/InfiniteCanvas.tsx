'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useProjectStore } from '@/store/useProjectStore';
import { Play, Grid3x3, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, LayoutGrid, Eye, Download, Sparkles, RefreshCw, X, Plus, Loader2, Edit2, Upload, GalleryHorizontal, Trash2 } from 'lucide-react';
import type { ShotSize, CameraMovement, Shot } from '@/types/project';
import { translateShotSize, translateCameraMovement } from '@/utils/translations';
import { formatShotLabel } from '@/utils/shotOrder';
import AddShotDialog from '@/components/shot/AddShotDialog';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import ShotListItem from '@/components/shot/ShotListItem';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CanvasUserWidget } from '@/components/layout/CanvasUserWidget';
import { ShotEditor } from '@/components/layout/sidebar/ShotEditor';
import { batchDownloadAssets } from '@/utils/batchDownload';
import { SHOT_TO_CHAT, IMAGE_TO_SHOT } from '@/components/chat/dragTypes';
import { dataService } from '@/lib/dataService';
import DraggableCanvasShotCard from '@/components/canvas/DraggableCanvasShotCard';
import { constructBaseShotPrompt } from '@/utils/promptConstruction';

// Memoized Scene Component to prevent unnecessary re-renders
const CanvasScene = memo(({
  scene, sceneShots, currentSceneId, selectedShotId, draggedScene, dragOffset,
  sceneWidth, gridColsClass, aspectRatio, ratioStyle,
  handleSceneDragStart, selectScene, deleteScene, setConfirmDialog,
  handleSelectShot, handlePreview, handleDownload, handleEditShot,
  handleUploadShotTrigger, handleGenerate, handleAddShotClick
}: any) => {
  const isSceneSelected = currentSceneId === scene.id && !selectedShotId;
  const isDraggingThisScene = draggedScene === scene.id;
  const currentPosition = {
    x: scene.position.x + (isDraggingThisScene ? dragOffset.x : 0),
    y: scene.position.y + (isDraggingThisScene ? dragOffset.y : 0)
  };

  return (
    <div
      className={`glass-card p-6 min-w-[600px] max-w-4xl interactive ${isSceneSelected
        ? 'border-2 border-light-accent/50 dark:border-cine-accent/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] ring-1 ring-light-accent/20 dark:ring-cine-accent/20'
        : 'shadow-xl'
        } ${isDraggingThisScene ? 'z-50 shadow-2xl scale-[1.01]' : ''}`}
      style={{
        position: 'absolute',
        left: currentPosition.x,
        top: currentPosition.y,
        width: sceneWidth,
        cursor: isDraggingThisScene ? 'grabbing' : 'grab',
        transition: isDraggingThisScene ? 'none' : 'transform 0.1s ease-out, box-shadow 0.2s ease',
        willChange: isDraggingThisScene ? 'transform' : 'auto', // Optimization
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Scene Header */}
      <div
        onMouseDown={(e) => handleSceneDragStart(e, scene.id)}
        onClick={() => selectScene(scene.id)}
        className="w-full flex items-center justify-between mb-4 hover:bg-light-bg dark:bg-cine-panel/50 rounded p-2 -m-2 transition-colors text-left cursor-grab active:cursor-grabbing"
      >
        <div>
          <h3 className="font-bold text-light-text dark:text-white pointer-events-none">{scene.name}</h3>
          <p className="text-xs text-light-text-muted dark:text-cine-text-muted pointer-events-none">{scene.location}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-light-text-muted dark:text-cine-text-muted pointer-events-none">
            {sceneShots.length} 个镜头
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDialog({
                isOpen: true,
                title: '删除场景',
                description: `确定要删除场景 "${scene.name}" 及其包含的所有镜头吗？此操作无法撤销。`,
                variant: 'destructive',
                onConfirm: () => {
                  deleteScene(scene.id);
                  toast.success('场景已删除');
                  setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
                },
              });
            }}
            className="p-1.5 hover:bg-red-500/10 hover:text-red-500 text-light-text-muted dark:text-cine-text-muted rounded-md transition-colors"
            title="删除场景"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Shots Grid */}
      {
        sceneShots.length > 0 ? (
          <div className={`grid ${gridColsClass} gap-3`}>
            {sceneShots.map((shot: any) => {
              const isShotSelected = selectedShotId === shot.id;
              const shotLabel = formatShotLabel(scene.order, shot.order, shot.globalOrder);

              return (
                <DraggableCanvasShotCard
                  key={shot.id}
                  shot={shot}
                  sceneId={scene.id}
                  shotLabel={shotLabel}
                  isShotSelected={isShotSelected}
                  onSelect={handleSelectShot}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  onEdit={handleEditShot}
                  onUpload={handleUploadShotTrigger}
                  onGenerate={handleGenerate}
                  shotSizeLabel={translateShotSize(shot.shotSize)}
                  cameraMovementLabel={translateCameraMovement(shot.cameraMovement)}
                  aspectRatio={aspectRatio}
                />
              );

            })}
            {/* Add Shot Button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleAddShotClick(scene.id); }}
              className="rounded border-2 border-dashed border-light-border dark:border-cine-border flex flex-col items-center justify-center text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent transition-colors"
              style={ratioStyle}
            >
              <Plus size={24} />
              <span className="text-xs mt-1">添加镜头</span>
            </button>
          </div>
        ) : (
          <div className="text-sm text-light-text-muted dark:text-cine-text-muted text-center py-8 flex flex-col items-center gap-2">
            <span>暂无镜头</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleAddShotClick(scene.id); }}
              className="text-xs text-light-accent dark:text-cine-accent hover:underline"
            >
              添加第一个镜头
            </button>
          </div>
        )
      }
    </div>
  );
}, (prev, next) => {
  // Custom comparison to prevent re-renders when other scenes are selected
  return (
    prev.scene === next.scene &&
    prev.sceneShots === next.sceneShots &&
    prev.currentSceneId === next.currentSceneId &&
    prev.selectedShotId === next.selectedShotId &&
    prev.draggedScene === next.draggedScene &&
    prev.dragOffset === next.dragOffset &&
    prev.aspectRatio === next.aspectRatio
  );
});

export default function InfiniteCanvas() {
  const project = useProjectStore((state) => state.project);
  const currentSceneId = useProjectStore((state) => state.currentSceneId);
  const selectedShotId = useProjectStore((state) => state.selectedShotId);
  const selectScene = useProjectStore((state) => state.selectScene);
  const updateScene = useProjectStore((state) => state.updateScene);
  const deleteScene = useProjectStore((state) => state.deleteScene);
  const updateShot = useProjectStore((state) => state.updateShot);
  const addShot = useProjectStore((state) => state.addShot);
  const reorderShots = useProjectStore((state) => state.reorderShots);
  const autoArrangeScenes = useProjectStore((state) => state.autoArrangeScenes);


  // Canvas State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggedScene, setDraggedScene] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Preview & Edit State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    variant: 'default' | 'destructive';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    variant: 'default',
    onConfirm: () => { },
  });

  // Dialog State
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');
  const [shotInsertIndex, setShotInsertIndex] = useState<number | null>(null);
  const [showAddCharacterDialog, setShowAddCharacterDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<any | null>(null);
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const liveEditingShot = editingShot
    ? project?.shots.find((s) => s.id === editingShot.id) || editingShot
    : null;

  const shotHistoryImages = useMemo(() => {
    if (!liveEditingShot) return [];
    const urls = new Set<string>();
    if (liveEditingShot.referenceImage) urls.add(liveEditingShot.referenceImage);
    liveEditingShot.gridImages?.forEach((u) => u && urls.add(u));
    liveEditingShot.generationHistory?.forEach((h) => {
      if (h.type === 'image' && typeof h.result === 'string') urls.add(h.result);
      if ((h.parameters as any)?.fullGridUrl) urls.add((h.parameters as any).fullGridUrl);
    });
    return Array.from(urls);
  }, [liveEditingShot]);

  useEffect(() => {
    if (liveEditingShot?.referenceImage) {
      setSelectedHistoryImage(liveEditingShot.referenceImage);
    } else {
      setSelectedHistoryImage(null);
    }
  }, [liveEditingShot?.referenceImage, editingShot?.id]);

  // --- Zoom & Pan Logic ---

  // Use ref to access latest state in event listener without re-binding
  const stateRef = useRef({ scale, position });
  useEffect(() => {
    stateRef.current = { scale, position };
  }, [scale, position]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        const { scale: currentScale, position: currentPosition } = stateRef.current;
        const delta = -e.deltaY;
        const scaleChange = delta > 0 ? 1.1 : 0.9;
        const newScale = Math.min(Math.max(currentScale * scaleChange, 0.1), 5);

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const contentX = (mouseX - currentPosition.x) / currentScale;
        const contentY = (mouseY - currentPosition.y) / currentScale;

        const newX = mouseX - contentX * newScale;
        const newY = mouseY - contentY * newScale;

        setScale(newScale);
        setPosition({ x: newX, y: newY });
      } else {
        // Support both vertical and horizontal scroll (trackpad)
        setPosition(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the background (container)
    // or if holding Space (common convention)
    if (e.button === 1 || e.button === 0) { // Middle or Left click
      // Check if target is interactive
      const target = e.target as HTMLElement;
      // If clicking inside a scene but NOT initiating scene drag (handled separately), prevent canvas drag
      if (target.closest('.interactive')) return;

      if (target.closest('button')) return;

      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleSceneDragStart = (e: React.MouseEvent, sceneId: string) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation(); // Prevent canvas pan
    e.preventDefault(); // Prevent text selection
    setDraggedScene(sceneId);
    setDragOffset({ x: 0, y: 0 });
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedScene) {
      const deltaX = (e.clientX - lastMousePos.x) / scale;
      const deltaY = (e.clientY - lastMousePos.y) / scale;

      setDragOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [draggedScene, isDragging, lastMousePos, scale]);

  const handleMouseUp = () => {
    if (draggedScene) {
      const scene = project?.scenes.find(s => s.id === draggedScene);
      if (scene) {
        // Commit the final position
        updateScene(draggedScene, {
          position: {
            x: scene.position.x + dragOffset.x,
            y: scene.position.y + dragOffset.y
          }
        });
      }
      setDragOffset({ x: 0, y: 0 });
      setDraggedScene(null);
    } else {
      setIsDragging(false);
    }
  };

  // --- Actions ---

  const handlePreview = useCallback((imageUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setImagePreview(imageUrl);
  }, []);

  const handleDownload = useCallback((imageUrl: string, shotOrder: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `shot_${shotOrder}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleGenerate = useCallback((shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Find the shot to get its description
    const shot = useProjectStore.getState().project?.shots.find(s => s.id === shotId);
    if (shot) {
      const promptParts = constructBaseShotPrompt(useProjectStore.getState().project!, shot);
      const cleanParts = promptParts
        .join('\n')
        .split('\n')
        .map(part => part.trim().replace(/[，,。.]+$/, ''))
        .filter(Boolean);

      const fullPrompt = cleanParts.reduce((acc, part, index) => {
        if (index === 0) return part;
        const separator = part.startsWith('场景描述：') ? '。' : '，';
        return `${acc}${separator}${part}`;
      }, '');

      useProjectStore.getState().setGenerationRequest({
        prompt: fullPrompt,
        model: 'jimeng',
        jimengModel: 'jimeng-4.5',
        jimengResolution: '2k'
      });
    }

    useProjectStore.getState().selectShot(shotId);
    useProjectStore.getState().setControlMode('pro');
    if (useProjectStore.getState().rightSidebarCollapsed) {
      useProjectStore.getState().toggleRightSidebar();
    }
  }, []);

  const handleEditShot = useCallback((shot: Shot, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingShot(shot);
    setShotForm({
      description: shot.description || '',
      narration: shot.narration || '',
      dialogue: shot.dialogue || '',
      shotSize: shot.shotSize || '',
      cameraMovement: shot.cameraMovement || '',
      duration: shot.duration || 3,
    });
  }, []);

  const resolveSelectionMeta = (shot: Shot | null, url: string) => {
    if (!shot) return {};
    const historyMatch = shot.generationHistory?.find((item) => item.type === 'image' && item.result === url);
    const params = (historyMatch?.parameters || {}) as any;
    if (params?.fullGridUrl || params?.slices) {
      return {
        fullGridUrl: params.fullGridUrl as string | undefined,
        gridImages: params.slices as string[] | undefined,
      };
    }
    if (shot.gridImages?.includes(url)) {
      return {
        fullGridUrl: shot.fullGridUrl,
        gridImages: shot.gridImages,
      };
    }
    return {};
  };

  const saveShotEdit = () => {
    if (!editingShot) return;
    if (!shotForm.description.trim()) return;
    const updates: Partial<Shot> = {
      description: shotForm.description.trim(),
      narration: shotForm.narration.trim(),
      dialogue: shotForm.dialogue.trim(),
      shotSize: shotForm.shotSize || undefined,
      cameraMovement: shotForm.cameraMovement || undefined,
      duration: shotForm.duration,
    };
    if (selectedHistoryImage) {
      const meta = resolveSelectionMeta(liveEditingShot || null, selectedHistoryImage);
      updates.referenceImage = selectedHistoryImage;
      updates.status = 'done';
      if (meta.fullGridUrl) updates.fullGridUrl = meta.fullGridUrl;
      if (meta.gridImages) updates.gridImages = meta.gridImages;
    }
    updateShot(editingShot.id, updates);
    setEditingShot(null);
  };

  const handleAddShotClick = useCallback((sceneId: string, insertIndex?: number) => {
    setSelectedSceneForNewShot(sceneId);
    setShotInsertIndex(insertIndex ?? null);
    setShowAddShotDialog(true);
  }, []);

  const handleAddShot = (shotData: any) => {
    const scene = project?.scenes.find(s => s.id === shotData.sceneId);
    const sceneShots = project?.shots.filter(s => s.sceneId === shotData.sceneId).sort((a, b) => (a.order || 0) - (b.order || 0)) || [];
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

  const handleDeleteShot = useCallback((shotId: string, shotOrder: number, sceneName: string) => {
    if (confirm(`确定要删除镜头 #${shotOrder} 吗？`)) {
      useProjectStore.getState().deleteShot(shotId);
      toast.success('镜头已删除');
    }
  }, []);

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>, shotId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const { storageService } = await import('@/lib/storageService');
      const result = await storageService.uploadFile(file, `shots/${shotId}`);
      const imageUrl = result.url;

      // 添加到历史记录
      const shot = useProjectStore.getState().project?.shots.find(s => s.id === shotId);
      if (shot) {
        const historyItem = {
          id: `upload_${Date.now()}`,
          type: 'image' as const,
          timestamp: new Date(),
          result: imageUrl,
          prompt: '用户上传图片',
          parameters: {
            model: 'upload',
            source: 'user_upload',
          },
          status: 'success' as const,
        };
        const newHistory = [...(shot.generationHistory || []), historyItem];
        useProjectStore.getState().updateShot(shotId, { generationHistory: newHistory });
      }

      toast.success('图片上传成功');
      setSelectedHistoryImage(imageUrl);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('图片上传失败');
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleBatchDownload = async () => {
    if (!project) return;
    setIsDownloading(true);
    const downloadToast = toast.loading('正在打包下载...');
    try {
      await batchDownloadAssets(project, {
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

  const sceneGroups = project?.scenes.map((scene) => {
    const sceneShots = project.shots
      .filter((shot) => shot.sceneId === scene.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    return {
      scene,
      shots: sceneShots,
    };
  });

  // Helper to determine grid columns based on aspect ratio
  const getGridColsClass = (ratio: string) => {
    switch (ratio) {
      case '9:16':
      case '3:4':
        return 'grid-cols-6';
      case '1:1':
      case '4:3':
        return 'grid-cols-5';
      case '21:9':
        return 'grid-cols-3';
      default:
        return 'grid-cols-4';
    }
  };

  const getSceneWidth = (ratio: string) => {
    switch (ratio) {
      case '9:16':
      case '3:4':
        return '1400px';
      case '1:1':
      case '4:3':
        return '1200px';
      case '21:9':
        return '1400px';
      default:
        return '1000px';
    }
  };

  const aspectRatio = project?.settings.aspectRatio || '16:9';
  const gridColsClass = getGridColsClass(aspectRatio);
  const ratioStyle = { aspectRatio: aspectRatio.replace(':', '/') };
  const sceneWidth = getSceneWidth(aspectRatio);

  const handleSelectShot = useCallback((shotId: string) => {
    useProjectStore.getState().selectShot(shotId);
  }, []);

  const handleUploadShotTrigger = useCallback((shotId: string) => {
    useProjectStore.getState().selectShot(shotId);
    uploadInputRef.current?.click();
  }, []);

  return (

    <div
      ref={containerRef}
      className="w-full h-full bg-light-bg dark:bg-cine-black relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={{
        backgroundImage: 'radial-gradient(rgba(39, 39, 42, 0.5) 1px, transparent 1px)',
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${position.x}px ${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ... (Toolbars code unchanged) ... */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 interactive">
        {/* ... contents of top toolbar ... */}
        <div className="flex gap-1 glass-panel p-1.5 rounded-2xl shadow-lg ring-1 ring-black/5">
          <button className="p-2 glass-button rounded-xl text-gray-600 dark:text-gray-300">
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button className="p-2 glass-button-active rounded-xl">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <div className="w-px bg-black/5 dark:bg-white/10 mx-1 my-1"></div>
          <button onClick={() => setScale(s => Math.max(s - 0.1, 0.1))} className="p-2 glass-button rounded-xl text-gray-600 dark:text-gray-300">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="text-[10px] font-medium text-gray-600 dark:text-gray-300 px-2 hover:text-black dark:hover:text-white cursor-pointer min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </button>
          <button onClick={() => setScale(s => Math.min(s + 0.1, 5))} className="p-2 glass-button rounded-xl text-gray-600 dark:text-gray-300">
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px bg-black/5 dark:bg-white/10 mx-1 my-1"></div>
          <button onClick={() => autoArrangeScenes()} className="p-2 glass-button rounded-xl text-gray-600 dark:text-gray-300" title="自动整理布局">
            <GalleryHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 interactive">
        <button
          onClick={handleBatchDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/90 dark:bg-white/90 text-white dark:text-black text-xs font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span>批量下载素材</span>
        </button>
      </div>

      {/* Canvas Content Container */}
      <div
        className="absolute top-0 left-0 w-full h-full origin-top-left"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: 'none', // 禁用 CSS 过渡以防止缩放闪烁 (Fix flickering)
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'subpixel-antialiased',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Grid Background - Removed and moved to container to prevent flickering */}


        {/* Content */}
        <div className="relative p-20 min-w-max min-h-max">
          {!sceneGroups || sceneGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-40">
              <div className="text-light-text-muted dark:text-cine-text-muted mb-4">
                <LayoutGrid size={48} className="opacity-20" />
              </div>
              <p className="text-sm text-light-text-muted dark:text-cine-text-muted">
                暂无场景，请从左侧导入剧本生成
              </p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              {sceneGroups.map(({ scene, shots: sceneShots }) => (
                <CanvasScene
                  key={scene.id}
                  scene={scene}
                  sceneShots={sceneShots}
                  currentSceneId={currentSceneId}
                  selectedShotId={selectedShotId}
                  draggedScene={draggedScene}
                  dragOffset={dragOffset}
                  sceneWidth={sceneWidth}
                  gridColsClass={gridColsClass}
                  aspectRatio={aspectRatio}
                  ratioStyle={ratioStyle}
                  handleSceneDragStart={handleSceneDragStart}
                  selectScene={selectScene}
                  deleteScene={deleteScene}
                  setConfirmDialog={setConfirmDialog}
                  handleSelectShot={handleSelectShot}
                  handlePreview={handlePreview}
                  handleDownload={handleDownload}
                  handleEditShot={handleEditShot}
                  handleUploadShotTrigger={handleUploadShotTrigger}
                  handleGenerate={handleGenerate}
                  handleAddShotClick={handleAddShotClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Canvas User Widget (Floating) */}
      <CanvasUserWidget />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        confirmText="确认删除"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Modals */}
      {
        imagePreview && (
          <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setImagePreview(null)}>
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={imagePreview} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
              <button onClick={() => setImagePreview(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"><X size={20} /></button>
            </div>
          </div>
        )
      }
      <ShotEditor
        editingShot={editingShot}
        setEditingShot={setEditingShot}
        shotForm={shotForm}
        setShotForm={setShotForm}
        saveShotEdit={saveShotEdit}
        shotHistoryImages={shotHistoryImages}
        selectedHistoryImage={selectedHistoryImage}
        setSelectedHistoryImage={setSelectedHistoryImage}
        setShotImagePreview={setImagePreview}
        onUploadClick={() => uploadInputRef.current?.click()}
        isUploading={isUploading}
      />

      {
        showAddShotDialog && selectedSceneForNewShot && (
          <AddShotDialog
            sceneId={selectedSceneForNewShot}
            sceneName={project?.scenes.find(s => s.id === selectedSceneForNewShot)?.name || ''}
            existingShotsCount={project?.shots.filter(s => s.sceneId === selectedSceneForNewShot).length || 0}
            insertIndex={shotInsertIndex ?? undefined}
            onAdd={handleAddShot}
            onClose={() => { setShowAddShotDialog(false); setShotInsertIndex(null); }}
          />
        )
      }

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const shotId = selectedShotId || editingShot?.id;
          if (shotId) handleUploadImage(e, shotId);
        }}
        className="hidden"
      />
    </div >
  );
}
