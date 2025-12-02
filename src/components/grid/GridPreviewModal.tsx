'use client';

import { X, Check, Star, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { Shot } from '@/types/project';

interface GridPreviewModalProps {
  gridImages: string[];
  fullGridUrl: string;
  shots: Shot[];
  sceneId: string;
  onAssign: (assignments: Record<string, string>, favoriteSlices?: string[]) => void;
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
  const [selectedShots, setSelectedShots] = useState<Set<string>>(() => {
    // If shots > slices, user must select which shots to assign
    if (sceneShots.length > gridImages.length) {
      return new Set(sceneShots.slice(0, gridImages.length).map((s) => s.id));
    }
    return new Set(sceneShots.map((s) => s.id));
  });

  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    // Auto-assign: first N slices to first N selected shots
    const initial: Record<string, string> = {};
    const selectedShotsList = sceneShots.filter((s) => selectedShots.has(s.id));
    selectedShotsList.forEach((shot, idx) => {
      if (idx < gridImages.length) {
        initial[shot.id] = gridImages[idx];
      }
    });
    return initial;
  });

  const [favoriteSlices, setFavoriteSlices] = useState<Set<string>>(new Set());

  const handleSliceClick = (sliceUrl: string, shotId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [shotId]: sliceUrl,
    }));
  };

  const handleShotSelect = (shotId: string) => {
    setSelectedShots((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shotId)) {
        newSet.delete(shotId);
        // Remove assignment if unselected
        setAssignments((prevAssignments) => {
          const { [shotId]: _, ...rest } = prevAssignments;
          return rest;
        });
      } else {
        newSet.add(shotId);
      }
      return newSet;
    });
  };

  const toggleFavoriteSlice = (sliceUrl: string) => {
    setFavoriteSlices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sliceUrl)) {
        newSet.delete(sliceUrl);
      } else {
        newSet.add(sliceUrl);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    onAssign(assignments, Array.from(favoriteSlices));
    onClose();
  };

  const hasCountMismatch = sceneShots.length !== gridImages.length;
  const hasMoreSlices = gridImages.length > sceneShots.length;
  const hasMoreShots = sceneShots.length > gridImages.length;
  const unusedSlices = gridImages.filter(
    (slice) => !Object.values(assignments).includes(slice)
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-cine-dark border border-cine-border rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-cine-dark border-b border-cine-border p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold">Grid 切片预览与分配</h2>
            <p className="text-sm text-cine-text-muted mt-1">
              点击切片图片为对应镜头分配
            </p>
            {hasCountMismatch && (
              <div className="flex items-center gap-2 mt-2 text-xs text-yellow-400">
                <AlertCircle size={14} />
                {hasMoreSlices && (
                  <span>切片数量({gridImages.length})多于镜头数量({sceneShots.length})，未使用的切片可收藏保存</span>
                )}
                {hasMoreShots && (
                  <span>镜头数量({sceneShots.length})多于切片数量({gridImages.length})，请选择要分配的镜头</span>
                )}
              </div>
            )}
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
              {gridImages.map((img, idx) => {
                const isUsed = Object.values(assignments).includes(img);
                const isFavorited = favoriteSlices.has(img);
                return (
                  <div
                    key={idx}
                    className={`bg-cine-panel border rounded-lg p-3 ${
                      isUsed ? 'border-cine-accent' : 'border-cine-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-cine-text-muted">切片 {idx + 1}</div>
                      {hasMoreSlices && !isUsed && (
                        <button
                          onClick={() => toggleFavoriteSlice(img)}
                          className="text-yellow-400 hover:text-yellow-300 transition-colors"
                          title="收藏此切片"
                        >
                          <Star
                            size={14}
                            fill={isFavorited ? 'currentColor' : 'none'}
                          />
                        </button>
                      )}
                    </div>
                    <img
                      src={img}
                      alt={`Slice ${idx + 1}`}
                      className="w-full rounded mb-2"
                    />
                    {isUsed && (
                      <div className="text-xs text-cine-accent">已分配</div>
                    )}
                    {!isUsed && hasMoreSlices && (
                      <div className="text-xs text-cine-text-muted">未使用</div>
                    )}
                  </div>
                );
              })}
            </div>
            {hasMoreSlices && unusedSlices.length > 0 && (
              <div className="mt-3 text-xs text-cine-text-muted">
                提示：未使用的切片可以点击星标收藏，保存到场景的素材库中
              </div>
            )}
          </div>

          {/* Shot Assignment */}
          <div>
            <h3 className="text-sm font-bold mb-3">
              镜头分配 ({sceneShots.length} 个镜头)
              {hasMoreShots && (
                <span className="ml-2 text-xs text-yellow-400 font-normal">
                  (已选择 {selectedShots.size}/{gridImages.length})
                </span>
              )}
            </h3>
            <div className="space-y-3">
              {sceneShots.map((shot) => {
                const isSelected = selectedShots.has(shot.id);
                return (
                  <div
                    key={shot.id}
                    className={`bg-cine-panel border rounded-lg p-4 transition-all ${
                      hasMoreShots && !isSelected
                        ? 'border-cine-border opacity-50'
                        : 'border-cine-border'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Shot Selection Checkbox (if more shots than slices) */}
                      {hasMoreShots && (
                        <div className="flex items-center pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleShotSelect(shot.id)}
                            disabled={
                              !isSelected && selectedShots.size >= gridImages.length
                            }
                            className="w-4 h-4 accent-cine-accent"
                          />
                        </div>
                      )}

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
                        {assignments[shot.id] && isSelected ? (
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
                            {isSelected ? '未分配' : '未选择'}
                          </div>
                        )}
                      </div>

                      {/* Slice Selector */}
                      {isSelected && (
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-cine-dark border-t border-cine-border p-4 flex justify-between items-center">
          <div className="text-xs text-cine-text-muted">
            {favoriteSlices.size > 0 && (
              <span className="text-yellow-400">
                {favoriteSlices.size} 个切片将被收藏
              </span>
            )}
          </div>
          <div className="flex gap-3">
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
    </div>
  );
}
