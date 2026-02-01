/**
 * ReferenceSection - 参考图区域组件
 * 支持图片懒加载和 React.memo 优化
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { DraggableReference } from './DraggableReference';
import { StartEndFrameSelector } from './StartEndFrameSelector';
import type { ActiveReference } from '@/hooks/chat/useAutoReference';
import type { FrameImage } from '@/hooks/chat/useStartEndFrames';


interface ReferenceSectionProps {
    selectedModel: string;
    viduMode?: string;
    activeReferences: ActiveReference[];
    startFrame: FrameImage | null;
    endFrame: FrameImage | null;
    onStartFrameChange: (frame: FrameImage | null) => void;
    onEndFrameChange: (frame: FrameImage | null) => void;
    onMoveReference: (dragIndex: number, hoverIndex: number) => void;
    onRemoveReference: (ref: ActiveReference) => void;
    onPreview: (url: string) => void;
}

/**
 * 参考图区域组件 - 使用 React.memo 优化渲染
 */
export const ReferenceSection = memo(function ReferenceSection({
    selectedModel,
    viduMode,
    activeReferences,
    startFrame,
    endFrame,
    onStartFrameChange,
    onEndFrameChange,
    onMoveReference,
    onRemoveReference,
    onPreview,
}: ReferenceSectionProps) {

    // 1. Vidu 首尾帧模式
    if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
        return (
            <div className="px-4 py-2 border-t border-white/5">
                <StartEndFrameSelector
                    startFrame={startFrame}
                    endFrame={endFrame}
                    onStartFrameChange={onStartFrameChange}
                    onEndFrameChange={onEndFrameChange}
                    onPreview={onPreview}
                />
            </div>
        );
    }

    // 2. 其他模式 (Vidu img2video, ref2video, Jimeng, etc.)
    // 只要有 activeReferences 就显示
    if (activeReferences.length > 0) {
        return (
            <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto custom-scrollbar">
                {activeReferences.map((ref, index) => (
                    <DraggableReference
                        key={ref.url}
                        index={index}
                        refItem={ref}
                        moveReference={onMoveReference}
                        onRemove={onRemoveReference}
                        onPreview={onPreview}
                    />
                ))}
            </div>
        );
    }

    // 如果没有参考图，且是 Vidu 图片模式，提示用户 (可选，用户说可以换成自己想要的，没说一定要提示)
    // 但留个提示比较友好
    if (selectedModel === 'vidu-video' && viduMode === 'img2video' && activeReferences.length === 0) {
        return (
            <div className="px-4 py-2 border-t border-white/5">
                <div className="text-[10px] text-zinc-400">
                    请添加参考图 (支持拖拽)
                </div>
            </div>
        );
    }

    return null;

}, (prev, next) => {
    return (
        prev.selectedModel === next.selectedModel &&
        prev.viduMode === next.viduMode &&
        prev.activeReferences === next.activeReferences &&
        prev.startFrame === next.startFrame &&
        prev.endFrame === next.endFrame
    );
});

/**
 * 懒加载图片组件
 */
export const LazyImage = memo(function LazyImage({
    src,
    alt,
    className,
    onClick,
    title,
}: {
    src: string;
    alt: string;
    className?: string;
    onClick?: () => void;
    title?: string;
}) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={imgRef} className={`relative ${className || ''}`}>
            {!isLoaded && isVisible && (
                <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded-lg" />
            )}
            {isVisible && (
                <img
                    src={src}
                    alt={alt}
                    className={`${className || ''} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
                    onClick={onClick}
                    title={title}
                    onLoad={() => setIsLoaded(true)}
                    loading="lazy"
                />
            )}
            {!isVisible && (
                <div className={`${className || ''} bg-zinc-200 dark:bg-zinc-700 animate-pulse`} />
            )}
        </div>
    );
});
