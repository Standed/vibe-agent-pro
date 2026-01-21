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
        const taskTimestamp = (task: SoraTask) => {
            const updatedAt = task.updatedAt instanceof Date
                ? task.updatedAt.getTime()
                : task.updatedAt
                    ? new Date(task.updatedAt).getTime()
                    : NaN;
            if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
            const createdAt = task.createdAt instanceof Date
                ? task.createdAt.getTime()
                : task.createdAt
                    ? new Date(task.createdAt).getTime()
                    : 0;
            return createdAt;
        };
        return tasks.sort((a, b) => {
            const rankDiff = statusRank(a) - statusRank(b);
            if (rankDiff !== 0) return rankDiff;
            return taskTimestamp(b) - taskTimestamp(a);
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

            // 状态更新后，useEffect 会自动处理分镜同步（如果启用了 autoSyncToShots）
            if (notify) {
                toast.success('视频生成成功！');
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

    // 刷新所有任务：先从 API 获取最新列表，再调用 Kaponai 更新进行中任务的状态
    const refreshAllTasks = useCallback(async () => {
        if (!project?.id) return;

        console.log('[useSoraTaskManager] refreshAllTasks called');

        // 🔄 首先重新加载任务列表
        let freshTasks: SoraTask[] = [];
        try {
            const listRes = await fetch('/api/sora/tasks/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: project.id }),
            });

            if (listRes.ok) {
                const listData = await listRes.json();
                freshTasks = (listData.tasks || []).map((row: any): SoraTask => ({
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

                console.log('[useSoraTaskManager] Loaded', freshTasks.length, 'tasks from API');

                const taskMap = new Map<string, SoraTask>();
                freshTasks.forEach((t: SoraTask) => taskMap.set(t.id, t));
                setSoraTasks(taskMap);
            } else {
                console.error('[useSoraTaskManager] Failed to load task list:', await listRes.text());
            }
        } catch (error) {
            console.error('[useSoraTaskManager] Refresh task list failed:', error);
            return;
        }

        // 找出所有进行中的任务，需要调用 Kaponai 获取实时状态
        const pendingTasks = freshTasks.filter((task) =>
            task.status === 'queued' ||
            task.status === 'processing' ||
            task.status === 'generating' ||
            task.status === 'in_progress'
        );

        console.log('[useSoraTaskManager] Found', pendingTasks.length, 'pending tasks to refresh');

        if (pendingTasks.length === 0) {
            console.log('[useSoraTaskManager] No pending tasks, skipping batch status refresh');
            return;
        }

        // 调用 batch status API 获取 Kaponai 实时状态
        try {
            const res = await fetch('/api/sora/status/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskIds: pendingTasks.map((task) => task.id),
                }),
            });

            if (!res.ok) {
                console.error('[useSoraTaskManager] Batch status API failed:', await res.text());
                return;
            }

            const data = await res.json();
            console.log('[useSoraTaskManager] Batch status results:', data.results?.length);

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
            console.error('[useSoraTaskManager] Batch refresh failed:', error);
        }
    }, [project?.id, applyStatusUpdate]);

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

        // 关键修复 P4：切换项目时先清空旧任务，确保不显示其他项目的历史
        setSoraTasks(new Map());
        syncedTaskIdsRef.current.clear();
        notifiedTaskIdsRef.current.clear();

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

    const mountTimeRef = useRef(Date.now());

    // 自动同步完成的任务到分镜（Agent 模式：总是覆盖 + 写入历史）
    // 优化：批量处理，只对新任务写入数据库，避免进入页面时疯狂请求
    useEffect(() => {
        if (!project?.id || !autoSyncToShots) return;

        const tasks = Array.from(soraTasks.values());

        // 收集所有需要同步的更新
        const pendingUpdates: Array<{
            task: SoraTask;
            shotId: string;
            sceneId: string;
            videoUrl: string;
            isNewTask: boolean;
        }> = [];

        tasks.forEach((task) => {
            if (task.status !== 'completed') return;

            const videoUrl = task.r2Url || task.kaponaiUrl;
            if (!videoUrl) return;

            const targetShotIds = task.shotIds?.length
                ? task.shotIds
                : (task.shotId ? [task.shotId] : []);
            if (targetShotIds.length === 0) return;

            // 通知逻辑保持不变
            if (!notifiedTaskIdsRef.current.has(task.id)) {
                notifiedTaskIdsRef.current.add(task.id);
                const isVeryRecent = new Date(task.updatedAt).getTime() > Date.now() - 30000;
                if (isVeryRecent && targetShotIds.length > 0) {
                    const shotLabels = targetShotIds
                        .map((id) => {
                            const shot = project.shots.find((s) => s.id === id);
                            return shot?.globalOrder ?? shot?.order;
                        })
                        .filter((idx): idx is number => idx !== undefined)
                        .sort((a, b) => a - b);

                    if (shotLabels.length > 0) {
                        const rangeStr = shotLabels.length === 1
                            ? String(shotLabels[0])
                            : `${shotLabels[0]}-${shotLabels[shotLabels.length - 1]}`;
                        toast.success(`Sora视频已生成 (镜头 ${rangeStr})`, {
                            id: `sora-complete-${task.id}`,
                            duration: 4000,
                        });
                    }
                }
            }

            // 收集需要同步的分镜
            const isNewTask = new Date(task.updatedAt).getTime() > Date.now() - 30000; // 30秒内视为新任务
            for (const shotId of targetShotIds) {
                const syncKey = `${task.id}:${shotId}`;
                if (syncedTaskIdsRef.current.has(syncKey)) continue;
                syncedTaskIdsRef.current.add(syncKey);

                const shot = project.shots.find((s) => s.id === shotId);
                if (!shot?.sceneId) continue;
                if (shot.videoClip === videoUrl) continue;

                pendingUpdates.push({
                    task,
                    shotId,
                    sceneId: shot.sceneId,
                    videoUrl,
                    isNewTask,
                });
            }
        });

        // 如果没有待更新的，直接返回
        if (pendingUpdates.length === 0) return;

        // 批量更新内存状态（立即生效，无需等待数据库）
        pendingUpdates.forEach(({ shotId, videoUrl }) => {
            updateShot(shotId, {
                status: 'done',
                videoClip: videoUrl,
            } as any);
        });

        // 只对新任务（30秒内）写入数据库，避免进入页面时大量请求
        const newTaskUpdates = pendingUpdates.filter((u) => u.isNewTask);
        if (newTaskUpdates.length > 0) {
            console.log(`[useSoraTaskManager] 批量写入 ${newTaskUpdates.length} 个分镜到数据库`);
            // 串行写入避免并发问题
            (async () => {
                for (const { task, shotId, sceneId, videoUrl } of newTaskUpdates) {
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
                                parameters: { model: 'sora', taskId: task.id },
                                status: 'success' as const
                            },
                            ...existingHistory
                        ];

                        await dataService.saveShot(sceneId, {
                            id: shotId,
                            status: 'done',
                            videoClip: videoUrl,
                            generationHistory: newHistory,
                        } as any);
                    } catch (error) {
                        console.error(`[useSoraTaskManager] Failed to save shot ${shotId}:`, error);
                    }
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [soraTasks, project?.id, updateShot, autoSyncToShots]);

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
