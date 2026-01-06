'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Play, Grid3x3, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, LayoutGrid, Eye, Download, Sparkles, RefreshCw, X, Edit2, Plus, MoreHorizontal, Check, Upload, Loader2 } from 'lucide-react';
import type { ShotSize, CameraMovement, Shot } from '@/types/project';
import { translateShotSize, translateCameraMovement } from '@/utils/translations';
import { formatShotLabel } from '@/utils/shotOrder';
import AddShotDialog from '@/components/shot/AddShotDialog';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import ShotListItem from '@/components/shot/ShotListItem';
import { toast } from 'sonner';
import { CanvasUserWidget } from '@/components/layout/CanvasUserWidget';

export default function InfiniteCanvas() {
  const { project, selectScene, selectShot, currentSceneId, selectedShotId, setControlMode, toggleRightSidebar, rightSidebarCollapsed, updateShot, addShot, reorderShots, addCharacter, addLocation } = useProjectStore();

  // Canvas State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

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
  const [shotImagePreview, setShotImagePreview] = useState<string | null>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);

  // Dialog State
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');
  const [shotInsertIndex, setShotInsertIndex] = useState<number | null>(null);
  const [showAddCharacterDialog, setShowAddCharacterDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<any | null>(null);
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const shotSizeOptions: ShotSize[] = ['Extreme Wide Shot', 'Wide Shot', 'Medium Shot', 'Close-Up', 'Extreme Close-Up'];
  const cameraMovementOptions: CameraMovement[] = ['Static', 'Pan Left', 'Pan Right', 'Tilt Up', 'Tilt Down', 'Dolly In', 'Dolly Out', 'Zoom In', 'Zoom Out', 'Handheld'];

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
        setPosition(prev => ({ ...prev, y: prev.y - e.deltaY }));
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
      if (target.closest('button') || target.closest('.interactive')) return;

      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));

      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- Actions ---

  const handlePreview = (imageUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setImagePreview(imageUrl);
  };

  const handleDownload = (imageUrl: string, shotOrder: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `shot_${shotOrder}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerate = (shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Find the shot to get its description
    const shot = project?.shots.find(s => s.id === shotId);
    if (shot) {
      // 1. 设置生成请求，包含场景上下文
      const scene = project?.scenes.find(s => s.id === shot.sceneId);
      const sceneContext = scene?.description ? `\n场景环境: ${scene.description}` : '';
      const fullPrompt = `镜头画面: ${shot.description || ''}${sceneContext}`;

      useProjectStore.getState().setGenerationRequest({
        prompt: fullPrompt,
        model: 'jimeng',
        jimengModel: 'jimeng-4.5',
        jimengResolution: '2k'
      });
    }

    selectShot(shotId);
    setControlMode('pro');
    if (rightSidebarCollapsed) {
      toggleRightSidebar();
    }
  };

  const handleEditShot = (shot: Shot, e: React.MouseEvent) => {
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
  };

  const saveShotEdit = () => {
    if (!editingShot) return;
    if (!shotForm.description.trim()) return;
    updateShot(editingShot.id, {
      description: shotForm.description.trim(),
      narration: shotForm.narration.trim(),
      dialogue: shotForm.dialogue.trim(),
      shotSize: shotForm.shotSize || undefined,
      cameraMovement: shotForm.cameraMovement || undefined,
      duration: shotForm.duration,
    });
    setEditingShot(null);
  };

  const handleAddShotClick = (sceneId: string, insertIndex?: number) => {
    setSelectedSceneForNewShot(sceneId);
    setShotInsertIndex(insertIndex ?? null);
    setShowAddShotDialog(true);
  };

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

  const handleDeleteShot = (shotId: string, shotOrder: number, sceneName: string) => {
    if (confirm(`确定要删除镜头 #${shotOrder} 吗？`)) {
      useProjectStore.getState().deleteShot(shotId);
      toast.success('镜头已删除');
    }
  };

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

      updateShot(shotId, {
        referenceImage: imageUrl,
        status: 'done'
      });

      // 添加到历史记录
      const shot = project?.shots.find(s => s.id === shotId);
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
        updateShot(shotId, { generationHistory: newHistory });
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

  const sceneGroups = project?.scenes.map((scene) => {
    const sceneShots = project.shots
      .filter((shot) => shot.sceneId === scene.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    return {
      scene,
      shots: sceneShots,
    };
  });

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-light-bg dark:bg-cine-black relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Floating Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 interactive">
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
        </div>
      </div>

      {/* Canvas Content Container */}
      <div
        className="absolute top-0 left-0 w-full h-full origin-top-left transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        }}
      >
        {/* Grid Background - Scaled with content or fixed? 
            If inside here, it scales. If outside, it needs background-size adjustment.
            Let's put it inside so it scales naturally like a real surface.
        */}
        <div
          className="absolute -inset-[5000px]" // Huge background
          style={{
            backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.5
          }}
        />

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
            <div className="space-y-8">
              {sceneGroups.map(({ scene, shots: sceneShots }) => {
                const isSceneSelected = currentSceneId === scene.id && !selectedShotId;
                return (
                  <div
                    key={scene.id}
                    className={`glass-card p-6 min-w-[600px] max-w-4xl interactive ${isSceneSelected
                      ? 'border-2 border-light-accent/50 dark:border-cine-accent/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] ring-1 ring-light-accent/20 dark:ring-cine-accent/20'
                      : 'shadow-xl'
                      }`}
                    style={{
                      marginLeft: scene.position.x,
                      marginTop: scene.position.y,
                    }}
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking scene
                  >
                    {/* Scene Header */}
                    <button
                      onClick={() => selectScene(scene.id)}
                      className="w-full flex items-center justify-between mb-4 hover:bg-light-bg dark:bg-cine-panel/50 rounded p-2 -m-2 transition-colors text-left"
                    >
                      <div>
                        <h3 className="font-bold text-light-text dark:text-white">{scene.name}</h3>
                        <p className="text-xs text-light-text-muted dark:text-cine-text-muted">{scene.location}</p>
                      </div>
                      <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                        {sceneShots.length} 个镜头
                      </div>
                    </button>

                    {/* Shots Grid */}
                    {sceneShots.length > 0 ? (
                      <div className="grid grid-cols-4 gap-3">
                        {sceneShots.map((shot) => {
                          const isShotSelected = selectedShotId === shot.id;
                          const shotLabel = formatShotLabel(scene.order, shot.order, shot.globalOrder);

                          return (
                            <div
                              role="button"
                              tabIndex={0}
                              key={shot.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectShot(shot.id);
                                if (shot.referenceImage) {
                                  handlePreview(shot.referenceImage);
                                }
                              }}
                              className={`group bg-white/40 dark:bg-black/40 rounded-2xl overflow-hidden hover:border-light-accent/50 dark:hover:border-cine-accent/50 transition-all duration-300 ${isShotSelected
                                ? 'border-2 border-light-accent dark:border-cine-accent shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20 scale-[1.02]'
                                : 'border border-white/20 dark:border-white/5 hover:shadow-lg'
                                }`}
                            >
                              {/* Shot Thumbnail */}
                              <div className="aspect-video bg-light-bg dark:bg-cine-black flex items-center justify-center relative">
                                {shot.referenceImage ? (
                                  <>
                                    <img
                                      src={shot.referenceImage}
                                      alt={shotLabel}
                                      className="w-full h-full object-cover cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); handlePreview(shot.referenceImage!); }}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                      <button onClick={(e) => handleDownload(shot.referenceImage!, shot.order, e)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="下载"><Download size={12} /></button>
                                      <button onClick={(e) => handleEditShot(shot, e)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="编辑"><Edit2 size={12} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); selectShot(shot.id); uploadInputRef.current?.click(); }} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="上传图片"><Upload size={12} /></button>
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="重新生成"><RefreshCw size={12} /></button>
                                    </div>
                                  </>
                                ) : shot.gridImages && shot.gridImages.length > 0 ? (
                                  <>
                                    <img
                                      src={shot.gridImages[0]}
                                      alt={shotLabel}
                                      className="w-full h-full object-cover cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); handlePreview(shot.gridImages![0]); }}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                      <button onClick={(e) => { e.stopPropagation(); selectShot(shot.id); uploadInputRef.current?.click(); }} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="上传图片"><Upload size={12} /></button>
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="重新生成"><RefreshCw size={12} /></button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon size={24} className="text-light-text-muted dark:text-cine-text-muted" />
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                      <button onClick={(e) => { e.stopPropagation(); selectShot(shot.id); uploadInputRef.current?.click(); }} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm" title="上传图片"><Upload size={12} /></button>
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="px-3 py-1.5 rounded-full bg-light-accent hover:bg-light-accent-hover text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm flex items-center gap-1 text-xs"><Sparkles size={12} /> 生成图片</button>
                                    </div>
                                  </>
                                )}
                                {/* Status Indicator */}
                                <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${shot.status === 'done' ? 'bg-green-500' : shot.status === 'processing' ? 'bg-yellow-500' : shot.status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                                {shot.videoClip && (
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <Play size={32} className="text-white" fill="white" />
                                  </div>
                                )}
                              </div>
                              {/* Shot Info */}
                              <div className="p-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-mono text-light-text-muted dark:text-cine-text-muted">{shotLabel}</span>
                                  <span className="text-light-text-muted dark:text-cine-text-muted">{shot.duration}s</span>
                                </div>
                                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 truncate">{translateShotSize(shot.shotSize)} · {translateCameraMovement(shot.cameraMovement)}</div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Add Shot Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddShotClick(scene.id); }}
                          className="aspect-video rounded border-2 border-dashed border-light-border dark:border-cine-border flex flex-col items-center justify-center text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent transition-colors"
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Canvas User Widget (Floating) */}
      <CanvasUserWidget />

      {/* Modals */}
      {imagePreview && (
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setImagePreview(null)}>
          <div className="relative w-full h-full flex items-center justify-center">
            <img src={imagePreview} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
            <button onClick={() => setImagePreview(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"><X size={20} /></button>
          </div>
        </div>
      )}

      {editingShot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 md:p-8">
          <div className="bg-white dark:bg-[#0c0c0e] border border-white/20 dark:border-white/10 rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-dark/50 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-light-accent dark:bg-cine-accent rounded-xl text-white dark:text-black">
                  <Edit2 size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-light-text dark:text-white">分镜详情编辑</span>
                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-light-text-muted dark:text-cine-text-muted mt-0.5">
                    <span>镜头 #{editingShot.order}</span>
                    <span className="opacity-30">•</span>
                    <span>{translateShotSize(editingShot.shotSize)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                  <button className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-light-text-muted dark:text-cine-text-muted transition-all">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-1"></div>
                <button
                  onClick={() => setEditingShot(null)}
                  className="p-2 rounded-xl hover:bg-red-500/10 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Description & Text */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头描述</label>
                    <textarea
                      value={shotForm.description}
                      onChange={(e) => setShotForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full h-48 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                      placeholder="详细描述镜头画面内容..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">对白</label>
                      <textarea
                        value={shotForm.dialogue}
                        onChange={(e) => setShotForm((prev) => ({ ...prev, dialogue: e.target.value }))}
                        className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                        placeholder="角色对白（可选）"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">旁白</label>
                      <textarea
                        value={shotForm.narration}
                        onChange={(e) => setShotForm((prev) => ({ ...prev, narration: e.target.value }))}
                        className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                        placeholder="旁白/场景说明"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Settings & History */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary rounded-3xl p-6 border border-light-border dark:border-cine-border space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头景别</label>
                        <select
                          value={shotForm.shotSize}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, shotSize: e.target.value as ShotSize }))}
                          className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                        >
                          <option value="">选择景别</option>
                          {shotSizeOptions.map((size) => (
                            <option key={size} value={size}>{translateShotSize(size)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头运动</label>
                        <select
                          value={shotForm.cameraMovement}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, cameraMovement: e.target.value as CameraMovement }))}
                          className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                        >
                          <option value="">选择运动</option>
                          {cameraMovementOptions.map((move) => (
                            <option key={move} value={move}>{translateCameraMovement(move)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">时长 (秒)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={0.5}
                          value={shotForm.duration}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                          className="flex-1 accent-light-accent dark:accent-cine-accent"
                        />
                        <input
                          type="number"
                          min={1}
                          value={shotForm.duration}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                          className="w-16 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2 text-center text-sm font-bold text-light-text dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">历史分镜图片</label>
                      <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                        {shotHistoryImages.length} 张记录
                      </span>
                    </div>

                    {shotHistoryImages.length === 0 ? (
                      <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary border border-dashed border-light-border dark:border-cine-border rounded-2xl py-8 text-center">
                        <ImageIcon size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted opacity-30" />
                        <p className="text-xs text-light-text-muted dark:text-cine-text-muted">暂无历史图片</p>
                        <button
                          onClick={() => uploadInputRef.current?.click()}
                          className="mt-2 text-xs text-light-accent dark:text-cine-accent font-bold hover:underline"
                        >
                          点击上传
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {/* Upload Button Card */}
                        <button
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={isUploading}
                          className="aspect-video bg-light-bg dark:bg-black/40 rounded-xl border-2 border-dashed border-light-border dark:border-white/10 flex flex-col items-center justify-center text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent transition-all"
                        >
                          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                          <span className="text-[10px] mt-1 font-bold">上传图片</span>
                        </button>

                        {shotHistoryImages.map((url, idx) => (
                          <div
                            key={idx}
                            className={`group relative aspect-video bg-light-bg dark:bg-cine-black rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedHistoryImage === url ? 'border-light-accent dark:border-cine-accent ring-4 ring-light-accent/10 dark:ring-cine-accent/10' : 'border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'}`}
                            onClick={() => {
                              setSelectedHistoryImage(url);
                              if (liveEditingShot) {
                                updateShot(liveEditingShot.id, { referenceImage: url, status: 'done' });
                              }
                            }}
                          >
                            <img src={url} alt={`history-${idx + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                            {selectedHistoryImage === url && (
                              <div className="absolute inset-0 bg-light-accent/10 dark:bg-cine-accent/10 flex items-center justify-center">
                                <div className="bg-light-accent dark:bg-cine-accent text-white dark:text-black p-1 rounded-full shadow-lg">
                                  <Check size={12} />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-8 py-6 border-t border-light-border dark:border-cine-border bg-light-bg-secondary dark:bg-cine-bg-secondary">
              <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                最后修改: {new Date().toLocaleTimeString()}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingShot(null)}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl glass-button text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={saveShotEdit}
                  className="px-8 py-2.5 text-sm font-bold rounded-xl bg-black dark:bg-white text-white dark:text-black shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <span>保存并应用</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddShotDialog && selectedSceneForNewShot && (
        <AddShotDialog
          sceneId={selectedSceneForNewShot}
          sceneName={project?.scenes.find(s => s.id === selectedSceneForNewShot)?.name || ''}
          existingShotsCount={project?.shots.filter(s => s.sceneId === selectedSceneForNewShot).length || 0}
          insertIndex={shotInsertIndex ?? undefined}
          onAdd={handleAddShot}
          onClose={() => { setShowAddShotDialog(false); setShotInsertIndex(null); }}
        />
      )}

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
    </div>
  );
}
