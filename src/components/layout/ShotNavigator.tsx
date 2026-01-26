'use client';

import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMemo } from 'react';
import { formatShotLabel } from '@/utils/shotOrder';

/**
 * Shot Navigator - Global navigation for quickly switching between shots
 */
export default function ShotNavigator() {
  const { project, selectedShotId, selectShot, selectScene } = useProjectStore();

  const shots = project?.shots || [];
  const scenes = project?.scenes || [];

  // Find current shot and scene
  const currentShot = shots.find(s => s.id === selectedShotId);
  const currentScene = scenes.find(scene =>
    scene.shotIds.includes(selectedShotId || '')
  );

  // Build flat list of all shots with scene context
  const allShotsWithContext = useMemo(() => {
    return scenes.flatMap(scene =>
      scene.shotIds.map(shotId => {
        const shot = shots.find(s => s.id === shotId);
        return shot ? { shot, scene } : null;
      }).filter(Boolean)
    ).filter((item): item is { shot: any; scene: any } => item !== null);
  }, [scenes, shots]);

  // Find current shot index in global list
  const currentIndex = allShotsWithContext.findIndex(
    item => item.shot.id === selectedShotId
  );

  const handleSelectShot = (shotId: string, sceneId: string) => {
    selectShot(shotId);
    selectScene(sceneId);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prev = allShotsWithContext[currentIndex - 1];
      handleSelectShot(prev.shot.id, prev.scene.id);
    }
  };

  const handleNext = () => {
    if (currentIndex < allShotsWithContext.length - 1) {
      const next = allShotsWithContext[currentIndex + 1];
      handleSelectShot(next.shot.id, next.scene.id);
    }
  };

  // Keyboard shortcuts
  useMemo(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Arrow left/right for prev/next shot (only if not in input)
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
          handlePrevious();
        } else {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allShotsWithContext]);

  if (!project || shots.length === 0) {
    return null;
  }

  return (
    <div className="bg-light-panel dark:bg-cine-panel border-b border-light-border dark:border-cine-border px-4 py-2 flex items-center gap-3">
      {/* Previous Button */}
      <button
        onClick={handlePrevious}
        disabled={currentIndex <= 0}
        className="p-2 rounded hover:bg-light-bg dark:hover:bg-cine-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="上一个镜头 (←)"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Shot Selector Dropdown */}
      <div className="flex-1 max-w-md">
        <select
          value={selectedShotId || ''}
          onChange={(e) => {
            const item = allShotsWithContext.find(
              item => item.shot.id === e.target.value
            );
            if (item) {
              handleSelectShot(item.shot.id, item.scene.id);
            }
          }}
          className="w-full bg-light-bg dark:bg-cine-black border border-light-border dark:border-cine-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
        >
          {allShotsWithContext.map(({ shot, scene }, index) => {
            const shotNumber = formatShotLabel(scene.order, shot.order, shot.globalOrder);
            const statusEmoji =
              shot.status === 'done' ? '✓' :
              shot.status === 'processing' ? '⏳' :
              shot.status === 'error' ? '✗' :
              '○';

            return (
              <option key={shot.id} value={shot.id}>
                {statusEmoji} 镜头 {shotNumber} - {scene.name} - {shot.shotSize} - {shot.cameraMovement}
              </option>
            );
          })}
        </select>
      </div>

      {/* Current Shot Info */}
      {currentShot && currentScene && (
        <div className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted">
          <Film size={14} />
          <span>
            {currentIndex + 1} / {allShotsWithContext.length}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-light-bg dark:bg-cine-black">
            {currentScene.name}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              currentShot.status === 'done'
                ? 'bg-green-500/20 text-green-400'
                : currentShot.status === 'processing'
                ? 'bg-yellow-500/20 text-yellow-400'
                : currentShot.status === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {currentShot.status}
          </span>
        </div>
      )}

      {/* Next Button */}
      <button
        onClick={handleNext}
        disabled={currentIndex >= allShotsWithContext.length - 1}
        className="p-2 rounded hover:bg-light-bg dark:hover:bg-cine-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="下一个镜头 (→)"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
