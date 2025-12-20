import { useState } from 'react';
import { toast } from 'sonner';
import { jimengService } from '@/services/jimengService';
import { JimengModel, JimengResolution } from '@/components/jimeng/JimengOptions';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { storageService } from '@/lib/storageService';
import { dataService } from '@/lib/dataService';
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

    const generateImage = async (
        prompt: string,
        capturedShotId: string | null,
        capturedSceneId: string | null,
        capturedContextKey: string,
        extraImageUrls: string[] = [],
        autoSelect: boolean = false
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

        const { enrichedPrompt: promptForModel, referenceImageUrls, usedCharacters, usedLocations } = enrichPromptWithAssets(prompt, project, undefined);
        const projectAspectRatio = project?.settings.aspectRatio || AspectRatio.WIDE;

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
        setContext({
            prompt: promptForModel,
            basePrompt: prompt,
            shotId: capturedShotId,
            sceneId: capturedSceneId,
            contextKey: capturedContextKey,
            referenceImages: allReferenceUrls,
            skipAssetRefs: false
        });

        toast.info(`即梦任务已提交 (${model}, ${resolution})，正在后台生成...`, { duration: 3000 });

        // Return the promise so the caller can await it
        return jimengService.generateImage({
            prompt: promptForModel,
            model: model,
            aspectRatio: projectAspectRatio,
            sessionid,
            imageUrls: allReferenceUrls,
            resolutionType: resolution
        }).then(async (genResult) => {
            const historyId = genResult.data?.aigc_data?.history_record_id;
            if (!historyId) {
                throw new Error('即梦任务提交失败：' + (genResult.errmsg || '未知错误'));
            }

            // 轮询
            const pollResult = await jimengService.pollTask(historyId, sessionid);
            const urls = pollResult.urls || [pollResult.url];

            if (urls.length > 0) {
                setGeneratedImages(urls);
                if (autoSelect) {
                    // 自动选择第一张并保存
                    toast.info('Agent 自动选择第一张图片保存...');

                    // 重新构建 context 用于保存
                    const tempContext = {
                        prompt: promptForModel,
                        basePrompt: prompt,
                        shotId: capturedShotId,
                        sceneId: capturedSceneId,
                        contextKey: capturedContextKey,
                        referenceImages: allReferenceUrls,
                        skipAssetRefs: false
                    };
                    setContext(tempContext); // 保持状态同步

                    await saveImage(urls[0], tempContext);
                } else {
                    setIsModalOpen(true);
                    toast.success('即梦图片生成完成，请选择一张保存');
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
            // Upload to R2
            try {
                const folder = `projects/${project.id}/shots/${activeContext.shotId || 'chat'}`;

                if (imageUrl.startsWith('http')) {
                    // Fetch and convert to File
                    let blob: Blob;
                    try {
                        const response = await fetch(imageUrl);
                        if (!response.ok) throw new Error('Network response was not ok');
                        blob = await response.blob();
                    } catch (e) {
                        console.warn('Direct fetch failed, trying proxy...', e);
                        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
                        const response = await fetch(proxyUrl);
                        if (!response.ok) throw new Error('Proxy fetch failed');
                        blob = await response.blob();
                    }

                    const file = new File([blob], `gen_${Date.now()}.png`, { type: blob.type });

                    // Upload using uploadFile
                    const result = await storageService.uploadFile(file, folder, user.id);
                    imageUrl = result.url;
                } else {
                    // Assume Base64
                    imageUrl = await storageService.uploadBase64ToR2(imageUrl, folder, `gen_${Date.now()}.png`, user.id);
                }
            } catch (error) {
                console.error('R2 upload failed, using original url:', error);
            }

            // Update shot if selected
            if (activeContext.shotId) {
                updateShot(activeContext.shotId, {
                    referenceImage: imageUrl,
                    status: 'done',
                });

                // Add to history
                const historyItem: GenerationHistoryItem = {
                    id: `gen_${Date.now()}`,
                    type: 'image',
                    timestamp: new Date(),
                    result: imageUrl,
                    prompt: activeContext.prompt,
                    parameters: {
                        model: model,
                        aspectRatio: project.settings.aspectRatio,
                    },
                    status: 'success',
                };
                addGenerationHistory(activeContext.shotId, historyItem);
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

            // 只有当上下文匹配时才添加到当前视图（这里简化处理，直接添加，因为 ChatPanel 会过滤）
            // 但由于 setMessages 是传入的，通常就是当前视图的 setter
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

            toast.success('图片已保存！');
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
