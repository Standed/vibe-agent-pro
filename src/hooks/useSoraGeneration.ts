import { useState, useCallback, useRef, useEffect } from 'react';
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

interface UseSoraGenerationReturn {
    generateSoraVideo: (
        userMessageContent: string,
        uploadedUrls: string[],
        manualReferenceUrls: string[],
        currentShotId?: string,
        currentSceneIdCaptured?: string
    ) => Promise<void>;
    /** 取消当前轮询 */
    cancelPolling: () => void;
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
}: UseSoraGenerationProps): UseSoraGenerationReturn {
    // AbortController 用于取消轮询
    const abortControllerRef = useRef<AbortController | null>(null);

    // 组件卸载时自动取消轮询
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    const cancelPolling = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

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
                    contextShotId: currentShotId || undefined,
                    contextSceneId: currentSceneIdCaptured || undefined,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '视频生成请求失败');
            }

            const taskId = result.taskId;

            // 任务已提交，显示初始消息
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

            // 启动后台轮询任务状态（带 AbortController）
            if (taskId) {
                // 取消之前的轮询
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
                const abortController = new AbortController();
                abortControllerRef.current = abortController;

                const pollTask = async () => {
                    // 优化：首次等待 30 秒（而非 120 秒），更快响应完成状态
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(resolve, 30000);
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            reject(new DOMException('Aborted', 'AbortError'));
                        });
                    });

                    const maxAttempts = 90;
                    for (let i = 0; i < maxAttempts; i++) {
                        if (abortController.signal.aborted) {
                            console.log('[useSoraGeneration] Polling aborted');
                            return;
                        }

                        try {
                            const statusRes = await fetch(`/api/sora/status?taskId=${taskId}`, {
                                signal: abortController.signal,
                            });
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
                                abortControllerRef.current = null;
                                return;
                            } else if (statusData.status === 'failed') {
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: `视频生成失败: ${statusData.error || '未知错误'}` }
                                        : m
                                ));
                                toast.error('Sora 视频生成失败');
                                abortControllerRef.current = null;
                                return;
                            } else {
                                const progress = statusData.progress || 0;
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: `Sora 视频生成中... ${progress}%` }
                                        : m
                                ));
                            }
                        } catch (e: any) {
                            if (e.name === 'AbortError') {
                                console.log('[useSoraGeneration] Polling aborted');
                                return;
                            }
                            console.warn('Sora status poll error:', e);
                        }

                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(resolve, 10000);
                            abortController.signal.addEventListener('abort', () => {
                                clearTimeout(timeout);
                                reject(new DOMException('Aborted', 'AbortError'));
                            });
                        }).catch(() => { });
                    }

                    // 轮询超时，清理 ref
                    abortControllerRef.current = null;
                };

                pollTask().catch((e) => {
                    if (e.name !== 'AbortError') {
                        console.error('[useSoraGeneration] Poll task error:', e);
                    }
                });
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
    }, [project, selectedModel, soraAspectRatio, soraDuration, setMessages, setIsGenerating, setInputText, setUploadedImages, setManualReferenceUrls]);

    return { generateSoraVideo, cancelPolling };
}

