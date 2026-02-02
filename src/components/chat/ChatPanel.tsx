'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatReferenceInteractions } from '@/hooks/chat/useChatReferenceInteractions';
import { useProjectStore } from '@/store/useProjectStore';
import { AspectRatio } from '@/types/project';
import { toast } from 'sonner';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import { GridSliceSelector } from '@/components/ui/GridSliceSelector';
import { useChatGeneration } from '@/hooks/chat/useChatGeneration';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatShotLabel } from '@/utils/shotOrder';
import { ImagePreviewOverlay } from './ImagePreviewOverlay';
import { dataService } from '@/lib/dataService';
import { useJimengGeneration } from '@/hooks/generation/useJimengGeneration';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ReferenceSection } from './ReferenceSection';
import { Sparkles, Bug, Loader2 } from 'lucide-react';
import { useSoraGeneration } from '@/hooks/sora/useSoraGeneration';
import { useChatHistory } from '@/hooks/chat/useChatHistory';
import { useChatScroll } from '@/hooks/chat/useChatScroll';
import { useAutoReference, ActiveReference } from '@/hooks/chat/useAutoReference';
import { useStartEndFrames, FrameImage } from '@/hooks/chat/useStartEndFrames';
import { useVideoReferences } from '@/hooks/chat/useVideoReferences';
import { useReferenceCallbacks } from '@/hooks/chat/useReferenceCallbacks';
import { useViduGeneration } from '@/hooks/generation/useViduGeneration';
import { ChatPanelMessage, GenerationModel } from '@/types/project';
// 新增解耦 Hook
import { useSoraConfig } from '@/hooks/sora/useSoraConfig';
import { useApplyVideoToShot } from '@/hooks/chat/useApplyVideoToShot';
import { useChatActions } from '@/hooks/chat/useChatActions';
import { useChatModals } from '@/hooks/chat/useChatModals';
import { useVideoModeReferences } from '@/hooks/chat/useVideoModeReferences';


