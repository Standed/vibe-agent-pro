'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Play, Grid3x3, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, LayoutGrid, Eye, Download, Sparkles, RefreshCw, X, Edit2, Plus } from 'lucide-react';
import type { ShotSize, CameraMovement, Shot } from '@/types/project';
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
      shotSize: shotForm.shotSize,
      cameraMovement: shotForm.cameraMovement,
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
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                      <button onClick={(e) => handlePreview(shot.referenceImage!, e)} className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800"><Eye size={14} /></button>
                                      <button onClick={(e) => handleDownload(shot.referenceImage!, shot.order, e)} className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800"><Download size={14} /></button>
                                      <button onClick={(e) => handleEditShot(shot, e)} className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800"><Edit2 size={14} /></button>
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="p-1.5 bg-light-accent hover:bg-light-accent-hover rounded text-white"><RefreshCw size={14} /></button>
                                    </div>
                                  </>
                                ) : shot.gridImages && shot.gridImages.length > 0 ? (
                                  <>
                                    <img src={shot.gridImages[0]} alt={shotLabel} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                      <button onClick={(e) => handlePreview(shot.gridImages![0], e)} className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800"><Eye size={14} /></button>
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="p-1.5 bg-light-accent hover:bg-light-accent-hover rounded text-white"><RefreshCw size={14} /></button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon size={24} className="text-light-text-muted dark:text-cine-text-muted" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <button onClick={(e) => handleGenerate(shot.id, e)} className="p-2 bg-light-accent hover:bg-light-accent-hover rounded-lg text-white flex items-center gap-1 text-xs"><Sparkles size={14} /> 生成图片</button>
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
                                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 truncate">{shot.shotSize}</div>
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
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 interactive" onClick={() => setImagePreview(null)}>
          <div className="relative max-w-7xl max-h-full">
            <img src={imagePreview} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
            <button onClick={() => setImagePreview(null)} className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full text-gray-800"><X size={20} /></button>
          </div>
        </div>
      )}

      {editingShot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 interactive">
          <div className="bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl w-[900px] max-w-[96vw] max-h-[88vh] overflow-hidden flex flex-col ring-1 ring-black/5">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-cine-border">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-light-accent dark:text-cine-accent" />
                <span className="text-sm font-bold text-light-text dark:text-white">分镜详情编辑</span>
              </div>
              <button onClick={() => setEditingShot(null)} className="p-1 rounded hover:bg-light-bg dark:hover:bg-cine-panel"><X size={16} className="text-light-text-muted dark:text-cine-text-muted" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 overflow-auto">
              <div className="space-y-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block">镜头描述</label>
                <textarea value={shotForm.description} onChange={(e) => setShotForm((prev) => ({ ...prev, description: e.target.value }))} className="glass-input w-full h-40 rounded-xl p-3 text-sm resize-none text-gray-800 dark:text-gray-100 placeholder-gray-400" placeholder="描述镜头画面内容..." />
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block mt-3">旁白</label>
                <textarea value={shotForm.narration} onChange={(e) => setShotForm((prev) => ({ ...prev, narration: e.target.value }))} className="glass-input w-full h-24 rounded-xl p-3 text-sm resize-none text-gray-800 dark:text-gray-100 placeholder-gray-400" placeholder="旁白内容..." />
              </div>
              <div className="space-y-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block">对白</label>
                <textarea value={shotForm.dialogue} onChange={(e) => setShotForm((prev) => ({ ...prev, dialogue: e.target.value }))} className="glass-input w-full h-24 rounded-xl p-3 text-sm resize-none text-gray-800 dark:text-gray-100 placeholder-gray-400" placeholder="角色对白..." />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block">镜头景别</label>
                    <select value={shotForm.shotSize} onChange={(e) => setShotForm((prev) => ({ ...prev, shotSize: e.target.value as ShotSize }))} className="glass-input w-full mt-1 rounded-xl p-2 text-sm text-gray-800 dark:text-gray-100">
                      <option value="">选择景别</option>
                      {shotSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block">镜头运动</label>
                    <select value={shotForm.cameraMovement} onChange={(e) => setShotForm((prev) => ({ ...prev, cameraMovement: e.target.value as CameraMovement }))} className="glass-input w-full mt-1 rounded-xl p-2 text-sm text-gray-800 dark:text-gray-100">
                      <option value="">选择运动</option>
                      {cameraMovementOptions.map((move) => <option key={move} value={move}>{move}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1 mb-1 block">时长 (秒)</label>
                  <input type="number" min={1} value={shotForm.duration} onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))} className="glass-input w-full mt-1 rounded-xl p-2 text-sm text-gray-800 dark:text-gray-100" />
                </div>
              </div>
            </div>
            {/* History Images */}
            <div className="px-4 pb-4">
              <div className="text-xs font-medium text-light-text dark:text-white mb-2">历史分镜图片</div>
              <div className="grid grid-cols-5 gap-2">
                {shotHistoryImages.map((url, idx) => (
                  <div key={idx} className={`aspect-video bg-light-bg dark:bg-cine-black rounded border cursor-pointer ${selectedHistoryImage === url ? 'border-light-accent dark:border-cine-accent' : 'border-transparent'}`} onClick={() => { setSelectedHistoryImage(url); if (liveEditingShot) updateShot(liveEditingShot.id, { referenceImage: url }); }}>
                    <img src={url} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-light-border dark:border-cine-border">
              <button onClick={() => setEditingShot(null)} className="px-4 py-2 text-sm rounded-xl glass-button text-gray-600 dark:text-gray-300">取消</button>
              <button onClick={saveShotEdit} className="px-4 py-2 text-sm rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium shadow-md hover:scale-105 transition-transform">保存并应用</button>
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
    </div>
  );
}
