/**
 * useApplyVideoToShot
 * 
 * 处理视频应用到分镜的复杂逻辑
 * 包括历史记录去重、乐观更新、异步保存
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { dataService } from '@/lib/dataService';
import { Project, Shot, ChatPanelMessage } from '@/types/project';

interface UseApplyVideoToShotProps {
    project: Project | null;
    selectedShotId: string | null;
    selectedShot: Shot | undefined;
    currentSceneId: string | null;
    updateShot: (shotId: string, updates: Partial<Shot>) => void;
}

export function useApplyVideoToShot({
    project,
    selectedShotId,
    selectedShot,
    currentSceneId,
    updateShot,
}: UseApplyVideoToShotProps) {

    const handleApplyVideoToShot = useCallback(async (message: ChatPanelMessage) => {
        const videoUrl = message.videoUrl || message.metadata?.videoUrl;
        const taskId = message.metadata?.taskId || message.metadata?.viduTaskId || message.metadata?.soraTaskId;

        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        if (!videoUrl) {
            toast.error("无效的视频链接");
            return;
        }

        try {
            // 从数据库获取最新的 Shot 数据，确保不丢失历史记录
            const latestShot = await dataService.getShot(selectedShotId);
            const currentHistory = latestShot?.generationHistory || [];
            const sceneId =
                latestShot?.sceneId ||
                selectedShot?.sceneId ||
                currentSceneId ||
                project?.scenes?.[0]?.id;

            if (!sceneId) {
                toast.error("未找到场景信息");
                return;
            }

            // 检查历史记录去重
            const alreadyExists = currentHistory.some((h: any) => h.result === videoUrl);

            let updatedHistory = currentHistory;
            if (!alreadyExists) {
                const newHistoryItem = {
                    id: `sora_pro_${Date.now()}`,
                    type: 'video' as const,
                    timestamp: new Date(),
                    result: videoUrl,
                    prompt: message.metadata?.prompt || 'Sora Pro Mode Generation',
                    parameters: {
                        model: 'sora-video',
                        source: 'pro-chat',
                        taskId: taskId
                    },
                    status: 'success' as const
                };
                updatedHistory = [newHistoryItem, ...currentHistory];
            }

            // 1. 立即更新前端状态 (Optimistic Update)
            updateShot(selectedShotId, {
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any);
            toast.success("视频已应用到当前分镜");

            // 2. 后台异步保存到数据库 (不阻塞 UI)
            const saveShotPromise = dataService.saveShot(sceneId, {
                id: selectedShotId,
                videoClip: videoUrl,
                status: 'done',
                generationHistory: updatedHistory
            } as any);

            // 3. 如果有 taskId，绑定任务到分镜
            if (taskId) {
                dataService.getSoraTasks(project?.id || '').then(async (tasks) => {
                    const task = tasks.find(t => t.id === taskId);
                    if (task) {
                        const updatedTask = { ...task, shotId: selectedShotId, updatedAt: new Date() };
                        await dataService.saveSoraTask(updatedTask);
                    }
                }).catch(err => console.error('Failed to bind task:', err));
            }

            await saveShotPromise;

        } catch (e) {
            console.error('Apply video to shot error:', e);
            toast.error("应用视频失败");
        }
    }, [project, selectedShotId, selectedShot, currentSceneId, updateShot]);

    return { handleApplyVideoToShot };
}
