import { useState } from 'react';
import { compressFileToBase64 } from '@/utils/imageCompression';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { generateMessageId } from '@/lib/utils';
import { storageService } from '@/lib/storageService';
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
    selectedShotId: string | null;
    currentSceneId: string | null;
    setMessages: React.Dispatch<React.SetStateAction<ChatPanelMessage[]>>;
    setInputText: (text: string) => void;
    setUploadedImages: (images: File[]) => void;
    setManualReferenceUrls: (urls: string[]) => void;
    setDroppedReferences: (refs: ActiveReference[]) => void;
}

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
    const [isGenerating, setIsGenerating] = useState(false);
    const { updateShot } = useProjectStore();

    const handleSend = async (
        inputText: string,
        uploadedImages: File[],
        activeReferences: ActiveReference[],
        selectedModel: GenerationModel,
        gridSize: '2x2' | '3x3',
        geminiImageSize: '2K' | '4K',
        // Optional specialized handlers
        soraHandler?: (allRefUrls: string[]) => Promise<void>,
        jimengHandler?: (allRefUrls: string[], contextKey: string) => Promise<void>
    ) => {
        if ((!inputText.trim() && uploadedImages.length === 0) || isGenerating || !user || !project) return;

        const currentShot = project.shots.find(s => s.id === selectedShotId);
        const currentSceneIdCaptured = currentSceneId || (currentShot ? currentShot.sceneId : null);
        const contextKey = selectedShotId ? `pro-chat:${project.id}:shot:${selectedShotId}` : currentSceneIdCaptured ? `pro-chat:${project.id}:scene:${currentSceneIdCaptured}` : `pro-chat:${project.id}:global`;

        // 1. Capture Active References
        const activeRefUrls = activeReferences.map(r => r.url);

        // 2. Optimistic User Message
        const userMsgId = generateMessageId();
        const userMessage: ChatPanelMessage = {
            id: userMsgId,
            role: 'user',
            content: inputText,
            timestamp: new Date(),
            images: [
                ...uploadedImages.map(f => URL.createObjectURL(f)),
                ...activeRefUrls
            ],
            shotId: selectedShotId || undefined,
            sceneId: currentSceneIdCaptured || undefined,
        };

        setMessages(prev => [...prev, userMessage]);

        // Clear Inputs immediately
        setInputText('');
        setUploadedImages([]);
        setManualReferenceUrls([]);
        setDroppedReferences([]);
        setIsGenerating(true);

        // 3. Pre-upload Local Images to R2 (Concurrent) - With Compression
        let uploadedUrls: string[] = [];
        if (uploadedImages.length > 0) {
            try {
                const uploadPathBase = `chat-uploads/${user.id}/${Date.now()}`;

                const uploadPromises = uploadedImages.map(async (file, idx) => {
                    try {
                        // 1. Compress Image
                        const compressedDataUrl = await compressFileToBase64(file);

                        // 2. Parse Base64
                        const matches = compressedDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

                        if (matches && matches.length === 3) {
                            const mimeType = matches[1];
                            const base64Data = matches[2];
                            const filePath = `${uploadPathBase}_${idx}.jpg`; // Compressed is JPEG

                            // 3. Upload Compressed
                            return await storageService.uploadBase64ToR2(base64Data, filePath, mimeType, user.id);
                        }

                        // Fallback
                        throw new Error("Invalid base64 format");
                    } catch (err) {
                        console.warn(`Compression failed for ${file.name}, uploading original`, err);
                        // Fallback to original upload
                        const res = await storageService.uploadFile(file, `chat-uploads/${user.id}/${Date.now()}`, user.id);
                        return res.url;
                    }
                });

                uploadedUrls = await Promise.all(uploadPromises);
            } catch (error) {
                console.error("Failed to upload images", error);
                toast.error("图片上传失败，请重试");
                setIsGenerating(false);
                return;
            }
        }

        const allRefUrls = [...activeRefUrls, ...uploadedUrls];

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
        }).catch(e => console.error("Failed to save user message", e)); // Non-blocking

        try {
            // 5. Delegate to Specialized Handlers if needed
            if (selectedModel === 'sora-video' && soraHandler) {
                await soraHandler(allRefUrls); // Sora handler handles its own logic
                return;
            }

            if (selectedModel === 'jimeng' && jimengHandler) {
                await jimengHandler(allRefUrls, contextKey); // Jimeng handler
                return;
            }

            // 6. Gemini Generation Logic (Grid / Direct)

            // Smart Enrichment
            const hasBaseImage = activeReferences.some(r => r.source === 'manual_upload' || r.source === 'history_ref') || uploadedImages.length > 0;
            const { enrichedPrompt } = enrichPromptWithAssets(userMessage.content, project, currentShot?.description, { onlyExtractRefs: hasBaseImage });

            // IMPORTANT: Pass URLs directly to service to avoid body limits
            const referenceImagesData = await urlsToReferenceImages(allRefUrls);

            let resultImages: string[] = []; // Base64 or URL
            let gridData: ChatPanelMessage['gridData'] | undefined;

            if (selectedModel === 'gemini-grid') {
                const rows = gridSize === '3x3' ? 3 : 2;
                const cols = gridSize === '3x3' ? 3 : 2;
                const projectAspectRatio = project.settings?.aspectRatio || AspectRatio.WIDE;

                const res = await generateSimpleGrid(enrichedPrompt, rows, cols, projectAspectRatio, referenceImagesData);

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
                const res = await generateSingleImage(enrichedPrompt, project.settings?.aspectRatio || AspectRatio.WIDE, referenceImagesData, geminiImageSize);
                resultImages = [res];
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
                try {
                    const uploadedResultImages: string[] = [];
                    // Upload main result images
                    for (const img of resultImages) {
                        if (img.startsWith('data:')) {
                            const base64Data = img.split(',')[1];
                            const r2Url = await storageService.uploadBase64ToR2(base64Data, `generated/${user.id}`, undefined, user.id);
                            uploadedResultImages.push(r2Url);
                        } else {
                            uploadedResultImages.push(img);
                        }
                    }

                    // Update Grid Data if needed
                    let uploadedGridData = gridData;
                    if (gridData) {
                        // If we have grid data, we need to ensure fullImage and slices are uploaded
                        // Note: If resultImages was [fullImage], it's already uploaded above.
                        // But slices inside gridData might need uploading if they act as source of truth.
                        // For Scene Mode, resultImages = [fullImage].

                        // We uploaded fullImage in the loop above (index 0).
                        const uploadedFullImage = uploadedResultImages[0];

                        // Upload slices if they aren't the same as resultImages
                        const uploadedSlices: string[] = [];
                        for (const slice of gridData.slices) {
                            if (slice.startsWith('data:')) {
                                const base64Data = slice.split(',')[1];
                                const r2Url = await storageService.uploadBase64ToR2(base64Data, `generated/${user.id}/slices`, undefined, user.id);
                                uploadedSlices.push(r2Url);
                            } else {
                                uploadedSlices.push(slice);
                            }
                        }

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

                    // Persist to Database
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
                            images: uploadedResultImages,
                            model: selectedModel,
                            gridData: uploadedGridData ? {
                                ...uploadedGridData,
                                gridRows: uploadedGridData.gridRows || 2,
                                gridCols: uploadedGridData.gridCols || 2,
                                gridSize: uploadedGridData.gridSize || '2x2',
                                prompt: uploadedGridData.prompt || '',
                                aspectRatio: uploadedGridData.aspectRatio || AspectRatio.WIDE,
                            } : undefined,
                            referenceImages: allRefUrls
                        },
                        createdAt: assistantMessage.timestamp,
                        updatedAt: assistantMessage.timestamp,
                    });

                    // Save to Shot History (if Shot Mode Grid)
                    if (selectedShotId && selectedModel === 'gemini-grid' && !uploadedGridData) {
                        // !uploadedGridData means we are in Shot Mode (Batch)
                        // We save ALL slices to history
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
                }
            })();

        } catch (error: any) {
            console.error('Generation failed:', error);
            toast.error(`生成失败: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        isGenerating,
        setIsGenerating,
        handleSend
    };
}
