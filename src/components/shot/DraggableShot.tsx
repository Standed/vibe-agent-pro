'use client';

import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { Identifier, XYCoord } from 'dnd-core';
import { Film, Trash2 } from 'lucide-react';
import type { Shot } from '@/types/project';

interface DraggableShotProps {
  shot: Shot;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const ITEM_TYPE = 'SHOT';

export default function DraggableShot({
  shot,
  index,
  isSelected,
  onSelect,
  onDelete,
  onMove,
}: DraggableShotProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: ITEM_TYPE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // Time to actually perform the action
      onMove(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ITEM_TYPE,
    item: () => {
      return { id: shot.id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={`relative rounded-lg transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${
        isSelected
          ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-2 border-light-accent dark:border-cine-accent'
          : 'bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
      } cursor-move`}
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
                💬 "{shot.dialogue}"
              </p>
            )}
          </div>
        </div>
      </button>

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
