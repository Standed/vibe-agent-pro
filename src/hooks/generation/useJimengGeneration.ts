import { useState } from 'react';
import { toast } from 'sonner';
import { jimengService } from '@/services/jimengService';
import { JimengModel, JimengResolution } from '@/components/jimeng/JimengOptions';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { storageService } from '@/lib/storageService';
import { dataService } from '@/lib/dataService';
import type { R2PathContext } from '@/lib/r2-path';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { AspectRatio, GenerationHistoryItem } from '@/types/project';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
    referenceImages?: string[];
    model?: any;
    shotId?: string;
    sceneId?: string;
    metadata?: any;
}

interface UseJimengGenerationProps {
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    manualReferenceUrls: string[];
    mentionedAssets: { characters: any[]; locations: any[] };
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

export function useJimengGeneration({
    setMessages,
    manualReferenceUrls,
    mentionedAssets
}: UseJimengGenerationProps) {
    const [model, setModel] = useState<JimengModel>('jimeng-4.0');
    const [resolution, setResolution] = useState<JimengResolution>('2k');
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [context, setContext] = useState<{
        prompt: string;
        basePrompt: string;
        shotId: string | null;
        sceneId: string | null;
        contextKey: string;
        referenceImages: string[];
        skipAssetRefs: boolean;
    } | null>(null);

    const { project, updateShot, addGenerationHistory } = useProjectStore();
    const { user } = useAuth();

    // 提取上传逻辑
    const uploadToR2 = async (url: string, shotId: string): Promise<string> => {
        if (!user) throw new Error('User not authenticated');

        // 如果已经是 R2 链接，直接返回
        const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
        if (r2PublicUrl && url.startsWith(r2PublicUrl)) {
            return url;
        }
        if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage')) {
            return url;
        }

        const folder: R2PathContext = {
            projectId: project?.id,
            scope: 'shots',
            entityId: shotId,
            assetType: 'image',
            model: 'jimeng'
        };
        let blob: Blob;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            blob = await response.blob();
        } catch (e) {
            console.warn('Direct fetch failed, trying proxy...', e);
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Proxy fetch failed');
            blob = await response.blob();
        }

