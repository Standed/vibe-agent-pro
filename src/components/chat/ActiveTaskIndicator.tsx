'use client';

import { useProjectStore, ActiveTask } from '@/store/useProjectStore';
import { Loader2, Image as ImageIcon, Video } from 'lucide-react';
import { useEffect, useState } from 'react';

const MODEL_LABELS: Record<ActiveTask['model'], string> = {
    jimeng: '即梦',
    gemini: 'Gemini',
    'gemini-grid': 'Gemini Grid',
    seedream: 'SeeDream',
    sora: 'Sora',
    vidu: 'Vidu'
};

interface ActiveTaskIndicatorProps {
    shotId: string | null;
}

export function ActiveTaskIndicator({ shotId }: ActiveTaskIndicatorProps) {
    const { activeTasks } = useProjectStore();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // 获取当前分镜的进行中任务
    const currentTasks: ActiveTask[] = [];
    const normalizedShotId = shotId || '';  // null/undefined 转为空字符串
    activeTasks.forEach((task) => {
        if (task.shotId === normalizedShotId) {
            currentTasks.push(task);
        }
    });

    // 更新耗时计时器
    useEffect(() => {
        if (currentTasks.length === 0) {
            setElapsedSeconds(0);
            return;
        }

        const interval = setInterval(() => {
            const oldestTask = currentTasks.reduce((oldest, t) =>
                t.startTime < oldest.startTime ? t : oldest
            );
            setElapsedSeconds(Math.floor((Date.now() - oldestTask.startTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [currentTasks.length, shotId]);

    if (currentTasks.length === 0) return null;

    // 按类型分组
    const imageTasks = currentTasks.filter(t => t.type === 'image');
    const videoTasks = currentTasks.filter(t => t.type === 'video');

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    return (
        <div className="px-4 py-3 bg-gradient-to-r from-light-accent/10 to-transparent dark:from-cine-accent/10 border-b border-light-accent/20 dark:border-cine-accent/20">
            <div className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-light-accent dark:text-cine-accent" />
                <div className="flex-1 text-sm">
                    {imageTasks.length > 0 && (
                        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                            <ImageIcon size={14} />
                            <span>
                                {imageTasks.map(t => MODEL_LABELS[t.model]).join(', ')} 图片生成中...
                            </span>
                        </div>
                    )}
                    {videoTasks.length > 0 && (
                        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mt-1">
                            <Video size={14} />
                            <span>
                                {videoTasks.map(t => MODEL_LABELS[t.model]).join(', ')} 视频生成中...
                            </span>
                        </div>
                    )}
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    已耗时 {formatTime(elapsedSeconds)}
                </span>
            </div>
        </div>
    );
}
