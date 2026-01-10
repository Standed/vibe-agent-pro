import React from 'react';
import { cn } from '@/lib/utils';
import { GenerationResult } from './GenerationResult';
import { AspectRatio } from '@/types/project';
import { User, Sparkles, Maximize2, RefreshCw, Grid3x3 } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
    model?: any;
    shotId?: string;
    videoUrl?: string;  // Sora生成的视频URL
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
}

interface ChatBubbleProps {
    message: ChatMessage;
    onImageClick?: (url: string, index: number, message: ChatMessage) => void;
    onSliceSelect?: (message: ChatMessage) => void;
    onReusePrompt?: (prompt: string) => void;
    onReuseImage?: (url: string) => void;
    onApplyToShot?: (url: string) => void;
    onApplyVideoToShot?: (url: string) => void;  // 应用视频到分镜
}

export function ChatBubble({
    message,
    onImageClick,
    onSliceSelect,
    onReusePrompt,
    onReuseImage,
    onApplyToShot,
    onApplyVideoToShot
}: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const hasImages = message.images && message.images.length > 0;
    const hasVideo = !!message.videoUrl;

    return (
        <div className={cn("flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300", isUser ? "justify-end" : "justify-start")}>
            <div className={cn("flex max-w-[90%] md:max-w-[85%] gap-3", isUser ? "flex-row-reverse" : "flex-row")}>

                {/* Avatar */}
                <div className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10",
                    isUser ? "bg-zinc-100 dark:bg-zinc-800" : "bg-zinc-900 dark:bg-white"
                )}>
                    {isUser ? (
                        <User size={14} className="text-zinc-500 dark:text-zinc-400" />
                    ) : (
                        <Sparkles size={14} className="text-white dark:text-black" />
                    )}
                </div>

                {/* Content Bubble */}
                {/* Content Bubble */}
                <div className={cn(
                    "flex flex-col gap-1 min-w-0 max-w-[85%]",
                    isUser ? "items-end" : "items-start"
                )}>
                    {/* Text Content */}
                    {message.content && (
                        <div className={cn(
                            "relative group/text px-4 py-3 shadow-sm border text-sm whitespace-pre-wrap break-words",
                            isUser
                                ? "bg-white dark:bg-zinc-800 text-black dark:text-white border-black/5 dark:border-white/10 rounded-2xl rounded-tr-sm"
                                : "bg-zinc-100 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-2xl rounded-tl-sm backdrop-blur-sm"
                        )}>
                            {message.content}
                            {isUser && onReusePrompt && (
                                <button
                                    onClick={() => onReusePrompt(message.content)}
                                    className="absolute -right-2 -top-2 p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 opacity-0 group-hover/text:opacity-100 transition-opacity shadow-sm border border-black/5 dark:border-white/10"
                                    title="复用提示词"
                                >
                                    <RefreshCw size={10} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Video (Sora生成的视频) */}
                    {hasVideo && !isUser && (
                        <div className="max-w-[360px] w-auto mt-1 rounded-2xl overflow-hidden">
                            <div className="relative group/video rounded-xl overflow-hidden border border-black/5 dark:border-white/10 shadow-sm">
                                <video
                                    src={message.videoUrl}
                                    controls
                                    className="w-auto h-auto max-w-full max-h-[280px] object-contain"
                                />
                                {/* 操作按钮 */}
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                    {onApplyVideoToShot && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onApplyVideoToShot(message.videoUrl!); }}
                                            className="px-2 py-1 rounded-full bg-white/20 hover:bg-white/40 text-white text-xs backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm flex items-center gap-1"
                                            title="应用到当前分镜"
                                        >
                                            <Grid3x3 size={12} />
                                            <span>应用到分镜</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Images (User or Assistant) */}
                    {hasImages && (
                        <div className={cn(
                            "max-w-[360px] w-auto transition-all duration-300 mt-1",
                            isUser ? "rounded-2xl overflow-hidden" : "rounded-2xl overflow-hidden"
                        )}>
                            {isUser ? (
                                <div className="flex flex-col gap-2">
                                    {message.images!.map((img, idx) => (
                                        <div key={idx} className="relative group/image rounded-xl overflow-hidden border border-black/5 dark:border-white/10 shadow-sm">
                                            <img
                                                src={img}
                                                alt="User upload"
                                                className="w-auto h-auto max-w-full max-h-[360px] object-contain cursor-pointer hover:scale-[1.02] transition-transform duration-500"
                                                onClick={() => onImageClick?.(img, idx, message)}
                                            />
                                            {/* Actions Overlay - iOS Style */}
                                            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                                {onReuseImage && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onReuseImage(img); }}
                                                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm"
                                                        title="复用图片"
                                                    >
                                                        <RefreshCw size={12} />
                                                    </button>
                                                )}
                                                {onApplyToShot && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onApplyToShot(img); }}
                                                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm"
                                                        title="应用到当前分镜"
                                                    >
                                                        <Grid3x3 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <GenerationResult
                                    images={message.images!}
                                    model={message.model}
                                    gridData={message.gridData}
                                    onImageClick={(url, idx) => onImageClick?.(url, idx, message)}
                                    onSliceSelect={() => onSliceSelect?.(message)}
                                    onReusePrompt={() => onReusePrompt?.(message.gridData?.prompt || message.model?.prompt || message.content)}
                                    onReuseImage={onReuseImage}
                                    onApplyToShot={onApplyToShot}
                                />
                            )}
                        </div>
                    )}

                    {/* Timestamp */}
                    <div className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium self-end">
                        {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    );
}
