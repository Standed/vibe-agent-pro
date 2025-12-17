'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import Image from 'next/image';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleSelectSlice = (index: number) => {
    setSelectedIndex(index);
    if (onSelectSlice) {
      onSelectSlice(index);
    }
  };

  const { gridRows, gridCols, slices, fullImage, aspectRatio } = gridData;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-[90vw] max-w-6xl max-h-[90vh] bg-white dark:bg-cine-dark rounded-lg shadow-xl overflow-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-white dark:bg-cine-dark border-b border-light-border dark:border-cine-border">
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-white">
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
            <h3 className="text-sm font-medium text-light-text dark:text-white mb-3">
              完整 Grid 预览
            </h3>
            <div className="w-full border border-light-border dark:border-cine-border rounded-lg overflow-hidden">
              <Image
                src={fullImage}
                alt="Grid 完整预览"
                width={1920}
                height={1080}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          </div>

          {/* Slices Grid */}
          <div>
            <h3 className="text-sm font-medium text-light-text dark:text-white mb-3">
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
                    className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${isSelected
                      ? 'border-light-accent dark:border-cine-accent ring-2 ring-light-accent/50 dark:ring-cine-accent/50'
                      : isCurrent
                        ? 'border-gray-500 dark:border-gray-400'
                        : 'border-light-border dark:border-cine-border hover:border-light-accent dark:hover:border-cine-accent'
                      }`}
                    onClick={() => shotId && handleSelectSlice(index)}
                  >
                    <Image
                      src={slice}
                      alt={`切片 ${index + 1}`}
                      width={500}
                      height={500}
                      className="w-full h-auto"
                      unoptimized
                    />

                    {/* Slice Number Badge */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      #{index + 1}
                    </div>

                    {/* Current Badge */}
                    {isCurrent && !isSelected && (
                      <div className="absolute top-2 right-2 bg-gray-500 dark:bg-gray-400 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Check size={12} />
                        当前
                      </div>
                    )}

                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-light-accent/20 dark:bg-cine-accent/20 flex items-center justify-center">
                        <div className="bg-light-accent dark:bg-cine-accent text-white dark:text-black p-3 rounded-full">
                          <Check size={24} />
                        </div>
                      </div>
                    )}

                    {/* Assignment Info (场景模式) */}
                    {gridData.assignments && Object.entries(gridData.assignments).find(([_, idx]) => idx === index) && (
                      <div className="absolute bottom-2 left-2 right-2 bg-black/90 dark:bg-white/90 text-white dark:text-black text-xs px-2 py-1 rounded truncate">
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
    </div>,
    document.body
  );
}
