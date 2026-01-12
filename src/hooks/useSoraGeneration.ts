import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { replaceSoraCharacterCodes } from '@/utils/soraCharacterReplace';
import { Project, ChatPanelMessage } from '@/types/project';
import { generateMessageId } from '@/lib/utils';

interface UseSoraGenerationProps {
    project: Project | null;
    user: any;
    selectedModel: string;
    soraAspectRatio: string;
    soraDuration: number;
    setMessages: React.Dispatch<React.SetStateAction<ChatPanelMessage[]>>;
    setIsGenerating: (isGenerating: boolean) => void;
    setInputText: (text: string) => void;
    setUploadedImages: (images: File[]) => void;
    setManualReferenceUrls: (urls: string[]) => void;
}

export function useSoraGeneration({
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
}: UseSoraGenerationProps) {

    const generateSoraVideo = useCallback(async (
        userMessageContent: string,
        uploadedUrls: string[],
        manualReferenceUrls: string[],
        currentShotId?: string,
        currentSceneIdCaptured?: string
    ) => {
        if (selectedModel !== 'sora-video') return;

        const resolution = soraAspectRatio === '16:9' ? '1280x720' : '720x1280';

        // 角色@提及替换
        const characters = project?.characters || [];
        const { result: processedPrompt, replacements } = replaceSoraCharacterCodes(
            userMessageContent,
            characters
        );

        if (replacements.length > 0) {
            const replaceInfo = replacements.map(r => `${r.from} → ${r.to}`).join(', ');
            toast.info(`角色替换: ${replaceInfo}`);
        }

        try {
            const response = await fetch('/api/sora/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: processedPrompt,
                    model: 'sora-2',
                    seconds: soraDuration,
                    size: resolution,
                    input_reference: [...(uploadedUrls.length > 0 ? uploadedUrls : []), ...manualReferenceUrls],
                    projectId: project?.id,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '视频生成请求失败');
            }

            const taskId = result.taskId;

            // 任务已提交，显示初始消息 (移除 Task ID 显示)
            const assistantMsgId = generateMessageId();
            const assistantMessage: ChatPanelMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: `Sora 视频生成中...`,
                timestamp: new Date(),
                model: selectedModel,
                shotId: currentShotId || undefined,
                sceneId: currentSceneIdCaptured || undefined,
                metadata: { soraTaskId: taskId },
            };
            setMessages(prev => [...prev, assistantMessage]);
            toast.success('Sora 视频任务已提交，预计需要2-5分钟');

            // 清空输入和参考图
            setInputText('');
            setUploadedImages([]);
            setManualReferenceUrls([]);
            setIsGenerating(false);

            // 启动后台轮询任务状态
            if (taskId) {
                const pollTask = async () => {
                    // 策略优化：先等待120秒，然后每10秒轮询一次，最长15分钟
                    await new Promise(r => setTimeout(r, 120000));

                    const maxAttempts = 90; // (15*60 - 120) / 10 ≈ 78
                    for (let i = 0; i < maxAttempts; i++) {
                        try {
                            const statusRes = await fetch(`/api/sora/status?taskId=${taskId}`);
                            if (!statusRes.ok) {
                                await new Promise(r => setTimeout(r, 10000));
                                continue;
                            }
                            const statusData = await statusRes.json();

                            if (statusData.status === 'completed' && statusData.videoUrl) {
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? {
                                            ...m,
                                            content: 'Sora 视频生成完成！',
                                            videoUrl: statusData.videoUrl
                                        }
                                        : m
                                ));
                                toast.success('Sora 视频生成完成！');
                                return;
                            } else if (statusData.status === 'failed') {
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: `视频生成失败: ${statusData.error || '未知错误'}` }
                                        : m
                                ));
                                toast.error('Sora 视频生成失败');
                                return;
                            } else {
                                const progress = statusData.progress || 0;
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: `Sora 视频生成中... ${progress}%` }
                                        : m
                                ));
                            }
                        } catch (e) {
                            console.warn('Sora status poll error:', e);
                        }
                        await new Promise(r => setTimeout(r, 10000));
                    }
                };
                pollTask();
            }
        } catch (soraError: any) {
            const errorMsgId = generateMessageId();
            const errorMessage: ChatPanelMessage = {
                id: errorMsgId,
                role: 'assistant',
                content: `Sora 视频生成失败: ${soraError.message}`,
                timestamp: new Date(),
                model: selectedModel,
                shotId: currentShotId || undefined,
                sceneId: currentSceneIdCaptured || undefined,
            };
            setMessages(prev => [...prev, errorMessage]);
            toast.error(`Sora 生成失败: ${soraError.message}`);
            setIsGenerating(false);
        }
    }, [project, user, selectedModel, soraAspectRatio, soraDuration, setMessages, setIsGenerating, setInputText, setUploadedImages, setManualReferenceUrls]);

    return { generateSoraVideo };
}
