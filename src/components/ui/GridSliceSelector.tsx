'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { GridData } from '@/types/project';

interface GridSliceSelectorProps {
  gridData: GridData;
  shotId?: string; // 单个镜头模式
  sceneId?: string; // 场景模式（已自动分配）
  onSelectSlice?: (sliceIndex: number) => void; // 选择切片回调
  onClose: () => void;
  currentSliceIndex?: number; // 当前使用的切片索引
}

export function GridSliceSelector({
  gridData,
  shotId,
  sceneId,
  onSelectSlice,
  onClose,
  currentSliceIndex,
}: GridSliceSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    currentSliceIndex !== undefined ? currentSliceIndex : null
  );

  const handleSelectSlice = (index: number) => {
    setSelectedIndex(index);
    if (onSelectSlice) {
      onSelectSlice(index);
    }
  };

  const { gridRows, gridCols, slices, fullImage, aspectRatio } = gridData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-[90vw] max-w-6xl max-h-[90vh] bg-white dark:bg-cine-dark rounded-lg shadow-xl overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-white dark:bg-cine-dark border-b border-light-border dark:border-cine-border">
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-cine-text">
              Grid 切片选择器
            </h2>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted">
              {gridRows}x{gridCols} Grid ({gridRows * gridCols} 个切片) · {aspectRatio}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-light-bg-secondary dark:hover:bg-cine-bg-secondary rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Full Grid Preview */}
          <div>
            <h3 className="text-sm font-medium text-light-text dark:text-cine-text mb-3">
              完整 Grid 预览
            </h3>
            <div className="w-full border border-light-border dark:border-cine-border rounded-lg overflow-hidden">
              <img
                src={fullImage}
                alt="Grid 完整预览"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Slices Grid */}
          <div>
            <h3 className="text-sm font-medium text-light-text dark:text-cine-text mb-3">
              切片预览 {shotId && '(点击选择)'}
            </h3>
            <div
              className={`grid gap-4`}
              style={{
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gridTemplateRows: `repeat(${gridRows}, 1fr)`,
              }}
            >
              {slices.map((slice, index) => {
                const isSelected = selectedIndex === index;
                const isCurrent = currentSliceIndex === index;

                return (
                  <div
                    key={index}
                    className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-green-500 ring-2 ring-green-500/50'
                        : isCurrent
                        ? 'border-blue-500'
                        : 'border-light-border dark:border-cine-border hover:border-light-accent dark:hover:border-cine-accent'
                    }`}
                    onClick={() => shotId && handleSelectSlice(index)}
                  >
                    <img
                      src={slice}
                      alt={`切片 ${index + 1}`}
                      className="w-full h-auto"
                    />

                    {/* Slice Number Badge */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      #{index + 1}
                    </div>

                    {/* Current Badge */}
                    {isCurrent && !isSelected && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Check size={12} />
                        当前
                      </div>
                    )}

                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <div className="bg-green-500 text-white p-3 rounded-full">
                          <Check size={24} />
                        </div>
                      </div>
                    )}

                    {/* Assignment Info (场景模式) */}
                    {gridData.assignments && Object.entries(gridData.assignments).find(([_, idx]) => idx === index) && (
                      <div className="absolute bottom-2 left-2 right-2 bg-purple-500/90 text-white text-xs px-2 py-1 rounded truncate">
                        已分配
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt Info */}
          <div className="text-sm text-light-text-muted dark:text-cine-text-muted bg-light-bg-secondary dark:bg-cine-bg-secondary p-4 rounded-lg">
            <strong>生成提示词:</strong>
            <p className="mt-2 whitespace-pre-wrap">{gridData.prompt}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
