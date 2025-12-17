'use client';

import { Film, Trash2 } from 'lucide-react';
import Image from 'next/image';
import type { Shot } from '@/types/project';

interface ShotListItemProps {
  shot: Shot;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  label?: string;
}

export default function ShotListItem({
  shot,
  isSelected,
  onSelect,
  onDelete,
  onEdit,
  label,
}: ShotListItemProps) {
  return (
    <div
      className={`relative rounded-xl transition-all duration-300 group/item ${isSelected
        ? 'bg-light-accent/10 dark:bg-cine-accent/10 ring-2 ring-light-accent dark:ring-cine-accent shadow-[0_0_20px_rgba(168,85,247,0.15)]'
        : 'glass-card hover:border-light-accent/30 dark:hover:border-cine-accent/30 hover:shadow-lg hover:-translate-y-0.5'
        }`}
    >
      {/* Shot Content - Clickable */}
      <button onClick={onSelect} className="w-full text-left p-3">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="w-16 h-16 flex-shrink-0 bg-light-bg dark:bg-cine-black rounded-lg overflow-hidden border border-light-border/50 dark:border-cine-border/50 shadow-sm">
            {shot.referenceImage ? (
              <Image
                src={shot.referenceImage}
                alt={`Shot ${shot.order}`}
                fill
                className="object-cover transition-transform duration-500 group-hover/item:scale-110"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-light-text-muted dark:text-cine-text-muted bg-light-bg/50 dark:bg-cine-panel/50">
                <Film size={20} className="opacity-50" />
              </div>
            )}
          </div>

          {/* Shot Info */}
          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold ${isSelected ? 'text-light-accent dark:text-cine-accent' : 'text-light-text dark:text-white'}`}>
                {label || `#${shot.order}`}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted">
                {shot.shotSize}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted">
                {shot.duration}s
              </span>
              {shot.status === 'done' && (
                <span className="text-xs text-green-500 dark:text-green-400" title="已生成">✓</span>
              )}
            </div>
            <p className="text-xs text-light-text dark:text-gray-300 line-clamp-2 leading-relaxed">
              {shot.description}
            </p>
            {/* 显示对白（如果有） */}
            {shot.dialogue && (
              <p className="text-xs text-light-accent dark:text-cine-accent mt-1 line-clamp-1 italic opacity-80">
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
          className="absolute top-2 right-8 p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/20 rounded-lg transition-colors group/edit opacity-0 group-hover/item:opacity-100"
          title="编辑分镜"
        >
          <Film size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover/edit:text-light-accent dark:group-hover/edit:text-cine-accent" />
        </button>
      )}

      {/* Delete Button - Absolute positioned */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors group/delete opacity-0 group-hover/item:opacity-100"
        title="删除镜头"
      >
        <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted group-hover/delete:text-red-500" />
      </button>
    </div>
  );
}
