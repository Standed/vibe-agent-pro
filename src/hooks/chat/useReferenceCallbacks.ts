/**
 * useReferenceCallbacks - 参考图操作回调 Hook
 * 将 ChatPanel 中与参考图相关的回调逻辑解耦到独立 Hook
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import type { ActiveReference } from './useAutoReference';
import type { FrameImage } from './useStartEndFrames';
import type { VideoReferencesHook } from './useVideoReferences';

interface UseReferenceCallbacksOptions {
    // 模式
    selectedModel: string;
    viduMode: string;

    // 状态 Hooks
    videoRefs: VideoReferencesHook;
    startEndFrames: {
        frames: { startFrame: FrameImage | null; endFrame: FrameImage | null };
        setStartFrame: (frame: FrameImage | null) => void;
        setEndFrame: (frame: FrameImage | null) => void;
    };

    // 图片生成相关
    setManualReferenceUrls: React.Dispatch<React.SetStateAction<string[]>>;
    setDroppedReferences: React.Dispatch<React.SetStateAction<ActiveReference[]>>;
    setIsShotRefDeleted: (deleted: boolean) => void;
    setIgnoredUrls: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * 参考图操作回调 Hook
 * 统一管理添加、删除、移动参考图的逻辑
 */
export function useReferenceCallbacks({
    selectedModel,
    viduMode,
    videoRefs,
    startEndFrames,
    setManualReferenceUrls,
    setDroppedReferences,
    setIsShotRefDeleted,
    setIgnoredUrls
}: UseReferenceCallbacksOptions) {

    /**
     * 从历史记录添加参考图
     */
    const handleAddToReference = useCallback((url: string) => {
        // ========== Vidu 首尾帧模式 ==========
        if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
            // 使用 getter 获取最新值，避免闭包问题
            const currentStartFrame = startEndFrames.frames.startFrame;
            const currentEndFrame = startEndFrames.frames.endFrame;
            const frame: FrameImage = { url, source: 'history_ref', label: '历史引用' };

            if (!currentStartFrame) {
                startEndFrames.setStartFrame(frame);
                toast.success('已设置为首帧');
            } else if (!currentEndFrame) {
                startEndFrames.setEndFrame(frame);
                toast.success('已设置为尾帧');
            } else {
                toast.warning('首尾帧已满，请先删除再添加');
            }
            return;
        }

        // ========== Vidu 图生视频模式 ==========
        if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
            const hasExisting = videoRefs.viduImg2VideoRef !== null;
            videoRefs.setViduImg2Video({ url, source: 'history_ref', label: '历史引用' });

            if (hasExisting) {
                toast.success('Vidu 图生视频只支持 1 张图片，已替换');
            } else {
                toast.success('已添加参考图');
            }
            return;
        }

        // ========== Vidu 参考生视频模式 ==========
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            const MAX_REF_IMAGES = videoRefs.MAX_VIDU_REFS;

            if (videoRefs.viduReferenceRefs.some(r => r.url === url)) {
                toast.warning('该图片已添加');
                return;
            }

            if (!videoRefs.canAddViduReference()) {
                toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                return;
            }

            videoRefs.addViduReference({ url, source: 'history_ref', label: '历史引用' });
            toast.success(`已添加参考图 (${videoRefs.getViduReferenceCount() + 1}/${MAX_REF_IMAGES})`);
            return;
        }

        // ========== Sora 视频模式 ==========
        if (selectedModel === 'sora-video') {
            const hasExisting = videoRefs.soraRef !== null;
            videoRefs.setSora({ url, source: 'history_ref', label: '历史引用' });

            if (hasExisting) {
                toast.success('Sora 仅支持 1 张参考图，已替换');
            } else {
                toast.success('已添加参考图');
            }
            return;
        }

        // ========== 图片生成模式（默认） ==========
        setManualReferenceUrls(prev => {
            if (prev.includes(url)) return prev;
            return [...prev, url];
        });
        toast.success('已添加到参考图');
    }, [selectedModel, viduMode, videoRefs, startEndFrames.frames.startFrame, startEndFrames.frames.endFrame, startEndFrames.setStartFrame, startEndFrames.setEndFrame, setManualReferenceUrls]);

    /**
     * 删除参考图
     */
    const handleRemoveReference = useCallback((ref: ActiveReference) => {
        // Vidu 图生视频
        if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
            videoRefs.clearViduImg2Video();
            return;
        }

        // Vidu 参考生视频
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            videoRefs.removeViduReference(ref);
            return;
        }

        // Sora
        if (selectedModel === 'sora-video') {
            videoRefs.clearSora();
            return;
        }

        // 图片生成模式
        if (ref.source === 'shot_ref') {
            setIsShotRefDeleted(true);
        } else {
            setDroppedReferences(prev => prev.filter(r => r.url !== ref.url));
            setManualReferenceUrls(prev => prev.filter(url => url !== ref.url));
            setIgnoredUrls(prev => {
                const next = new Set(prev);
                next.add(ref.url);
                return next;
            });
        }
    }, [selectedModel, viduMode, videoRefs, setIsShotRefDeleted, setDroppedReferences, setManualReferenceUrls, setIgnoredUrls]);

    /**
     * 移动参考图顺序（拖拽排序）
     */
    const handleMoveReference = useCallback((dragIndex: number, hoverIndex: number) => {
        if (dragIndex === hoverIndex) return;

        // Vidu 参考生视频模式使用独立的排序
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            videoRefs.moveViduReference(dragIndex, hoverIndex);
            return;
        }

        // 其他模式使用 droppedReferences
        setDroppedReferences(prev => {
            const newRefs = [...prev];
            const [dragItem] = newRefs.splice(dragIndex, 1);
            newRefs.splice(hoverIndex, 0, dragItem);
            return newRefs;
        });
    }, [selectedModel, viduMode, videoRefs, setDroppedReferences]);

    return {
        handleAddToReference,
        handleRemoveReference,
        handleMoveReference
    };
}
