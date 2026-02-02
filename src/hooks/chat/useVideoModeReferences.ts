/**
 * useVideoModeReferences
 * 
 * 视频模式参考图状态管理 Hook
 * 负责处理 Vidu 和 Sora 模式下的参考图自动填充、合并和显示逻辑
 * 
 * 从 ChatPanel.tsx 中提取，减少主组件复杂度
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Shot, GenerationModel } from '@/types/project';
import { ActiveReference } from './useAutoReference';
import { FrameImage, useStartEndFrames } from './useStartEndFrames';
import { useVideoReferences } from './useVideoReferences';

// 使用 ReturnType 推断 Hook 返回类型
export type UseStartEndFramesReturn = ReturnType<typeof useStartEndFrames>;
export type UseVideoReferencesReturn = ReturnType<typeof useVideoReferences>;

interface MentionedAssets {
    characters: Array<{ name: string; referenceImages?: string[] }>;
    locations: Array<{ name: string; referenceImages?: string[] }>;
}

interface UseVideoModeReferencesProps {
    selectedModel: GenerationModel;
    viduMode: 'img2video' | 'start-end2video' | 'reference2video';
    selectedShot: Shot | null;
    selectedShotId: string | null;
    activeReferences: ActiveReference[];
    manualReferenceUrls: string[];
    droppedReferences: ActiveReference[];
    mentionedAssets: MentionedAssets;
    ignoredUrls: Set<string>;
    videoRefs: UseVideoReferencesReturn;
    startEndFrames: UseStartEndFramesReturn;
}

interface UseVideoModeReferencesReturn {
    // 删除状态
    isShotRefDeleted: boolean;
    isViduRefShotDeleted: boolean;
    setIsShotRefDeleted: (deleted: boolean) => void;
    setIsViduRefShotDeleted: (deleted: boolean) => void;

    // Vidu reference order
    viduReferenceOrder: string[];
    setViduReferenceOrder: React.Dispatch<React.SetStateAction<string[]>>;

    // 派生状态
    finalDisplayReferences: ActiveReference[];
    sendReferences: ActiveReference[];

    // 操作方法
    handleMoveReference: (
        dragIndex: number,
        hoverIndex: number,
        setDroppedReferences?: React.Dispatch<React.SetStateAction<ActiveReference[]>>,
        setManualReferenceUrls?: React.Dispatch<React.SetStateAction<string[]>>
    ) => void;
    handleRemoveReference: (
        ref: ActiveReference,
        onRemoveReferenceFn?: (ref: ActiveReference) => void
    ) => void;
}

export function useVideoModeReferences({
    selectedModel,
    viduMode,
    selectedShot,
    selectedShotId,
    activeReferences,
    manualReferenceUrls,
    droppedReferences,
    mentionedAssets,
    ignoredUrls,
    videoRefs,
    startEndFrames,
}: UseVideoModeReferencesProps): UseVideoModeReferencesReturn {

    // 分镜图删除状态
    const [isShotRefDeleted, setIsShotRefDeleted] = useState(false);
    const [isViduRefShotDeleted, setIsViduRefShotDeleted] = useState(false);
    const [viduReferenceOrder, setViduReferenceOrder] = useState<string[]>([]);

    // 追踪状态变化
    const prevShotIdRef = useRef<string | null>(null);
    const prevModeRef = useRef<string | null>(null);
    const prevModelRef = useRef<string | null>(null);

    // 重置逻辑：切换分镜时，恢复显示默认分镜图
    useEffect(() => {
        setIsShotRefDeleted(false);
        setIsViduRefShotDeleted(false);
    }, [selectedShotId]);

    // 自动填充逻辑：切换模式/分镜时自动初始化参考图
    useEffect(() => {
        const shotChanged = selectedShotId !== prevShotIdRef.current;
        const modeChanged = viduMode !== prevModeRef.current;
        const modelChanged = selectedModel !== prevModelRef.current;

        prevShotIdRef.current = selectedShotId;
        prevModeRef.current = viduMode;
        prevModelRef.current = selectedModel;

        // 没有变化则不处理
        if (!shotChanged && !modeChanged && !modelChanged) return;

        const shotImage = selectedShot?.referenceImage;

        if (shotChanged) {
            videoRefs.clearViduImg2Video();
            videoRefs.clearViduReferences();
            videoRefs.clearSora();
            startEndFrames.clearFrames();
            setIsShotRefDeleted(false);
            setIsViduRefShotDeleted(false);
            setViduReferenceOrder([]);
        }

        // ========== Vidu 视频模式初始化 ==========
        if (selectedModel === 'vidu-video') {
            // 图生视频模式：初始化分镜图到独立状态
            if (viduMode === 'img2video') {
                setIsShotRefDeleted(false);
                if ((shotChanged || modeChanged || modelChanged) && !videoRefs.viduImg2VideoRef && shotImage) {
                    videoRefs.setViduImg2Video({
                        url: shotImage,
                        source: 'shot_ref',
                        label: '分镜图'
                    });
                }
            }

            // 首尾帧模式：进入模式/切换分镜时重置并初始化首帧为分镜图
            if (viduMode === 'start-end2video') {
                startEndFrames.clearFrames();
                if (shotImage) {
                    startEndFrames.setStartFrame({
                        url: shotImage,
                        source: 'shot_ref',
                        label: '分镜图'
                    });
                }
            }

            // 参考生视频模式：清空分镜投影删除状态
            if (viduMode === 'reference2video') {
                setIsViduRefShotDeleted(false);
            }
        }

        // ========== Sora 视频模式初始化 ==========
        if (selectedModel === 'sora-video') {
            if ((shotChanged || modelChanged) && !videoRefs.soraRef && shotImage) {
                videoRefs.setSora({
                    url: shotImage,
                    source: 'shot_ref',
                    label: '分镜图'
                });
            }
        }
    }, [selectedShotId, viduMode, selectedModel, selectedShot, videoRefs, startEndFrames]);

    // 计算是否应该注入分镜图
    const shouldInjectShotRef =
        selectedModel === 'vidu-video' &&
        viduMode === 'img2video' &&
        manualReferenceUrls.length === 0 &&
        droppedReferences.length === 0 &&
        !isShotRefDeleted &&
        selectedShot?.referenceImage;

    const shotRef: ActiveReference | null = shouldInjectShotRef ? {
        url: selectedShot!.referenceImage!,
        source: 'shot_ref',
        label: '分镜图'
    } : null;

    // 合并列表：分镜图排在最前（仅用于图片生成模式）
    const baseReferences = shotRef ? [shotRef, ...activeReferences] : activeReferences;

    // Vidu Reference2Video 自动检测的参考图（角色/场景）
    const autoDetectedViduRefs = useMemo(() => {
        const refs: ActiveReference[] = [];
        const seen = new Set<string>();
        const pushRef = (url: string | undefined, name: string, type: 'character' | 'location') => {
            if (!url || seen.has(url) || ignoredUrls.has(url)) return;
            refs.push({
                url,
                source: 'auto_detect',
                label: `${type === 'character' ? '角色' : '场景'}: ${name}`,
                entityName: name
            });
            seen.add(url);
        };

        mentionedAssets.characters.forEach((character) => {
            const url = character.referenceImages?.[0];
            pushRef(url, character.name, 'character');
        });
        mentionedAssets.locations.forEach((location) => {
            const url = location.referenceImages?.[0];
            pushRef(url, location.name, 'location');
        });

        return refs;
    }, [mentionedAssets, ignoredUrls]);

    // 合并 Vidu 参考图
    const mergeViduReferences = useCallback((manualRefs: ActiveReference[], autoRefs: ActiveReference[], max: number) => {
        const merged: ActiveReference[] = [];
        const seen = new Set<string>();

        manualRefs.forEach(ref => {
            if (!seen.has(ref.url)) {
                merged.push(ref);
                seen.add(ref.url);
            }
        });

        for (const ref of autoRefs) {
            if (merged.length >= max) break;
            if (!seen.has(ref.url)) {
                merged.push(ref);
                seen.add(ref.url);
            }
        }

        return merged;
    }, []);

    // 应用参考图顺序
    const applyReferenceOrder = useCallback((refs: ActiveReference[], order: string[]) => {
        if (!order.length) return refs;
        const refMap = new Map(refs.map(ref => [ref.url, ref]));
        const ordered: ActiveReference[] = [];
        order.forEach((url) => {
            const ref = refMap.get(url);
            if (ref) {
                ordered.push(ref);
                refMap.delete(url);
            }
        });
        refs.forEach(ref => {
            if (refMap.has(ref.url)) {
                ordered.push(ref);
            }
        });
        return ordered;
    }, []);

    // Vidu 合并后的参考图列表
    const viduMergedRefs = useMemo(() => {
        if (selectedModel !== 'vidu-video' || viduMode !== 'reference2video') return [];
        return mergeViduReferences(
            videoRefs.viduReferenceRefs,
            autoDetectedViduRefs,
            videoRefs.MAX_VIDU_REFS
        );
    }, [selectedModel, viduMode, mergeViduReferences, videoRefs.viduReferenceRefs, autoDetectedViduRefs, videoRefs.MAX_VIDU_REFS]);

    // 同步 viduReferenceOrder
    useEffect(() => {
        if (selectedModel !== 'vidu-video' || viduMode !== 'reference2video') return;
        const mergedUrls = viduMergedRefs.map(ref => ref.url);
        setViduReferenceOrder(prev => {
            if (prev.length === 0) return mergedUrls;
            let changed = false;
            const next = prev.filter(url => mergedUrls.includes(url));
            mergedUrls.forEach(url => {
                if (!next.includes(url)) {
                    next.push(url);
                    changed = true;
                }
            });
            if (changed || next.length !== prev.length) return next;
            return prev;
        });
    }, [selectedModel, viduMode, viduMergedRefs]);

    // 获取显示用的参考图列表
    const finalDisplayReferences = useMemo((): ActiveReference[] => {
        // Vidu 图生视频：使用独立状态
        if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
            return videoRefs.viduImg2VideoRef ? [videoRefs.viduImg2VideoRef] : [];
        }

        // Vidu 首尾帧：不显示在参考图区域
        if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
            return [];
        }

        // Vidu 参考生视频
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            const orderedMerged = applyReferenceOrder(viduMergedRefs, viduReferenceOrder);

            if (orderedMerged.length === 0 && selectedShot?.referenceImage && !isViduRefShotDeleted) {
                return [{
                    url: selectedShot.referenceImage,
                    source: 'shot_ref',
                    label: '分镜图'
                }];
            }

            return orderedMerged;
        }

        // Sora 视频
        if (selectedModel === 'sora-video') {
            return videoRefs.soraRef ? [videoRefs.soraRef] : [];
        }

        // 图片生成模式
        return baseReferences;
    }, [selectedModel, viduMode, videoRefs, viduMergedRefs, viduReferenceOrder, applyReferenceOrder, selectedShot, isViduRefShotDeleted, baseReferences]);

    // 发送用的参考图列表
    const sendReferences = useMemo(() => {
        if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
            const frames: ActiveReference[] = [];
            const mapFrame = (frame: FrameImage | null, fallbackLabel: string) => {
                if (!frame) return;
                frames.push({
                    url: frame.url,
                    source: frame.source === 'manual_upload'
                        ? 'manual_upload'
                        : frame.source === 'history_ref'
                            ? 'history_ref'
                            : 'shot_ref',
                    label: frame.label || fallbackLabel,
                    file: frame.file
                });
            };
            mapFrame(startEndFrames.frames.startFrame, '首帧');
            mapFrame(startEndFrames.frames.endFrame, '尾帧');
            return frames;
        }
        return finalDisplayReferences;
    }, [selectedModel, viduMode, finalDisplayReferences, startEndFrames.frames]);

    // 移动参考图顺序
    const handleMoveReference = useCallback((
        dragIndex: number,
        hoverIndex: number,
        setDroppedReferences?: React.Dispatch<React.SetStateAction<ActiveReference[]>>,
        setManualReferenceUrls?: React.Dispatch<React.SetStateAction<string[]>>
    ) => {
        const fromRef = finalDisplayReferences[dragIndex];
        const toRef = finalDisplayReferences[hoverIndex];
        if (!fromRef || !toRef) return;
        if (fromRef.source === 'shot_ref' || toRef.source === 'shot_ref') return;

        // Vidu reference2video: 更新顺序
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            const orderBase = viduReferenceOrder.length ? viduReferenceOrder : finalDisplayReferences.map(ref => ref.url);
            const fromOrderIndex = orderBase.indexOf(fromRef.url);
            const toOrderIndex = orderBase.indexOf(toRef.url);
            if (fromOrderIndex === -1 || toOrderIndex === -1) return;

            const nextOrder = [...orderBase];
            const [moved] = nextOrder.splice(fromOrderIndex, 1);
            nextOrder.splice(toOrderIndex, 0, moved);
            setViduReferenceOrder(nextOrder);
            return;
        }

        // 其他视频模式不支持排序
        if (selectedModel === 'vidu-video' || selectedModel === 'sora-video') {
            return;
        }

        // 图片生成模式：重新排序手动和历史参考图
        if (setDroppedReferences && setManualReferenceUrls) {
            if (fromRef.source === 'auto_detect' || toRef.source === 'auto_detect') return;
            const sortableRefs = finalDisplayReferences.filter(ref => ref.source !== 'auto_detect');
            const fromSortableIndex = sortableRefs.findIndex(ref => ref.url === fromRef.url);
            const toSortableIndex = sortableRefs.findIndex(ref => ref.url === toRef.url);
            if (fromSortableIndex === -1 || toSortableIndex === -1) return;

            const nextSortable = [...sortableRefs];
            const [moved] = nextSortable.splice(fromSortableIndex, 1);
            nextSortable.splice(toSortableIndex, 0, moved);

            const nextDropped = nextSortable.filter(ref => ref.source !== 'history_ref');
            const nextManualUrls = nextSortable
                .filter(ref => ref.source === 'history_ref')
                .map(ref => ref.url);

            setDroppedReferences(nextDropped);
            setManualReferenceUrls(nextManualUrls);
        }
    }, [finalDisplayReferences, selectedModel, viduMode, viduReferenceOrder]);

    // 删除参考图
    const handleRemoveReference = useCallback((
        ref: ActiveReference,
        onRemoveReferenceFn?: (ref: ActiveReference) => void
    ) => {
        // Vidu 图生视频
        if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
            videoRefs.clearViduImg2Video();
            return;
        }

        // Vidu 参考生视频
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            setViduReferenceOrder(prev => prev.filter(url => url !== ref.url));
            if (ref.source === 'shot_ref') {
                setIsViduRefShotDeleted(true);
                return;
            }
            if (ref.source === 'auto_detect') {
                onRemoveReferenceFn?.(ref);
                return;
            }
            videoRefs.removeViduReference(ref);
            return;
        }

        // Sora
        if (selectedModel === 'sora-video') {
            videoRefs.clearSora();
            return;
        }

        // 图片生成模式：原有逻辑
        if (ref.source === 'shot_ref') {
            setIsShotRefDeleted(true);
        } else {
            onRemoveReferenceFn?.(ref);
        }
    }, [selectedModel, viduMode, videoRefs]);

    return {
        isShotRefDeleted,
        isViduRefShotDeleted,
        setIsShotRefDeleted,
        setIsViduRefShotDeleted,
        viduReferenceOrder,
        setViduReferenceOrder,
        finalDisplayReferences,
        sendReferences,
        handleMoveReference,
        handleRemoveReference,
    };
}

