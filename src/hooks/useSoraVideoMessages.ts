import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

export interface VideoMessage {
    id: string;
    role: 'assistant';
    content: string;
    timestamp: Date;
    videoUrl: string;
    shotId: string;
    metadata: {
        type: 'sora_video_complete';
        videoUrl: string;
        taskId: string;
        model: string;
        prompt: string;
        source: 'agent' | 'pro';
    };
}

/**
 * 从 sora_tasks 表加载已完成的视频任务，转换为消息格式
 * 通过 API 路由获取数据，确保正确的权限验证
 */
export function useSoraVideoMessages(projectId?: string, shotId?: string) {
    const [videoMessages, setVideoMessages] = useState<VideoMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const loadVideoMessages = useCallback(async () => {
        if (!projectId || !shotId) {
            setVideoMessages([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const url = `/api/sora/tasks?projectId=${projectId}&shotId=${shotId}`;
            const response = await authenticatedFetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch video tasks: ${response.status}`);
            }

            const data = await response.json();

            // 转换 timestamp 为 Date 对象
            const messages: VideoMessage[] = (data.videoMessages || []).map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            }));

            // 按时间排序（最新的在后面）
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            setVideoMessages(messages);
        } catch (err) {
            console.error('[useSoraVideoMessages] Failed to load video tasks:', err);
            setError(err instanceof Error ? err : new Error('Failed to load video tasks'));
        } finally {
            setLoading(false);
        }
    }, [projectId, shotId]);

    useEffect(() => {
        loadVideoMessages();
    }, [loadVideoMessages]);

    return {
        videoMessages,
        loading,
        error,
        refresh: loadVideoMessages
    };
}
