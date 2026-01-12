'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, generateSingleImage, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, Character, Location, ImageSize, GridData } from '@/types/project';
import { toast } from 'sonner';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import { GridSliceSelector } from '@/components/ui/GridSliceSelector';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatShotLabel } from '@/utils/shotOrder';
import { dataService } from '@/lib/dataService';
import { storageService } from '@/lib/storageService';
import { useJimengGeneration } from '@/hooks/useJimengGeneration';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { Sparkles, Bug, Loader2 } from 'lucide-react';
import { compressImage, compressFileToBase64 } from '@/utils/imageCompression';
import { replaceSoraCharacterCodes } from '@/utils/soraCharacterReplace';
import { useSoraGeneration } from '@/hooks/useSoraGeneration';
import { useSoraVideoMessages } from '@/hooks/useSoraVideoMessages';
import { ChatPanelMessage, GenerationModel } from '@/types/project';
import { generateMessageId } from '@/lib/utils';

// Types


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

    // State
    const [messages, setMessages] = useState<ChatPanelMessage[]>([]);
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
        gridData: ChatPanelMessage['gridData'];
        shotId?: string;
        currentSliceIndex?: number;
    } | null>(null);

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

    // Derived State
    const shots = project?.shots || [];
    const scenes = project?.scenes || [];
    const selectedShot = shots.find((s) => s.id === selectedShotId);
    const selectedScene = scenes.find((s) => s.id === (selectedShot?.sceneId || currentSceneId));
    const selectedShotLabel = selectedShot ? formatShotLabel(selectedScene?.order, selectedShot.order, selectedShot.globalOrder) : undefined;
    const projectId = project?.id || 'default';

    // Load video messages from sora_tasks (most reliable source, independent of Cron)
    const { videoMessages, refresh: refreshVideoMessages } = useSoraVideoMessages(project?.id, selectedShotId || undefined);

    // Load History
    useEffect(() => {
        const loadHistory = async () => {
            const pendingRequestRef = useProjectStore.getState().generationRequest; // Capture at start
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
                const filteredMessages = loadedMessages.filter(msg => msg.metadata?.channel !== 'planning');

                const converted: ChatPanelMessage[] = filteredMessages.map((msg) => ({
                    id: msg.id,
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: new Date(msg.createdAt),
                    images: msg.metadata?.images as string[] | undefined,
                    referenceImages: msg.metadata?.referenceImages as string[] | undefined,
                    model: msg.metadata?.model as GenerationModel | undefined,
                    shotId: msg.shotId,
                    sceneId: msg.sceneId,
                    gridData: msg.metadata?.gridData as ChatPanelMessage['gridData'] | undefined,
                    videoUrl: msg.metadata?.videoUrl as string | undefined,
                    metadata: {
                        ...msg.metadata,
                        prompt: msg.metadata?.prompt,
                        basePrompt: msg.metadata?.basePrompt
                    }
                }));



                // Inject Generation History if a shot is selected
                if (selectedShotId) {
                    // Fetch latest shot data directly from database (not via store to avoid re-render loops)
                    const latestShot = await dataService.getShot(selectedShotId);
                    const currentShot = latestShot || project?.shots?.find(s => s.id === selectedShotId);
                    if (currentShot && currentShot.generationHistory && currentShot.generationHistory.length > 0) {
                        const historyMessages: ChatPanelMessage[] = currentShot.generationHistory.map(h => {
                            const params = (h.parameters || {}) as any;

                            // 处理视频类型
                            if (h.type === 'video') {
                                const existingVideoMsg = converted.find(m =>
                                    m.videoUrl === h.result ||
                                    m.metadata?.videoUrl === h.result
                                );
                                if (existingVideoMsg) return null;

                                return {
                                    id: h.id,
                                    role: 'assistant' as const,
                                    content: 'Sora 视频生成完成',
                                    timestamp: new Date(h.timestamp),
                                    videoUrl: h.result,
                                    shotId: selectedShotId,
                                    metadata: {
                                        type: 'sora_video_complete',
                                        videoUrl: h.result,
                                        prompt: h.prompt || params.prompt || '',
                                        model: 'sora',
                                        taskId: params.taskId,
                                        source: 'generation_history'
                                    }
                                };
                            }

                            // 处理图片类型（原有逻辑）
                            const existingMsg = converted.find(m => m.images?.includes(h.result));
                            if (existingMsg) return null;

                            const isGrid = params.model === 'gemini-grid' || params.gridSize || Array.isArray(params.slices);
                            const gridSize = params.gridSize as '2x2' | '3x3' | undefined;
                            const gridRows = params.gridRows || (gridSize === '3x3' ? 3 : gridSize === '2x2' ? 2 : (Array.isArray(params.slices) && params.slices.length === 9 ? 3 : 2));
                            const gridCols = params.gridCols || (gridSize === '3x3' ? 3 : gridSize === '2x2' ? 2 : (Array.isArray(params.slices) && params.slices.length === 9 ? 3 : 2));
                            const promptText = h.prompt || params.prompt || '';

                            const msg: ChatPanelMessage = {
                                id: h.id,
                                role: 'assistant',
                                content: isGrid ? 'Agent Generated Grid' : 'Agent Generated Image',
                                timestamp: new Date(h.timestamp),
                                images: [h.result],
                                model: (isGrid ? 'gemini-grid' : params.model) as GenerationModel,
                                shotId: selectedShotId,
                                gridData: isGrid ? {
                                    fullImage: (params.fullGridUrl as string) || h.result,
                                    slices: (params.slices as string[]) || [],
                                    gridRows,
                                    gridCols,
                                    gridSize: gridSize || (gridRows === 3 ? '3x3' : '2x2'),
                                    prompt: promptText,
                                    aspectRatio: project.settings.aspectRatio || AspectRatio.WIDE,
                                    sceneId: currentShot.sceneId
                                } : undefined,
                                metadata: {
                                    prompt: promptText,
                                    model: params.model
                                }
                            };
                            return msg;
                        }).filter((m): m is ChatPanelMessage => m !== null);

                        converted.push(...historyMessages);
                    }
                }

                // Sort all messages by timestamp (video messages from hook will be merged after)
                converted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                setMessages(converted);

                // Initialize Input Text Logic
                // We check both the captured request (at start of effect) and current state
                // to avoid race conditions where a request might be cleared by the time we get here
                // or might have arrived while we were loading history.
                const currentRequest = useProjectStore.getState().generationRequest;
                if (!pendingRequestRef && !currentRequest) {
                    if (converted.length > 0) {
                        // Use last user message
                        const lastUserMsg = [...converted].reverse().find(m => m.role === 'user');
                        if (lastUserMsg) {
                            const meta = (lastUserMsg as any).metadata;
                            let prompt = meta?.basePrompt || meta?.prompt || lastUserMsg.content;

                            // Clean up prompt if needed
                            if (prompt && typeof prompt === 'string') {
                                prompt = prompt.split(/【角色信息】|【参考图像】/)[0].trim();
                            }
                            setInputText(prompt);
                        } else {
                            setInputText('');
                        }
                    } else {
                        // First time: use shot description if in shot scope
                        if (selectedShotId && project?.shots) {
                            const currentShot = project.shots.find(s => s.id === selectedShotId);
                            if (currentShot) {
                                setInputText(currentShot.description || '');
                            } else {
                                setInputText('');
                            }
                        } else {
                            setInputText('');
                        }
                    }
                }

            } catch (error) {
                console.error('[ChatPanel] Load history failed:', error);
                setMessages([]);
            }
        };

        loadHistory();
        setMentionedAssets({ characters: [], locations: [] });
        setManualReferenceUrls([]);
    }, [project?.id, selectedShotId, currentSceneId, user, project?.shots]);

    // Merge video messages from sora_tasks hook into messages state
    useEffect(() => {
        if (videoMessages.length === 0) return;

        setMessages(prev => {
            // Filter out duplicates by checking taskId or videoUrl
            const newVideoMessages = videoMessages.filter(vm =>
                !prev.some(m =>
                    m.id === vm.id ||
                    m.metadata?.taskId === vm.metadata.taskId ||
                    m.videoUrl === vm.videoUrl
                )
            ) as ChatPanelMessage[];

            if (newVideoMessages.length === 0) return prev;

            // Merge and sort
            const merged = [...prev, ...newVideoMessages];
            merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            return merged;
        });
    }, [videoMessages]);

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

            // 计算当前已选图片的总大小
            const currentTotalSize = uploadedImages.reduce((acc, f) => acc + f.size, 0);
            const newFilesSize = files.reduce((acc, f) => acc + f.size, 0);

            if (currentTotalSize + newFilesSize > 10 * 1024 * 1024) {
                toast.error("所有上传图片的总大小不能超过 10MB");
                return;
            }

            const validFiles = files.filter(file => {
                if (!file.type.startsWith('image/')) {
                    toast.error(`文件 ${file.name} 不是图片`);
                    return false;
                }
                return true;
            });

            if (validFiles.length > 0) {
                setUploadedImages((prev) => [...prev, ...validFiles]);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);

            // 计算当前已选图片的总大小
            const currentTotalSize = uploadedImages.reduce((acc, f) => acc + f.size, 0);
            const newFilesSize = files.reduce((acc, f) => acc + f.size, 0);

            if (currentTotalSize + newFilesSize > 10 * 1024 * 1024) {
                toast.error("所有上传图片的总大小不能超过 10MB");
                return;
            }

            const validFiles = files.filter(file => {
                if (!file.type.startsWith('image/')) {
                    toast.error(`文件 ${file.name} 不是图片`);
                    return false;
                }
                return true;
            });

            if (validFiles.length > 0) {
                setUploadedImages((prev) => [...prev, ...validFiles]);
                toast.success(`已添加 ${validFiles.length} 张图片`);
            }
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

        const currentShotId = selectedShotId || null;
        const currentSceneIdCaptured = currentSceneId || (selectedShot ? selectedShot.sceneId : null);
        const contextKey = currentShotId ? `pro-chat:${projectId}:shot:${currentShotId}` : currentSceneIdCaptured ? `pro-chat:${projectId}:scene:${currentSceneIdCaptured}` : `pro-chat:${projectId}:global`;

        const userMsgId = generateMessageId();
        const userMessage: ChatPanelMessage = {
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

        let uploadedUrls: string[] = [];
        if (uploadedImages.length > 0) {
            try {
                const uploadPromises = uploadedImages.map(async file => {
                    // 直接上传原图到 R2，不再预压缩
                    return storageService.uploadFile(file, `chat-uploads/${user.id}`, user.id);
                });
                const results = await Promise.all(uploadPromises);
                uploadedUrls = results.map(r => r.url);
            } catch (error) {
                console.error("Failed to upload images", error);
                toast.error("图片上传失败");
                setIsGenerating(false);
                return;
            }
        }

        try {
            await dataService.saveChatMessage({
                id: userMsgId,
                userId: user.id,
                projectId: project.id,
                scope: currentShotId ? 'shot' : currentSceneIdCaptured ? 'scene' : 'project',
                shotId: currentShotId || undefined,
                sceneId: currentSceneIdCaptured || undefined,
                role: 'user',
                content: userMessage.content,
                timestamp: userMessage.timestamp,
                metadata: { images: uploadedUrls },
                createdAt: userMessage.timestamp,
                updatedAt: userMessage.timestamp,
            });
        } catch (e) {
            console.error("Failed to save user message", e);
        }

        try {
            if (selectedModel === 'sora-video') {
                await generateSoraVideo(
                    userMessage.content,
                    uploadedUrls,
                    manualReferenceUrls,
                    currentShotId || undefined,
                    currentSceneIdCaptured || undefined
                );
            } else if (selectedModel === 'jimeng') {
                await jimengGeneration.generateImage(userMessage.content, currentShotId, currentSceneIdCaptured, contextKey, uploadedUrls);
            } else {
                const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(userMessage.content, project, undefined);
                const allRefUrls = [...referenceImageUrls, ...manualReferenceUrls, ...uploadedUrls];
                const referenceImagesData = await urlsToReferenceImages(allRefUrls);

                let resultImages: string[] = [];
                let gridData: ChatPanelMessage['gridData'] | undefined;

                if (selectedModel === 'gemini-grid') {
                    const rows = gridSize === '3x3' ? 3 : 2;
                    const cols = gridSize === '3x3' ? 3 : 2;
                    const res = await generateMultiViewGrid(enrichedPrompt, rows, cols, project.settings.aspectRatio || AspectRatio.WIDE, ImageSize.K4, referenceImagesData);
                    resultImages = [res.fullImage];
                    gridData = {
                        fullImage: res.fullImage,
                        slices: res.slices,
                        gridRows: rows,
                        gridCols: cols,
                        gridSize: gridSize,
                        prompt: enrichedPrompt,
                        aspectRatio: project.settings.aspectRatio || AspectRatio.WIDE,
                        sceneId: currentSceneIdCaptured || undefined
                    };
                } else if (selectedModel === 'gemini-direct') {
                    const res = await generateSingleImage(enrichedPrompt, project.settings.aspectRatio || AspectRatio.WIDE, referenceImagesData);
                    resultImages = [res];
                }

                const uploadedResultImages: string[] = [];
                for (const img of resultImages) {
                    if (img.startsWith('data:')) {
                        const base64Data = img.split(',')[1];
                        const r2Url = await storageService.uploadBase64ToR2(base64Data, `generated/${user.id}`, undefined, user.id);
                        uploadedResultImages.push(r2Url);
                    } else {
                        uploadedResultImages.push(img);
                    }
                }
                resultImages = uploadedResultImages;
                if (gridData) gridData.fullImage = resultImages[0];

                const assistantMsgId = generateMessageId();
                const assistantMessage: ChatPanelMessage = {
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
        } finally {
            setIsGenerating(false);
        }
    };

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
        setManualReferenceUrls(prev => [...prev, url]);
        toast.success("已添加为参考图");
    };

    const handleApplyToShot = async (url: string) => {
        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        updateShot(selectedShotId, { referenceImage: url, status: 'done' });
        toast.success("已应用到当前分镜");
    };

    const handleApplyVideoToShot = async (videoUrl: string) => {
        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        // 使用currentSceneId
        const sceneId = currentSceneId || project?.scenes?.[0]?.id;
        if (!sceneId) {
            toast.error("未找到场景信息");
            return;
        }
        try {
            // 从数据库获取最新的 Shot 数据，确保不丢失历史记录
            const latestShot = await dataService.getShot(selectedShotId);
            const currentHistory = latestShot?.generationHistory || [];

            const newHistoryItem = {
                id: `sora_pro_${Date.now()}`,
                type: 'video' as const,
                timestamp: new Date(),
                result: videoUrl,
                prompt: 'Sora Pro Mode Generation',
                parameters: {
                    model: 'sora-video',
                    source: 'pro-chat'
                },
                status: 'success' as const
            };

            const updatedHistory = [newHistoryItem, ...currentHistory];

            // 1. 立即更新前端状态 (Optimistic Update)
            updateShot(selectedShotId, {
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any);
            toast.success("视频已应用到当前分镜");

            // 2. 后台异步保存到数据库 (不阻塞 UI)
            dataService.saveShot(sceneId, {
                id: selectedShotId,
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any).catch(err => {
                console.error('Background save failed:', err);
                toast.error("保存到数据库失败，请刷新重试");
            });

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
        <div className="h-full flex flex-col bg-zinc-50 dark:bg-black" onDragOver={handleDragOver} onDrop={handleDrop}>
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
                        onApplyVideoToShot={handleApplyVideoToShot}
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

            {previewImage && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="relative w-full h-full flex items-center justify-center">
                        <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                        <button className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors" onClick={() => setPreviewImage(null)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
