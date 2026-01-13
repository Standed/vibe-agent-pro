'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import type { SoraTask, Shot } from '@/types/project';
import { toast } from 'sonner';

/**
 * Sora 任务统一管理 Hook
 * 
 * 解决问题：
 * 1. Map 键统一使用 task.id，避免键变化导致的状态错乱
 * 2. 提供辅助索引按 shotId 快速查找任务
 * 3. 统一轮询逻辑，避免重复请求
 * 4. 提供 AbortController 支持请求取消
 */

interface UseSoraTaskManagerOptions {
    /** 是否启用自动轮询 */
    enablePolling?: boolean;
    /** 轮询间隔（毫秒） */
    pollingInterval?: number;
    /** 是否在任务完成时自动同步到分镜 */
    autoSyncToShots?: boolean;
}

interface UseSoraTaskManagerReturn {
    /** 任务 Map（以 task.id 为键） */
    soraTasks: Map<string, SoraTask>;
    /** 任务列表（按状态排序） */
    soraTaskList: SoraTask[];
    /** 任务统计 */
    taskCounts: { queued: number; processing: number; completed: number; failed: number };
    /** 按 shotId 获取相关任务 */
    getTasksForShot: (shotId: string) => SoraTask[];
    /** 获取分镜的最佳视频（按 updatedAt 排序） */
    getBestVideoForShot: (shotId: string) => string | undefined;
    /** 刷新单个任务 */
    refreshTask: (taskId: string, notify?: boolean) => Promise<void>;
    /** 刷新所有进行中的任务 */
    refreshAllTasks: () => Promise<void>;
    /** 绑定任务到分镜 */
    bindTaskToShot: (task: SoraTask, shotId: string) => Promise<void>;
    /** 是否正在加载 */
    isLoading: boolean;
}

