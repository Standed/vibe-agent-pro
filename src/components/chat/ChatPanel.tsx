'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import { createPortal } from 'react-dom';
import { SHOT_TO_CHAT } from './dragTypes';
import { useProjectStore } from '@/store/useProjectStore';
import { generateSimpleGrid, generateSingleImage, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, Character, Location, GridData } from '@/types/project';
import { toast } from 'sonner';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import { GridSliceSelector } from '@/components/ui/GridSliceSelector';
import { useChatGeneration } from '@/hooks/chat/useChatGeneration';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatShotLabel } from '@/utils/shotOrder';
import { ImagePreviewOverlay } from './ImagePreviewOverlay';
import { dataService } from '@/lib/dataService';
import { storageService } from '@/lib/storageService';
import { useJimengGeneration } from '@/hooks/generation/useJimengGeneration';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ReferenceSection } from './ReferenceSection';
import { Sparkles, Bug, Loader2, X } from 'lucide-react';
import { compressImage, compressFileToBase64 } from '@/utils/imageCompression';
import { replaceSoraCharacterCodes } from '@/utils/soraCharacterReplace';
import { useSoraGeneration } from '@/hooks/sora/useSoraGeneration';
// import { useSoraVideoMessages } from '@/hooks/useSoraVideoMessages'; // Moved to useChatHistory
import { useChatHistory } from '@/hooks/chat/useChatHistory';
import { useAutoReference, ActiveReference } from '@/hooks/chat/useAutoReference';
import { useStartEndFrames, FrameImage } from '@/hooks/chat/useStartEndFrames';
import { useVideoReferences } from '@/hooks/chat/useVideoReferences';
import { useViduGeneration } from '@/hooks/generation/useViduGeneration';
import { ChatPanelMessage, GenerationModel } from '@/types/project';
import { generateMessageId } from '@/lib/utils';

// Types

