/**
 * MessageList - 消息列表组件
 * 支持懒加载和 React.memo 优化
 */

import React, { memo, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { ChatPanelMessage } from '@/types/project';
import { ChatBubble } from './ChatBubble';

interface MessageListProps {
    messages: ChatPanelMessage[];
    isGenerating: boolean;
    selectedModel: string;
    scrollParentRef?: React.RefObject<HTMLDivElement | null>;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => Promise<void> | void;
    onMediaLoaded?: () => void;
    onDelete: (messageId: string) => void;
    onSetSlicerData: (data: {
        gridData: ChatPanelMessage['gridData'];
        shotId?: string;
        currentSliceIndex?: number;
    }) => void;
    onPreview: (images: string[], index: number) => void;
    onApplyToShot: (imageUrl: string) => void;
    onApplyVideoToShot?: (message: ChatPanelMessage) => void;
    onAddToReference: (imageUrl: string) => void;
    onReusePrompt: (prompt: string) => void; // 新增
}

/**
 * 单条消息组件 - 使用 memo 优化
 */
const MessageItem = memo(function MessageItem({
    message,
    selectedModel,
    onDelete,
    onSetSlicerData,
    onPreview,
    onApplyToShot,
    onApplyVideoToShot,
    onAddToReference,
    onReusePrompt, // 新增
    onMediaLoaded,
}: {
    message: ChatPanelMessage;
    selectedModel: string;
    onDelete: () => void;
    onSetSlicerData: (data: {
        gridData: ChatPanelMessage['gridData'];
        shotId?: string;
        currentSliceIndex?: number;
    }) => void;
    onPreview: (images: string[], index: number) => void;
    onApplyToShot: (imageUrl: string) => void;
    onApplyVideoToShot?: (message: ChatPanelMessage) => void;
    onAddToReference: (imageUrl: string) => void;
    onReusePrompt: (prompt: string) => void; // 新增
    onMediaLoaded?: () => void;
}) {
    return (
        <ChatBubble
            message={{
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                images: message.images,
                model: message.model,
                shotId: message.shotId,
                videoUrl: message.videoUrl,
                metadata: message.metadata,
                gridData: message.gridData as any, // 类型兼容处理
            }}
            onDelete={onDelete}
            onApplyVideoToShot={onApplyVideoToShot}
            onMediaLoaded={onMediaLoaded}
            onSliceSelect={(msg) => {
                if (msg.gridData) {
                    onSetSlicerData({
                        gridData: msg.gridData as ChatPanelMessage['gridData'],
                        shotId: msg.shotId,
                        currentSliceIndex: 0
                    });
                }
            }}
            onImageClick={(url, idx, msg) => {
                if (msg.images?.length) {
                    onPreview(msg.images, idx);
                } else if (msg.gridData?.slices?.length) {
                    onPreview(msg.gridData.slices, idx);
                }
            }}
            onApplyToShot={onApplyToShot}
            onReuseImage={onAddToReference}
            onReusePrompt={() => onReusePrompt(message.content)}
        />
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.message.id === nextProps.message.id &&
        prevProps.message.images === nextProps.message.images &&
        prevProps.message.content === nextProps.message.content &&
        prevProps.selectedModel === nextProps.selectedModel &&
        prevProps.onAddToReference === nextProps.onAddToReference
    );
});

/**
 * 生成中状态组件
 */
const GeneratingIndicator = memo(function GeneratingIndicator({
    selectedModel,
}: {
    selectedModel: string;
}) {
    return (
        <div className="flex w-full mb-6 justify-start animate-pulse">
            <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 bg-zinc-900 dark:bg-white">
                    <Sparkles size={14} className="text-white dark:text-black" />
                </div>
                <div className="flex flex-col gap-2 min-w-0 items-start">
                    <div className="px-4 py-3 rounded-2xl shadow-sm border text-sm bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-tl-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <span>
                                {selectedModel.includes('video') ? '正在生成视频，请稍候...' : '正在生成图片，请稍候...'}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">
                            {selectedModel === 'jimeng'
                                ? '即梦 AI 正在绘制中，通常需要 15-30 秒'
                                : selectedModel.includes('video')
                                    ? 'AI 正在生成视频，通常需要 3-5 分钟'
                                    : 'AI 正在思考中...'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * 骨架屏加载组件
 */
export const SkeletonMessage = memo(function SkeletonMessage() {
    return (
        <div className="flex w-full mb-6 justify-start animate-pulse">
            <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex flex-col gap-2 min-w-0 items-start flex-1">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
                </div>
            </div>
        </div>
    );
});

/**
 * 消息列表组件 - 使用 React.memo 优化
 */
export const MessageList = memo(function MessageList({
    messages,
    isGenerating,
    selectedModel,
    scrollParentRef,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onMediaLoaded,
    onDelete,
    onSetSlicerData,
    onPreview,
    onApplyToShot,
    onApplyVideoToShot,
    onAddToReference,
    onReusePrompt, // 新增
}: MessageListProps) {
    const loadMoreLock = useRef(false);
    useEffect(() => {
        const parent = scrollParentRef?.current;
        if (!parent || !onLoadMore) return;

        const onScroll = () => {
            if (loadMoreLock.current) return;
            if (isLoadingMore) return;
            if (!hasMore) return;
            if (parent.scrollTop <= 120) {
                loadMoreLock.current = true;
                Promise.resolve(onLoadMore()).finally(() => {
                    loadMoreLock.current = false;
                });
            }
        };

        parent.addEventListener('scroll', onScroll);
        return () => {
            parent.removeEventListener('scroll', onScroll);
        };
    }, [scrollParentRef, onLoadMore, hasMore, isLoadingMore]);

    return (
        <div className="space-y-6">
            {messages.map((message) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    selectedModel={selectedModel}
                    onDelete={() => onDelete(message.id)}
                    onSetSlicerData={onSetSlicerData}
                    onPreview={onPreview}
                    onApplyToShot={onApplyToShot}
                    onApplyVideoToShot={onApplyVideoToShot}
                    onAddToReference={onAddToReference}
                    onReusePrompt={onReusePrompt}
                    onMediaLoaded={onMediaLoaded}
                />
            ))}
            {isGenerating && <GeneratingIndicator selectedModel={selectedModel} />}
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.messages === nextProps.messages &&
        prevProps.isGenerating === nextProps.isGenerating &&
        prevProps.selectedModel === nextProps.selectedModel &&
        prevProps.onAddToReference === nextProps.onAddToReference &&
        prevProps.onApplyVideoToShot === nextProps.onApplyVideoToShot &&
        prevProps.scrollParentRef === nextProps.scrollParentRef
    );
});