export default function ChatPanel() {
    const {
        project,
        selectedShotId,
        updateShot,
        currentSceneId,
        gridResult,
        setGridResult,
        clearGridResult,
        generationRequest,
        setGenerationRequest,
        generationProgress,
        setGenerationProgress,
        refreshShot,
    } = useProjectStore();

    const { user } = useAuth();

    // Derived State (Moved up for hooks dependency)
    const shots = project?.shots || [];
    const scenes = project?.scenes || [];
    const selectedShot = shots.find((s) => s.id === selectedShotId);
    const selectedScene = scenes.find((s) => s.id === (selectedShot?.sceneId || currentSceneId));
    const selectedShotLabel = selectedShot ? formatShotLabel(selectedScene?.order, selectedShot.order, selectedShot.globalOrder) : undefined;
    const projectId = project?.id || 'default';

    // State
    const [inputText, setInputText] = useState('');
    const [selectedModel, setSelectedModel] = useState<GenerationModel>('gemini-grid');
    // Removed uploadedImages state - now managed within droppedReferences

    const [manualReferenceUrls, setManualReferenceUrls] = useState<string[]>([]);
    const [geminiImageSize, setGeminiImageSize] = useState<'2K' | '4K'>('2K');
    const [droppedReferences, setDroppedReferences] = useState<ActiveReference[]>([]);
    const [viduReferenceOrder, setViduReferenceOrder] = useState<string[]>([]);

    // Use Custom Hook for Chat History Logic
    const { messages, setMessages, deleteMessage, isLoading, hasMore, loadMore } = useChatHistory(
        project?.id,
        selectedShotId,
        currentSceneId,
        setInputText
    );

    // Use Auto Reference Hook
    const {
        activeReferences,
        ignoredUrls,
        setIgnoredUrls,
        mentionedAssets,
        setMentionedAssets,
        handleMention,
        handleAssetSelected
    } = useAutoReference(
        project,
        selectedShotId,
        inputText,
        setInputText,
        manualReferenceUrls,
        droppedReferences
    );

    // Grid specific
    const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
    const [sliceSelectorData, setSliceSelectorData] = useState<{
        gridData: ChatPanelMessage['gridData'];
        shotId?: string;
        currentSliceIndex?: number;
    } | null>(null);

    const { isGenerating, setIsGenerating, handleSend } = useChatGeneration({
        project,
        user,
        selectedShotId,
        currentSceneId: currentSceneId || (selectedShot ? selectedShot.sceneId : null),
        setMessages,
        setInputText,
        setUploadedImages: () => { }, // No-op, managed via setDroppedReferences
        setManualReferenceUrls,
        setDroppedReferences
    });



    // Preview State
    const [previewState, setPreviewState] = useState<{ images: string[], index: number } | null>(null);

    // Sora specific
    const [soraModel, setSoraModel] = useState<'sora-2' | 'sora-2-pro'>('sora-2');
    const [soraAspectRatio, setSoraAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [soraDuration, setSoraDuration] = useState<10 | 15 | 25>(10);

    useEffect(() => {
        if (soraModel === 'sora-2-pro' && soraDuration === 10) {
            setSoraDuration(15);
        }
        if (soraModel === 'sora-2' && soraDuration === 25) {
            setSoraDuration(15);
        }
    }, [soraModel, soraDuration]);



    // Vidu Hook
    const {
        viduMode,
        setViduMode,
        viduDuration,
        setViduDuration,
        viduResolution,
        setViduResolution,
        viduOffPeak,
        setViduOffPeak,
        generateViduVideo
    } = useViduGeneration({
        project,
        user,
        selectedShotId,
        currentSceneId: currentSceneId || (selectedShot ? selectedShot.sceneId : null),
        setMessages,
        setInputText,
        setDroppedReferences,
        setIsGenerating
    });

    // 首尾帧管理（通用，支持 Vidu、Runway 等）
    const startEndFrames = useStartEndFrames();

    // 视频参考图状态管理（隔离各模式）
    const videoRefs = useVideoReferences();

    // 分镜图删除状态（提前定义供 useReferenceCallbacks 使用）
    const [isShotRefDeleted, setIsShotRefDeleted] = useState(false);
    const [isViduRefShotDeleted, setIsViduRefShotDeleted] = useState(false);

    // 参考图操作回调（解耦自 ChatPanel 的复杂逻辑）
    const referenceCallbacks = useReferenceCallbacks({
        selectedModel,
        viduMode,
        videoRefs,
        startEndFrames,
        setManualReferenceUrls,
        setDroppedReferences,
        setIsShotRefDeleted: (deleted: boolean) => setIsShotRefDeleted(deleted),
        setIgnoredUrls
    });

    const { handleFileUpload, drop, isOver } = useChatReferenceInteractions({
        selectedModel,
        viduMode,
        activeReferences,
        setDroppedReferences,
        setIgnoredUrls,
        setIsShotRefDeleted,
        videoRefs,
        startEndFrames
    });

    // Jimeng Hook
    const jimengGeneration = useJimengGeneration({
        setMessages: setMessages as any, // Type compatibility
        manualReferenceUrls,
        mentionedAssets
    });

    const { generateSoraVideo } = useSoraGeneration({
        project,
        user,
        selectedModel,
        soraModel,
        soraAspectRatio,
        soraDuration,
        setMessages,
        setIsGenerating,
        setInputText,
        setUploadedImages: () => { }, // No-op, managed via setDroppedReferences
        setManualReferenceUrls
    });

    // 加载更多时的锁定标记
    const isLoadingMoreRef = useRef(false);

    const onRemoveReferenceFn = useCallback((ref: any) => {
        setDroppedReferences(prev => prev.filter(r => r.url !== ref.url));
        setManualReferenceUrls(prev => prev.filter(url => url !== ref.url)); // Also remove from manual refs
        setIgnoredUrls(prev => {
            const next = new Set(prev);
            next.add(ref.url);
            return next;
        });
        if (ref.entityName) {
            const mentionText = `@${ref.entityName}`;
            setInputText((prevText: string) => { // Use functional update
                if (prevText.includes(mentionText)) {
                    return prevText.replaceAll(mentionText, '').replace(/\s{2,}/g, ' ').trim();
                }
                return prevText;
            });
        }
    }, [setDroppedReferences, setManualReferenceUrls, setIgnoredUrls, setInputText]);



    // Vidu Auto-Fill Logic
    // --- Vidu Derived State Logic ---
    // isShotRefDeleted 已在上方定义

    // 重置逻辑：切换分镜时，恢复显示默认分镜图
    useEffect(() => {
        setIsShotRefDeleted(false);
        setIsViduRefShotDeleted(false);
    }, [selectedShotId]);

    // 自动填充逻辑：切换模式/分镜时自动初始化参考图
    const prevShotIdRef = useRef<string | null>(null);
    const prevModeRef = useRef<string | null>(null);
    const prevModelRef = useRef<string | null>(null);

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
                // 仅在切换模式/分镜且当前为空时初始化
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
    }, [selectedShotId, viduMode, selectedModel, selectedShot, videoRefs, startEndFrames, setIsShotRefDeleted, setIsViduRefShotDeleted]);

    // 计算最终参考图列表 (Derived State)
    // 如果是 Vidu Img2Video 且没被删除且没手动图 -> 注入分镜图
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
        // file is undefined, fine
    } : null;

    // 合并列表：分镜图排在最前（仅用于图片生成模式）
    const baseReferences = shotRef ? [shotRef, ...activeReferences] : activeReferences;

    // Vidu Reference2Video auto-detect refs (角色/场景)
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

    const viduMergedRefs = useMemo(() => {
        if (selectedModel !== 'vidu-video' || viduMode !== 'reference2video') return [];
        return mergeViduReferences(
            videoRefs.viduReferenceRefs,
            autoDetectedViduRefs,
            videoRefs.MAX_VIDU_REFS
        );
    }, [selectedModel, viduMode, mergeViduReferences, videoRefs.viduReferenceRefs, autoDetectedViduRefs, videoRefs.MAX_VIDU_REFS]);

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

    // ========== 根据模式选择参考图 ==========
    const getDisplayReferences = (): ActiveReference[] => {
        // Vidu 图生视频：使用独立状态
        if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
            return videoRefs.viduImg2VideoRef ? [videoRefs.viduImg2VideoRef] : [];
        }

        // Vidu 首尾帧：不显示在参考图区域（由 StartEndFrameSelector 显示）
        if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
            return [];
        }

        // Vidu 参考生视频：手动 + 自动检测，必要时投影分镜图
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

        // Sora 视频：使用独立状态
        if (selectedModel === 'sora-video') {
            return videoRefs.soraRef ? [videoRefs.soraRef] : [];
        }

        // 图片生成模式：使用原有逻辑（activeReferences）
        return baseReferences.filter(ref => true); // 保持原有过滤
    };

    const finalDisplayReferences = getDisplayReferences();

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
    }, [selectedModel, viduMode, finalDisplayReferences, startEndFrames.frames.startFrame, startEndFrames.frames.endFrame]);

    const handleMoveReference = useCallback((dragIndex: number, hoverIndex: number) => {
        const fromRef = finalDisplayReferences[dragIndex];
        const toRef = finalDisplayReferences[hoverIndex];
        if (!fromRef || !toRef) return;
        if (fromRef.source === 'shot_ref' || toRef.source === 'shot_ref') return;

        // Vidu reference2video: map indices to manual refs list
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            const orderBase = viduReferenceOrder.length ? viduReferenceOrder : finalDisplayReferences.map(ref => ref.url);
            const fromOrderIndex = orderBase.indexOf(fromRef.url);
            const toOrderIndex = orderBase.indexOf(toRef.url);
            if (fromOrderIndex === -1 || toOrderIndex === -1) return;

            const nextOrder = [...orderBase];
            const [moved] = nextOrder.splice(fromOrderIndex, 1);
            nextOrder.splice(toOrderIndex, 0, moved);
            setViduReferenceOrder(nextOrder);

            if (fromRef.source !== 'auto_detect' && toRef.source !== 'auto_detect') {
                const manualRefs = videoRefs.viduReferenceRefs;
                const fromManualIndex = manualRefs.findIndex(ref => ref.url === fromRef.url);
                const toManualIndex = manualRefs.findIndex(ref => ref.url === toRef.url);
                if (fromManualIndex !== -1 && toManualIndex !== -1) {
                    referenceCallbacks.handleMoveReference(fromManualIndex, toManualIndex);
                }
            }
            return;
        }

        // Other video modes do not support reordering
        if (selectedModel === 'vidu-video' || selectedModel === 'sora-video') {
            return;
        }

        // Image generation: reorder manual + history references together
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
    }, [
        finalDisplayReferences,
        selectedModel,
        viduMode,
        videoRefs.viduReferenceRefs,
        viduReferenceOrder,
        setViduReferenceOrder,
        referenceCallbacks.handleMoveReference,
        setDroppedReferences,
        setManualReferenceUrls
    ]);

    // 包装删除函数 - 根据模式删除对应状态
    const handleRemoveReference = useCallback((ref: ActiveReference) => {
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
                onRemoveReferenceFn(ref);
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
            onRemoveReferenceFn(ref);
        }
    }, [selectedModel, viduMode, videoRefs, onRemoveReferenceFn, setIsViduRefShotDeleted]);

    // Handle Generation Request from other components (e.g. Storyboard)
    useEffect(() => {
        if (generationRequest) {
            setInputText(generationRequest.prompt);
            setSelectedModel(generationRequest.model);

            if (generationRequest.model === 'jimeng') {
                if (generationRequest.jimengModel) {
                    jimengGeneration.setModel(generationRequest.jimengModel);
                }
                if (generationRequest.jimengResolution) {
                    jimengGeneration.setResolution(generationRequest.jimengResolution);
                }
            }

            setTimeout(() => {
                setGenerationRequest(null);
            }, 100);
        }
    }, [generationRequest, jimengGeneration, setGenerationRequest]);

    // 使用统一的滚动管理 Hook
    const {
        containerRef: messagesContainerRef,
        endRef: messagesEndRef,
        handleMediaLoaded,
        beforeLoadMore,
        afterLoadMore,
    } = useChatScroll({
        messages,
        shotId: selectedShotId,
        sceneId: currentSceneId,
        isLoading,
        isLoadingMore: isLoadingMoreRef.current,
    });

    const handleLoadMore = useCallback(async () => {
        if (isLoadingMoreRef.current || isLoading || !hasMore) return;
        isLoadingMoreRef.current = true;
        beforeLoadMore();
        await loadMore();
        afterLoadMore();
        isLoadingMoreRef.current = false;
    }, [isLoading, hasMore, loadMore, beforeLoadMore, afterLoadMore]);

    // Handlers

    const removeUploadedImage = (index: number) => {
        // Redundant with unified reference list, kept empty for interface compatibility if needed
    };



    // handleSend logic moved to useChatGeneration hook

    const handleRestoreState = (message: ChatPanelMessage) => {
        const meta = (message as any).metadata;
        let prompt = meta?.basePrompt || meta?.prompt || message.gridData?.prompt || message.content;
        if (prompt && (prompt.startsWith('已生成') || prompt.startsWith('Generated'))) {
            if (!meta?.basePrompt && !meta?.prompt && !message.gridData?.prompt) prompt = '';
        }
        if (prompt && typeof prompt === 'string') {
            prompt = prompt.split(/【角色信息】|【参考图像】/)[0].trim();
        }
        if (prompt) setInputText(prompt);
        if (message.model) {
            setSelectedModel(message.model);
            if (message.model === 'gemini-grid' && message.gridData?.gridSize) setGridSize(message.gridData.gridSize);
        }
        // toast.success("已恢复生成配置和提示词");
    };

    const handleReuseImage = (url: string) => {
        // Fix: Remove from ignoredUrls if it was previously removed
        setIgnoredUrls(prev => {
            const next = new Set(prev);
            next.delete(url);
            return next;
        });

        setManualReferenceUrls(prev => {
            if (prev.includes(url)) return prev;
            return [...prev, url];
        });
        // toast.success("图片已加入参考");
    };

    const handleApplyToShot = async (url: string) => {
        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        updateShot(selectedShotId, { referenceImage: url, status: 'done' });
        toast.success("已应用到当前分镜");
    };

    const handleApplyVideoToShot = async (message: ChatPanelMessage) => {
        const videoUrl = message.videoUrl || message.metadata?.videoUrl;
        const taskId = message.metadata?.taskId || message.metadata?.viduTaskId || message.metadata?.soraTaskId;
        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        if (!videoUrl) {
            toast.error("无效的视频链接");
            return;
        }

        try {
            // 从数据库获取最新的 Shot 数据，确保不丢失历史记录
            const latestShot = await dataService.getShot(selectedShotId);
            const currentHistory = latestShot?.generationHistory || [];
            const sceneId =
                latestShot?.sceneId ||
                selectedShot?.sceneId ||
                currentSceneId ||
                project?.scenes?.[0]?.id;

            if (!sceneId) {
                toast.error("未找到场景信息");
                return;
            }

            // 检查历史记录去重
            const alreadyExists = currentHistory.some((h: any) => h.result === videoUrl);

            let updatedHistory = currentHistory;
            if (!alreadyExists) {
                const newHistoryItem = {
                    id: `sora_pro_${Date.now()}`,
                    type: 'video' as const,
                    timestamp: new Date(),
                    result: videoUrl,
                    prompt: message.metadata?.prompt || 'Sora Pro Mode Generation',
                    parameters: {
                        model: 'sora-video',
                        source: 'pro-chat',
                        taskId: taskId
                    },
                    status: 'success' as const
                };
                updatedHistory = [newHistoryItem, ...currentHistory];
            }

            // 1. 立即更新前端状态 (Optimistic Update)
            updateShot(selectedShotId, {
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any);
            toast.success("视频已应用到当前分镜");

            // 2. 后台异步保存到数据库 (不阻塞 UI)
            const saveShotPromise = dataService.saveShot(sceneId, {
                id: selectedShotId,
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any);

            // 3. 如果有 taskId，绑定任务到分镜
            if (taskId) {
                dataService.getSoraTasks(project?.id || '').then(async (tasks) => {
                    const task = tasks.find(t => t.id === taskId);
                    if (task) {
                        const updatedTask = { ...task, shotId: selectedShotId, updatedAt: new Date() };
                        await dataService.saveSoraTask(updatedTask);
                    }
                }).catch(err => console.error('Failed to bind task:', err));
            }

            await saveShotPromise;

        } catch (e) {
            console.error('Apply video to shot error:', e);
            toast.error("应用视频失败");
        }
    };

    const handleFeedback = async () => {
        const content = window.prompt('请输入您的反馈或遇到的问题：');
        if (content?.trim()) toast.success('反馈已提交');
    };

    return (
        <div id="chat-panel-container" ref={drop as any} className={`h-full flex flex-col bg-zinc-50 dark:bg-black relative ${isOver ? 'ring-2 ring-light-accent dark:ring-cine-accent' : ''}`}>
            {isOver && (
                <div className="absolute inset-0 bg-light-accent/10 dark:bg-cine-accent/10 z-50 pointer-events-none flex items-center justify-center backdrop-blur-[1px]">
                    <div className="bg-white/90 dark:bg-black/90 px-4 py-2 rounded-full shadow-lg border border-light-accent/20 dark:border-cine-accent/20 text-light-accent dark:text-cine-accent font-medium flex items-center gap-2">
                        <Sparkles size={16} />
                        <span>释放添加为参考图</span>
                    </div>
                </div>
            )}
            <div className="flex-shrink-0 border-b border-black/5 dark:border-white/5 px-6 py-4 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-xl z-20">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Sparkles size={18} className="text-zinc-900 dark:text-white" />
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Pro 创作</h2>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 pl-6">
                            {selectedShotId ? `当前镜头: ${selectedShotLabel || '未知'}` : currentSceneId ? `当前场景: ${scenes.find(s => s.id === currentSceneId)?.name || '未知'}` : '未选择镜头或场景'}
                        </p>
                    </div>
                    <button onClick={handleFeedback} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-black/10 dark:hover:bg-white/20 transition-all">
                        <Bug size={14} /> 反馈
                    </button>
                </div>

                {generationProgress.status === 'running' && (
                    <div className="mt-4 animate-in slide-in-from-top duration-300">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <Loader2 size={14} className="text-indigo-500 animate-spin" />
                                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{generationProgress.message || '正在批量生成中...'}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">{generationProgress.current} / {generationProgress.total}</span>
                        </div>
                        <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]" style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Messages Area - Flex Grow */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar p-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                        <Sparkles size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">开始您的创作之旅...</p>
                    </div>
                )}
                <MessageList
                    messages={messages}
                    isGenerating={isGenerating}
                    selectedModel={selectedModel}
                    scrollParentRef={messagesContainerRef}
                    hasMore={hasMore}
                    isLoadingMore={isLoading}
                    onLoadMore={handleLoadMore}
                    onMediaLoaded={handleMediaLoaded}
                    onDelete={deleteMessage}
                    project={project}
                    onSetSlicerData={(data) => {
                        setSliceSelectorData(data);
                    }}
                    onPreview={(images, index) => setPreviewState({ images, index })}
                    onApplyToShot={async (url) => {
                        if (selectedShotId) {
                            updateShot(selectedShotId, { referenceImage: url });
                            toast.success('已应用到分镜');
                        }
                    }}
                    onApplyVideoToShot={handleApplyVideoToShot}
                    onAddToReference={referenceCallbacks.handleAddToReference}
                    onReusePrompt={(prompt) => setInputText(prompt)}
                />
                <div ref={messagesEndRef} />
            </div>


            {/* Active References UI */}
            <ReferenceSection
                selectedModel={selectedModel}
                viduMode={viduMode}
                activeReferences={finalDisplayReferences}
                startFrame={startEndFrames.frames.startFrame}
                endFrame={startEndFrames.frames.endFrame}
                onStartFrameChange={startEndFrames.setStartFrame}
                onEndFrameChange={startEndFrames.setEndFrame}
                onMoveReference={handleMoveReference}
                onRemoveReference={handleRemoveReference}
                onPreview={(url) => setPreviewState({ images: [url], index: 0 })}
            />

            <ChatInput
                inputText={inputText}
                setInputText={setInputText}
                onSend={() => {
                    handleSend(
                        inputText,
                        sendReferences, // Pass full ordered list
                        [], // Deprecated files arg
                        selectedModel,
                        gridSize,
                        geminiImageSize,

                        (urls) => generateSoraVideo(
                            inputText,
                            urls,
                            [], // All refs in first arg
                            selectedShotId || undefined,
                            (currentSceneId || (selectedShot ? selectedShot.sceneId : null)) || undefined
                        ),
                        (urls, contextKey) => jimengGeneration.generateImage(
                            inputText,
                            selectedShotId || null,
                            (currentSceneId || (selectedShot ? selectedShot.sceneId : null)) || null,
                            contextKey,
                            urls,
                            false,
                            { onlyExtractRefs: false }
                        ),
                        (urls) => generateViduVideo(
                            inputText,
                            urls,
                            startEndFrames.frames,
                            selectedShot
                        )
                    );
                }}
                onAssetSelected={handleAssetSelected}
                isGenerating={isGenerating}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                uploadedImages={[]} // Use empty as managed in droppedReferences
                onFileUpload={handleFileUpload}
                onRemoveImage={removeUploadedImage}
                onMention={handleMention}
                jimengModel={jimengGeneration.model}
                setJimengModel={jimengGeneration.setModel}
                jimengResolution={jimengGeneration.resolution}
                setJimengResolution={jimengGeneration.setResolution}
                gridSize={gridSize}
                setGridSize={setGridSize}
                manualReferenceUrls={manualReferenceUrls}
                onRemoveReferenceUrl={(index) => setManualReferenceUrls(prev => prev.filter((_, i) => i !== index))}
                geminiImageSize={geminiImageSize}
                setGeminiImageSize={setGeminiImageSize}
                soraAspectRatio={soraAspectRatio}
                setSoraAspectRatio={setSoraAspectRatio}
                soraDuration={soraDuration}
                setSoraDuration={setSoraDuration}
                soraModel={soraModel}
                setSoraModel={setSoraModel}
                viduMode={viduMode}
                setViduMode={setViduMode}
                viduDuration={viduDuration}
                setViduDuration={setViduDuration}
                viduResolution={viduResolution}
                setViduResolution={setViduResolution}
                viduOffPeak={viduOffPeak}
                setViduOffPeak={setViduOffPeak}
            />

            {gridResult && (
                <GridPreviewModal
                    fullGridUrl={gridResult.fullImage}
                    gridImages={gridResult.slices}
                    sceneId={gridResult.sceneId}
                    sceneOrder={scenes.find((s) => s.id === gridResult.sceneId)?.order}
                    shots={shots}
                    gridRows={gridResult.gridRows}
                    gridCols={gridResult.gridCols}
                    onAssign={(assignments) => {
                        Object.entries(assignments).forEach(([shotId, imageUrl]) => {
                            updateShot(shotId, {
                                referenceImage: imageUrl,
                                fullGridUrl: gridResult.fullImage,
                                gridImages: gridResult.slices,
                                status: 'done'
                            });
                        });
                        clearGridResult();
                    }}
                    onClose={() => clearGridResult()}
                />
            )}

            {sliceSelectorData && sliceSelectorData.gridData && (
                <GridSliceSelector
                    gridData={{
                        fullImage: sliceSelectorData.gridData.fullImage,
                        slices: sliceSelectorData.gridData.slices,
                        shotId: sliceSelectorData.shotId,
                        gridRows: sliceSelectorData.gridData.gridRows || 2,
                        gridCols: sliceSelectorData.gridData.gridCols || 2,
                        gridSize: sliceSelectorData.gridData.gridSize || '2x2',
                        prompt: sliceSelectorData.gridData.prompt || '',
                        aspectRatio: sliceSelectorData.gridData.aspectRatio || AspectRatio.WIDE,
                    }}
                    shotId={sliceSelectorData.shotId}
                    currentSliceIndex={sliceSelectorData.currentSliceIndex}
                    onSelectSlice={(sliceIndex) => {
                        const url = sliceSelectorData.gridData!.slices[sliceIndex];
                        if (sliceSelectorData.shotId) {
                            updateShot(sliceSelectorData.shotId, {
                                referenceImage: url,
                                fullGridUrl: sliceSelectorData.gridData!.fullImage,
                                gridImages: sliceSelectorData.gridData!.slices,
                                status: 'done'
                            });
                            toast.success(`已选择切片 #${sliceIndex + 1}`);
                        }
                        setSliceSelectorData(null);
                    }}
                    onClose={() => setSliceSelectorData(null)}
                />
            )}

            <ImageSelectionModal
                isOpen={jimengGeneration.isModalOpen}
                onClose={() => jimengGeneration.setIsModalOpen(false)}
                onConfirm={jimengGeneration.saveImage}
                imageUrls={jimengGeneration.generatedImages}
                isLoading={jimengGeneration.isSaving}
            />

            {previewState && (
                <ImagePreviewOverlay
                    images={previewState.images}
                    initialIndex={previewState.index}
                    onClose={() => setPreviewState(null)}
                />
            )}
        </div>
    );
}
