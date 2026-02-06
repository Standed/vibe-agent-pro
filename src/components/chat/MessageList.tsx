/**
 * MessageList - 消息列表组件
 * 支持懒加载和 React.memo 优化
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { Sparkles, MessageCircle, Loader2 } from 'lucide-react';
import { ChatPanelMessage } from '@/types/project';
import { ChatBubble } from './ChatBubble';
import { EmptyState } from '@/components/ui/StatusComponents';
import { useProjectStore } from '@/store/useProjectStore';

import { GeneratingIndicator } from './GeneratingIndicator';

interface MessageListProps {
    messages: ChatPanelMessage[];
    selectedModel: string;
    selectedShotId: string | null;
    currentSceneId: string | null;
    userAvatarSrc?: string | null;
    userAvatarName?: string | null;
    userAvatarEmail?: string | null;
    scrollParentRef?: React.RefObject<HTMLDivElement | null>;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => Promise<void> | void;
    onMediaLoaded?: () => void;
    onDelete: (messageId: string) => void;
    project?: any; // For aspect ratio
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
    userAvatarSrc,
    userAvatarName,
    userAvatarEmail,
    onDelete,
    onSetSlicerData,
    onPreview,
    onApplyToShot,
    onApplyVideoToShot,
    onAddToReference,
    onReusePrompt,
    onMediaLoaded,
    project,
}: {
    message: ChatPanelMessage;
    selectedModel: string;
    userAvatarSrc?: string | null;
    userAvatarName?: string | null;
    userAvatarEmail?: string | null;
    onDelete: () => void;
    project?: any;
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
            userAvatarSrc={userAvatarSrc}
            userAvatarName={userAvatarName}
            userAvatarEmail={userAvatarEmail}
            project={project}
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
        prevProps.userAvatarSrc === nextProps.userAvatarSrc &&
        prevProps.userAvatarName === nextProps.userAvatarName &&
        prevProps.userAvatarEmail === nextProps.userAvatarEmail &&
        prevProps.onAddToReference === nextProps.onAddToReference &&
        prevProps.project?.settings?.aspectRatio === nextProps.project?.settings?.aspectRatio
    );
});

const MODEL_LABELS: Record<string, string> = {
    jimeng: '即梦',
    gemini: 'Gemini',
    'gemini-grid': 'Gemini Grid',
    'gemini-direct': 'Gemini',
    seedream: 'SeeDream',
    sora: 'Sora',
    vidu: 'Vidu'
};



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
    selectedModel,
    selectedShotId,
    currentSceneId,
    userAvatarSrc,
    userAvatarName,
    userAvatarEmail,
    scrollParentRef,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onMediaLoaded,
    onDelete,
    project,
    onSetSlicerData,
    onPreview,
    onApplyToShot,
    onApplyVideoToShot,
    onAddToReference,
    onReusePrompt,
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
            {/* 空状态 */}
            {messages.length === 0 && (
                <EmptyState
                    icon={<MessageCircle className="w-12 h-12" />}
                    title="开始创作"
                    description="输入提示词开始生成图片或视频，也可以 @ 角色和场景作为参考"
                    className="py-16"
                />
            )}

            {messages.map((message) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    selectedModel={selectedModel}
                    userAvatarSrc={userAvatarSrc}
                    userAvatarName={userAvatarName}
                    userAvatarEmail={userAvatarEmail}
                    project={project}
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
            {(useProjectStore.getState().activeTasks.size > 0) && (
                <GeneratingIndicator
                    selectedModel={selectedModel}
                    shotId={selectedShotId}
                    sceneId={currentSceneId}
                />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.messages === nextProps.messages &&
        prevProps.selectedModel === nextProps.selectedModel &&
        prevProps.userAvatarSrc === nextProps.userAvatarSrc &&
        prevProps.userAvatarName === nextProps.userAvatarName &&
        prevProps.userAvatarEmail === nextProps.userAvatarEmail &&
        prevProps.onAddToReference === nextProps.onAddToReference &&
        prevProps.onApplyVideoToShot === nextProps.onApplyVideoToShot &&
        prevProps.scrollParentRef === nextProps.scrollParentRef
    );
});
