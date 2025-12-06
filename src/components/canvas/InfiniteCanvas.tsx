'use client';

import { useState, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Play, Grid3x3, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, LayoutGrid, Eye, Download, Sparkles, RefreshCw, X } from 'lucide-react';

export default function InfiniteCanvas() {
  const { project, selectScene, selectShot, currentSceneId, selectedShotId, setControlMode, toggleRightSidebar, rightSidebarCollapsed } = useProjectStore();
  const [zoom, setZoom] = useState(100);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle image preview
  const handlePreview = (imageUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreview(imageUrl);
  };

  // Handle image download
  const handleDownload = (imageUrl: string, shotOrder: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `shot_${shotOrder}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle generate/regenerate
  const handleGenerate = (shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    selectShot(shotId);
    setControlMode('pro');
    if (rightSidebarCollapsed) {
      toggleRightSidebar();
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  // 处理滚轮缩放（Ctrl + 滚轮 或 触控板捏合）
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // 检测是否按住 Ctrl/Cmd 键（触控板捏合也会触发 ctrlKey）
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      // deltaY > 0 表示向下滚动（缩小），< 0 表示向上滚动（放大）
      const delta = -e.deltaY;
      const zoomSpeed = 0.5; // 缩放速度

      setZoom((prevZoom) => {
        const newZoom = prevZoom + delta * zoomSpeed;
        // 限制缩放范围在 50% - 200% 之间，并四舍五入为整数
        return Math.round(Math.min(Math.max(newZoom, 50), 200));
      });
    }
  };

  const sceneGroups = project?.scenes.map((scene) => {
    const sceneShots = project.shots.filter((shot) => shot.sceneId === scene.id);
    return {
      scene,
      shots: sceneShots,
    };
  });

  if (!sceneGroups || sceneGroups.length === 0) {
    return (
      <div
        ref={canvasRef}
        onWheel={handleWheel}
        className="w-full h-full bg-light-bg dark:bg-cine-black relative"
      >
        {/* Floating Toolbar */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <div className="flex gap-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border p-1 rounded-lg shadow-xl backdrop-blur-sm">
            <button className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 bg-cine-border text-light-text dark:text-white rounded">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <div className="w-px bg-cine-border mx-1"></div>
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={handleResetZoom} className="text-[10px] text-light-text-muted dark:text-cine-text-muted px-1 hover:text-light-text dark:hover:text-white cursor-pointer">
              {zoom}%
            </button>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Grid Background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Canvas Content */}
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-light-text-muted dark:text-cine-text-muted mb-4">
              <svg
                className="mx-auto mb-2"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted">
              从左侧导入剧本，AI 将自动生成分镜场景卡片
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      onWheel={handleWheel}
      className="w-full h-full bg-light-bg dark:bg-cine-black relative flex flex-col overflow-hidden"
    >
      {/* Floating Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex gap-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border p-1 rounded-lg shadow-xl backdrop-blur-sm">
          <button className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button className="p-1.5 bg-cine-border text-light-text dark:text-white rounded">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <div className="w-px bg-cine-border mx-1"></div>
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleResetZoom} className="text-[10px] text-light-text-muted dark:text-cine-text-muted px-1 hover:text-light-text dark:hover:text-white cursor-pointer">
            {zoom}%
          </button>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-light-border dark:hover:bg-cine-border rounded text-light-text-muted dark:text-cine-text-muted">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Container with Pan */}
      <div
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-auto"
        style={{
          backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Scene Cards with Zoom */}
        <div
          className="relative p-8 space-y-6 transition-transform origin-top-left"
          style={{
            transform: `scale(${zoom / 100})`,
            minWidth: `${100 * (100 / zoom)}%`,
            minHeight: `${100 * (100 / zoom)}%`,
          }}
        >
        {sceneGroups.map(({ scene, shots: sceneShots }) => {
          const isSceneSelected = currentSceneId === scene.id && !selectedShotId;

          return (
          <div
            key={scene.id}
            className={`bg-light-panel dark:bg-cine-dark rounded-lg p-4 min-w-[600px] max-w-4xl transition-all ${
              isSceneSelected
                ? 'border-2 border-light-accent dark:border-cine-accent shadow-lg shadow-cine-accent/20'
                : 'border border-light-border dark:border-cine-border'
            }`}
            style={{
              marginLeft: scene.position.x,
              marginTop: scene.position.y,
            }}
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

                  return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={shot.id}
                    onClick={() => selectShot(shot.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectShot(shot.id);
                      }
                    }}
                    className={`group bg-light-bg dark:bg-cine-panel rounded overflow-hidden hover:border-light-accent dark:border-cine-accent transition-all ${
                      isShotSelected
                        ? 'border-2 border-light-accent dark:border-cine-accent shadow-md shadow-cine-accent/30'
                        : 'border border-light-border dark:border-cine-border'
                    }`}
                  >
                    {/* Shot Thumbnail */}
                    <div className="aspect-video bg-light-bg dark:bg-cine-black flex items-center justify-center relative">
                      {shot.referenceImage ? (
                        <>
                          <img
                            src={shot.referenceImage}
                            alt={`Shot ${shot.order}`}
                            className="w-full h-full object-cover"
                          />
                          {/* Action Buttons Overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => handlePreview(shot.referenceImage!, e)}
                              className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800 transition-colors"
                              title="预览"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDownload(shot.referenceImage!, shot.order, e)}
                              className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800 transition-colors"
                              title="下载"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={(e) => handleGenerate(shot.id, e)}
                              className="p-1.5 bg-light-accent hover:bg-light-accent-hover rounded text-white transition-colors"
                              title="重新生成"
                            >
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        </>
                      ) : shot.gridImages && shot.gridImages.length > 0 ? (
                        <>
                          <img
                            src={shot.gridImages[0]}
                            alt={`Shot ${shot.order}`}
                            className="w-full h-full object-cover"
                          />
                          {/* Action Buttons Overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => handlePreview(shot.gridImages![0], e)}
                              className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800 transition-colors"
                              title="预览"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDownload(shot.gridImages![0], shot.order, e)}
                              className="p-1.5 bg-white/90 hover:bg-white rounded text-gray-800 transition-colors"
                              title="下载"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={(e) => handleGenerate(shot.id, e)}
                              className="p-1.5 bg-light-accent hover:bg-light-accent-hover rounded text-white transition-colors"
                              title="重新生成"
                            >
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <ImageIcon size={24} className="text-light-text-muted dark:text-cine-text-muted" />
                          {/* Generate Button for empty shots */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={(e) => handleGenerate(shot.id, e)}
                              className="p-2 bg-light-accent hover:bg-light-accent-hover rounded-lg text-white transition-colors flex items-center gap-1 text-xs"
                            >
                              <Sparkles size={14} />
                              生成图片
                            </button>
                          </div>
                        </>
                      )}

                      {/* Status Indicator */}
                      <div
                        className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                          shot.status === 'done'
                            ? 'bg-green-500'
                            : shot.status === 'processing'
                            ? 'bg-yellow-500'
                            : shot.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-gray-500'
                        }`}
                      />

                      {/* Play Icon Overlay */}
                      {shot.videoClip && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={32} className="text-light-text dark:text-white" fill="white" />
                        </div>
                      )}
                    </div>

                    {/* Shot Info */}
                    <div className="p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-light-text-muted dark:text-cine-text-muted">
                          {`S${String(scene.id.split('_')[2] || '01').padStart(2, '0')}_${String(shot.order).padStart(2, '0')}`}
                        </span>
                        <span className="text-light-text-muted dark:text-cine-text-muted">{shot.duration}s</span>
                      </div>
                      <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 truncate">
                        {shot.shotSize}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-light-text-muted dark:text-cine-text-muted text-center py-8">
                暂无镜头
              </div>
            )}
          </div>
          );
        })}
        </div>
      </div>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setImagePreview(null)}
              className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full text-gray-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
