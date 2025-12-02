'use client';

import { X, Clock, Image as ImageIcon } from 'lucide-react';
import type { GridHistoryItem, Shot } from '@/types/project';

interface GridHistoryModalProps {
  sceneId: string;
  sceneName: string;
  gridHistory: GridHistoryItem[];
  shots: Shot[];
  onSelectHistory: (historyItem: GridHistoryItem) => void;
  onClose: () => void;
}

export default function GridHistoryModal({
  sceneId,
  sceneName,
  gridHistory,
  shots,
  onSelectHistory,
  onClose,
}: GridHistoryModalProps) {
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSelectHistory = (historyItem: GridHistoryItem) => {
    onSelectHistory(historyItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-cine-dark border border-cine-border rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-cine-dark border-b border-cine-border p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold">Grid 生成历史</h2>
            <p className="text-sm text-cine-text-muted mt-1">
              场景：{sceneName} ({gridHistory.length} 条记录)
            </p>
          </div>
          <button onClick={onClose} className="text-cine-text-muted hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* History List */}
        <div className="p-6 space-y-4">
          {gridHistory.length === 0 ? (
            <div className="text-center py-12 text-cine-text-muted">
              <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
              <p>暂无 Grid 生成记录</p>
            </div>
          ) : (
            gridHistory.map((item) => {
              const assignedCount = item.assignments
                ? Object.keys(item.assignments).length
                : 0;

              return (
                <div
                  key={item.id}
                  className="bg-cine-panel border border-cine-border rounded-lg p-4 hover:border-cine-accent transition-colors cursor-pointer"
                  onClick={() => handleSelectHistory(item)}
                >
                  <div className="flex gap-4">
                    {/* Full Grid Thumbnail */}
                    <div className="w-48 shrink-0">
                      <img
                        src={item.fullGridUrl}
                        alt="Grid"
                        className="w-full rounded border border-cine-border"
                      />
                    </div>

                    {/* History Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-cine-text-muted">
                        <Clock size={12} />
                        <span>{formatDate(item.timestamp)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-cine-text-muted">Grid 大小：</span>
                          <span className="font-medium">
                            {item.gridSize} ({item.slices.length}视图)
                          </span>
                        </div>
                        <div>
                          <span className="text-cine-text-muted">画面比例：</span>
                          <span className="font-medium">{item.aspectRatio}</span>
                        </div>
                        <div>
                          <span className="text-cine-text-muted">已分配镜头：</span>
                          <span className="font-medium">{assignedCount} 个</span>
                        </div>
                      </div>

                      <div className="text-xs">
                        <div className="text-cine-text-muted mb-1">提示词：</div>
                        <div className="bg-cine-dark border border-cine-border rounded p-2 line-clamp-2">
                          {item.prompt}
                        </div>
                      </div>
                    </div>

                    {/* Slice Preview */}
                    <div className="w-40 shrink-0">
                      <div className="text-xs text-cine-text-muted mb-2">切片预览</div>
                      <div
                        className={`grid gap-1 ${
                          item.gridSize === '2x2' ? 'grid-cols-2' : 'grid-cols-3'
                        }`}
                      >
                        {item.slices.slice(0, 4).map((slice, idx) => (
                          <img
                            key={idx}
                            src={slice}
                            alt={`Slice ${idx + 1}`}
                            className="w-full rounded border border-cine-border"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Hint */}
                  <div className="mt-3 pt-3 border-t border-cine-border text-center">
                    <span className="text-xs text-cine-accent">
                      点击选择此 Grid 进行重新分配
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-cine-dark border-t border-cine-border p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cine-panel hover:bg-cine-border border border-cine-border transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
