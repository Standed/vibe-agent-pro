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
import { AspectRatio } from '@/types/project';

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

    const { project, updateShot } = useProjectStore();
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

        const { referenceImageUrls, usedCharacters, usedLocations } = enrichPromptWithAssets(prompt, project, undefined, options);
        // User Request: Pro模式下提示词“所见即所得”，不进行自动扩写
        const promptForModel = prompt;
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
        // Combine manual uploads + manual history + asset refs (Order matches UI: Files -> History -> Auto)
        const allReferenceUrls = Array.from(new Set([...extraImageUrls, ...manualReferenceUrls, ...referenceImageUrls, ...mentionedImageUrls]));

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

        // toast.info(`即梦任务已提交 (${model}, ${resolution})，正在后台生成...`, { duration: 3000 });

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
            const rawUrls = [
                ...(pollResult.urls || []),
                ...(pollResult.url ? [pollResult.url] : [])
            ].filter(Boolean);
            const urls = rawUrls.slice(0, 4);

            if (urls.length > 0) {
                const persistPromise = (async () => {
                    const r2Urls: string[] = [];
                    if (capturedShotId) {
                        for (const url of urls) {
                            try {
                                const r2Url = await uploadToR2(url, capturedShotId);
                                r2Urls.push(r2Url);
                            } catch (e) {
                                console.error('Auto persist failed for url:', url, e);
                                r2Urls.push(url); // Fallback to original
                            }
                        }
                    } else {
                        r2Urls.push(...urls);
                    }

                    // 生成并显示单一聚合消息 (2x2 Grid)
                    const assistantMessage: ChatMessage = {
                        id: generateMessageId(),
                        role: 'assistant',
                        content: `即梦为您生成了 ${r2Urls.length} 张图片`,
                        timestamp: new Date(),
                        images: r2Urls,
                        model: 'jimeng',
                        shotId: capturedShotId || undefined,
                        sceneId: capturedSceneId || undefined,
                        metadata: {
                            prompt: promptForModel,
                            basePrompt: prompt,
                            model: 'jimeng',
                            jimengModel: model,
                            jimengResolution: resolution,
                            referenceImages: allReferenceUrls,
                            images: r2Urls
                        }
                    };

                    setMessages(prev => [...prev, assistantMessage]);

                    // 持久化聊天记录
                    await dataService.saveChatMessage({
                        id: assistantMessage.id,
                        userId: user!.id,
                        projectId: project!.id,
                        scope: capturedShotId ? 'shot' : capturedSceneId ? 'scene' : 'project',
                        shotId: capturedShotId || undefined,
                        sceneId: capturedSceneId || undefined,
                        role: 'assistant',
                        content: assistantMessage.content,
                        timestamp: assistantMessage.timestamp,
                        metadata: assistantMessage.metadata,
                        createdAt: assistantMessage.timestamp,
                        updatedAt: assistantMessage.timestamp,
                    });

                    if (r2Urls.length > 0) {
                        setGeneratedImages(r2Urls);
                    }
                    return r2Urls;
                })();

                setGeneratedImages(urls);

                // 触发后台持久化 (确保 R2 上传完成)
                persistPromise.then(r2Urls => {
                    if (r2Urls.length > 0) {
                        console.log('jimeng Images persisted to R2 and History');
                    }
                });
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
                toast.success('已应用到分镜');
            }

            // Add assistant message (仅当手动保存时添加一条确认消息，或者不添加？)
            // 用户反馈希望聚合显示，所以 generateImage 已经添加了。
            // 这里 manual save 主要是应用到分镜。
            // 如果我们也加一条消息，会显得冗余？
            // 之前的逻辑是 saveImage 负责加消息。
            // 现在 generateImage 负责加 Grid 消息。
            // 那么 saveImage 只负责 updateShot 即可。

            // 为了反馈明确，可以加一条简短的 system message 或者 update 原 grid message?
            // 暂时保持简单：只更新分镜，不发新消息。除非用户觉得没反馈。
            // 但原来的逻辑是 saveImage 发消息。
            // 我们保留 saveImage 发消息逻辑，但内容要是 "已应用到分镜"。

            const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `已将即梦生成的图片应用到当前分镜`, // 简化文案
                timestamp: new Date(),
                images: [imageUrl], // 显示被选中的那张
                model: 'jimeng',
                shotId: activeContext.shotId || undefined,
                sceneId: activeContext.sceneId || undefined,
                metadata: {
                    prompt: activeContext.prompt,
                    basePrompt: activeContext.basePrompt,
                    model: 'jimeng',
                    jimengModel: model,
                    jimengResolution: resolution,
                    referenceImages: activeContext.referenceImages,
                    action: 'applied_to_shot' // new metadata
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
                    metadata: assistantMessage.metadata,
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
