'use client';

import { memo, useEffect, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Sparkles } from 'lucide-react';

const MODEL_LABELS: Record<string, string> = {
    jimeng: '即梦',
    gemini: 'Gemini',
    'gemini-grid': 'Gemini Grid',
    'gemini-direct': 'Gemini',
    seedream: 'SeeDream',
    sora: 'Sora',
    vidu: 'Vidu'
};

interface GeneratingIndicatorProps {
    shotId: string | null;
    sceneId: string | null;
    selectedModel: string;
}

/**
 * 生成中状态组件 - 独立订阅 Store，避免父组件重渲染
 */
export const GeneratingIndicator = memo(function GeneratingIndicator({
    shotId,
    sceneId,
    selectedModel
}: GeneratingIndicatorProps) {
    const activeTasks = useProjectStore(state => state.activeTasks);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // 获取当前分镜的进行中任务
    const currentTasks: any[] = [];
    const normalizedShotId = shotId || '';
    // const normalizedSceneId = sceneId || '';

    // 筛选逻辑：只显示匹配 shotId 的任务
    activeTasks.forEach((task) => {
        if (task.shotId === normalizedShotId) {
            currentTasks.push(task);
        }
    });

    // 计时器
    useEffect(() => {
        if (currentTasks.length === 0) {
            setElapsedSeconds(0);
            return;
        }
        const interval = setInterval(() => {
            const oldestTask = currentTasks.reduce((oldest, t) =>
                t.startTime < oldest.startTime ? t : oldest
                , currentTasks[0]);
            if (oldestTask) {
                setElapsedSeconds(Math.floor((Date.now() - oldestTask.startTime) / 1000));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [currentTasks.length, shotId]);

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    // 如果有活跃任务，显示详细状态
    if (currentTasks.length > 0) {
        const imageTasks = currentTasks.filter(t => t.type === 'image');
        const videoTasks = currentTasks.filter(t => t.type === 'video');

        // 检测是否只有 pending 任务
        const isAllPending = currentTasks.every(t => t.status === 'pending');

        return (
            <div className="flex w-full mb-6 justify-start animate-pulse">
                <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 bg-zinc-900 dark:bg-white">
                        <Sparkles size={14} className="text-white dark:text-black" />
                    </div>
                    <div className="flex flex-col gap-2 min-w-0 items-start">
                        <div className="px-4 py-3 rounded-2xl shadow-sm border text-sm bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10 rounded-tl-sm backdrop-blur-sm">
                            <div className="flex flex-col gap-1">
                                {isAllPending ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                        <span>正在准备上传...</span>
                                    </div>
                                ) : (
                                    <>
                                        {imageTasks.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                                <span>
                                                    {imageTasks.map(t => MODEL_LABELS[t.model] || t.model).join(', ')} 图片生成中...
                                                </span>
                                            </div>
                                        )}
                                        {videoTasks.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                <span>
                                                    {videoTasks.map(t => MODEL_LABELS[t.model] || t.model).join(', ')} 视频生成中...
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            {!isAllPending && (
                                <p className="text-xs text-zinc-400 mt-2 tabular-nums">
                                    已耗时 {formatTime(elapsedSeconds)}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
});
