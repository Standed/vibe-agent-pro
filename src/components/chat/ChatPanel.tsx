'use client';

import { useState, useRef, useEffect } from 'react';
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
import { useJimengGeneration } from '@/hooks/useJimengGeneration';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { Sparkles, Bug, Loader2, X } from 'lucide-react';
import { compressImage, compressFileToBase64 } from '@/utils/imageCompression';
import { replaceSoraCharacterCodes } from '@/utils/soraCharacterReplace';
import { useSoraGeneration } from '@/hooks/useSoraGeneration';
// import { useSoraVideoMessages } from '@/hooks/useSoraVideoMessages'; // Moved to useChatHistory
import { useChatHistory } from '@/hooks/chat/useChatHistory';
import { useAutoReference, ActiveReference } from '@/hooks/chat/useAutoReference';
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
    const [uploadedImages, setUploadedImages] = useState<File[]>([]);

    const [manualReferenceUrls, setManualReferenceUrls] = useState<string[]>([]);
    const [geminiImageSize, setGeminiImageSize] = useState<'2K' | '4K'>('2K');
    const [droppedReferences, setDroppedReferences] = useState<ActiveReference[]>([]);

    // Use Custom Hook for Chat History Logic
    const { messages, setMessages } = useChatHistory(
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
        setUploadedImages,
        setManualReferenceUrls,
        setDroppedReferences
    });



    // Preview State
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Sora specific
    const [soraAspectRatio, setSoraAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [soraDuration, setSoraDuration] = useState<10 | 15>(10);

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
        setUploadedImages,
        setManualReferenceUrls
    });

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);





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
            const files = Array.from(e.target.files);
            const MAX_IMAGES = 10;
            const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

            // 检查数量限制
            if (uploadedImages.length + files.length > MAX_IMAGES) {
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
                setUploadedImages((prev) => [...prev, ...validFiles]);
            }
        }
    };



    const removeUploadedImage = (index: number) => {
        setUploadedImages((prev) => prev.filter((_, i) => i !== index));
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
        toast.success("已恢复生成配置和提示词");
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
                    const fileList = Array.from(files as FileList); // Cast to array
                    const MAX_IMAGES = 10;
                    const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

                    // 检查数量限制
                    if (uploadedImages.length + fileList.length > MAX_IMAGES) {
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
                        setUploadedImages((prev) => [...prev, ...validFiles]);
                    }
                }
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    return (
        <div ref={drop as any} className={`h-full flex flex-col bg-zinc-50 dark:bg-black relative ${isOver ? 'ring-2 ring-light-accent dark:ring-cine-accent' : ''}`}>
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

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                        <Sparkles size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">开始您的创作之旅...</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <ChatBubble
                        key={msg.id}
                        message={msg as any}
                        onReusePrompt={() => handleRestoreState(msg)}
                        onReuseImage={handleReuseImage}
                        onApplyToShot={handleApplyToShot}
                        onApplyVideoToShot={handleApplyVideoToShot as any}
                        onImageClick={(url, idx, m: any) => {
                            if (m.gridData) {
                                setGridResult({
                                    fullImage: m.gridData.fullImage,
                                    slices: m.gridData.slices,
                                    sceneId: m.gridData.sceneId || currentSceneId || '',
                                    gridRows: m.gridData.gridRows || 2,
                                    gridCols: m.gridData.gridCols || 2,
                                    prompt: m.gridData.prompt || '',
                                    aspectRatio: m.gridData.aspectRatio || AspectRatio.WIDE,
                                    gridSize: m.gridData.gridSize || gridSize,
                                });
                            } else {
                                setPreviewImage(url);
                            }
                        }}
                        onSliceSelect={(m: any) => {
                            if (m.gridData && m.shotId) {
                                setSliceSelectorData({ gridData: m.gridData, shotId: m.shotId });
                            } else {
                                toast.error("此 Grid 未关联镜头，无法选择切片");
                            }
                        }}
                    />
                ))}
                {isGenerating && (
                    <div className="flex w-full mb-6 justify-start animate-pulse">
                        <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 bg-zinc-900 dark:bg-white">
                                <Sparkles size={14} className="text-white dark:text-black" />
                            </div>
                            <div className="flex flex-col gap-2 min-w-0 items-start">
                                <div className="px-4 py-3 rounded-2xl shadow-sm border text-sm bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-tl-sm backdrop-blur-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                        <span>正在生成图片，请稍候...</span>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-2">{selectedModel === 'jimeng' ? '即梦 AI 正在绘制中，通常需要 15-30 秒' : 'AI 正在思考中...'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Active References UI */}
            {activeReferences.length > 0 && (
                <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto custom-scrollbar">
                    {activeReferences.map((ref) => (
                        <div key={ref.url} className="relative group flex-shrink-0 w-16 h-16" title={ref.label}>
                            <img
                                src={ref.url}
                                alt={ref.label}
                                className={`w-full h-full object-cover rounded-lg border ${ref.source === 'manual_upload' ? 'border-green-500/50' :
                                    'border-white/10'
                                    }`}
                            />
                            <button
                                onClick={() => {
                                    setDroppedReferences(prev => prev.filter(r => r.url !== ref.url));
                                    setIgnoredUrls(prev => {
                                        const next = new Set(prev);
                                        next.add(ref.url);
                                        return next;
                                    });
                                    if (ref.entityName) {
                                        const mentionText = `@${ref.entityName}`;
                                        if (inputText.includes(mentionText)) {
                                            const newText = inputText.replaceAll(mentionText, '').replace(/\s{2,}/g, ' ').trim();
                                            setInputText(newText);
                                        }
                                    }
                                }}
                                className="absolute -top-1 -right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="移除此参考图"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <ChatInput
                inputText={inputText}
                setInputText={setInputText}
                onSend={() => handleSend(
                    inputText,
                    uploadedImages,
                    activeReferences,
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
                        selectedShotId,
                        (currentSceneId || (selectedShot ? selectedShot.sceneId : null)),
                        contextKey,
                        urls,
                        false,
                        { onlyExtractRefs: false } // Already enriched
                    )
                )}
                onAssetSelected={handleAssetSelected}
                isGenerating={isGenerating}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                uploadedImages={uploadedImages}
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

            {previewImage && (
                <ImagePreviewOverlay
                    imageUrl={previewImage}
                    onClose={() => setPreviewImage(null)}
                />
            )}
        </div>
    );
}
