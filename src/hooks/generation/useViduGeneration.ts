import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { translateCameraMovement } from '@/utils/translations';
import { ChatPanelMessage } from '@/types/project';
import { generateMessageId } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

interface UseViduGenerationProps {
    project: any;
    user: any;
    selectedShotId: string | null;
    currentSceneId: string | null;
    setMessages: React.Dispatch<React.SetStateAction<ChatPanelMessage[]>>;
    setInputText: (text: string) => void;
    setDroppedReferences: (refs: any[]) => void;
}

export function useViduGeneration({
    project,
    user,
    selectedShotId,
    currentSceneId,
    setMessages,
    setInputText,
    setDroppedReferences
}: UseViduGenerationProps) {
    const { addActiveTask, removeActiveTask } = useProjectStore();
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

    // 状态管理
    const [viduMode, setViduMode] = useState<'img2video' | 'start-end2video' | 'reference2video'>('img2video');
    const [viduDuration, setViduDuration] = useState<number>(5);
    const [viduResolution, setViduResolution] = useState<'720p' | '1080p'>('1080p');
    const [viduOffPeak, setViduOffPeak] = useState(false);

    const generateViduVideo = useCallback(async (
        prompt: string,
        referenceUrls: string[],
        startEndFrames: { startFrame: { url: string } | null, endFrame: { url: string } | null },
        selectedShot: any
    ) => {
        if (!project || !user) return;

        try {
            // 根据 viduMode 构造正确的图片列表
            let viduImages: string[] = [];

            if (viduMode === 'img2video') {
                // 图生视频
                if (referenceUrls.length > 0) {
                    // 仅使用参考图（ChatPanel 负责自动填充）
                    viduImages = [referenceUrls[0]];
                } else {
                    toast.error('图生视频模式需要至少一张图片');
                    return;
                }
            } else if (viduMode === 'start-end2video') {
                // 首尾帧
                if (referenceUrls.length >= 2) {
                    viduImages = referenceUrls.slice(0, 2);
                } else if (!startEndFrames.startFrame || !startEndFrames.endFrame) {
                    toast.error('请设置首帧和尾帧');
                    return;
                } else {
                    viduImages = [startEndFrames.startFrame.url, startEndFrames.endFrame.url];
                }
            } else if (viduMode === 'reference2video') {
                // 参考生视频
                if (!prompt || !prompt.trim()) {
                    toast.error('参考生视频模式需要提示词');
                    return;
                }
                if (referenceUrls.length === 0) {
                    toast.error('参考生视频模式需要至少一张参考图');
                    return;
                }
                viduImages = referenceUrls;
            }

            // 调试日志
            console.log(`[Vidu] Mode: ${viduMode}, Images: ${viduImages.length}`);

            // Auto-append camera movement for video if missing
            let finalPrompt = prompt;
            if (selectedShot?.cameraMovement && selectedShot.cameraMovement !== 'Static') {
                const cnMove = translateCameraMovement(selectedShot.cameraMovement);
                const suffix = `${cnMove}`;
                if (!finalPrompt.includes(suffix) && !finalPrompt.includes(cnMove)) {
                    finalPrompt = `${finalPrompt}，${suffix}`;
                }
            }

            // 调用 API
            const response = await fetch('/api/vidu/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    mode: viduMode,
                    images: viduImages,
                    duration: viduDuration,
                    resolution: viduResolution,
                    off_peak: viduOffPeak,
                    projectId: project.id,
                    shotId: selectedShotId || undefined,
                    sceneId: currentSceneId || undefined,
                    aspect_ratio: project.settings?.aspectRatio || '16:9',
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Vidu 视频生成请求失败');
            }

            // 添加助手消息
            const assistantMsgId = generateMessageId();
            const assistantMessage: ChatPanelMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: `Vidu 视频生成中...`,
                timestamp: new Date(),
                model: 'vidu-video',
                shotId: selectedShotId || undefined,
                sceneId: currentSceneId || undefined,
                metadata: {
                    taskId: result.taskId,
                    viduTaskId: result.taskId,
                    model: 'vidu-video',
                    provider: 'vidu',
                    mode: viduMode
                },
            };
            setMessages(prev => [...prev, assistantMessage]);
            toast.success('Vidu 视频任务已提交');

            // 注册全局任务（切换分镜后仍可追踪）
            const taskId = result.taskId;
            addActiveTask({
                taskId,
                shotId: selectedShotId || '',
                type: 'video',
                model: 'vidu',
                status: 'generating',
                startTime: Date.now(),
                prompt
            });

            // 清理状态
            setInputText('');
            setDroppedReferences([]);

            // 启动后台轮询任务状态（复用 /api/sora/status，内部会处理 Vidu + R2 转存）
            if (result.taskId) {
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
                const abortController = new AbortController();
                abortControllerRef.current = abortController;

                const pollTask = async () => {
                    // 首次等待，避免过早轮询
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(resolve, 25000);
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            reject(new DOMException('Aborted', 'AbortError'));
                        });
                    });

                    const maxAttempts = 90;
                    for (let i = 0; i < maxAttempts; i++) {
                        if (abortController.signal.aborted) return;

                        try {
                            const statusRes = await fetch(`/api/sora/status?taskId=${result.taskId}`, {
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
                                        ? { ...m, content: 'Vidu 视频生成完成！', videoUrl: statusData.videoUrl }
                                        : m
                                ));
                                toast.success('Vidu 视频生成完成！');
                                removeActiveTask(taskId);
                                abortControllerRef.current = null;
                                return;
                            }
                            if (statusData.status === 'failed') {
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: `视频生成失败: ${statusData.error || '未知错误'}` }
                                        : m
                                ));
                                toast.error('Vidu 视频生成失败');
                                removeActiveTask(taskId);
                                abortControllerRef.current = null;
                                return;
                            }

                            const progress = statusData.progress || 0;
                            setMessages(prev => prev.map(m =>
                                m.id === assistantMsgId
                                    ? { ...m, content: `Vidu 视频生成中... ${progress}%` }
                                    : m
                            ));
                        } catch (e: any) {
                            if (e.name === 'AbortError') return;
                            console.warn('[useViduGeneration] Status poll error:', e);
                        }

                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(resolve, 10000);
                            abortController.signal.addEventListener('abort', () => {
                                clearTimeout(timeout);
                                reject(new DOMException('Aborted', 'AbortError'));
                            });
                        }).catch(() => { });
                    }

                    abortControllerRef.current = null;
                };

                pollTask().catch((e) => {
                    if (e.name !== 'AbortError') {
                        console.error('[useViduGeneration] Poll task error:', e);
                    }
                });
            }

        } catch (error: any) {
            toast.error(`Vidu 生成失败: ${error.message}`);
        }
    }, [
        project,
        user,
        viduMode,
        viduDuration,
        viduResolution,
        viduOffPeak,
        selectedShotId,
        currentSceneId,
        setMessages,
        setInputText,
        setDroppedReferences,
    ]);

    return {
        viduMode,
        setViduMode,
        viduDuration,
        setViduDuration,
        viduResolution,
        setViduResolution,
        viduOffPeak,
        setViduOffPeak,
        generateViduVideo
    };
}
