import React, { useState } from 'react';
import Image from 'next/image';
import { useDrag } from 'react-dnd';
import { Grid3x3, Download, RefreshCw, Image as ImageIcon, ChevronUp } from 'lucide-react';
import { AspectRatio, GridData } from '@/types/project';
import { IMAGE_TO_SHOT } from './dragTypes';
import { downloadFile } from '@/utils/download';

interface GenerationResultProps {
    images: string[];
    model?: string;
    gridData?: GridData;
    onImageClick?: (url: string, index: number) => void;
    onSliceSelect?: () => void;
    onReusePrompt?: () => void;
    onReuseImage?: (url: string) => void;
    onApplyToShot?: (url: string) => void;
    defaultAspectRatio?: AspectRatio;
    onMediaLoaded?: () => void;
}

// Sub-component for individual draggable images
function DraggableResultImage({
    img,
    idx,
    isSingle,
    gridData,
    onImageClick,
    onReuseImage,
    onApplyToShot,
    defaultAspectRatio,
    model,
    onMediaLoaded
}: {
    img: string;
    idx: number;
    isSingle: boolean;
    gridData?: GenerationResultProps['gridData'];
    onImageClick?: (url: string, index: number) => void;
    onReuseImage?: (url: string) => void;
    onApplyToShot?: (url: string) => void;
    defaultAspectRatio?: AspectRatio;
    model?: string;
    onMediaLoaded?: () => void;
}) {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: IMAGE_TO_SHOT,
        item: { imageUrl: img },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [img]);

    const isGrid = !!gridData;
    // 优先使用 gridData 中的比例，否则使用默认比例（项目比例）
    const ratio = gridData?.aspectRatio ?? defaultAspectRatio;

    let containerClass = "relative group rounded-xl border border-black/5 dark:border-white/10 overflow-hidden cursor-pointer hover:border-zinc-900 dark:hover:border-white transition-colors bg-zinc-100 dark:bg-zinc-900";
    let aspectClass = "";

    // 确定宽高比样式
    if (ratio !== undefined) {
        switch (ratio) {
            case AspectRatio.MOBILE: // 9:16
                aspectClass = "aspect-[9/16]";
                break;
            case AspectRatio.PORTRAIT: // 3:4
                aspectClass = "aspect-[3/4]";
                break;
            case AspectRatio.SQUARE: // 1:1
                aspectClass = "aspect-square";
                break;
            case AspectRatio.STANDARD: // 4:3
                aspectClass = "aspect-[4/3]";
                break;
            case AspectRatio.CINEMA: // 21:9
                aspectClass = "aspect-[21/9]";
                break;
            case AspectRatio.WIDE: // 16:9
            default: // 16:9
                aspectClass = "aspect-video";
        }
    } else {
        aspectClass = "aspect-video";
    }

    if (isSingle) {
        // Single image mode
        if (ratio === AspectRatio.MOBILE) {
            containerClass += ` w-[180px] ${aspectClass}`; // Reduced size
        } else if (ratio === AspectRatio.PORTRAIT) {
            containerClass += ` w-[220px] ${aspectClass}`; // Reduced size
        } else {
            containerClass += ` w-full ${aspectClass}`;
        }
    } else {
        // Grid mode
        containerClass += ` w-full ${aspectClass}`;
    }

    // 是否使用自适应布局 (兜底情况)
    const isAutoFit = isSingle && ratio === undefined;
    const filenameBase = isGrid ? `grid_${idx + 1}` : `image_${idx + 1}`;

    return (
        <div
            ref={drag as any}
            className={`${containerClass} ${isDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab'}`}
        >
            {isAutoFit ? (
                // 自适应布局：使用 img 标签让图片保持原有比例
                <img
                    src={img}
                    alt={`Result ${idx + 1}`}
                    className="w-auto h-auto max-w-full max-h-[280px] object-contain transition-transform duration-500 group-hover:scale-105"
                    onClick={() => onImageClick?.(img, idx)}
                />
            ) : (
                // 固定比例布局：使用 next/image fill 模式
                <Image
                    src={img}
                    alt={`Result ${idx + 1}`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    unoptimized
                    onClick={() => onImageClick?.(img, idx)}
                    onLoad={onMediaLoaded}
                />
            )}

            {/* Grid Badge */}
            {isGrid && model === 'gemini-grid' && (gridData.gridRows || gridData.gridSize) && (
                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                    <Grid3x3 size={12} />
                    Grid {gridData.gridRows && gridData.gridCols ? `${gridData.gridRows}x${gridData.gridCols}` : gridData.gridSize}
                </div>
            )}

            {/* Hover Actions */}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-end z-20">
                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // 确保使用 downloadFile 进行下载
                            const filename = gridData ? `grid_slice_${idx + 1}` : `image_${idx + 1}`;
                            downloadFile(img, filename).catch(() => {
                                // 失败兜底
                                const link = document.createElement('a');
                                link.href = img;
                                link.download = filename;
                                link.target = '_blank';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            });
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
                        title="下载图片"
                    >
                        <Download size={14} />
                    </button>
                    {onReuseImage && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onReuseImage(img); }}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
                            title="使用此图作为参考"
                        >
                            <ImageIcon size={14} />
                        </button>
                    )}
                    {onApplyToShot && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onApplyToShot(img); }}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
                            title="应用到当前分镜"
                        >
                            <Grid3x3 size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function GenerationResult({
    images,
    model,
    gridData,
    onImageClick,
    onSliceSelect,
    onReusePrompt,
    onReuseImage,
    onApplyToShot,
    defaultAspectRatio = AspectRatio.WIDE,
    onMediaLoaded
}: GenerationResultProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Determine display label based on model
    const getModelLabel = () => {
        if (model === 'seedream') return 'SeeDream';
        if (model === 'gemini-direct') return 'Gemini 直出';
        if (model === 'jimeng') return '即梦 AI';
        if (model === 'gemini-grid' || gridData) return 'Gemini Grid';
        return 'AI 生成'; // Default fallback
    };

    const isGrid = !!gridData;
    const allImages = images.filter(img => img && img.trim() !== '');

    if (allImages.length === 0) return null;

    // Logic for collapsing
    const is3x3 = allImages.length === 9;
    const showGrid = allImages.length > 1;
    const MAX_VISIBLE = is3x3 ? 9 : 4;
    const shouldCollapse = allImages.length > MAX_VISIBLE;
    const displayImages = isExpanded || !shouldCollapse ? allImages : allImages.slice(0, MAX_VISIBLE);
    const hiddenCount = allImages.length - MAX_VISIBLE;

    // Resolve effective aspect ratio
    const activeRatio = gridData?.aspectRatio ?? defaultAspectRatio;

    // Grid Layout Classes
    let gridLayoutClass = "";
    if (is3x3) {
        gridLayoutClass = "grid-cols-3 min-w-[360px] max-w-[480px]";
    } else if (showGrid) {
        gridLayoutClass = "grid-cols-2 min-w-[240px] max-w-[360px]";
    } else {
        gridLayoutClass = "grid-cols-1 min-w-[200px]";
    }

    return (
        <div className="space-y-3">
            {/* Images Grid */}
            <div className={`grid gap-2 ${gridLayoutClass} ${(allImages.length === 1 && (activeRatio === AspectRatio.MOBILE || activeRatio === AspectRatio.PORTRAIT))
                ? 'w-fit' // 单张竖图自适应宽度
                : 'w-full' // 多张或横图占满
                }`}>
                {displayImages.map((img, idx) => {
                    const isSingle = allImages.length === 1;

                    // Calculate if this is the last visible item in collapsed state, to show overlay
                    const isLastVisible = !isExpanded && shouldCollapse && idx === MAX_VISIBLE - 1;

                    return (
                        <div key={idx} className="relative space-y-2">
                            <DraggableResultImage
                                img={img}
                                idx={idx}
                                isSingle={isSingle}
                                gridData={gridData}
                                onImageClick={onImageClick}
                                onReuseImage={onReuseImage}
                                onApplyToShot={onApplyToShot}
                                defaultAspectRatio={defaultAspectRatio}
                                model={model}
                                onMediaLoaded={onMediaLoaded}
                            />

                            {/* "Show More" Overlay */}
                            {isLastVisible && (
                                <div
                                    className="absolute inset-0 z-30 bg-black/60 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-black/70 transition-colors"
                                    onClick={() => setIsExpanded(true)}
                                >
                                    <span className="text-white font-bold text-lg">+{hiddenCount}</span>
                                    <span className="text-white/80 text-xs">查看更多</span>
                                </div>
                            )}

                            {/* Grid Slice Button - Only for Gemini Grid, NOT in Pro Mode (Shot Bound) */}
                            {isGrid && gridData?.slices && gridData.slices.length > 0 && onSliceSelect && !isLastVisible && model === 'gemini-grid' && !onApplyToShot && (
                                <button
                                    onClick={onSliceSelect}
                                    className="w-full px-3 py-2 text-xs font-medium bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all flex items-center justify-center gap-2 text-zinc-700 dark:text-zinc-300"
                                >
                                    <Grid3x3 size={14} />
                                    选择切片
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Collapse Button (if expanded) */}
            {isExpanded && shouldCollapse && (
                <button
                    onClick={() => setIsExpanded(false)}
                    className="w-full py-1 text-xs flex items-center justify-center gap-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
                >
                    <ChevronUp size={14} />
                    收起
                </button>
            )}

            {/* Footer Info & Actions */}
            <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                        {getModelLabel()}
                    </span>
                    {allImages.length > 1 && (
                        <span>{allImages.length} 张图片</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {allImages.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                allImages.forEach((img, idx) => {
                                    // Stagger downloads slightly to avoid browser blocking
                                    setTimeout(() => {
                                        const filename = gridData ? `grid_slice_${idx + 1}` : `image_${idx + 1}`;
                                        downloadFile(img, filename);
                                    }, idx * 300);
                                });
                            }}
                            className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
                            title="下载所有图片"
                        >
                            <Download size={12} />
                            全部下载
                        </button>
                    )}
                    {/* {onReusePrompt && (
                        <button
                            onClick={onReusePrompt}
                            className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
                        >
                            <RefreshCw size={12} />
                            复用提示词
                        </button>
                    )} */}
                </div>
            </div>
        </div>
    );
}
