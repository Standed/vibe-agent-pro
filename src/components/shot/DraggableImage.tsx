'use client';

import { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { IMAGE_TO_SHOT_TYPE } from './DraggableShot';

interface DraggableImageProps {
    imageUrl: string;
    sourceType: 'history' | 'grid' | 'chat';
    className?: string;
    children?: React.ReactNode;
    onClick?: () => void;
}

/**
 * 可拖拽的图片组件
 * 用于生成历史、Grid 切片、聊天记录中的图片
 * 可以拖拽到分镜卡片上以设置 referenceImage
 */
export default function DraggableImage({
    imageUrl,
    sourceType,
    className = '',
    children,
    onClick,
}: DraggableImageProps) {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
        type: IMAGE_TO_SHOT_TYPE,
        item: () => ({
            type: IMAGE_TO_SHOT_TYPE,
            imageUrl,
            sourceType,
        }),
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    drag(ref);

    return (
        <div
            ref={ref}
            className={`${className} ${isDragging ? 'opacity-50 scale-95' : ''} transition-all cursor-grab active:cursor-grabbing`}
            onClick={onClick}
            title="拖拽到分镜卡片以设为参考图"
        >
            {children || (
                <img
                    src={imageUrl}
                    alt="Draggable"
                    className="w-full h-full object-cover rounded"
                    draggable={false}
                />
            )}
        </div>
    );
}
