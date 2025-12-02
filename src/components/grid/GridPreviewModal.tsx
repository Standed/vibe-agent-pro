'use client';

import { X, Check } from 'lucide-react';
import { useState } from 'react';
import type { Shot } from '@/types/project';

interface GridPreviewModalProps {
  gridImages: string[];
  fullGridUrl: string;
  shots: Shot[];
  sceneId: string;
  onAssign: (assignments: Record<string, string>) => void;
  onClose: () => void;
}

export default function GridPreviewModal({
  gridImages,
  fullGridUrl,
  shots,
  sceneId,
  onAssign,
  onClose,
}: GridPreviewModalProps) {
  const sceneShots = shots.filter((s) => s.sceneId === sceneId);
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    // Auto-assign: first N slices to first N shots
    const initial: Record<string, string> = {};
    sceneShots.forEach((shot, idx) => {
      if (idx < gridImages.length) {
        initial[shot.id] = gridImages[idx];
      }
    });
    return initial;
  });

  const handleSliceClick = (sliceUrl: string, shotId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [shotId]: sliceUrl,
    }));
  };

  const handleConfirm = () => {
    onAssign(assignments);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-cine-dark border border-cine-border rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-cine-dark border-b border-cine-border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Grid 切片预览与分配</h2>
            <p className="text-sm text-cine-text-muted mt-1">
              点击切片图片为对应镜头分配
            </p>
          </div>
          <button onClick={onClose} className="text-cine-text-muted hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Full Grid Preview */}
          <div>
            <h3 className="text-sm font-bold mb-3">完整 Grid 图</h3>
            <div className="bg-cine-panel border border-cine-border rounded-lg p-4">
              <img
                src={fullGridUrl}
                alt="Full Grid"
                className="w-full max-w-2xl mx-auto rounded"
              />
            </div>
          </div>

          {/* Sliced Images */}
          <div>
            <h3 className="text-sm font-bold mb-3">切片后的分镜 ({gridImages.length} 个)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {gridImages.map((img, idx) => (
                <div
                  key={idx}
                  className="bg-cine-panel border border-cine-border rounded-lg p-3"
                >
                  <div className="text-xs text-cine-text-muted mb-2">切片 {idx + 1}</div>
                  <img
                    src={img}
                    alt={`Slice ${idx + 1}`}
                    className="w-full rounded mb-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Shot Assignment */}
          <div>
            <h3 className="text-sm font-bold mb-3">
              镜头分配 ({sceneShots.length} 个镜头)
            </h3>
            <div className="space-y-3">
              {sceneShots.map((shot) => (
                <div
                  key={shot.id}
                  className="bg-cine-panel border border-cine-border rounded-lg p-4"
                >
                  <div className="flex items-start gap-4">
                    {/* Shot Info */}
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">
                        镜头 {shot.order}
                      </div>
                      <div className="text-xs text-cine-text-muted mb-2">
                        {shot.shotSize} - {shot.cameraMovement}
                      </div>
                      <div className="text-xs text-cine-text-muted line-clamp-2">
                        {shot.description}
                      </div>
                    </div>

                    {/* Assigned Image Preview */}
                    <div className="w-32">
                      {assignments[shot.id] ? (
                        <div className="relative">
                          <img
                            src={assignments[shot.id]}
                            alt="Assigned"
                            className="w-full rounded border-2 border-cine-accent"
                          />
                          <div className="absolute top-1 right-1 bg-cine-accent text-white rounded-full p-0.5">
                            <Check size={12} />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full aspect-video bg-cine-dark border border-dashed border-cine-border rounded flex items-center justify-center text-xs text-cine-text-muted">
                          未分配
                        </div>
                      )}
                    </div>

                    {/* Slice Selector */}
                    <div className="flex gap-2">
                      {gridImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSliceClick(img, shot.id)}
                          className={`w-12 h-12 rounded border-2 transition-all ${
                            assignments[shot.id] === img
                              ? 'border-cine-accent scale-110'
                              : 'border-cine-border hover:border-cine-accent/50'
                          }`}
                        >
                          <img
                            src={img}
                            alt={`Slice ${idx + 1}`}
                            className="w-full h-full object-cover rounded"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-cine-dark border-t border-cine-border p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cine-panel hover:bg-cine-border border border-cine-border transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-cine-accent hover:bg-cine-accent-hover text-white font-bold transition-colors"
          >
            确认分配
          </button>
        </div>
      </div>
    </div>
  );
}
