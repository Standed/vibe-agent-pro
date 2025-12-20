'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, generateSingleImage, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, Character, Location, ImageSize } from '@/types/project';
import { toast } from 'sonner';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import { GridSliceSelector } from '@/components/ui/GridSliceSelector';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatShotLabel } from '@/utils/shotOrder';
import { dataService } from '@/lib/dataService';
import { useJimengGeneration } from '@/hooks/useJimengGeneration';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { ChatBubble } from './ChatBubble';
import { ChatInput, GenerationModel } from './ChatInput';
import { Sparkles, Bug } from 'lucide-react';

// Types
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
    referenceImages?: string[];
    model?: GenerationModel;
    shotId?: string;
    sceneId?: string;
    gridData?: {
        fullImage: string;
        slices: string[];
        sceneId?: string;
        gridRows?: number;
        gridCols?: number;
        prompt?: string;
        aspectRatio?: AspectRatio;
        gridSize?: '2x2' | '3x3';
    };
}

const generateMessageId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

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
    } = useProjectStore();

    const { user } = useAuth();

    // State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [selectedModel, setSelectedModel] = useState<GenerationModel>('gemini-grid');
    const [uploadedImages, setUploadedImages] = useState<File[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [manualReferenceUrls, setManualReferenceUrls] = useState<string[]>([]);
    const [mentionedAssets, setMentionedAssets] = useState<{
        characters: Character[];
        locations: Location[];
    }>({ characters: [], locations: [] });

    // Grid specific
    const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
    const [sliceSelectorData, setSliceSelectorData] = useState<{
        gridData: ChatMessage['gridData'];
        shotId?: string;
        currentSliceIndex?: number;
    } | null>(null);

    // Preview State
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Jimeng Hook
    const jimengGeneration = useJimengGeneration({
        setMessages: setMessages as any, // Type compatibility
        manualReferenceUrls,
        mentionedAssets
    });

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Derived State
    const shots = project?.shots || [];
    const scenes = project?.scenes || [];
    const selectedShot = shots.find((s) => s.id === selectedShotId);
    const selectedScene = scenes.find((s) => s.id === (selectedShot?.sceneId || currentSceneId));
    const selectedShotLabel = selectedShot ? formatShotLabel(selectedScene?.order, selectedShot.order, selectedShot.globalOrder) : undefined;
    const projectId = project?.id || 'default';



    // Load History
    useEffect(() => {
        const loadHistory = async () => {
            if (!project || !user) {
                setMessages([]);
                return;
            }

            try {
                let filters: Parameters<typeof dataService.getChatMessages>[0];

                if (selectedShotId) {
                    filters = { projectId: project.id, scope: 'shot', shotId: selectedShotId };
                } else if (currentSceneId) {
                    filters = { projectId: project.id, scope: 'scene', sceneId: currentSceneId };
                } else {
                    filters = { projectId: project.id, scope: 'project' };
                }

                const loadedMessages = await dataService.getChatMessages(filters, user?.id);

                const converted: ChatMessage[] = loadedMessages.map((msg) => ({
                    id: msg.id,
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: new Date(msg.createdAt),
                    images: msg.metadata?.images as string[] | undefined,
                    referenceImages: msg.metadata?.referenceImages as string[] | undefined,
                    model: msg.metadata?.model as GenerationModel | undefined,
                    shotId: msg.shotId,
                    sceneId: msg.sceneId,
                    gridData: msg.metadata?.gridData as ChatMessage['gridData'] | undefined,
                    metadata: {
                        ...msg.metadata,
                        prompt: msg.metadata?.prompt,
                        basePrompt: msg.metadata?.basePrompt
                    }
                }));

                setMessages(converted);
            } catch (error) {
                console.error('[ChatPanel] Load history failed:', error);
                setMessages([]);
            }
        };

        loadHistory();
        setMentionedAssets({ characters: [], locations: [] });

        // Check store directly to avoid closure staleness
        const pendingRequest = useProjectStore.getState().generationRequest;
        if (!pendingRequest) {
            setInputText('');
        }
        setManualReferenceUrls([]);
    }, [project?.id, selectedShotId, currentSceneId, user]);

    // Handle Generation Request from other components (e.g. Storyboard)
    // Placed AFTER loadHistory to ensure input isn't cleared by loadHistory
    useEffect(() => {
        if (generationRequest) {
            console.log('[ChatPanel] Received generationRequest:', generationRequest);
            setInputText(generationRequest.prompt);
            setSelectedModel(generationRequest.model);

            if (generationRequest.model === 'jimeng') {
                if (generationRequest.jimengModel) {
                    console.log('[ChatPanel] Setting Jimeng model:', generationRequest.jimengModel);
                    jimengGeneration.setModel(generationRequest.jimengModel);
                }
                if (generationRequest.jimengResolution) {
                    console.log('[ChatPanel] Setting Jimeng resolution:', generationRequest.jimengResolution);
                    jimengGeneration.setResolution(generationRequest.jimengResolution);
                }
            }

            // Delay clearing to ensure loadHistory effect sees the request
            setTimeout(() => {
                console.log('[ChatPanel] Clearing generationRequest');
                setGenerationRequest(null);
            }, 100);
        } else {
            // console.log('[ChatPanel] No generationRequest');
        }
    }, [generationRequest, jimengGeneration, setGenerationRequest]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handlers
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setUploadedImages((prev) => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeUploadedImage = (index: number) => {
        setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleMention = async (query: string) => {
        if (!project) return [];
        const chars = project.characters.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).map(c => ({ id: c.id, display: c.name, type: 'character', data: c }));
        const locs = project.locations.filter(l => l.name.toLowerCase().includes(query.toLowerCase())).map(l => ({ id: l.id, display: l.name, type: 'location', data: l }));
        return [...chars, ...locs];
    };

    const handleSend = async () => {
        if ((!inputText.trim() && uploadedImages.length === 0) || isGenerating || !user || !project) return;

        // Capture context
        const currentShotId = selectedShotId || null;
        const currentSceneIdCaptured = currentSceneId || (selectedShot ? selectedShot.sceneId : null);
        const contextKey = currentShotId ? `pro-chat:${projectId}:shot:${currentShotId}` : currentSceneIdCaptured ? `pro-chat:${projectId}:scene:${currentSceneIdCaptured}` : `pro-chat:${projectId}:global`;

        // Optimistic User Message
        const userMsgId = generateMessageId();
        const userMessage: ChatMessage = {
            id: userMsgId,
            role: 'user',
            content: inputText,
            timestamp: new Date(),
            images: uploadedImages.map(f => URL.createObjectURL(f)),
            shotId: currentShotId || undefined,
            sceneId: currentSceneIdCaptured || undefined,
        };
        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setUploadedImages([]);
        setIsGenerating(true);

        // Save User Message
        try {
            await dataService.saveChatMessage({
                id: userMsgId,
                userId: user.id,
                projectId: project.id,
                scope: currentShotId ? 'shot' : currentSceneIdCaptured ? 'scene' : 'project',
                shotId: currentShotId || undefined,
                sceneId: currentSceneIdCaptured || undefined,
                role: 'user',
                content: inputText,
                timestamp: userMessage.timestamp,
                metadata: {
                    images: [] // TODO: Upload user images to R2 if needed
                },
                createdAt: userMessage.timestamp,
                updatedAt: userMessage.timestamp,
            });
        } catch (e) {
            console.error("Failed to save user message", e);
        }

        try {
            // 1. Jimeng Generation
            if (selectedModel === 'jimeng') {
                await jimengGeneration.generateImage(
                    userMessage.content,
                    currentShotId,
                    currentSceneIdCaptured,
                    contextKey
                );
                // jimengGeneration handles saving assistant message internally
            }
            // 2. Gemini Generation
            else {
                // Prepare Prompt
                const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(userMessage.content, project, undefined);
                const finalPrompt = enrichedPrompt;

                // Combine manual uploads + asset refs
                const allRefUrls = [...referenceImageUrls, ...manualReferenceUrls];
                const referenceImagesData = await urlsToReferenceImages(allRefUrls);

                let resultImages: string[] = [];
                let gridData: ChatMessage['gridData'] | undefined;

                if (selectedModel === 'gemini-grid') {
                    const rows = gridSize === '3x3' ? 3 : 2;
                    const cols = gridSize === '3x3' ? 3 : 2;
                    const res = await generateMultiViewGrid(
                        finalPrompt,
                        rows,
                        cols,
                        project.settings.aspectRatio || AspectRatio.WIDE,
                        ImageSize.K4,
                        referenceImagesData
                    );
                    resultImages = [res.fullImage];
                    gridData = {
                        fullImage: res.fullImage,
                        slices: res.slices,
                        gridRows: rows,
                        gridCols: cols,
                        gridSize: gridSize,
                        prompt: finalPrompt,
                        aspectRatio: project.settings.aspectRatio || AspectRatio.WIDE,
                        sceneId: currentSceneIdCaptured || undefined
                    };
                } else if (selectedModel === 'gemini-direct') {
                    const res = await generateSingleImage(
                        finalPrompt,
                        project.settings.aspectRatio || AspectRatio.WIDE,
                        referenceImagesData
                    );
                    resultImages = [res];
                } else if (selectedModel === 'seedream') {
                    toast.info("SeeDream 暂未集成，请使用 Gemini 或 即梦");
                    setIsGenerating(false);
                    return;
                }

                // Create Assistant Message
                const assistantMsgId = generateMessageId();
                const assistantMessage: ChatMessage = {
                    id: assistantMsgId,
                    role: 'assistant',
                    content: `已生成 ${selectedModel === 'gemini-grid' ? 'Grid' : '图片'}`,
                    timestamp: new Date(),
                    images: resultImages,
                    model: selectedModel,
                    gridData,
                    shotId: currentShotId || undefined,
                    sceneId: currentSceneIdCaptured || undefined,
                };

                setMessages(prev => [...prev, assistantMessage]);

                // Save Assistant Message
                await dataService.saveChatMessage({
                    id: assistantMsgId,
                    userId: user.id,
                    projectId: project.id,
                    scope: currentShotId ? 'shot' : currentSceneIdCaptured ? 'scene' : 'project',
                    shotId: currentShotId || undefined,
                    sceneId: currentSceneIdCaptured || undefined,
                    role: 'assistant',
                    content: assistantMessage.content,
                    timestamp: assistantMessage.timestamp,
                    metadata: {
                        images: resultImages,
                        model: selectedModel,
                        gridData: gridData ? {
                            ...gridData,
                            gridRows: gridData.gridRows || 2,
                            gridCols: gridData.gridCols || 2,
                            gridSize: gridData.gridSize || '2x2',
                            prompt: gridData.prompt || '',
                            aspectRatio: gridData.aspectRatio || AspectRatio.WIDE,
                            fullImage: gridData.fullImage,
                            slices: gridData.slices
                        } : undefined,
                        referenceImages: allRefUrls
                    },
                    createdAt: assistantMessage.timestamp,
                    updatedAt: assistantMessage.timestamp,
                });
            }
        } catch (error: any) {
            console.error('Generation failed:', error);
            toast.error(`生成失败: ${error.message}`);
            setMessages(prev => [...prev, {
                id: generateMessageId(),
                role: 'assistant',
                content: `生成出错: ${error.message}`,
                timestamp: new Date(),
                model: selectedModel
            }]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRestoreState = (message: ChatMessage) => {
        // Restore Prompt
        // Prioritize basePrompt (original user input) -> prompt (enriched) -> gridData.prompt -> content (fallback)
        const meta = (message as any).metadata;
        let prompt = meta?.basePrompt || meta?.prompt || message.gridData?.prompt || message.content;

        // Auto-clean enriched prompt if it contains system markers
        // This handles legacy messages or cases where enriched prompt was pasted
        if (prompt && typeof prompt === 'string') {
            // Remove Character Info and Reference Images sections
            prompt = prompt.split(/【角色信息】|【参考图像】/)[0].trim();
        }

        setInputText(prompt);

        // Restore Model & Settings
        if (message.model) {
            setSelectedModel(message.model);

            // Restore Grid Settings
            if (message.model === 'gemini-grid' && message.gridData?.gridSize) {
                setGridSize(message.gridData.gridSize);
            }

            // Restore Jimeng Settings (if available in metadata)
            // Note: We need to access metadata from the message, but ChatMessage type might need update or casting
            // Assuming we can get it from where we constructed it
        }

        toast.success("已恢复生成配置和提示词");
    };

    const handleReuseImage = (url: string) => {
        setManualReferenceUrls(prev => [...prev, url]);
        toast.success("已添加为参考图");
    };

    const handleFeedback = async () => {
        const content = window.prompt('请输入您的反馈或遇到的问题：');
        if (!content?.trim()) return;
        // ... feedback logic (simplified)
        toast.success('反馈已提交');
    };

    return (
        <div className="h-full flex flex-col bg-zinc-50 dark:bg-black">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-black/5 dark:border-white/5 px-6 py-4 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-xl z-20">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Sparkles size={18} className="text-zinc-900 dark:text-white" />
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                                Pro 创作
                            </h2>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 pl-6">
                            {selectedShotId
                                ? `当前镜头: ${selectedShotLabel || '未知'}`
                                : currentSceneId
                                    ? `当前场景: ${scenes.find(s => s.id === currentSceneId)?.name || '未知'}`
                                    : '未选择镜头或场景'}
                        </p>
                    </div>
                    <button
                        onClick={handleFeedback}
                        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-black/10 dark:hover:bg-white/20 transition-all"
                    >
                        <Bug size={14} />
                        反馈
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                        <Sparkles size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            开始您的创作之旅...
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <ChatBubble
                        key={msg.id}
                        message={msg}
                        onReusePrompt={() => handleRestoreState(msg)}
                        onReuseImage={handleReuseImage}
                        onImageClick={(url, idx, m) => {
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
                        onSliceSelect={(m) => {
                            if (m.gridData && m.shotId) {
                                setSliceSelectorData({
                                    gridData: m.gridData,
                                    shotId: m.shotId
                                });
                            } else {
                                toast.error("此 Grid 未关联镜头，无法选择切片");
                            }
                        }}
                    />
                ))}

                {isGenerating && (
                    <div className="flex w-full mb-6 justify-start animate-pulse">
                        <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                            {/* Avatar */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 bg-zinc-900 dark:bg-white">
                                <Sparkles size={14} className="text-white dark:text-black" />
                            </div>

                            {/* Content Bubble */}
                            <div className="flex flex-col gap-2 min-w-0 items-start">
                                <div className="px-4 py-3 rounded-2xl shadow-sm border text-sm bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-tl-sm backdrop-blur-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                        <span>正在生成图片，请稍候...</span>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-2">
                                        {selectedModel === 'jimeng' ? '即梦 AI 正在绘制中，通常需要 15-30 秒' : 'AI 正在思考中...'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <ChatInput
                inputText={inputText}
                setInputText={setInputText}
                onSend={handleSend}
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
            />

            {/* Modals */}
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
                            updateShot(shotId, { referenceImage: imageUrl, fullGridUrl: gridResult.fullImage, status: 'done' });
                            // Add history logic here if needed, or rely on chat history
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
                            updateShot(sliceSelectorData.shotId, { referenceImage: url, fullGridUrl: sliceSelectorData.gridData!.fullImage, status: 'done' });
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

            {/* Image Preview Modal */}
            {/* Image Preview Modal */}
            {previewImage && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-full max-h-full">
                        <img
                            src={previewImage}
                            alt="Preview"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors"
                            onClick={() => setPreviewImage(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
