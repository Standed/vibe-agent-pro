import React from 'react';
import Image from 'next/image';
import { Grid3x3, Download, Copy, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { AspectRatio } from '@/types/project';
import { toast } from 'sonner';

interface GenerationResultProps {
    images: string[];
    model?: string;
    gridData?: {
        fullImage: string;
        slices: string[];
        gridRows?: number;
        gridCols?: number;
        prompt?: string;
        aspectRatio?: AspectRatio;
        gridSize?: '2x2' | '3x3';
        sceneId?: string;
    };
    onImageClick?: (url: string, index: number) => void;
    onSliceSelect?: () => void;
    onReusePrompt?: () => void;
    onReuseImage?: (url: string) => void;
}

export function GenerationResult({
    images,
    model,
    gridData,
    onImageClick,
    onSliceSelect,
    onReusePrompt,
    onReuseImage
}: GenerationResultProps) {
    // Determine display label based on model
    const getModelLabel = () => {
        if (model === 'seedream') return 'SeeDream';
        if (model === 'gemini-direct') return 'Gemini 直出';
        if (model === 'jimeng') return '即梦 AI';
        if (model === 'gemini-grid' || gridData) return 'Gemini Grid';
        return 'AI 生成'; // Default fallback
    };

    const isGrid = !!gridData;
    const displayImages = images.filter(img => img && img.trim() !== '');

    if (displayImages.length === 0) return null;

    return (
        <div className="space-y-3">
            {/* Images Grid */}
            <div className={`grid gap-2 ${displayImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {displayImages.map((img, idx) => (
                    <div key={idx} className="space-y-2">
                        <div className="relative group aspect-video rounded-xl border border-black/5 dark:border-white/10 overflow-hidden cursor-pointer hover:border-zinc-900 dark:hover:border-white transition-colors bg-zinc-100 dark:bg-zinc-900">
                            <Image
                                src={img}
                                alt={`Result ${idx + 1}`}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                unoptimized
                                onClick={() => onImageClick?.(img, idx)}
                            />

                            {/* Grid Badge */}
                            {isGrid && (
                                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                                    <Grid3x3 size={12} />
                                    Grid {gridData.gridRows && gridData.gridCols ? `${gridData.gridRows}x${gridData.gridCols}` : gridData.gridSize}
                                </div>
                            )}

                            {/* Hover Actions */}
                            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                                {onReuseImage && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onReuseImage(img); }}
                                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
                                        title="使用此图作为参考"
                                    >
                                        <ImageIcon size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Grid Slice Button */}
                        {isGrid && gridData.slices && gridData.slices.length > 0 && onSliceSelect && (
                            <button
                                onClick={onSliceSelect}
                                className="w-full px-3 py-2 text-xs font-medium bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all flex items-center justify-center gap-2 text-zinc-700 dark:text-zinc-300"
                            >
                                <Grid3x3 size={14} />
                                选择切片
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer Info & Actions */}
            <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                        {getModelLabel()}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {onReusePrompt && (
                        <button
                            onClick={onReusePrompt}
                            className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
                        >
                            <RefreshCw size={12} />
                            复用提示词
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