export function useSoraTaskManager(options: UseSoraTaskManagerOptions = {}): UseSoraTaskManagerReturn {
    const {
        enablePolling = true,
        pollingInterval = 5000,
        autoSyncToShots = true,
    } = options;

    const { user } = useAuth();
    const { project, updateShot } = useProjectStore();

    // 核心状态：以 task.id 为键的 Map
    const [soraTasks, setSoraTasks] = useState<Map<string, SoraTask>>(new Map());
    const [isLoading, setIsLoading] = useState(false);

    // 用于防止重复同步
    const syncedTaskIdsRef = useRef(new Set<string>());
    const notifiedTaskIdsRef = useRef(new Set<string>());
    const abortControllerRef = useRef<AbortController | null>(null);

    // 辅助索引：shotId -> taskIds
    const tasksByShotId = useMemo(() => {
        const map = new Map<string, Set<string>>();
        soraTasks.forEach((task) => {
            const shotIds = task.shotIds?.length ? task.shotIds : (task.shotId ? [task.shotId] : []);
            shotIds.forEach((shotId) => {
                if (!map.has(shotId)) {
                    map.set(shotId, new Set());
                }
                map.get(shotId)!.add(task.id);
            });
        });
        return map;
    }, [soraTasks]);

    // 按状态排序的任务列表
    const soraTaskList = useMemo(() => {
        const tasks = Array.from(soraTasks.values());
        const statusRank = (task: SoraTask) => {
            if (task.status === 'processing' || task.status === 'generating') return 0;
            if (task.status === 'queued') return 1;
            if (task.status === 'completed') return 2;
            if (task.status === 'failed') return 3;
            return 4;
        };
        return tasks.sort((a, b) => {
            const rankDiff = statusRank(a) - statusRank(b);
            if (rankDiff !== 0) return rankDiff;
            const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
            const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
            return bTime - aTime;
        });
    }, [soraTasks]);

    // 任务统计
    const taskCounts = useMemo(() => {
        const counts = { queued: 0, processing: 0, completed: 0, failed: 0 };
        soraTaskList.forEach((task) => {
            if (task.status === 'queued') counts.queued += 1;
            else if (task.status === 'processing' || task.status === 'generating') counts.processing += 1;
            else if (task.status === 'completed') counts.completed += 1;
            else if (task.status === 'failed') counts.failed += 1;
        });
        return counts;
    }, [soraTaskList]);

    // 按 shotId 获取任务
    const getTasksForShot = useCallback((shotId: string): SoraTask[] => {
        const taskIds = tasksByShotId.get(shotId);
        if (!taskIds) return [];
        return Array.from(taskIds)
            .map((id) => soraTasks.get(id))
            .filter((task): task is SoraTask => !!task);
    }, [tasksByShotId, soraTasks]);

    // 获取分镜的最佳视频（优先使用最新完成的任务）
    const getBestVideoForShot = useCallback((shotId: string): string | undefined => {
        const tasks = getTasksForShot(shotId);
        const completedTasks = tasks
            .filter((task) => task.status === 'completed' && (task.r2Url || task.kaponaiUrl))
            .sort((a, b) => {
                const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt).getTime();
                const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt).getTime();
                return bTime - aTime; // 最新的在前
            });

        if (completedTasks.length === 0) return undefined;
        return completedTasks[0].r2Url || completedTasks[0].kaponaiUrl;
    }, [getTasksForShot]);

    // 应用状态更新
    const applyStatusUpdate = useCallback(async (task: SoraTask, data: any, notify: boolean) => {
        const remoteStatus = data.status;
        const videoUrl = data.videoUrl || data.r2Url || data.kaponaiUrl;

        if (remoteStatus === 'completed') {
            const isTransition = task.status !== 'completed';
            const updatedTask: SoraTask = {
                ...task,
                status: 'completed',
                progress: 100,
                kaponaiUrl: data.kaponaiUrl || task.kaponaiUrl || videoUrl,
                r2Url: data.r2Url || task.r2Url,
                updatedAt: new Date(),
            };
            // 始终使用 task.id 作为键
            setSoraTasks((prev) => new Map(prev).set(task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);

            if (isTransition && videoUrl && autoSyncToShots) {
                // 同步到分镜
                if (task.shotId && task.sceneId) {
                    const currentShotData = await dataService.getShot(task.shotId);
                    const existingHistory = currentShotData?.generationHistory || [];
                    const alreadyExists = existingHistory.some((h: any) => h.result === videoUrl);

                    const newHistory = alreadyExists ? existingHistory : [
                        {
                            id: `sora_${task.id}_${Date.now()}`,
                            type: 'video' as const,
                            timestamp: new Date().toISOString(),
                            result: videoUrl,
                            prompt: typeof task.prompt === 'string' ? task.prompt : 'Sora Video Generation',
                            parameters: { model: 'sora', taskId: task.id },
                            status: 'success' as const
                        },
                        ...existingHistory
                    ];

                    await dataService.saveShot(task.sceneId, {
                        id: task.shotId,
                        status: 'done',
                        videoClip: videoUrl,
                        generationHistory: newHistory,
                    } as any);

                    updateShot(task.shotId, {
                        status: 'done',
                        videoClip: videoUrl,
                        generationHistory: newHistory,
                    } as any);
                }

                // 保存聊天消息（检查 user 是否就绪）
                if (user && project?.id) {
                    const scope = task.shotId ? 'shot' : task.sceneId ? 'scene' : 'project';
                    await dataService.saveChatMessage({
                        id: crypto.randomUUID(),
                        userId: user.id,
                        projectId: project.id,
                        sceneId: task.sceneId,
                        shotId: task.shotId,
                        scope,
                        role: 'assistant',
                        content: '视频生成成功！',
                        timestamp: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        metadata: {
                            type: 'video_result',
                            videoUrl: videoUrl,
                            taskId: task.id,
                        }
                    });
                }

                if (notify) {
                    toast.success('视频生成成功！');
                }
            } else if (notify) {
                toast.success('状态已更新');
            }
            return;
        }

        if (remoteStatus === 'failed') {
            const errorMsg = data.error || 'Unknown error';
            const updatedTask: SoraTask = {
                ...task,
                status: 'failed',
                errorMessage: errorMsg,
                updatedAt: new Date(),
            };
            setSoraTasks((prev) => new Map(prev).set(task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);
            if (notify) {
                toast.error(`视频生成失败: ${errorMsg}`);
            }
            return;
        }

        const nextStatus = remoteStatus === 'generating' ? 'processing' : remoteStatus;
        const nextProgress = typeof data.progress === 'number' ? data.progress : task.progress;
        if (nextStatus !== task.status || nextProgress !== task.progress) {
            const updatedTask: SoraTask = {
                ...task,
                status: nextStatus,
                progress: nextProgress,
                updatedAt: new Date(),
            };
            setSoraTasks((prev) => new Map(prev).set(task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);
        }

        if (notify) {
            toast.info(`已刷新状态：${nextStatus}${typeof nextProgress === 'number' ? ` (${nextProgress}%)` : ''}`);
        }
    }, [autoSyncToShots, project?.id, updateShot, user]);

    // 刷新单个任务
    const refreshTask = useCallback(async (taskId: string, notify: boolean = true) => {
        const task = soraTasks.get(taskId);
        if (!task) {
            if (notify) toast.info('任务不存在');
            return;
        }

        try {
            const res = await fetch(`/api/sora/status?taskId=${taskId}`);
            if (!res.ok) {
                const text = await res.text();
                if (notify) toast.error(`刷新失败: ${text || res.status}`);
                return;
            }
            const data = await res.json();
            await applyStatusUpdate(task, data, notify);
        } catch (error) {
            console.error('Error refreshing sora task:', error);
            if (notify) toast.error('刷新失败，请稍后重试');
        }
    }, [soraTasks, applyStatusUpdate]);

    // 刷新所有进行中的任务
    const refreshAllTasks = useCallback(async () => {
        if (!project?.id) return;

        const pendingTasks = soraTaskList.filter((task) =>
            task.status === 'queued' ||
            task.status === 'processing' ||
            task.status === 'generating' ||
            (task.status === 'completed' && !task.kaponaiUrl && !task.r2Url)
        );

        if (pendingTasks.length === 0) return;

        try {
            const res = await fetch('/api/sora/status/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskIds: pendingTasks.map((task) => task.id),
                }),
            });
            if (!res.ok) return;

            const data = await res.json();
            const resultMap = new Map<string, any>();
            (data.results || []).forEach((item: any) => {
                if (item?.id) resultMap.set(item.id, item);
            });

            for (const task of pendingTasks) {
                const payload = resultMap.get(task.id);
                if (payload) {
                    await applyStatusUpdate(task, payload, false);
                }
            }
        } catch (error) {
            console.error('Batch refresh failed:', error);
        }
    }, [project?.id, soraTaskList, applyStatusUpdate]);

    // 绑定任务到分镜
    const bindTaskToShot = useCallback(async (task: SoraTask, shotId: string) => {
        const shot = project?.shots.find((s) => s.id === shotId);
        if (!shot?.sceneId) {
            toast.error('未找到目标镜头');
            return;
        }

        const videoUrl = task.r2Url || task.kaponaiUrl;
        if (!videoUrl) {
            toast.info('该任务暂时没有可用视频');
            return;
        }

        try {
            await dataService.saveShot(shot.sceneId, {
                id: shot.id,
                status: 'done',
                videoClip: videoUrl,
            } as any);

            updateShot(shot.id, {
                status: 'done',
                videoClip: videoUrl,
            } as any);

            const updatedTask: SoraTask = {
                ...task,
                shotId: shot.id,
                updatedAt: new Date(),
            };

            setSoraTasks((prev) => new Map(prev).set(task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);
            toast.success('已绑定到镜头');
        } catch (error) {
            console.error('Error binding sora task to shot:', error);
            toast.error('绑定失败，请稍后重试');
        }
    }, [project?.shots, updateShot]);

    // 加载任务
    const loadTasks = useCallback(async () => {
        if (!project?.id) return;

        setIsLoading(true);
        try {
            const res = await fetch('/api/sora/tasks/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: project.id }),
            });

            if (res.ok) {
                const data = await res.json();
                const tasks = (data.tasks || []).map((row: any): SoraTask => ({
                    id: row.id,
                    userId: row.user_id,
                    projectId: row.project_id,
                    sceneId: row.scene_id || undefined,
                    shotId: row.shot_id || undefined,
                    shotIds: row.shot_ids || undefined,
                    shotRanges: row.shot_ranges || undefined,
                    characterId: row.character_id || undefined,
                    type: row.type || undefined,
                    status: row.status,
                    progress: row.progress ?? 0,
                    model: row.model || 'sora-2',
                    prompt: row.prompt || '',
                    targetDuration: row.target_duration || 0,
                    targetSize: row.target_size || '',
                    kaponaiUrl: row.kaponai_url || undefined,
                    r2Url: row.r2_url || undefined,
                    pointCost: row.point_cost || 0,
                    errorMessage: row.error_message || undefined,
                    createdAt: new Date(row.created_at),
                    updatedAt: new Date(row.updated_at),
                }));

                const taskMap = new Map<string, SoraTask>();
                tasks.forEach((t: SoraTask) => taskMap.set(t.id, t));
                setSoraTasks(taskMap);
            } else {
                // 降级到 dataService
                const tasks = await dataService.getSoraTasks(project.id);
                const taskMap = new Map<string, SoraTask>();
                tasks.forEach((t) => taskMap.set(t.id, t));
                setSoraTasks(taskMap);
            }
        } catch (error) {
            console.error('Load sora tasks failed:', error);
            // 降级到 dataService
            try {
                const tasks = await dataService.getSoraTasks(project.id);
                const taskMap = new Map<string, SoraTask>();
                tasks.forEach((t) => taskMap.set(t.id, t));
                setSoraTasks(taskMap);
            } catch (e) {
                console.error('Fallback load also failed:', e);
            }
        } finally {
            setIsLoading(false);
        }
    }, [project?.id]);

    // 初始化加载 + 订阅实时更新
    useEffect(() => {
        if (!project?.id) return;

        loadTasks();

        const unsubscribe = dataService.subscribeToSoraTasks(project.id, (task) => {
            setSoraTasks((prev) => new Map(prev).set(task.id, task));
        });

        return () => unsubscribe();
    }, [project?.id, loadTasks]);

    // 自动轮询
    useEffect(() => {
        if (!enablePolling || !project?.id) return;

        const pollInterval = setInterval(async () => {
            const processingTasks = soraTaskList.filter(
                (t) => t.status === 'processing' || t.status === 'queued' || t.status === 'generating'
            );

            if (processingTasks.length === 0) return;

            for (const task of processingTasks) {
                try {
                    const res = await fetch(`/api/sora/status?taskId=${task.id}`);
                    if (!res.ok) continue;
                    const data = await res.json();
                    await applyStatusUpdate(task, data, false);
                } catch (error) {
                    console.error('Error polling sora task:', error);
                }
            }
        }, pollingInterval);

        return () => clearInterval(pollInterval);
    }, [enablePolling, pollingInterval, project?.id, soraTaskList, applyStatusUpdate]);

    // 自动同步完成的任务到分镜（Agent 模式：总是覆盖 + 写入历史）
    useEffect(() => {
        if (!project?.id || !autoSyncToShots) return;

        const tasks = Array.from(soraTasks.values());

        tasks.forEach(async (task) => {
            if (task.status !== 'completed') return;

            const videoUrl = task.r2Url || task.kaponaiUrl;
            if (!videoUrl) return;

            // 获取所有涉及的分镜 ID
            const targetShotIds = task.shotIds?.length
                ? task.shotIds
                : (task.shotId ? [task.shotId] : []);
            if (targetShotIds.length === 0) return;

            // 多镜头任务通知
            if (targetShotIds.length > 1 && !notifiedTaskIdsRef.current.has(task.id)) {
                notifiedTaskIdsRef.current.add(task.id);
                const isRecent = new Date(task.updatedAt).getTime() > Date.now() - 60000;
                if (isRecent) {
                    const shotLabels = targetShotIds
                        .map((id) => {
                            const shot = project.shots.find((s) => s.id === id);
                            return shot?.globalOrder ?? shot?.order;
                        })
                        .filter((idx): idx is number => idx !== undefined)
                        .sort((a, b) => a - b);

                    if (shotLabels.length > 0) {
                        const rangeStr = `${shotLabels[0]}-${shotLabels[shotLabels.length - 1]}`;
                        toast.success(`Sora视频已生成 (镜头 ${rangeStr})`, {
                            description: '新视频已自动应用到所有涉及镜头，旧版本可在历史记录中恢复。',
                            duration: 5000,
                        });
                    }
                }
            }

            // 遍历所有涉及的分镜，同步视频并写入历史
            for (const shotId of targetShotIds) {
                const syncKey = `${task.id}:${shotId}`;
                if (syncedTaskIdsRef.current.has(syncKey)) continue;

                const shot = project.shots.find((s) => s.id === shotId);
                if (!shot?.sceneId) continue;

                // 如果已经是当前视频，跳过
                if (shot.videoClip === videoUrl) continue;

                syncedTaskIdsRef.current.add(syncKey);

                // 获取当前历史记录，添加新视频到历史
                try {
                    const currentShotData = await dataService.getShot(shotId);
                    const existingHistory = currentShotData?.generationHistory || [];
                    const alreadyExists = existingHistory.some((h: any) => h.result === videoUrl);

                    const newHistory = alreadyExists ? existingHistory : [
                        {
                            id: `sora_${task.id}_${Date.now()}_${shotId.slice(-4)}`,
                            type: 'video' as const,
                            timestamp: new Date().toISOString(),
                            result: videoUrl,
                            prompt: typeof task.prompt === 'string' ? task.prompt : 'Sora Video Generation',
                            parameters: {
                                model: 'sora',
                                taskId: task.id,
                                shotIds: targetShotIds.length > 1 ? targetShotIds : undefined,
                            },
                            status: 'success' as const
                        },
                        ...existingHistory
                    ];

                    // 总是覆盖 videoClip（用户可从历史恢复旧版本）
                    await dataService.saveShot(shot.sceneId, {
                        id: shot.id,
                        status: 'done',
                        videoClip: videoUrl,
                        generationHistory: newHistory,
                    } as any);

                    updateShot(shot.id, {
                        status: 'done',
                        videoClip: videoUrl,
                        generationHistory: newHistory,
                    } as any);
                } catch (error) {
                    console.error(`[useSoraTaskManager] Failed to sync shot ${shotId}:`, error);
                }
            }
        });
    }, [soraTasks, project?.id, project?.shots, updateShot, autoSyncToShots]);

    return {
        soraTasks,
        soraTaskList,
        taskCounts,
        getTasksForShot,
        getBestVideoForShot,
        refreshTask,
        refreshAllTasks,
        bindTaskToShot,
        isLoading,
    };
}
