import React from 'react';
import { cn } from '@/lib/utils';
import { GenerationResult } from './GenerationResult';
import { AspectRatio } from '@/types/project';
import { User, Sparkles } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
    model?: any;
    shotId?: string;
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
}

export function ChatBubble({
    message,
    onImageClick,
    onSliceSelect,
    onReusePrompt,
    onReuseImage
}: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const hasImages = message.images && message.images.length > 0;

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
                <div className={cn(
                    "flex flex-col gap-2 min-w-0",
                    isUser ? "items-end" : "items-start"
                )}>
                    <div className={cn(
                        "px-4 py-3 rounded-2xl shadow-sm border text-sm whitespace-pre-wrap break-words",
                        isUser
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-transparent rounded-tr-sm"
                            : "bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-tl-sm backdrop-blur-sm"
                    )}>
                        {message.content}
                    </div>

                    {/* Generation Result (Assistant only) */}
                    {!isUser && hasImages && (
                        <div className="w-full max-w-md bg-white dark:bg-zinc-900/50 border border-black/5 dark:border-white/10 rounded-2xl p-3 shadow-sm backdrop-blur-sm">
                            <GenerationResult
                                images={message.images!}
                                model={message.model}
                                gridData={message.gridData}
                                onImageClick={(url, idx) => onImageClick?.(url, idx, message)}
                                onSliceSelect={() => onSliceSelect?.(message)}
                                onReusePrompt={() => onReusePrompt?.(message.gridData?.prompt || message.model?.prompt || message.content)}
                                onReuseImage={onReuseImage}
                            />
                        </div>
                    )}

                    {/* Timestamp */}
                    <div className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                        {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    );
}
