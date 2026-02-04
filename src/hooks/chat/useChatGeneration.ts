import { useState, useEffect } from 'react';
import { compressFileToBase64 } from '@/utils/imageCompression';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { generateMessageId } from '@/lib/utils';
import { storageService } from '@/lib/storageService';
import type { R2PathContext } from '@/lib/r2-path';
import { dataService } from '@/lib/dataService';
import {
    generateSimpleGrid,
    generateSingleImage,
    urlsToReferenceImages
} from '@/services/geminiService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import {
    ChatPanelMessage,
    GenerationModel,
    AspectRatio,
    Project,
    Shot
} from '@/types/project';
import { ActiveReference } from './useAutoReference';

interface UseChatGenerationProps {
    project: Project | null;
    user: any;
    selectedModel: GenerationModel; // Copied from implementation
    selectedShotId: string | null;
    currentSceneId: string | null;
    setMessages: React.Dispatch<React.SetStateAction<ChatPanelMessage[]>>;
    setInputText: (text: string) => void;
    setUploadedImages: (images: File[]) => void;
    setManualReferenceUrls: (urls: string[]) => void;
    setDroppedReferences: (refs: ActiveReference[]) => void;
}

/**
 * Upload Base64 image to R2 with retry mechanism
 * Retries up to 5 times with exponential backoff (3s, 6s, 12s, 24s, 48s)
 * On failure, returns original Base64 data URL so user can still view the image
 */
const uploadWithRetry = async (
    base64DataUrl: string,
    folder: string | R2PathContext,
    userId: string,
    maxRetries = 5
): Promise<string> => {
    // If not a base64 data URL, return as-is
    if (!base64DataUrl.startsWith('data:')) {
        return base64DataUrl;
    }

    const base64Data = base64DataUrl;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const r2Url = await storageService.uploadBase64ToR2(base64Data, folder, undefined, userId);
            if (attempt > 0) {
                console.log(`[uploadWithRetry] ✅ R2 上传成功 (重试 ${attempt} 次后)`);
            }
            return r2Url;
        } catch (error: any) {
            lastError = error;
            const delay = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s, 24s, 48s
            console.warn(`[uploadWithRetry] ⚠️ R2 上传失败 (第 ${attempt + 1}/${maxRetries} 次)，${delay / 1000}s 后重试...`, error.message);

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries failed - return original Base64 so user can still view the image
    console.error('[uploadWithRetry] ❌ R2 上传最终失败，使用 Base64 作为临时图片', lastError);
    return base64DataUrl;
};

const isBase64DataUrl = (value?: string | null) => {
    return typeof value === 'string' && value.startsWith('data:');
};

const filterPersistableUrls = (urls: string[]) => {
    return urls.filter(url => !isBase64DataUrl(url));
};

