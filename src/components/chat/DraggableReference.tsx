
import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { X } from 'lucide-react';
import { ActiveReference } from '@/hooks/chat/useAutoReference';

const REF_ITEM_TYPE = 'REFERENCE_ITEM';

interface DraggableReferenceProps {
    refItem: ActiveReference;
    index: number;
    moveReference: (dragIndex: number, hoverIndex: number) => void;
    onRemove: (ref: ActiveReference) => void;
    onPreview?: (url: string) => void; // 新增：点击预览
}

export const DraggableReference: React.FC<DraggableReferenceProps> = ({ refItem, index, moveReference, onRemove, onPreview }) => {
    const ref = useRef<HTMLDivElement>(null);

    const [{ handlerId }, drop] = useDrop({
        accept: REF_ITEM_TYPE,
        collect(monitor) {
            return {
                handlerId: monitor.getHandlerId(),
            };
        },
        hover(item: any, monitor) {
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
            const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2; // For horizontal list

            // Determine mouse position
            const clientOffset = monitor.getClientOffset();

            // Get pixels to the top
            const hoverClientY = clientOffset!.y - hoverBoundingRect.top;
            const hoverClientX = clientOffset!.x - hoverBoundingRect.left;

            // Only perform the move when the mouse has crossed half of the items height
            // When dragging downwards, only move when the cursor is below 50%
            // When dragging upwards, only move when the cursor is above 50%

            // Dragging right
            if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
                return;
            }

            // Dragging left
            if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
                return;
            }

            // Time to actually perform the action
            moveReference(dragIndex, hoverIndex);

            // Note: we're mutating the monitor item here!
            // Generally it's better to avoid mutations,
            // but it's good here for the sake of performance
            // to avoid expensive index searches.
            item.index = hoverIndex;
        },
    });

    const [{ isDragging }, drag] = useDrag({
        type: REF_ITEM_TYPE,
        item: () => {
            return { id: refItem.url, index };
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    drag(drop(ref));

    // 懒加载状态
    const [isLoaded, setIsLoaded] = React.useState(false);

    return (
        <div
            ref={ref}
            className={`relative group flex-shrink-0 w-16 h-16 cursor-move ${isDragging ? 'opacity-0' : 'opacity-100'}`}
            title={refItem.label}
            data-handler-id={handlerId}
        >
            {/* 加载占位符 */}
            {!isLoaded && (
                <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded-lg" />
            )}
            <img
                src={refItem.url}
                alt={refItem.label}
                loading="lazy"
                onLoad={() => setIsLoaded(true)}
                className={`w-full h-full object-cover rounded-lg border cursor-pointer transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'
                    } ${refItem.source === 'manual_upload' ? 'border-green-500/50' : 'border-white/10'}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onPreview?.(refItem.url);
                }}
            />
            {/* 序号标记 - 可选 */}
            <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1 rounded-tl-md">
                {index + 1}
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation(); // 防止触发其它事件
                    onRemove(refItem);
                }}
                className="absolute -top-1 -right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="移除此参考图"
            >
                <X size={12} />
            </button>
        </div>
    );
};
