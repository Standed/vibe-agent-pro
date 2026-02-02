import { useState, useEffect, useCallback, useRef } from 'react';
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
export function useSoraVideoMessages(projectId?: string, shotId?: string, includePending: boolean = false) {
    const [videoMessages, setVideoMessages] = useState<VideoMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const loadVideoMessages = useCallback(async () => {
        if (!projectId || !shotId) {
            setVideoMessages([]);
            return;
        }

        // 取消上一次未完成的请求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        // 创建新的控制器
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const url = `/api/sora/tasks?projectId=${projectId}&shotId=${shotId}${includePending ? '&includePending=1' : ''}`;
            const response = await authenticatedFetch(url, { signal: controller.signal });

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
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('[useSoraVideoMessages] Request aborted');
                return;
            }
            console.error('[useSoraVideoMessages] Failed to load video tasks:', err);
            setError(err instanceof Error ? err : new Error('Failed to load video tasks'));
        } finally {
            // 只有当前控制器的请求结束时才关闭 loading
            if (abortControllerRef.current === controller) {
                setLoading(false);
            }
        }
    }, [projectId, shotId, includePending]);

    useEffect(() => {
        loadVideoMessages();
        // 组件卸载时取消请求
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [loadVideoMessages]);

    return {
        videoMessages,
        loading,
        error,
        refresh: loadVideoMessages
    };
}