export function useChatGeneration({
    project,
    user,
    selectedShotId,
    currentSceneId,
    setMessages,
    setInputText,
    setUploadedImages,
    setManualReferenceUrls,
    setDroppedReferences
}: UseChatGenerationProps) {
    const [isUploading, setIsUploading] = useState(false);
    const { updateShot, addGridHistory, addActiveTask, removeActiveTask, addOptimisticMessage, removeOptimisticMessage, updateActiveTaskStatus } = useProjectStore();

    // Note: beforeunload 提示已移除
    // 现在服务端直接上传 R2，数据保存到 Supabase，刷新不会丢失数据

    const handleSend = async (
        inputText: string,
        // Refactored: Accept single ordered list to preserve mix of files/urls
        orderedReferences: ActiveReference[],
        _deprecated_Files: File[] = [], // Kept for signature compat if needed, but unused
        selectedModel: GenerationModel,
        gridSize: '2x2' | '3x3',
        geminiImageSize: '2K' | '4K',
        // Optional specialized handlers
        soraHandler?: (allRefUrls: string[]) => Promise<void>,
        jimengHandler?: (allRefUrls: string[], contextKey: string) => Promise<void>,
        viduHandler?: (allRefUrls: string[], contextKey: string) => Promise<void>
    ) => {
        // Collect files to upload from the ordered list
        const filesToUpload = orderedReferences.filter(r => r.file).map(r => r.file!);

        if ((!inputText.trim() && filesToUpload.length === 0 && orderedReferences.length === 0) || !user || !project) return;

        const currentShot = project.shots.find(s => s.id === selectedShotId);
        const currentSceneIdCaptured = currentSceneId || (currentShot ? currentShot.sceneId : null);
        const contextKey = selectedShotId ? `pro-chat:${project.id}:shot:${selectedShotId}` : currentSceneIdCaptured ? `pro-chat:${project.id}:scene:${currentSceneIdCaptured}` : `pro-chat:${project.id}:global`;

        // 生成任务 ID (提前生成，涵盖上传阶段)
        const generationTaskId = `generation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const capturedShotId = selectedShotId || '';
        const activeTaskModel = selectedModel === 'gemini-direct' ? 'gemini' : selectedModel;

        // 0. 立即注册 pending 任务 (用于显示 Loading)
        addActiveTask({
            taskId: generationTaskId,
            shotId: capturedShotId,
            type: selectedModel.includes('video') ? 'video' : 'image',
            model: activeTaskModel as any,
            status: 'pending', // 初始状态为 pending (上传中)
            startTime: Date.now(),
            prompt: inputText
        });

        // 1. Capture Active References (URLs only for now) - incomplete until upload
        // We will construct the final list later.

        // 2. Optimistic User Message
        const userMsgId = generateMessageId();
        const userMessage: ChatPanelMessage = {
            id: userMsgId,
            role: 'user',
            content: inputText,
            timestamp: new Date(),
            images: orderedReferences.map(r => r.file ? URL.createObjectURL(r.file) : r.url),
            shotId: selectedShotId || undefined,
            sceneId: currentSceneIdCaptured || undefined,
        };

        // 优化：添加到 Store 的乐观消息队列
        setMessages(prev => [...prev, userMessage]);
        addOptimisticMessage(userMessage);

        // Clear Inputs immediately
        setInputText('');
        setUploadedImages([]);
        setManualReferenceUrls([]);
        setDroppedReferences([]);

        const fileUrlMap = new Map<File, string>();

        // 3. Sequential Upload (Blocking)
        if (filesToUpload.length > 0) {
            setIsUploading(true);
            try {
                const baseScope: R2PathContext = {
                    projectId: project.id,
                    scope: selectedShotId ? 'shots' : currentSceneIdCaptured ? 'scenes' : 'project',
                    entityId: selectedShotId || currentSceneIdCaptured || project.id
                };

                const uploadPromises = filesToUpload.map(async (file) => {
                    try {
                        const compressedDataUrl = await compressFileToBase64(file);
                        const matches = compressedDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                        if (matches && matches.length === 3) {
                            const filePath = `upload_${Date.now()}_${file.name}`; // Use original file name for path
                            const url = await storageService.uploadBase64ToR2(compressedDataUrl, baseScope, filePath, user.id);
                            fileUrlMap.set(file, url);
                            return url;
                        }
                        throw new Error("Invalid base64");
                    } catch (err: unknown) {
                        if (err instanceof Error && err.message === "Invalid base64") {
                            throw new Error("Invalid base64");
                        }
                        // Non-Error exception handling
                        console.warn(`Compression failed for ${file.name}, uploading original`, err);
                        const res = await storageService.uploadFile(file, baseScope, user.id);
                        fileUrlMap.set(file, res.url);
                        return res.url;
                    }
                });

                await Promise.all(uploadPromises);
            } catch (error) {
                console.error("Failed to upload images", error);
                toast.error("图片上传失败，请重试");
                setIsUploading(false);
                removeActiveTask(generationTaskId); // 失败移除任务
                removeOptimisticMessage(userMsgId); // 失败移除消息
                return;
            } finally {
                setIsUploading(false);
            }
        }

        // Reconstruct ALl Ref URLs preserving exact order from orderedReferences
        const allRefUrls = orderedReferences.map(r => {
            if (r.file && fileUrlMap.has(r.file)) {
                return fileUrlMap.get(r.file)!;
            }
            return r.url;
        });

        // Use 'filesToUpload' for checks instead of deprecated arg
        const uploadedImages = filesToUpload;

        // 4. Persist User Message (Background)
        dataService.saveChatMessage({
            id: userMsgId,
            userId: user.id,
            projectId: project.id,
            scope: selectedShotId ? 'shot' : currentSceneIdCaptured ? 'scene' : 'project',
            shotId: selectedShotId || undefined,
            sceneId: currentSceneIdCaptured || undefined,
            role: 'user',
            content: userMessage.content,
            timestamp: userMessage.timestamp,
            metadata: { images: allRefUrls },
            createdAt: userMessage.timestamp,
            updatedAt: userMessage.timestamp,
        }).catch(e => {
            console.error("Failed to save user message", e);
            removeOptimisticMessage(userMsgId); // 保存失败移除
        }); // Non-blocking

        try {
            // 5. Delegate to Specialized Handlers if needed
            if (selectedModel === 'sora-video' && soraHandler) {
                removeActiveTask(generationTaskId); // Handlers manage their own tasks? 
                // Wait, handlers create their own tasks usually. We created a placeholder.
                // For handlers, we should probably pass the taskId or let them create one.
                // Current impl: Handlers create new tasks inside. So we remove this placeholder.
                // 优化：最好让 handlers 接受 taskId，目前先移除避免重复

                await soraHandler(allRefUrls); // Sora handler handles its own logic
                return;
            }

            if (selectedModel === 'jimeng' && jimengHandler) {
                removeActiveTask(generationTaskId);
                await jimengHandler(allRefUrls, contextKey); // Jimeng handler
                return;
            }

            if (selectedModel === 'vidu-video' && viduHandler) {
                removeActiveTask(generationTaskId);
                await viduHandler(allRefUrls, contextKey); // Vidu handler
                return;
            }

            // 6. Gemini Generation Logic (Grid / Direct)

            // 更新任务状态为 generating (开始调用 API)
            updateActiveTaskStatus(generationTaskId, 'generating');

            // Smart Enrichment
            const hasBaseImage = orderedReferences.some(r => r.source === 'manual_upload' || r.source === 'history_ref') || orderedReferences.some(r => !!r.file);
            const { enrichedPrompt } = enrichPromptWithAssets(userMessage.content, project, currentShot?.description, { onlyExtractRefs: hasBaseImage });

            // IMPORTANT: Pass URLs directly to service to avoid body limits
            const referenceImagesData = await urlsToReferenceImages(allRefUrls);

            let resultImages: string[] = []; // Base64 or URL
            let gridData: ChatPanelMessage['gridData'] | undefined;

            const baseContext: R2PathContext = {
                projectId: project.id,
                scope: selectedShotId ? 'shots' : currentSceneIdCaptured ? 'scenes' : 'project',
                entityId: selectedShotId || currentSceneIdCaptured || project.id
            };

            // Gemini/SeeDream 逻辑不需要重复 addActiveTask，因为已经在开头添加了
            // 这里只需要更新 prompt
            addActiveTask({
                taskId: generationTaskId,
                shotId: capturedShotId,
                type: 'image',
                model: selectedModel as any,
                status: 'generating',
                startTime: Date.now(),
                prompt: enrichedPrompt // Update with enriched prompt
            });

            try {
                if (selectedModel === 'gemini-grid') {
                    const rows = gridSize === '3x3' ? 3 : 2;
                    const cols = gridSize === '3x3' ? 3 : 2;
                    const projectAspectRatio = project.settings?.aspectRatio || AspectRatio.WIDE;

                    const res = await generateSimpleGrid(
                        enrichedPrompt,
                        rows,
                        cols,
                        projectAspectRatio,
                        referenceImagesData,
                        { ...baseContext, assetType: 'grid', model: 'gemini-grid' }
                    );

                    // Logic Split: Shot vs Scene
                    if (selectedShotId) {
                        // Shot Mode: Batch Generation (Slices)
                        resultImages = res.slices; // Base64 slices
                        gridData = undefined; // No "Grid Data" overlay needed
                    } else {
                        // Scene Mode: Assignment (Full Image)
                        resultImages = [res.fullImage];
                        gridData = {
                            fullImage: res.fullImage,
                            slices: res.slices,
                            gridRows: rows,
                            gridCols: cols,
                            gridSize: gridSize,
                            prompt: enrichedPrompt,
                            aspectRatio: projectAspectRatio,
                            sceneId: currentSceneIdCaptured || undefined
                        };
                    }
                } else if (selectedModel === 'gemini-direct') {
                    const res = await generateSingleImage(
                        enrichedPrompt,
                        project.settings?.aspectRatio || AspectRatio.WIDE,
                        referenceImagesData,
                        geminiImageSize,
                        { ...baseContext, assetType: 'image', model: 'gemini-direct' }
                    );
                    resultImages = [res];
                    gridData = {
                        fullImage: res,
                        slices: [],
                        aspectRatio: project.settings?.aspectRatio || AspectRatio.WIDE,
                        sceneId: currentSceneIdCaptured || undefined,
                        prompt: enrichedPrompt,
                        gridRows: undefined,
                        gridCols: undefined,
                        gridSize: undefined
                    };
                } else if (selectedModel === 'seedream') {
                    const { VolcanoEngineService } = await import('@/services/volcanoEngineService');
                    const seedreamUrl = await VolcanoEngineService.getInstance().generateSingleImage(
                        enrichedPrompt,
                        project.settings?.aspectRatio || AspectRatio.WIDE,
                        allRefUrls,
                        { ...baseContext, assetType: 'image', model: 'seedream' }
                    );
                    resultImages = [seedreamUrl];
                    gridData = {
                        fullImage: seedreamUrl,
                        slices: [],
                        aspectRatio: project.settings?.aspectRatio || AspectRatio.WIDE,
                        sceneId: currentSceneIdCaptured || undefined,
                        prompt: enrichedPrompt,
                        gridRows: undefined,
                        gridCols: undefined,
                        gridSize: undefined
                    };
                }
            } finally {
                // 无论成功失败都移除任务
                removeActiveTask(generationTaskId);
            }

            // 7. Reference Handling (Optimistic Display + Background Upload)

            // Create Assistant Message with Base64 results FIRST (Optimistic)
            const assistantMsgId = generateMessageId();
            const assistantMessage: ChatPanelMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: `已生成 ${selectedModel === 'gemini-grid' ? 'Grid' : '图片'}`,
                timestamp: new Date(),
                images: resultImages, // Initially Base64
                model: selectedModel,
                gridData, // Base64 inside gridData if present
                shotId: selectedShotId || undefined,
                sceneId: currentSceneIdCaptured || undefined,
            };

            setMessages(prev => [...prev, assistantMessage]);

            // 8. Background R2 Upload & Persistence
            // Fire and forget promise chain
            (async () => {
                setIsUploading(true);
                try {
                    // Parallel Upload: Result Images
                    const uploadedResultImages = await Promise.all(
                        resultImages.map(img =>
                            uploadWithRetry(
                                img,
                                { ...baseContext, assetType: gridData ? 'grid' : 'image', model: selectedModel },
                                user.id
                            )
                        )
                    );

                    // Update Grid Data if needed
                    let uploadedGridData = gridData;
                    if (gridData) {
                        // Parallel Upload: Grid Slices
                        // Note: If resultImages = [fullImage], it's already uploaded above.
                        // We need to upload slices separately.

                        // We uploaded fullImage in the uploadedResultImages above (index 0).
                        const uploadedFullImage = uploadedResultImages[0];

                        const uploadedSlices = await Promise.all(
                            gridData.slices.map(slice =>
                                uploadWithRetry(
                                    slice,
                                    { ...baseContext, assetType: 'slice', model: selectedModel },
                                    user.id
                                )
                            )
                        );

                        uploadedGridData = {
                            ...gridData,
                            fullImage: uploadedFullImage,
                            slices: uploadedSlices
                        };
                    }

                    // Update Message in State with URLs (Silent Replacement)
                    setMessages(prev => prev.map(m => {
                        if (m.id === assistantMsgId) {
                            return {
                                ...m,
                                images: uploadedResultImages,
                                gridData: uploadedGridData
                            };
                        }
                        return m;
                    }));

                    const persistableImages = filterPersistableUrls(uploadedResultImages);
                    const persistableGridData = uploadedGridData ? {
                        ...uploadedGridData,
                        fullImage: uploadedGridData.fullImage,
                        slices: filterPersistableUrls(uploadedGridData.slices || []),
                    } : undefined;
                    const hasPersistableGrid = persistableGridData
                        && persistableGridData.fullImage
                        && !isBase64DataUrl(persistableGridData.fullImage);

                    // Persist to Database (never store Base64)
                    await dataService.saveChatMessage({
                        id: assistantMsgId,
                        userId: user.id,
                        projectId: project.id,
                        scope: selectedShotId ? 'shot' : currentSceneIdCaptured ? 'scene' : 'project',
                        shotId: selectedShotId || undefined,
                        sceneId: currentSceneIdCaptured || undefined,
                        role: 'assistant',
                        content: assistantMessage.content,
                        timestamp: assistantMessage.timestamp,
                        metadata: {
                            images: persistableImages,
                            model: selectedModel,
                            gridData: hasPersistableGrid ? {
                                ...persistableGridData,
                                gridRows: persistableGridData.gridRows || 2,
                                gridCols: persistableGridData.gridCols || 2,
                                gridSize: persistableGridData.gridSize || '2x2',
                                prompt: persistableGridData.prompt || '',
                                aspectRatio: persistableGridData.aspectRatio || AspectRatio.WIDE,
                            } : undefined,
                            referenceImages: allRefUrls
                        },
                        updatedAt: assistantMessage.timestamp,
                        createdAt: assistantMessage.timestamp,
                    });

                    // Save to Scene History (if Scene Mode Grid)
                    if (!selectedShotId && currentSceneIdCaptured && hasPersistableGrid && persistableGridData?.gridRows) {
                        // We are in Scene Mode + Grid
                        addGridHistory(currentSceneIdCaptured, {
                            id: `grid_${Date.now()}`,
                            timestamp: new Date(),
                            fullGridUrl: persistableGridData!.fullImage,
                            slices: persistableGridData!.slices || [],
                            gridSize: persistableGridData!.gridSize!,
                            prompt: persistableGridData!.prompt || '',
                            aspectRatio: persistableGridData!.aspectRatio as AspectRatio,
                            // assignments will be empty initially
                        });
                    }

                    // Save to Shot History (if Shot Mode Grid)
                    if (selectedShotId && selectedModel === 'gemini-grid' && !uploadedGridData) {
                        // !uploadedGridData means we are in Shot Mode (Batch)
                        // We save ALL slices to history
                        if (persistableImages.length !== uploadedResultImages.length || persistableImages.length === 0) {
                            console.warn('[useChatGeneration] Skipped persisting grid slices due to non-persistable images.');
                            return;
                        }
                        const latestShot = await dataService.getShot(selectedShotId);
                        const currentHistory = latestShot?.generationHistory || [];
                        const newHistoryItems = uploadedResultImages.map((sliceUrl, idx) => ({
                            id: `grid_slice_${Date.now()}_${idx}`,
                            type: 'image' as const,
                            timestamp: new Date(),
                            result: sliceUrl,
                            prompt: enrichedPrompt,
                            parameters: {
                                model: 'gemini-grid',
                                source: 'pro-chat',
                                sliceIndex: idx,
                                gridSize: gridSize,
                            },
                            status: 'success' as const
                        }));

                        const updatedHistory = [...newHistoryItems, ...currentHistory].slice(0, 20);

                        updateShot(selectedShotId, {
                            generationHistory: updatedHistory,
                            gridImages: uploadedResultImages // Save current batch as gridImages
                        } as any);

                        if (latestShot?.sceneId) {
                            dataService.saveShot(latestShot.sceneId, {
                                id: selectedShotId,
                                generationHistory: updatedHistory,
                                gridImages: uploadedResultImages
                            } as any).catch(console.error);
                        }
                    }

                } catch (err) {
                    console.error("Background upload failed", err);
                    toast.error("图片上传到服务器失败，但您可以继续浏览");
                } finally {
                    setIsUploading(false);
                }
            })();

        } catch (error: any) {
            console.error('Generation failed:', error);
            toast.error(`生成失败: ${error.message}`);
        }
    };

    return {
        handleSend,
        isUploading // Expose uploading state if UI wants to show non-blocking indicator
    };
}
