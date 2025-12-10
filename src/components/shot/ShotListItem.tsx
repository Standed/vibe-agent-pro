'use client';

import { Film, Trash2 } from 'lucide-react';
import type { Shot } from '@/types/project';

interface ShotListItemProps {
  shot: Shot;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}

export default function ShotListItem({
  shot,
  isSelected,
  onSelect,
  onDelete,
  onEdit,
}: ShotListItemProps) {
  return (
    <div
      className={`relative rounded-lg transition-all ${
        isSelected
          ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-2 border-light-accent dark:border-cine-accent'
          : 'bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
      }`}
    >
      {/* Shot Content - Clickable */}
      <button onClick={onSelect} className="w-full text-left p-3">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="w-16 h-16 flex-shrink-0 bg-light-bg dark:bg-cine-black rounded overflow-hidden">
            {shot.referenceImage ? (
              <img
                src={shot.referenceImage}
                alt={`Shot ${shot.order}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-light-text-muted dark:text-cine-text-muted">
                <Film size={20} className="opacity-50" />
              </div>
            )}
          </div>

          {/* Shot Info */}
          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-light-accent dark:text-cine-accent">
                #{shot.order}
              </span>
              <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                {shot.shotSize}
              </span>
              <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                {shot.duration}s
              </span>
              {shot.status === 'done' && (
                <span className="text-xs text-green-400">✓</span>
              )}
            </div>
            <p className="text-xs text-light-text dark:text-white line-clamp-2">
              {shot.description}
            </p>
            {/* 显示对白（如果有） */}
            {shot.dialogue && (
              <p className="text-xs text-light-accent dark:text-cine-accent mt-1 line-clamp-1 italic">
                💬 &ldquo;{shot.dialogue}&rdquo;
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Edit Button */}
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute top-2 right-8 p-1.5 hover:bg-light-border/50 dark:hover:bg-cine-panel/60 rounded transition-colors group"
          title="编辑分镜"
        >
          <Film size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover:text-light-accent dark:group-hover:text-cine-accent" />
        </button>
      )}

      {/* Delete Button - Absolute positioned */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 p-1.5 hover:bg-red-500/10 rounded transition-colors group"
        title="删除镜头"
      >
        <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover:text-red-500" />
      </button>
    </div>
  );
}
