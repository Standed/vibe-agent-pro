'use client';

import { RotateCcw, Download, Heart, Mic, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { GenerationHistoryItem } from '@/types/project';

interface ShotGenerationHistoryProps {
  history: GenerationHistoryItem[];
  onRegenerate: (item: GenerationHistoryItem) => void;
  onApply: (item: GenerationHistoryItem) => void;
  onDownload: (item: GenerationHistoryItem) => void;
  onFavorite: (item: GenerationHistoryItem) => void;
  onDubbing: (item: GenerationHistoryItem) => void;
  onOpenGridSelection?: (fullGridUrl: string, slices: string[]) => void;
  onPreview?: (imageUrl: string) => void;
}

export default function ShotGenerationHistory({
  history,
  onRegenerate,
  onApply,
  onDownload,
  onFavorite,
  onDubbing,
  onOpenGridSelection,
  onPreview,
}: ShotGenerationHistoryProps) {
  if (!history || history.length === 0) {
    return (
      <div className="text-xs text-cine-text-muted text-center py-4">
        暂无生成历史
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-cine-accent mb-2">
        生成历史 ({history.length} 条)
      </div>

      {history.map((item) => (
        <div
          key={item.id}
          className="bg-cine-black/30 border border-cine-border rounded-lg p-3 space-y-2"
        >
          {/* Preview */}
          <div className="relative group">
            {item.type === 'image' ? (
              <div
                className="cursor-pointer relative"
                onClick={() => {
                  if (item.parameters.gridSize && onOpenGridSelection) {
                    // Extract slices from parameters if available
                    const slices = (item.parameters.slices as string[]) || [];
                    onOpenGridSelection(item.result, slices);
                  } else if (onPreview) {
                    onPreview(item.result);
                  }
                }}
              >
                <Image
                  src={item.result}
                  alt="Generation Result"
                  width={800}
                  height={600}
                  className="w-full h-auto rounded border border-cine-border object-cover"
                  unoptimized
                />

                {/* Overlay Apply Button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onApply(item); }}
                  className="absolute bottom-1 right-1 p-1.5 bg-cine-accent text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-cine-accent-hover z-10"
                  title="使用此图片"
                >
                  <CheckCircle2 size={14} />
                </button>

                {item.parameters.gridSize && onOpenGridSelection && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors rounded flex items-center justify-center pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white bg-black/50 px-2 py-1 rounded">
                      点击重新分配
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <video
                src={item.result}
                className="w-full rounded border border-cine-border"
                controls
                preload="metadata"
              />
            )}

            {/* Status Badge */}
            <div
              className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded ${item.status === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
            >
              {item.status === 'success' ? '成功' : '失败'}
            </div>
          </div>

          {/* Prompt */}
          <div className="text-xs text-cine-text-muted">
            <div className="text-[10px] text-cine-text-muted/70 mb-1">提示词:</div>
            <div className="line-clamp-2">{item.prompt}</div>
          </div>

          {/* Parameters */}
          {Object.keys(item.parameters).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.parameters.model && (
                <span className="text-[10px] bg-cine-panel px-2 py-0.5 rounded border border-cine-border">
                  {item.parameters.model}
                </span>
              )}
              {item.parameters.aspectRatio && (
                <span className="text-[10px] bg-cine-panel px-2 py-0.5 rounded border border-cine-border">
                  {item.parameters.aspectRatio}
                </span>
              )}
              {item.parameters.gridSize && (
                <span className="text-[10px] bg-cine-panel px-2 py-0.5 rounded border border-cine-border">
                  Grid {item.parameters.gridSize}
                </span>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="text-[10px] text-cine-text-muted/50">
            {new Date(item.timestamp).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          {/* Action Buttons (Aipai style) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onApply(item)}
              className="col-span-2 flex items-center justify-center gap-1 bg-cine-accent hover:bg-cine-accent-hover text-white rounded px-2 py-1.5 text-xs transition-colors font-medium border border-transparent shadow-sm"
            >
              <CheckCircle2 size={12} />
              使用此版本
            </button>

            <button
              onClick={() => onRegenerate(item)}
              className="flex items-center justify-center gap-1 bg-cine-panel hover:bg-cine-border border border-cine-border rounded px-2 py-1.5 text-xs transition-colors"
            >
              <RotateCcw size={12} />
              重新生成
            </button>

            <button
              onClick={() => onDownload(item)}
              className="flex items-center justify-center gap-1 bg-cine-panel hover:bg-cine-border border border-cine-border rounded px-2 py-1.5 text-xs transition-colors"
            >
              <Download size={12} />
              下载
            </button>

            <button
              onClick={() => onFavorite(item)}
              className="flex items-center justify-center gap-1 bg-cine-panel hover:bg-cine-border border border-cine-border rounded px-2 py-1.5 text-xs transition-colors"
            >
              <Heart size={12} />
              收藏
            </button>

            {item.type === 'video' && (
              <button
                onClick={() => onDubbing(item)}
                className="flex items-center justify-center gap-1 bg-cine-panel hover:bg-cine-border border border-cine-border rounded px-2 py-1.5 text-xs transition-colors"
              >
                <Mic size={12} />
                配音
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