// Types
// ActiveReference imported from useAutoReference

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

    // Use Custom Hook for Chat History Logic
    const { messages, setMessages, deleteMessage } = useChatHistory(
        project?.id,
        selectedShotId,
        currentSceneId,
        setInputText
    );

    // Use Auto Reference Hook
    const {
        activeReferences,
        setActiveReferences,
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
    const [soraAspectRatio, setSoraAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [soraDuration, setSoraDuration] = useState<10 | 15>(10);



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
        soraAspectRatio,
        soraDuration,
        setMessages,
        setIsGenerating,
        setInputText,
        setUploadedImages: () => { }, // No-op, managed via setDroppedReferences
        setManualReferenceUrls
    });

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Handlers for Reference Dragging
    const moveReferenceFn = useCallback((dragIndex: number, hoverIndex: number) => {
        if (dragIndex === hoverIndex) return;
        setActiveReferences((prevRefs) => {
            const newRefs = [...prevRefs];
            const [dragItem] = newRefs.splice(dragIndex, 1);
            newRefs.splice(hoverIndex, 0, dragItem);
            return newRefs;
        });
    }, [setActiveReferences]);

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
    const [isShotRefDeleted, setIsShotRefDeleted] = useState(false);

    // 重置逻辑：切换分镜时，恢复显示默认分镜图
    useEffect(() => {
        setIsShotRefDeleted(false);
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

        // ========== Vidu 视频模式初始化 ==========
        if (selectedModel === 'vidu-video') {
            // 图生视频模式：初始化分镜图到独立状态
            if (viduMode === 'img2video') {
                // 仅在切换模式/分镜且当前为空时初始化
                if ((shotChanged || modeChanged || modelChanged) && !videoRefs.viduImg2VideoRef && shotImage) {
                    videoRefs.setViduImg2Video({
                        url: shotImage,
                        source: 'shot_ref',
                        label: '分镜图'
                    });
                }
            }

            // 首尾帧模式：初始化首帧为分镜图
            if (viduMode === 'start-end2video') {
                if ((shotChanged || modeChanged || modelChanged) && !startEndFrames.frames.startFrame && shotImage) {
                    startEndFrames.setStartFrame({
                        url: shotImage,
                        source: 'shot_ref',
                        label: '分镜图'
                    });
                }
            }

            // 参考生视频模式：初始化分镜图 + 资产图
            if (viduMode === 'reference2video') {
                if ((shotChanged || modeChanged || modelChanged) && videoRefs.viduReferenceRefs.length === 0) {
                    // 添加分镜图
                    if (shotImage) {
                        videoRefs.addViduReference({
                            url: shotImage,
                            source: 'shot_ref',
                            label: '分镜图'
                        });
                    }
                    // 添加提及的资产图（角色、场景）
                    const allAssets = [...mentionedAssets.characters, ...mentionedAssets.locations];
                    allAssets.forEach(asset => {
                        const assetImage = asset.referenceImages?.[0];
                        if (assetImage) {
                            videoRefs.addViduReference({
                                url: assetImage,
                                source: 'auto_detect',
                                label: asset.name,
                                entityName: asset.name
                            });
                        }
                    });
                }
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
    }, [selectedShotId, viduMode, selectedModel, selectedShot, videoRefs, startEndFrames, mentionedAssets]);

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

        // Vidu 参考生视频：使用独立状态
        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
            return videoRefs.viduReferenceRefs;
        }

        // Sora 视频：使用独立状态
        if (selectedModel === 'sora-video') {
            return videoRefs.soraRef ? [videoRefs.soraRef] : [];
        }

        // 图片生成模式：使用原有逻辑（activeReferences）
        return baseReferences.filter(ref => true); // 保持原有过滤
    };

    const finalDisplayReferences = getDisplayReferences();

    // 包装删除函数 - 根据模式删除对应状态
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

        // 图片生成模式：原有逻辑
        if (ref.source === 'shot_ref') {
            setIsShotRefDeleted(true);
        } else {
            onRemoveReferenceFn(ref);
        }
    }, [selectedModel, viduMode, videoRefs, onRemoveReferenceFn]);

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

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handlers
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            let files = Array.from(e.target.files);
            const MAX_IMAGES = 10;
            const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

            // Vidu 首尾帧模式：不在这里处理，由 StartEndFrameSelector 处理
            if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
                toast.info('请点击首帧或尾帧区域上传图片');
                return;
            }

            // Vidu 图生视频模式：单图替换
            if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
                const file = files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    toast.error('请上传图片文件');
                    return;
                }
                if (file.size > MAX_SIZE_PER_IMAGE) {
                    toast.error('图片大小不能超过 10MB');
                    return;
                }

                const hasExisting = droppedReferences.length > 0 ||
                    activeReferences.some(r => r.source === 'manual_upload' || r.source === 'shot_ref');

                setDroppedReferences([{
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file
                }]);
                setManualReferenceUrls([]);
                setIsShotRefDeleted(false);

                if (files.length > 1) {
                    toast.warning('Vidu 图生视频只支持 1 张图片，已选择第一张');
                } else if (hasExisting) {
                    toast.success('已替换参考图');
                }
                return;
            }

            // Sora 视频模式：单图替换
            if (selectedModel === 'sora-video') {
                const file = files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    toast.error('请上传图片文件');
                    return;
                }
                if (file.size > MAX_SIZE_PER_IMAGE) {
                    toast.error('图片大小不能超过 10MB');
                    return;
                }

                const hasExisting = droppedReferences.length > 0 ||
                    activeReferences.some(r => r.source === 'manual_upload' || r.source === 'history_ref');

                setDroppedReferences([{
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file
                }]);
                setManualReferenceUrls([]);

                if (files.length > 1) {
                    toast.warning('Sora 仅支持 1 张参考图，已选择第一张');
                } else if (hasExisting) {
                    toast.success('已替换参考图');
                }
                return;
            }

            // Vidu 参考生视频模式：最多 7 张，递增添加
            if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
                const MAX_REF_IMAGES = 7;
                const currentCount = activeReferences.length;
                const remaining = MAX_REF_IMAGES - currentCount;

                if (remaining <= 0) {
                    toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                    return;
                }

                const filesToAdd = files.slice(0, remaining);
                const validFiles = filesToAdd.filter(file => {
                    if (!file.type.startsWith('image/')) {
                        toast.error(`文件 ${file.name} 不是图片`);
                        return false;
                    }
                    if (file.size > MAX_SIZE_PER_IMAGE) {
                        toast.error(`文件 ${file.name} 超过 10MB 限制`);
                        return false;
                    }
                    // 检查是否已存在
                    const url = URL.createObjectURL(file);
                    if (activeReferences.some(r => r.url === url) || droppedReferences.some(r => r.url === url)) {
                        return false;
                    }
                    return true;
                });

                if (validFiles.length > 0) {
                    const newRefs: ActiveReference[] = validFiles.map(file => ({
                        url: URL.createObjectURL(file),
                        source: 'manual_upload',
                        label: file.name,
                        file
                    }));
                    setDroppedReferences(prev => [...prev, ...newRefs]);
                    toast.success(`已添加 ${validFiles.length} 张参考图 (${currentCount + validFiles.length}/${MAX_REF_IMAGES})`);
                }

                if (files.length > remaining) {
                    toast.warning(`已达到上限，忽略了 ${files.length - remaining} 张图片`);
                }
                return;
            }

            // 其他模式：多图上传
            // Count existing uploaded images in activeReferences
            const currentUploadedCount = activeReferences.filter(r => r.source === 'manual_upload').length;

            // 检查数量限制
            if (currentUploadedCount + files.length > MAX_IMAGES) {
                toast.error(`最多只能上传 ${MAX_IMAGES} 张参考图`);
                return;
            }

            const validFiles = files.filter(file => {
                if (!file.type.startsWith('image/')) {
                    toast.error(`文件 ${file.name} 不是图片`);
                    return false;
                }
                if (file.size > MAX_SIZE_PER_IMAGE) {
                    toast.error(`文件 ${file.name} 超过 10MB 限制`);
                    return false;
                }
                return true;
            });

            if (validFiles.length > 0) {
                const newRefs: ActiveReference[] = validFiles.map(file => ({
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file: file
                }));
                setDroppedReferences((prev) => [...prev, ...newRefs]);
            }
        }
    };



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
        const taskId = message.metadata?.taskId;
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

    // P6: Storyboard -> Pro Drag Drop AND File Drop
    const [{ isOver }, drop] = useDrop({
        accept: [SHOT_TO_CHAT, NativeTypes.FILE],
        drop: (item: any, monitor) => {
            const itemType = monitor.getItemType();

            // ========== Vidu Start-End 模式特殊处理 ==========
            // 智能填充到空槽位：首帧优先，然后尾帧
            if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
                const fillToEmptySlot = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const frame: FrameImage = { url, source, label, file };
                    const { startFrame, endFrame } = startEndFrames.frames;

                    if (!startFrame) {
                        startEndFrames.setStartFrame(frame);
                        toast.success('已设置为首帧');
                    } else if (!endFrame) {
                        startEndFrames.setEndFrame(frame);
                        toast.success('已设置为尾帧');
                    } else {
                        toast.warning('首尾帧已满，请先删除再添加');
                    }
                };

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length >= 2) {
                        // 多张图片：第一张->首帧，第二张->尾帧
                        const processFile = (file: File): FrameImage | null => {
                            if (!file.type.startsWith('image/')) return null;
                            if (file.size > 10 * 1024 * 1024) return null;
                            return {
                                url: URL.createObjectURL(file),
                                source: 'manual_upload' as const,
                                label: file.name,
                                file,
                            };
                        };
                        const frame1 = processFile(files[0]);
                        const frame2 = processFile(files[1]);
                        if (frame1) startEndFrames.setStartFrame(frame1);
                        if (frame2) startEndFrames.setEndFrame(frame2);
                        if (frame1 || frame2) {
                            toast.success('已自动设置首尾帧');
                        }
                        if (files.length > 2) {
                            toast.warning('首尾帧模式最多 2 张图片，已忽略多余图片');
                        }
                        return;
                    }
                    // 单张图片：智能填充到空槽位
                    if (files && files.length === 1) {
                        const file = files[0];
                        if (!file.type.startsWith('image/')) {
                            toast.error('请上传图片文件');
                            return;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                            toast.error('图片大小不能超过 10MB');
                            return;
                        }
                        fillToEmptySlot(URL.createObjectURL(file), 'manual_upload', file.name, file);
                        return;
                    }
                }
                // Shot 拖拽：智能填充到空槽位
                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    fillToEmptySlot(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }
                return;
            }

            // ========== Vidu Img2Video 模式 - 单图替换 ==========
            if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
                const processAndReplace = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const hasExisting = videoRefs.viduImg2VideoRef !== null;

                    // 使用独立状态
                    videoRefs.setViduImg2Video({ url, source, label, file });

                    if (hasExisting) {
                        toast.success('Vidu 图生视频只支持 1 张图片，已替换');
                    }
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    processAndReplace(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const file = files[0];
                        if (!file.type.startsWith('image/')) {
                            toast.error('请上传图片文件');
                            return;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                            toast.error('图片大小不能超过 10MB');
                            return;
                        }
                        if (files.length > 1) {
                            toast.warning('Vidu 图生视频只支持 1 张图片，已选择第一张');
                        }
                        processAndReplace(URL.createObjectURL(file), 'manual_upload', file.name, file);
                    }
                }
                return;
            }

            // ========== Vidu Reference2Video 模式 - 最多 7 张递增 ==========
            if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
                const MAX_REF_IMAGES = videoRefs.MAX_VIDU_REFS;

                const addReference = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File): boolean => {
                    // 检查是否已存在
                    if (videoRefs.viduReferenceRefs.some(r => r.url === url)) {
                        toast.warning('该图片已添加');
                        return false;
                    }

                    if (!videoRefs.canAddViduReference()) {
                        toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                        return false;
                    }

                    videoRefs.addViduReference({ url, source, label, file });
                    return true;
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    if (addReference(item.imageUrl, 'shot_ref', '分镜参考图')) {
                        toast.success(`已添加参考图 (${videoRefs.getViduReferenceCount() + 1}/${MAX_REF_IMAGES})`);
                    }
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const currentCount = videoRefs.getViduReferenceCount();
                        const remaining = MAX_REF_IMAGES - currentCount;

                        if (remaining <= 0) {
                            toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                            return;
                        }

                        let addedCount = 0;
                        const filesToAdd = Array.from(files as FileList).slice(0, remaining);

                        for (const file of filesToAdd) {
                            if (!file.type.startsWith('image/')) {
                                toast.error(`文件 ${file.name} 不是图片`);
                                continue;
                            }
                            if (file.size > 10 * 1024 * 1024) {
                                toast.error(`文件 ${file.name} 超过 10MB 限制`);
                                continue;
                            }
                            const url = URL.createObjectURL(file);
                            if (addReference(url, 'manual_upload', file.name, file)) {
                                addedCount++;
                            }
                        }

                        if (addedCount > 0) {
                            toast.success(`已添加 ${addedCount} 张参考图`);
                        }
                        if (files.length > remaining) {
                            toast.warning(`已达到上限，忽略了 ${files.length - remaining} 张图片`);
                        }
                    }
                }
                return;
            }

            // ========== Sora 视频模式 - 单图替换 ==========
            if (selectedModel === 'sora-video') {
                const processAndReplace = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const hasExisting = videoRefs.soraRef !== null;

                    // 使用独立状态
                    videoRefs.setSora({ url, source, label, file });

                    if (hasExisting) {
                        toast.success('Sora 视频生成只支持 1 张参考图，已替换');
                    }
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    processAndReplace(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const file = files[0];
                        if (!file.type.startsWith('image/')) {
                            toast.error('请上传图片文件');
                            return;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                            toast.error('图片大小不能超过 10MB');
                            return;
                        }
                        if (files.length > 1) {
                            toast.warning('Sora 仅支持 1 张参考图，已选择第一张');
                        }
                        processAndReplace(URL.createObjectURL(file), 'manual_upload', file.name, file);
                    }
                }
                return;
            }

            // ========== 默认处理 (其他模式) ==========
            // 1. Handle Shot Drop
            if (itemType === SHOT_TO_CHAT) {
                console.log("Dropped Shot:", item);
                if (!item.imageUrl) return;

                // FIX: Remove from ignoredUrls if it was previously removed
                setIgnoredUrls(prev => {
                    const next = new Set(prev);
                    next.delete(item.imageUrl);
                    return next;
                });

                setDroppedReferences(prev => {
                    if (prev.some(r => r.url === item.imageUrl)) return prev;
                    return [...prev, {
                        url: item.imageUrl,
                        source: 'shot_ref',
                        label: '分镜参考图',
                        entityName: 'Shot Reference'
                    }];
                });
                return;
            }

            // 2. Handle Native File Drop
            if (itemType === NativeTypes.FILE) {
                const files = item.files;
                if (files && files.length > 0) {
                    let fileList = Array.from(files as FileList);
                    const MAX_IMAGES = 10;
                    const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

                    // Count existing
                    const currentUploadedCount = activeReferences.filter(r => r.source === 'manual_upload').length;

                    // 检查数量限制
                    if (currentUploadedCount + fileList.length > MAX_IMAGES) {
                        toast.error(`最多只能上传 ${MAX_IMAGES} 张参考图`);
                        return;
                    }

                    const validFiles = fileList.filter(file => {
                        if (!file.type.startsWith('image/')) {
                            toast.error(`文件 ${file.name} 不是图片`);
                            return false;
                        }
                        if (file.size > MAX_SIZE_PER_IMAGE) {
                            toast.error(`文件 ${file.name} 超过 10MB 限制`);
                            return false;
                        }
                        return true;
                    });

                    if (validFiles.length > 0) {
                        const newRefs: ActiveReference[] = validFiles.map(file => ({
                            url: URL.createObjectURL(file),
                            source: 'manual_upload',
                            label: file.name,
                            file: file
                        }));
                        setDroppedReferences((prev) => [...prev, ...newRefs]);
                    }
                }
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

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
            <div className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar space-y-6 p-4">
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
                    onDelete={deleteMessage}
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
                    onAddToReference={(url) => {
                        // Vidu 首尾帧模式：智能填充到空槽位
                        if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
                            const { startFrame, endFrame } = startEndFrames.frames;
                            const frame: FrameImage = { url, source: 'history_ref', label: '历史引用' };

                            if (!startFrame) {
                                startEndFrames.setStartFrame(frame);
                                toast.success('已设置为首帧');
                            } else if (!endFrame) {
                                startEndFrames.setEndFrame(frame);
                                toast.success('已设置为尾帧');
                            } else {
                                toast.warning('首尾帧已满，请先删除再添加');
                            }
                            return;
                        }

                        // Vidu 图生视频模式：单图替换（使用独立状态）
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

                        // Vidu 参考生视频模式：最多 7 张，递增添加（使用独立状态）
                        if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
                            const MAX_REF_IMAGES = videoRefs.MAX_VIDU_REFS;

                            // 检查是否已存在相同图片
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

                        // Sora 视频模式：单图替换（使用独立状态）
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

                        // 其他模式（图片生成）：追加到原有状态
                        setManualReferenceUrls(prev => {
                            if (prev.includes(url)) return prev;
                            return [...prev, url];
                        });
                        toast.success('已添加到参考图');
                    }}
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
                onMoveReference={moveReferenceFn}
                onRemoveReference={handleRemoveReference}
                onPreview={(url) => setPreviewState({ images: [url], index: 0 })}
            />

            <ChatInput
                inputText={inputText}
                setInputText={setInputText}
                onSend={() => {
                    handleSend(
                        inputText,
                        finalDisplayReferences, // Pass full ordered list
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
                viduMode={viduMode}
                setViduMode={setViduMode}
                viduDuration={viduDuration}
                setViduDuration={setViduDuration}
                viduResolution={viduResolution}
                setViduResolution={setViduResolution}
                viduOffPeak={viduOffPeak}
                setViduOffPeak={setViduOffPeak}
                startFrame={startEndFrames.frames.startFrame}
                endFrame={startEndFrames.frames.endFrame}
                onStartFrameChange={startEndFrames.setStartFrame}
                onEndFrameChange={startEndFrames.setEndFrame}
                defaultStartFrameUrl={selectedShot?.referenceImage}
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
