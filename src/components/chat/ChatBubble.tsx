import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { GenerationResult } from './GenerationResult';
import { ChatPanelMessage } from '@/types/project';
import { User, Sparkles, Maximize2, RefreshCw, Grid3x3, Trash2, Image as ImageIcon, Download } from 'lucide-react';
import { downloadFile } from '@/utils/download';
import { useAuth } from '@/components/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';

// 使用统一的类型定义，保持向后兼容的别名
export type ChatMessage = ChatPanelMessage;

interface ChatBubbleProps {
    message: ChatMessage;
    onImageClick?: (url: string, index: number, message: ChatMessage) => void;
    onSliceSelect?: (message: ChatMessage) => void;
    onReusePrompt?: (prompt: string) => void;
    onReuseImage?: (url: string) => void;
    onApplyToShot?: (url: string) => void;
    onApplyVideoToShot?: (message: ChatMessage) => void;  // 应用视频到分镜
    onMediaLoaded?: () => void;
    onDelete?: () => void;
    project?: any; // Project type imported
}

export function ChatBubble({
    message,
    onImageClick,
    onSliceSelect,
    onReusePrompt,
    onReuseImage,
    onApplyToShot,
    onApplyVideoToShot,
    onMediaLoaded,
    onDelete,
    project
}: ChatBubbleProps) {
    const { user, profile } = useAuth(); // Get user and profile for avatar
    const isUser = message.role === 'user';
    const hasImages = message.images && message.images.length > 0;
    const hasVideo = !!message.videoUrl;
    const videoMeta = message.metadata || {};

    // ... (getVideoLabel logic remains same)
    const getVideoLabel = () => {
        const provider = videoMeta.provider || (String(videoMeta.model || '').includes('vidu') ? 'vidu' : String(videoMeta.model || '').includes('sora') ? 'sora' : '');
        if (provider === 'vidu') {
            const mode = videoMeta.mode;
            const modeLabel = mode === 'img2video' ? '图生视频' : mode === 'start-end2video' ? '首尾帧视频' : mode === 'reference2video' ? '参考生视频' : '';
            return modeLabel ? `Vidu · ${modeLabel}` : 'Vidu';
        }
        if (provider === 'sora') {
            const modelName = videoMeta.model || message.model;
            if (modelName === 'sora-2-pro') return 'Sora 2 Pro';
            if (modelName === 'sora-2') return 'Sora 2';
            return 'Sora';
        }
        return '';
    };

    // Detect if content is a Grid (2x2 or 3x3) to expand container width
    const isGridContent = (message.gridData?.slices?.length && message.gridData.slices.length >= 4) || (message.images && message.images.length >= 4);

    // Use wider layout for grids to ensure images are large enough
    const containerMaxWidth = isGridContent ? "max-w-full md:max-w-[95%]" : "max-w-[90%] md:max-w-[85%]";
    const contentMaxWidth = isGridContent ? "max-w-full w-full" : "max-w-[85%]";

    return (
        <div className={cn("flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300 group/message", isUser ? "justify-end" : "justify-start")}>
            <div className={cn("flex gap-3", containerMaxWidth, isUser ? "flex-row-reverse" : "flex-row")}>

                {/* Avatar */}
                {isUser ? (
                    <div className="flex-shrink-0 w-8 h-8">
                        <Avatar
                            src={profile?.avatar_url}
                            name={profile?.full_name}
                            email={user?.email}
                            size="sm"
                        />
                    </div>
                ) : (
                    <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 overflow-hidden",
                        "bg-zinc-900 dark:bg-white"
                    )}>
                        <Sparkles size={14} className="text-white dark:text-black" />
                    </div>
                )}

                {/* Content Bubble */}
                <div className={cn(
                    "flex flex-col gap-1 min-w-0",
                    contentMaxWidth,
                    isUser ? "items-end" : "items-start"
                )}>
                    {/* Text Content */}
                    {message.content && (
                        <div className={cn(
                            "relative group/text px-4 py-3 shadow-sm border text-sm break-words",
                            isUser
                                ? "bg-white dark:bg-zinc-800 text-black dark:text-white border-black/5 dark:border-white/10 rounded-2xl rounded-tr-sm whitespace-pre-wrap"
                                : "bg-white/80 dark:bg-zinc-900/40 text-zinc-800 dark:text-zinc-200 border-black/5 dark:border-white/5 rounded-2xl rounded-tl-sm backdrop-blur-md prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-code:bg-zinc-200 dark:prose-code:bg-zinc-800/50 prose-code:px-1 prose-code:rounded prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900/50 prose-pre:p-2 prose-pre:rounded-lg shadow-sm"
                        )}>
                            {isUser ? (
                                message.content
                            ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                </ReactMarkdown>
                            )}
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
                                    onLoadedMetadata={onMediaLoaded}
                                />
                                {/* 操作按钮 */}
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity flex justify-end gap-2 pointer-events-none">
                                    {onApplyVideoToShot && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onApplyVideoToShot(message); }}
                                            className="px-2 py-1 rounded-full bg-white/20 hover:bg-white/40 text-white text-xs backdrop-blur-md transition-all pointer-events-auto border border-white/10 shadow-sm flex items-center gap-1"
                                            title="应用到当前分镜"
                                        >
                                            <Grid3x3 size={12} />
                                            <span>应用到分镜</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            {getVideoLabel() && (
                                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                        {getVideoLabel()}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Images (User or Assistant) */}
                    {hasImages && (
                        <div className={cn(
                            isGridContent ? "max-w-full w-full" : "max-w-[360px] w-auto",
                            "transition-all duration-300 mt-1",
                            "rounded-2xl overflow-hidden"
                        )}>
                            {isUser ? (
                                <div className="flex flex-wrap gap-2 max-w-[300px] justify-end">
                                    {message.images!.map((img, idx) => {
                                        return (
                                            <div
                                                key={idx}
                                                className="relative group/image rounded-lg overflow-hidden border border-black/5 dark:border-white/10 shadow-sm h-28 w-auto flex-shrink-0 cursor-pointer transition-all"
                                                onClick={() => onImageClick?.(img, idx, message)}
                                            >
                                                <div className="absolute inset-0 border border-transparent group-hover/image:border-black dark:group-hover/image:border-white rounded-lg z-20 pointer-events-none transition-colors duration-300" />
                                                <img
                                                    src={img}
                                                    alt={`User upload ${idx + 1}`}
                                                    className="h-full w-auto object-cover transition-transform duration-500 group-hover/image:scale-105"
                                                    onLoad={onMediaLoaded}
                                                />

                                                {/* Hover Actions Overlay (Standardized with GenerationResult) */}
                                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity flex justify-end gap-1.5 pt-6 z-30">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            downloadFile(img, `reference_image_${Date.now()}_${idx + 1}`);
                                                        }}
                                                        className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors shadow-sm"
                                                        title="下载图片"
                                                    >
                                                        <Download size={12} />
                                                    </button>
                                                    {onReuseImage && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onReuseImage(img); }}
                                                            className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors shadow-sm"
                                                            title="使用此图作为参考"
                                                        >
                                                            <ImageIcon size={12} />
                                                        </button>
                                                    )}
                                                    {onApplyToShot && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onApplyToShot(img); }}
                                                            className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors shadow-sm"
                                                            title="应用到当前分镜"
                                                        >
                                                            <Grid3x3 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <GenerationResult
                                    images={message.images!}
                                    model={message.model}
                                    gridData={message.gridData}
                                    onImageClick={(url, idx) => onImageClick?.(url, idx, message)}
                                    onSliceSelect={() => onSliceSelect?.(message)}
                                    onReusePrompt={() => onReusePrompt?.(message.gridData?.prompt || message.metadata?.prompt || message.content)}
                                    onReuseImage={onReuseImage}
                                    onApplyToShot={onApplyToShot}
                                    defaultAspectRatio={project?.settings?.aspectRatio}
                                    onMediaLoaded={onMediaLoaded}
                                />
                            )}
                        </div>
                    )}

                    {/* Timestamp & Actions */}
                    <div className="flex items-center gap-2 self-end">
                        <div className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                            {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('确认删除这条消息吗？')) {
                                        onDelete();
                                    }
                                }}
                                className="opacity-0 group-hover/message:opacity-100 transition-all duration-200 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                title="删除消息"
                            >
                                <Trash2 size={13} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}
