import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
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
    setIsGenerating: (isGenerating: boolean) => void;
}

export function useViduGeneration({
    project,
    user,
    selectedShotId,
    currentSceneId,
    setMessages,
    setInputText,
    setDroppedReferences,
    setIsGenerating
}: UseViduGenerationProps) {
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
                    setIsGenerating(false);
                    return;
                }
            } else if (viduMode === 'start-end2video') {
                // 首尾帧
                if (!startEndFrames.startFrame || !startEndFrames.endFrame) {
                    toast.error('请设置首帧和尾帧');
                    setIsGenerating(false);
                    return;
                }
                viduImages = [startEndFrames.startFrame.url, startEndFrames.endFrame.url];
            } else if (viduMode === 'reference2video') {
                // 参考生视频
                if (referenceUrls.length === 0) {
                    toast.error('参考生视频模式需要至少一张参考图');
                    setIsGenerating(false);
                    return;
                }
                viduImages = referenceUrls;
            }

            // 调试日志
            console.log(`[Vidu] Mode: ${viduMode}, Images: ${viduImages.length}`);

            // 调用 API
            const response = await fetch('/api/vidu/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    mode: viduMode,
                    images: viduImages,
                    duration: viduDuration,
                    resolution: viduResolution,
                    offPeak: viduOffPeak,
                    projectId: project.id,
                    contextShotId: selectedShotId || undefined,
                    contextSceneId: currentSceneId || undefined,
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
                metadata: { viduTaskId: result.taskId },
            };
            setMessages(prev => [...prev, assistantMessage]);
            toast.success('Vidu 视频任务已提交');

            // 清理状态
            setInputText('');
            setDroppedReferences([]);
            setIsGenerating(false);

        } catch (error: any) {
            toast.error(`Vidu 生成失败: ${error.message}`);
            setIsGenerating(false);
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
        setIsGenerating
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