        const file = new File([blob], `gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`, { type: blob.type });
        const result = await storageService.uploadFile(file, folder, user.id);
        return result.url;
    };

    const generateImage = async (
        prompt: string,
        capturedShotId: string | null,
        capturedSceneId: string | null,
        capturedContextKey: string,
        extraImageUrls: string[] = [],
        autoSelect: boolean = false,
        options?: { onlyExtractRefs?: boolean }
    ) => {
        const sessionid = localStorage.getItem('jimeng_session_id');
        if (!sessionid) {
            toast.error('请先在设置中配置即梦 sessionid', {
                description: '进入设置 → API 配置 → 即梦 Session ID'
            });
            throw new Error('未配置即梦 sessionid');
        }

        if (!project) {
            toast.error('未找到项目信息');
            return;
        }

        const { enrichedPrompt: promptForModel, referenceImageUrls, usedCharacters, usedLocations } = enrichPromptWithAssets(prompt, project, undefined, options);
        const projectAspectRatio = project?.settings.aspectRatio || AspectRatio.WIDE;
        const uploadContext: R2PathContext = {
            projectId: project.id,
            scope: capturedShotId ? 'shots' : capturedSceneId ? 'scenes' : 'project',
            entityId: capturedShotId || capturedSceneId || project.id,
            assetType: 'image',
            model: 'jimeng'
        };

        // 收集所有参考图
        const mentionedImageUrls: string[] = [
            ...mentionedAssets.characters.flatMap(c => c.referenceImages || []),
            ...mentionedAssets.locations.flatMap(l => l.referenceImages || []),
        ];
        // Combine manual uploads + asset refs + extra uploaded images
        const allReferenceUrls = Array.from(new Set([...referenceImageUrls, ...mentionedImageUrls, ...manualReferenceUrls, ...extraImageUrls]));

        // 显示使用的资源提示
        if (allReferenceUrls.length > 0) {
            const assetInfo = [];
            if (usedCharacters.length > 0) assetInfo.push(`角色: ${usedCharacters.map(c => c.name).join(', ')}`);
            if (usedLocations.length > 0) assetInfo.push(`场景: ${usedLocations.map(l => l.name).join(', ')}`);

            toast.info('正在使用资源库参考', {
                description: assetInfo.length > 0 ? assetInfo.join(' | ') : '已包含参考图'
            });
        }

        // 保存上下文
        const currentContext = {
            prompt: promptForModel,
            basePrompt: prompt,
            shotId: capturedShotId,
            sceneId: capturedSceneId,
            contextKey: capturedContextKey,
            referenceImages: allReferenceUrls,
            skipAssetRefs: false
        };
        setContext(currentContext);

        toast.info(`即梦任务已提交 (${model}, ${resolution})，正在后台生成...`, { duration: 3000 });

        // Return the promise so the caller can await it
        return jimengService.generateImage({
            prompt: promptForModel,
            model: model,
            aspectRatio: projectAspectRatio,
            sessionid,
            imageUrls: allReferenceUrls,
            resolutionType: resolution,
            uploadContext
        }).then(async (genResult) => {
            const historyId = genResult.data?.aigc_data?.history_record_id;
            if (!historyId) {
                throw new Error('即梦任务提交失败：' + (genResult.errmsg || '未知错误'));
            }

            // 轮询
            const pollResult = await jimengService.pollTask(historyId, sessionid, 60, uploadContext);
            const urls = pollResult.urls || [pollResult.url];

            if (urls.length > 0) {
                // 立即在后台处理持久化和历史记录
                // 注意：这里不 await，以免阻塞 UI 显示
                const persistPromise = (async () => {
                    if (capturedShotId) {
                        const r2Urls: string[] = [];
                        for (const url of urls) {
                            try {
                                const r2Url = await uploadToR2(url, capturedShotId);
                                r2Urls.push(r2Url);

                                // 添加到历史记录
                                const historyItem: GenerationHistoryItem = {
                                    id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    type: 'image',
                                    timestamp: new Date(),
                                    result: r2Url,
                                    prompt: promptForModel,
                                    parameters: {
                                        model: model,
                                        aspectRatio: projectAspectRatio,
                                    },
                                    status: 'success',
                                };
                                addGenerationHistory(capturedShotId, historyItem);
                            } catch (e) {
                                console.error('Auto persist failed for url:', url, e);
                                r2Urls.push(url); // Fallback to original
                            }
                        }
                        // 更新 UI 显示为 R2 URL (如果成功)
                        if (r2Urls.length > 0) {
                            setGeneratedImages(r2Urls);
                        }
                        return r2Urls;
                    }
                    return urls;
                })();

                // 先显示原始 URL (或等待持久化完成，为了体验流畅，先显示)
                // 但为了避免 saveImage 时重复上传，最好是等待一下或者让 saveImage 智能判断
                // 这里我们选择：先显示原始 URL，后台静默上传。
                // 当用户点击保存时，saveImage 会检查是否已经是 R2 URL。
                // 但为了确保 generatedImages 最终是 R2 URL，我们需要在 persistPromise 完成后更新状态。

                setGeneratedImages(urls); // 先显示，让用户能看到

                if (autoSelect) {
                    toast.info('Agent 自动选择第一张图片保存...');
                    // 等待持久化完成，确保拿到 R2 URL
                    const finalUrls = await persistPromise;
                    await saveImage(finalUrls[0], currentContext);
                } else {
                    // Pro 模式修改：不再弹出选择窗口，而是直接保存到历史记录
                    // setIsModalOpen(true); <--- Removed

                    // toast.success('即梦图片已生成并保存至历史记录');

                    // 触发后台持久化 (确保 R2 上传完成)
                    persistPromise.then(r2Urls => {
                        if (r2Urls.length > 0) {
                            console.log('jimeng Images persisted to R2 and History');
                        }
                    });
                }
            } else {
                throw new Error('未返回图片 URL');
            }
        }).catch(err => {
            console.error('[Jimeng] Generation failed:', err);
            toast.error('即梦生成失败: ' + err.message);
            throw err; // Re-throw to let caller know it failed
        });
    };

    const saveImage = async (selectedUrl: string, manualContext?: any) => {
        const activeContext = manualContext || context;
        if (!activeContext || !user || !project) return;

        setIsSaving(true);
        let imageUrl = selectedUrl;

        try {
            // 检查是否需要上传 (如果已经是 R2 URL 则跳过)
            if (!imageUrl.includes('r2.dev') && !imageUrl.includes('r2.cloudflarestorage')) {
                try {
                    imageUrl = await uploadToR2(imageUrl, activeContext.shotId || 'chat');
                } catch (error) {
                    console.error('R2 upload failed in saveImage, using original url:', error);
                }
            }

            // Update shot if selected
            if (activeContext.shotId) {
                updateShot(activeContext.shotId, {
                    referenceImage: imageUrl,
                    status: 'done',
                });

                // 注意：历史记录已经在 generateImage 中自动添加了
                // 这里不需要重复添加，除非我们想标记"被选中"的状态
                // 目前 GenerationHistoryItem 没有"selected"状态，所以不重复添加
                toast.success('已应用到分镜');
            }

            // Add assistant message
            const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `已使用 ${model} 生成图片`,
                timestamp: new Date(),
                images: [imageUrl],
                model: 'jimeng',
                shotId: activeContext.shotId || undefined,
                sceneId: activeContext.sceneId || undefined,
                metadata: {
                    prompt: activeContext.prompt,
                    basePrompt: activeContext.basePrompt,
                    model: 'jimeng',
                    jimengModel: model,
                    jimengResolution: resolution,
                    referenceImages: activeContext.referenceImages
                }
            };

            setMessages(prev => [...prev, assistantMessage]);

            // Save to cloud
            try {
                await dataService.saveChatMessage({
                    id: assistantMessage.id,
                    userId: user.id,
                    projectId: project.id,
                    scope: activeContext.shotId ? 'shot' : activeContext.sceneId ? 'scene' : 'project',
                    shotId: activeContext.shotId || undefined,
                    sceneId: activeContext.sceneId || undefined,
                    role: 'assistant',
                    content: assistantMessage.content,
                    timestamp: assistantMessage.timestamp,
                    metadata: {
                        images: [imageUrl],
                        model: 'jimeng',
                        referenceImages: activeContext.referenceImages,
                        jimengModel: model,
                        jimengResolution: resolution,
                        prompt: activeContext.prompt,
                        basePrompt: activeContext.basePrompt
                    },
                    createdAt: assistantMessage.timestamp,
                    updatedAt: assistantMessage.timestamp,
                });
            } catch (error) {
                console.error('保存消息失败:', error);
            }

            setIsModalOpen(false);
            setGeneratedImages([]);
            setContext(null);

        } catch (error: any) {
            console.error('保存图片流程失败:', error);
            toast.error('保存图片失败: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return {
        model,
        setModel,
        resolution,
        setResolution,
        generateImage,
        saveImage,
        generatedImages,
        isModalOpen,
        setIsModalOpen,
        isSaving
    };
}
