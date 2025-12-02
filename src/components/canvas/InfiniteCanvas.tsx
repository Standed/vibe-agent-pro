'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Play, Grid3x3, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, LayoutGrid } from 'lucide-react';

export default function InfiniteCanvas() {
  const { project, selectScene, selectShot, currentSceneId, selectedShotId } = useProjectStore();
  const [zoom, setZoom] = useState(100);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
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
      <div className="w-full h-full bg-cine-black relative">
        {/* Floating Toolbar */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <div className="flex gap-1 bg-cine-panel border border-cine-border p-1 rounded-lg shadow-xl backdrop-blur-sm">
            <button className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 bg-cine-border text-white rounded">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <div className="w-px bg-cine-border mx-1"></div>
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={handleResetZoom} className="text-[10px] text-cine-text-muted px-1 hover:text-white cursor-pointer">
              {zoom}%
            </button>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
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
            <div className="text-cine-text-muted mb-4">
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
            <p className="text-sm text-cine-text-muted">
              从左侧导入剧本，AI 将自动生成分镜场景卡片
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-cine-black relative flex flex-col overflow-hidden">
      {/* Floating Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex gap-1 bg-cine-panel border border-cine-border p-1 rounded-lg shadow-xl backdrop-blur-sm">
          <button className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button className="p-1.5 bg-cine-border text-white rounded">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <div className="w-px bg-cine-border mx-1"></div>
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleResetZoom} className="text-[10px] text-cine-text-muted px-1 hover:text-white cursor-pointer">
            {zoom}%
          </button>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-cine-border rounded text-cine-text-muted">
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
            className={`bg-cine-dark rounded-lg p-4 min-w-[600px] max-w-4xl transition-all ${
              isSceneSelected
                ? 'border-2 border-cine-accent shadow-lg shadow-cine-accent/20'
                : 'border border-cine-border'
            }`}
            style={{
              marginLeft: scene.position.x,
              marginTop: scene.position.y,
            }}
          >
            {/* Scene Header */}
            <button
              onClick={() => selectScene(scene.id)}
              className="w-full flex items-center justify-between mb-4 hover:bg-cine-panel/50 rounded p-2 -m-2 transition-colors text-left"
            >
              <div>
                <h3 className="font-bold text-white">{scene.name}</h3>
                <p className="text-xs text-cine-text-muted">{scene.location}</p>
              </div>
              <div className="text-xs text-cine-text-muted">
                {sceneShots.length} 个镜头
              </div>
            </button>

            {/* Shots Grid */}
            {sceneShots.length > 0 ? (
              <div className="grid grid-cols-4 gap-3">
                {sceneShots.map((shot) => {
                  const isShotSelected = selectedShotId === shot.id;

                  return (
                  <button
                    key={shot.id}
                    onClick={() => selectShot(shot.id)}
                    className={`group bg-cine-panel rounded overflow-hidden hover:border-cine-accent transition-all ${
                      isShotSelected
                        ? 'border-2 border-cine-accent shadow-md shadow-cine-accent/30'
                        : 'border border-cine-border'
                    }`}
                  >
                    {/* Shot Thumbnail */}
                    <div className="aspect-video bg-cine-black flex items-center justify-center relative">
                      {shot.referenceImage ? (
                        <img
                          src={shot.referenceImage}
                          alt={`Shot ${shot.order}`}
                          className="w-full h-full object-cover"
                        />
                      ) : shot.gridImages && shot.gridImages.length > 0 ? (
                        <img
                          src={shot.gridImages[0]}
                          alt={`Shot ${shot.order}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={24} className="text-cine-text-muted" />
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
                          <Play size={32} className="text-white" fill="white" />
                        </div>
                      )}
                    </div>

                    {/* Shot Info */}
                    <div className="p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-cine-text-muted">
                          {`S${String(scene.id.split('_')[2] || '01').padStart(2, '0')}_${String(shot.order).padStart(2, '0')}`}
                        </span>
                        <span className="text-cine-text-muted">{shot.duration}s</span>
                      </div>
                      <div className="text-xs text-cine-text-muted mt-1 truncate">
                        {shot.shotSize}
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-cine-text-muted text-center py-8">
                暂无镜头
              </div>
            )}
          </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
