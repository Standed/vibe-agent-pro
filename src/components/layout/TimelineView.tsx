'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Grid3X3,
    Film,
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon,
    Bot,
    Sliders,
    RefreshCw,
    List,
} from 'lucide-react';
import AgentPanel from '../agent/AgentPanel';
import ChatPanel from '@/components/chat/ChatPanel';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import type { SoraTask, Shot } from '@/types/project';
import { toast } from 'sonner';
import LeftSidebarNew from './LeftSidebarNew';

interface TimelineViewProps {
    onClose: () => void;
}

export default function TimelineView({ onClose }: TimelineViewProps) {
    const { project, selectShot, selectedShotId, controlMode, setControlMode, currentSceneId, updateShot } = useProjectStore();

    const videoRef = useRef<HTMLVideoElement>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const previousVideoUrlRef = useRef<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false); // 默认不静音
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentShotIndex, setCurrentShotIndex] = useState(0);
    const [showRightPanel, setShowRightPanel] = useState(true); // 默认展开右侧面板
    const [showQueuePanel, setShowQueuePanel] = useState(false);
    const queueOpenRef = useRef(false);
    const TIMELINE_SLOT_WIDTH = 80;
    const TIMELINE_SLOT_GAP = 8;

    // Get all shots sorted by global order - Memoized to prevent effect re-runs
    const allShots = useMemo(() => {
        return project?.shots
            .slice()
            .sort((a, b) => (a.globalOrder || 0) - (b.globalOrder || 0)) || [];
    }, [project?.shots]);
    const totalDuration = useMemo(() => {
        return allShots.reduce((sum, shot) => sum + (shot.duration || 3), 0);
    }, [allShots]);

    // Subscribe to Sora task updates
    const { user } = useAuth(); // Get user for chat message
    const [soraTasks, setSoraTasks] = useState<Map<string, SoraTask>>(new Map());
    const shotsById = useMemo(
        () => new Map((project?.shots || []).map((shot) => [shot.id, shot])),
        [project?.shots]
    );
    const scenesById = useMemo(
        () => new Map((project?.scenes || []).map((scene) => [scene.id, scene])),
        [project?.scenes]
    );
    const charactersById = useMemo(
        () => new Map((project?.characters || []).map((character) => [character.id, character])),
        [project?.characters]
    );
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
    const soraTaskCounts = useMemo(() => {
        const counts = { queued: 0, processing: 0, completed: 0, failed: 0 };
        soraTaskList.forEach((task) => {
            if (task.status === 'queued') counts.queued += 1;
            else if (task.status === 'processing' || task.status === 'generating') counts.processing += 1;
            else if (task.status === 'completed') counts.completed += 1;
            else if (task.status === 'failed') counts.failed += 1;
        });
        return counts;
    }, [soraTaskList]);
    const activeQueueCount = soraTaskCounts.queued + soraTaskCounts.processing;

    const buildFallbackRanges = useCallback((shots: Shot[]) => {
        let cursor = 0;
        return shots.map((shot) => {
            const duration = shot.duration || 3;
            const range = { shotId: shot.id, start: cursor, end: cursor + duration };
            cursor += duration;
            return range;
        });
    }, []);

    const shotIndexById = useMemo(() => {
        const map = new Map<string, number>();
        allShots.forEach((shot, index) => map.set(shot.id, index));
        return map;
    }, [allShots]);

    const soraVideoGroups = useMemo(() => {
        const groups: Array<{
            taskId: string;
            videoUrl: string;
            shotIds: string[];
            shots: Shot[];
            shotRanges: Array<{ shotId: string; start: number; end: number }>;
            rangesByShotId: Map<string, { shotId: string; start: number; end: number }>;
            startIndex: number;
            endIndex: number;
        }> = [];

        soraTaskList.forEach((task) => {
            const videoUrl = task.r2Url || task.kaponaiUrl;
            if (!videoUrl) return;
            if (!task.shotIds || task.shotIds.length <= 1) return;

            const indices = task.shotIds
                .map((id) => shotIndexById.get(id))
                .filter((index): index is number => typeof index === 'number');
            if (indices.length === 0) return;

            const startIndex = Math.min(...indices);
            const endIndex = Math.max(...indices);
            const shots = task.shotIds.map((id) => shotsById.get(id)).filter(Boolean) as Shot[];
            const ranges = task.shotRanges?.length ? task.shotRanges : buildFallbackRanges(shots);
            const rangesByShotId = new Map(ranges.map((range) => [range.shotId, range]));

            groups.push({
                taskId: task.id,
                videoUrl,
                shotIds: task.shotIds,
                shots,
                shotRanges: ranges,
                rangesByShotId,
                startIndex,
                endIndex,
            });
        });

        return groups;
    }, [buildFallbackRanges, shotIndexById, shotsById, soraTaskList]);

    const groupByShotId = useMemo(() => {
        const map = new Map<string, (typeof soraVideoGroups)[number]>();
        soraVideoGroups.forEach((group) => {
            group.shotIds.forEach((shotId) => map.set(shotId, group));
        });
        return map;
    }, [soraVideoGroups]);

    // Find current shot
    const currentShot = allShots[currentShotIndex];
    const currentGroup = currentShot ? groupByShotId.get(currentShot.id) : undefined;
    const currentVideoUrl = currentGroup?.videoUrl || currentShot?.videoClip || '';
    const currentShotRange = currentGroup?.rangesByShotId.get(currentShot.id);
    const hasVideo = !!currentVideoUrl;
    const activeSceneId = currentSceneId || currentShot?.sceneId || project?.scenes?.[0]?.id;
    const sceneOutputTasks = useMemo(() => {
        if (!activeSceneId) return [];
        return soraTaskList.filter((task) =>
            task.sceneId === activeSceneId && (!task.type || task.type === 'shot_generation')
        );
    }, [soraTaskList, activeSceneId]);

    // 按镜头分组的任务列表
    type TaskGroup = {
        label: string;      // 分组标签，如 "镜头 14-16" 或 "未分配"
        sortKey: number;    // 排序键（用于按镜头顺序排序）
        tasks: SoraTask[];  // 该分组下的任务
    };

    const groupedSoraTaskList = useMemo(() => {
        const groups: Map<string, TaskGroup> = new Map();

        // 获取任务的镜头覆盖范围键
        const getTaskGroupKey = (task: SoraTask): { key: string; label: string; sortKey: number } => {
            const shotIds = task.shotIds?.length ? task.shotIds : (task.shotId ? [task.shotId] : []);

            if (shotIds.length === 0) {
                if (task.type === 'character_reference') {
                    const character = charactersById.get(task.characterId || '');
                    const charName = character?.name || '未知';
                    return { key: `char_${task.characterId}`, label: `角色: ${charName}`, sortKey: 99999 };
                }
                return { key: 'unassigned', label: '未分配', sortKey: 100000 };
            }

            // 获取镜头序号
            const numbers = shotIds
                .map((id) => {
                    const shot = shotsById.get(id);
                    if (shot?.globalOrder) return shot.globalOrder;
                    const idx = shotIndexById.get(id);
                    return typeof idx === 'number' ? idx + 1 : undefined;
                })
                .filter((value): value is number => typeof value === 'number')
                .sort((a, b) => a - b);

            if (numbers.length === 0) {
                return { key: 'unassigned', label: '未分配', sortKey: 100000 };
            }

            const minShot = Math.min(...numbers);
            const maxShot = Math.max(...numbers);
            const isContiguous = maxShot - minShot + 1 === numbers.length;

            if (numbers.length === 1) {
                const label = `镜头 ${String(numbers[0]).padStart(2, '0')}`;
                return { key: label, label, sortKey: numbers[0] };
            }

            const rangeLabel = isContiguous
                ? `${String(minShot).padStart(2, '0')}-${String(maxShot).padStart(2, '0')}`
                : numbers.map(n => String(n).padStart(2, '0')).join(',');
            const label = `镜头 ${rangeLabel}`;
            return { key: label, label, sortKey: minShot };
        };

        // 分组任务
        soraTaskList.forEach((task) => {
            const { key, label, sortKey } = getTaskGroupKey(task);
            if (!groups.has(key)) {
                groups.set(key, { label, sortKey, tasks: [] });
            }
            groups.get(key)!.tasks.push(task);
        });

        // 按镜头序号排序分组
        return Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey);
    }, [soraTaskList, shotsById, shotIndexById, charactersById]);

    // Sync with selected shot
    useEffect(() => {
        if (selectedShotId) {
            const index = allShots.findIndex((s) => s.id === selectedShotId);
            if (index !== -1) setCurrentShotIndex(index);
        }
    }, [selectedShotId, allShots]);

    // Reset video state when source changes
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (previousVideoUrlRef.current === currentVideoUrl) return;
        previousVideoUrlRef.current = currentVideoUrl;
        setCurrentTime(0);
        setDuration(0);
        if (currentVideoUrl) {
            video.currentTime = 0;
        }
    }, [currentVideoUrl]);

    // Seek to shot range when using grouped Sora video
    useEffect(() => {
        if (!currentShotRange) {
            pendingSeekRef.current = null;
            return;
        }
        pendingSeekRef.current = currentShotRange.start;
        const video = videoRef.current;
        if (video && video.readyState >= 1) {
            const target = Math.min(currentShotRange.start, video.duration || currentShotRange.start);
            video.currentTime = target;
            setCurrentTime(target);
        }
    }, [currentShotRange?.start, currentVideoUrl]);

    // Handle video time update
    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    // Handle video loaded
    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        setDuration(video.duration);
        if (pendingSeekRef.current !== null) {
            const target = Math.min(pendingSeekRef.current, video.duration || pendingSeekRef.current);
            video.currentTime = target;
            setCurrentTime(target);
        }
    }, []);

    // Handle video ended - auto play next (skip shots without video)
    const handleEnded = useCallback(() => {
        const group = currentShot ? groupByShotId.get(currentShot.id) : undefined;
        let nextIndex = (group ? group.endIndex + 1 : currentShotIndex + 1);

        while (nextIndex < allShots.length) {
            const shot = allShots[nextIndex];
            const shotGroup = groupByShotId.get(shot.id);
            const videoUrl = shotGroup?.videoUrl || shot.videoClip;
            if (videoUrl) {
                const targetIndex = shotGroup ? shotGroup.startIndex : nextIndex;
                console.log('Video ended, jumping to next index:', targetIndex);
                setIsPlaying(true);
                setCurrentShotIndex(targetIndex);
                selectShot(allShots[targetIndex].id);
                return;
            }
            nextIndex++;
        }

        console.log('Reached the last video, stopping.');
        setIsPlaying(false);
    }, [allShots, currentShot, currentShotIndex, groupByShotId, selectShot]);

    // Ensure video plays when ready if we are in playing state
    const handleCanPlay = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
        if (isPlaying) {
            const video = e.currentTarget;
            video.play().catch((err) => {
                console.warn('Auto-play on canplay failed:', err);
            });
        }
    }, [isPlaying]);

    // Auto-play / Load video when source changes
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasVideo) return;

        // If we are in playing state, ensure the new video starts
        if (isPlaying) {
            console.log('[TimelineView] Attempting to play new shot:', currentShotIndex);

            const playVideo = async () => {
                try {
                    await video.play();
                    console.log('[TimelineView] Play success');
                } catch (err) {
                    console.warn('[TimelineView] Play failed after source change:', err);
                }
            };

            playVideo();
        }
    }, [currentShotIndex, isPlaying, hasVideo, currentVideoUrl]);

    const getTaskLabel = useCallback((task: SoraTask) => {
        if (task.characterId) {
            const character = charactersById.get(task.characterId);
            return character ? `角色 · ${character.name}` : `角色任务 · ${task.id.slice(-6)}`;
        }
        if (task.shotId) {
            const shot = shotsById.get(task.shotId);
            const shotLabel = shot?.globalOrder ?? shot?.order ?? task.shotId.slice(-6);
            return `镜头 · ${shotLabel}`;
        }
        if (task.sceneId) {
            const scene = scenesById.get(task.sceneId);
            return scene ? `场景 · ${scene.name}` : `场景任务 · ${task.id.slice(-6)}`;
        }
        return `任务 · ${task.id.slice(-6)}`;
    }, [shotsById, scenesById, charactersById]);
    const getTaskShotCoverage = useCallback((task: SoraTask) => {
        const shotIds = task.shotIds?.length ? task.shotIds : (task.shotId ? [task.shotId] : []);
        if (shotIds.length === 0) return '';
        const numbers = shotIds
            .map((id) => {
                const shot = shotsById.get(id);
                if (shot?.globalOrder) return shot.globalOrder;
                const idx = shotIndexById.get(id);
                return typeof idx === 'number' ? idx + 1 : undefined;
            })
            .filter((value): value is number => typeof value === 'number')
            .sort((a, b) => a - b);
        if (numbers.length === 0) return '';

        if (numbers.length === 1) {
            return `镜头 ${numbers[0]}`;
        }
        const isContiguous = numbers[numbers.length - 1] - numbers[0] + 1 === numbers.length;
        const label = isContiguous ? `${numbers[0]}-${numbers[numbers.length - 1]}` : numbers.join(',');
        return `镜头 ${label}`;
    }, [shotsById, shotIndexById]);
    const canBindToCurrentShot = useCallback((task: SoraTask) => {
        if (task.shotId) return false;
        if (task.shotIds && task.shotIds.length > 1) return false;
        return !task.type || task.type === 'shot_generation';
    }, []);

    const syncedTaskIdsRef = useRef(new Set<string>());
    const notifiedTaskIdsRef = useRef(new Set<string>());

    useEffect(() => {
        if (!project?.id) return;
        const tasks = Array.from(soraTasks.values());
        const updates: Promise<any>[] = [];

        tasks.forEach((task) => {
            if (task.status !== 'completed') return;

            // 检查是否需要通知（针对多镜头任务）
            if (task.shotIds && task.shotIds.length > 1 && !notifiedTaskIdsRef.current.has(task.id)) {
                notifiedTaskIdsRef.current.add(task.id);
                // 只有当任务是最近完成的（比如1分钟内创建的，或者简单点直接提示）
                // 为了避免页面刷新时弹出大量提示，可以检查任务更新时间是否在最近
                const isRecent = new Date(task.updatedAt).getTime() > Date.now() - 60000;
                if (isRecent) {
                    const shotLabels = task.shotIds
                        .map(id => shotIndexById.get(id))
                        .filter(idx => idx !== undefined)
                        .map(idx => idx! + 1)
                        .sort((a, b) => a - b);

                    if (shotLabels.length > 0) {
                        const rangeStr = `${shotLabels[0]}-${shotLabels[shotLabels.length - 1]}`;
                        toast.success(`Sora视频已生成 (镜头 ${rangeStr})`, {
                            description: "新视频覆盖了指定镜头范围。如与旧视频重叠，请手动确认效果。",
                            duration: 5000,
                        });
                    }
                }
            }

            const videoUrl = task.r2Url || task.kaponaiUrl;
            if (!videoUrl) return;

            if (task.shotIds && task.shotIds.length > 1) return;

            const targetShotIds = task.shotId ? [task.shotId] : (task.shotIds || []);
            if (targetShotIds.length === 0) return;

            targetShotIds.forEach((shotId) => {
                const shot = shotsById.get(shotId);
                if (!shot?.sceneId) return;
                if (shot.videoClip === videoUrl) return;

                // 检查是否已经有视频，且不是来自同一个任务
                // 如果是单镜头任务，且分镜已有视频，则跳过（防止覆盖用户手动绑定的）
                if (shot.videoClip) return;

                if (syncedTaskIdsRef.current.has(`${task.id}:${shotId}`)) return;

                syncedTaskIdsRef.current.add(`${task.id}:${shotId}`);
                updateShot(shot.id, {
                    status: 'done',
                    videoClip: videoUrl,
                } as any);
                updates.push(
                    dataService.saveShot(shot.sceneId, {
                        id: shot.id,
                        status: 'done',
                        videoClip: videoUrl,
                    } as any)
                );
            });
        });
        if (updates.length > 0) {
            Promise.allSettled(updates).catch(() => { });
        }
    }, [soraTasks, shotsById, project?.id, updateShot, shotIndexById]);

    const applyStatusUpdate = async (task: SoraTask, data: any, notify: boolean) => {
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
            setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);

            if (isTransition && videoUrl) {
                if (task.shotId && task.sceneId) {
                    await dataService.saveShot(task.sceneId, {
                        id: task.shotId,
                        status: 'done',
                        videoClip: videoUrl,
                    } as any);
                    updateShot(task.shotId, {
                        status: 'done',
                        videoClip: videoUrl,
                    } as any);
                }

                if (user && project?.id) {
                    await dataService.saveChatMessage({
                        id: crypto.randomUUID(),
                        userId: user.id,
                        projectId: project.id,
                        sceneId: task.sceneId,
                        shotId: task.shotId,
                        scope: 'shot',
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
            const isTransition = task.status !== 'failed';
            const errorMsg = data.error || 'Unknown error';
            const updatedTask: SoraTask = {
                ...task,
                status: 'failed',
                errorMessage: errorMsg,
                updatedAt: new Date(),
            };
            setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
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
            setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
            await dataService.saveSoraTask(updatedTask);
        }

        if (notify) {
            toast.info(`已刷新状态：${nextStatus}${typeof nextProgress === 'number' ? ` (${nextProgress}%)` : ''}`);
        }
    };

    const refreshTask = async (task: SoraTask, notify: boolean, silentError: boolean = false) => {
        try {
            const res = await fetch(`/api/sora/status?taskId=${task.id}`);
            if (!res.ok) {
                const text = await res.text();
                if (!silentError) {
                    toast.error(`刷新失败: ${text || res.status}`);
                }
                return;
            }
            const data = await res.json();
            await applyStatusUpdate(task, data, notify);
        } catch (error) {
            console.error('Error refreshing sora task:', error);
            if (!silentError) {
                toast.error('刷新失败，请稍后重试');
            }
        }
    };

    const refreshSelectedTask = async () => {
        const targetShotId = selectedShotId || currentShot?.id;
        if (!targetShotId) {
            toast.info('请先选择一个镜头');
            return;
        }

        let task =
            soraTasks.get(targetShotId) ||
            Array.from(soraTasks.values()).find((t) => t.shotId === targetShotId);

        if (!task) {
            const shot = shotsById.get(targetShotId);
            const sceneTaskIds = shot?.sceneId
                ? scenesById.get(shot.sceneId)?.soraGeneration?.tasks || []
                : [];
            if (sceneTaskIds.length > 0) {
                task = Array.from(soraTasks.values()).find((t) => sceneTaskIds.includes(t.id));
            }
            if (!task && shot?.sceneId) {
                task = Array.from(soraTasks.values()).find(
                    (t) => t.sceneId === shot.sceneId && (!t.type || t.type === 'shot_generation')
                );
            }
        }

        if (!task) {
            const backfilled = await backfillMissingTasks();
            if (backfilled > 0 && project?.id) {
                const tasks = await loadSoraTasks();
                const taskMap = new Map<string, SoraTask>();
                tasks.forEach((t) => taskMap.set(t.shotId || t.id, t));
                setSoraTasks(taskMap);

                task =
                    taskMap.get(targetShotId) ||
                    Array.from(taskMap.values()).find((t) => t.shotId === targetShotId);
            }
        }

        if (!task) {
            toast.info('该镜头没有可刷新任务');
            return;
        }

        await refreshTask(task, true);
    };

    const backfillMissingTasks = useCallback(async () => {
        if (!project?.id || !user?.id) return 0;

        const knownTaskIds = new Set(Array.from(soraTasks.values()).map((task) => task.id));
        const candidates: Array<{ id: string; sceneId?: string; type?: 'shot_generation' | 'character_reference' }> = [];

        (project.scenes || []).forEach((scene) => {
            const taskIds = scene.soraGeneration?.tasks || [];
            taskIds.forEach((taskId) => {
                if (!taskId || knownTaskIds.has(taskId)) return;
                candidates.push({
                    id: taskId,
                    sceneId: scene.id,
                    type: 'shot_generation',
                });
            });
        });

        if (candidates.length === 0) return 0;

        try {
            const res = await fetch('/api/sora/tasks/backfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    userId: user.id,
                    tasks: candidates,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                console.error('Backfill sora tasks failed:', text);
                return 0;
            }
            return candidates.length;
        } catch (error) {
            console.error('Backfill sora tasks failed:', error);
            return 0;
        }
    }, [project?.id, project?.scenes, soraTasks, user?.id]);

    const mapTaskRow = useCallback((row: any): SoraTask => ({
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
    }), []);

    const loadSoraTasks = useCallback(async (): Promise<SoraTask[]> => {
        if (!project?.id) return [];

        try {
            const res = await fetch('/api/sora/tasks/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                return (data.tasks || []).map((row: any) => mapTaskRow(row));
            }
        } catch (error) {
            console.error('Load sora tasks from api failed:', error);
        }

        return dataService.getSoraTasks(project.id);
    }, [project?.id, mapTaskRow]);

    const refreshAllTasks = async () => {
        if (!project?.id) return;

        await backfillMissingTasks();

        let latestTasks: SoraTask[] = [];
        try {
            latestTasks = await loadSoraTasks();
            const taskMap = new Map<string, SoraTask>();
            latestTasks.forEach((t) => taskMap.set(t.shotId || t.id, t));
            setSoraTasks(taskMap);
        } catch (error) {
            console.error('Error reloading sora tasks:', error);
            latestTasks = soraTaskList;
        }

        const pendingTasks = latestTasks.filter((task) =>
            task.status === 'queued' ||
            task.status === 'processing' ||
            task.status === 'generating' ||
            (task.status === 'completed' && !task.kaponaiUrl && !task.r2Url)
        );
        if (pendingTasks.length === 0) {
            return;
        }

        try {
            const res = await fetch('/api/sora/status/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskIds: pendingTasks.map((task) => task.id),
                }),
            });
            if (!res.ok) {
                return;
            }
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
    };

    const bindTaskToShot = async (task: SoraTask, targetShotId?: string) => {
        const shotId = targetShotId || selectedShotId || currentShot?.id;
        if (!shotId) {
            toast.info('请先选择一个镜头');
            return;
        }

        const shot = shotsById.get(shotId);
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

            setSoraTasks((prev) => {
                const next = new Map(prev);
                const oldKey = task.shotId || task.id;
                next.delete(oldKey);
                next.set(shot.id, updatedTask);
                return next;
            });

            await dataService.saveSoraTask(updatedTask);
            toast.success('已绑定到镜头');
        } catch (error) {
            console.error('Error binding sora task to shot:', error);
            toast.error('绑定失败，请稍后重试');
        }
    };

    useEffect(() => {
        if (!project?.id) return;

        // Load existing tasks
        loadSoraTasks().then((tasks) => {
            const taskMap = new Map<string, SoraTask>();
            tasks.forEach((t) => taskMap.set(t.shotId || t.id, t));
            setSoraTasks(taskMap);
        });

        // Subscribe to realtime updates
        const unsubscribe = dataService.subscribeToSoraTasks(project.id, (task) => {
            setSoraTasks((prev) => {
                const newMap = new Map(prev);
                newMap.set(task.shotId || task.id, task);
                return newMap;
            });
        });

        return () => unsubscribe();
    }, [project?.id, loadSoraTasks]);

    useEffect(() => {
        if (!showQueuePanel) {
            queueOpenRef.current = false;
            return;
        }
        if (queueOpenRef.current) return;
        queueOpenRef.current = true;
        backfillMissingTasks().then(() => {
            if (!project?.id) return;
            loadSoraTasks().then((tasks) => {
                const taskMap = new Map<string, SoraTask>();
                tasks.forEach((t) => taskMap.set(t.shotId || t.id, t));
                setSoraTasks(taskMap);
            });
        });
    }, [showQueuePanel, project?.id, backfillMissingTasks, loadSoraTasks]);

    // Polling for Sora task status
    useEffect(() => {
        const pollInterval = setInterval(async () => {
            const processingTasks = Array.from(soraTasks.values()).filter(
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
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [soraTasks, project?.id, user]);
    // Play/Pause toggle
    const togglePlay = useCallback(() => {
        if (!hasVideo) return;

        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            } else {
                videoRef.current.play().then(() => {
                    setIsPlaying(true);
                }).catch((e) => {
                    console.warn('Video play failed:', e);
                });
            }
        }
    }, [isPlaying, hasVideo]);

    // Mute toggle
    const toggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    }, [isMuted]);

    // Navigate to previous shot
    const prevShot = useCallback(() => {
        if (currentShotIndex > 0) {
            const nextIndex = currentShotIndex - 1;
            setCurrentShotIndex(nextIndex);
            selectShot(allShots[nextIndex].id);
        }
    }, [currentShotIndex, allShots, selectShot]);

    // Navigate to next shot
    const nextShot = useCallback(() => {
        if (currentShotIndex < allShots.length - 1) {
            const nextIndex = currentShotIndex + 1;
            setCurrentShotIndex(nextIndex);
            selectShot(allShots[nextIndex].id);
        }
    }, [currentShotIndex, allShots, selectShot]);

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'queued':
                return '排队中';
            case 'processing':
            case 'generating':
            case 'in_progress':
                return '生成中';
            case 'completed':
                return '已完成';
            case 'failed':
                return '失败';
            default:
                return status;
        }
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'queued':
                return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300';
            case 'processing':
            case 'generating':
            case 'in_progress':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300';
            case 'completed':
                return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
            case 'failed':
                return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-300';
        }
    };

    // Progress bar click
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current || !hasVideo) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        const newTime = percent * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const timelineItems = useMemo(() => {
        const items: Array<
            | { type: 'shot'; shot: Shot; index: number }
            | { type: 'group'; group: (typeof soraVideoGroups)[number] }
        > = [];
        let index = 0;
        while (index < allShots.length) {
            const shot = allShots[index];
            const group = groupByShotId.get(shot.id);
            if (group && group.startIndex === index) {
                items.push({ type: 'group', group });
                index = group.endIndex + 1;
                continue;
            }
            items.push({ type: 'shot', shot, index });
            index += 1;
        }
        return items;
    }, [allShots, groupByShotId, soraVideoGroups]);

    return (
        <div className="fixed inset-0 z-50 bg-light-bg dark:bg-cine-black flex overflow-hidden">
            <LeftSidebarNew activeView="timeline" />
            {/* Left: Video Player Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Top Bar */}
                <div className="h-12 flex-shrink-0 bg-white dark:bg-cine-panel flex items-center justify-between px-4 border-b border-light-border dark:border-cine-border">
                    <div className="text-light-text dark:text-white font-bold text-sm">
                        时间轴预览
                    </div>
                    <div className="text-light-text-muted dark:text-cine-text-muted text-sm">
                        分镜 {currentShotIndex + 1} / {allShots.length}
                        {!hasVideo && <span className="ml-2 text-yellow-600 dark:text-yellow-500">(无视频)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowQueuePanel((prev) => !prev)}
                            className="relative flex items-center gap-2 px-3 py-1.5 bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded text-sm text-light-text dark:text-white transition-colors"
                        >
                            <List size={14} />
                            <span>任务队列</span>
                            {activeQueueCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                                    {activeQueueCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={refreshAllTasks}
                            className="flex items-center gap-2 px-3 py-1.5 bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded text-sm text-light-text dark:text-white transition-colors"
                        >
                            <RefreshCw size={14} />
                            <span>刷新状态</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 px-3 py-1.5 bg-light-accent/10 dark:bg-cine-accent/10 hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 rounded text-sm text-light-text dark:text-white transition-colors"
                        >
                            <Grid3X3 size={14} />
                            <span>故事板视图</span>
                        </button>
                    </div>
                </div>

                {showQueuePanel && (
                    <div className="absolute right-4 top-14 w-[360px] max-h-[70vh] bg-white dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl shadow-lg z-30 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-light-border dark:border-cine-border">
                            <div className="text-sm font-semibold text-light-text dark:text-white">Sora 任务队列</div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={refreshAllTasks}
                                    className="text-xs px-2 py-1 rounded border border-light-border dark:border-cine-border text-light-text dark:text-white hover:bg-light-border dark:hover:bg-cine-border transition-colors"
                                >
                                    刷新
                                </button>
                                <button
                                    onClick={() => setShowQueuePanel(false)}
                                    className="text-xs px-2 py-1 rounded bg-light-accent/10 dark:bg-cine-accent/10 text-light-text dark:text-white hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 transition-colors"
                                >
                                    收起
                                </button>
                            </div>
                        </div>
                        <div className="px-3 py-2 text-[11px] text-light-text-muted dark:text-cine-text-muted border-b border-light-border dark:border-cine-border">
                            排队 {soraTaskCounts.queued} · 进行中 {soraTaskCounts.processing} · 完成 {soraTaskCounts.completed} · 失败 {soraTaskCounts.failed}
                        </div>
                        <div className="p-3 space-y-4 overflow-y-auto max-h-[calc(70vh-96px)]">
                            <div>
                                <div className="text-xs font-semibold text-light-text dark:text-white mb-2">
                                    当前场景
                                </div>
                                {sceneOutputTasks.length === 0 ? (
                                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                        当前场景暂无输出
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {sceneOutputTasks.map((task) => {
                                            const videoUrl = task.r2Url || task.kaponaiUrl;
                                            const coverage = getTaskShotCoverage(task);
                                            const durationHint = task.targetDuration ? `${task.targetDuration}s` : '';

                                            return (
                                                <div
                                                    key={task.id}
                                                    className="flex items-center gap-2 rounded-lg border border-light-border/60 dark:border-cine-border/60 px-2.5 py-1.5 hover:bg-light-surface/50 dark:hover:bg-cine-surface/50 transition-colors"
                                                >
                                                    {/* 左侧：镜头范围标识 */}
                                                    <div className="w-14 flex-shrink-0 text-[10px] font-mono text-light-text-muted dark:text-cine-text-muted truncate">
                                                        {coverage || '—'}
                                                    </div>

                                                    {/* 状态标签 */}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${getStatusClass(task.status)}`}>
                                                        {getStatusLabel(task.status)}
                                                    </span>

                                                    {/* 中间：任务信息 */}
                                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                                        {durationHint && (
                                                            <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted">
                                                                {durationHint}
                                                            </span>
                                                        )}
                                                        {typeof task.progress === 'number' && task.status !== 'completed' && (
                                                            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">
                                                                {task.progress}%
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* 右侧：操作按钮 */}
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <button
                                                            onClick={() => refreshTask(task, false, true)}
                                                            className="text-[10px] px-1.5 py-0.5 rounded text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white hover:bg-light-border/50 dark:hover:bg-cine-border/50 transition-colors"
                                                        >
                                                            刷新
                                                        </button>
                                                        {videoUrl && canBindToCurrentShot(task) && (
                                                            <button
                                                                onClick={() => bindTaskToShot(task)}
                                                                className="text-[10px] px-1.5 py-0.5 rounded text-light-accent dark:text-cine-accent hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
                                                            >
                                                                绑定
                                                            </button>
                                                        )}
                                                        {videoUrl && (
                                                            <button
                                                                onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')}
                                                                className="text-[10px] px-1.5 py-0.5 rounded bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 transition-colors"
                                                            >
                                                                打开
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-light-text dark:text-white mb-2">
                                    全部任务 ({soraTaskList.length})
                                </div>
                                {soraTaskList.length === 0 ? (
                                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                        暂无任务
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {soraTaskList.map((task) => {
                                            const videoUrl = task.r2Url || task.kaponaiUrl;
                                            const coverage = getTaskShotCoverage(task);
                                            const durationHint = task.targetDuration ? `${task.targetDuration}s` : '';
                                            const isCharacterTask = task.type === 'character_reference';
                                            const character = isCharacterTask ? charactersById.get(task.characterId || '') : null;

                                            return (
                                                <div
                                                    key={task.id}
                                                    className="flex items-center gap-2 rounded-lg border border-light-border/60 dark:border-cine-border/60 px-2.5 py-1.5 hover:bg-light-surface/50 dark:hover:bg-cine-surface/50 transition-colors"
                                                >
                                                    {/* 左侧：镜头范围标识 */}
                                                    <div className="w-14 flex-shrink-0 text-[10px] font-mono text-light-text-muted dark:text-cine-text-muted truncate">
                                                        {coverage || (isCharacterTask ? '角色' : '—')}
                                                    </div>

                                                    {/* 状态标签 */}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${getStatusClass(task.status)}`}>
                                                        {getStatusLabel(task.status)}
                                                    </span>

                                                    {/* 中间：任务信息 */}
                                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                                        {isCharacterTask && character && (
                                                            <span className="text-[11px] text-light-text dark:text-white truncate">
                                                                {character.name}
                                                            </span>
                                                        )}
                                                        {durationHint && (
                                                            <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted">
                                                                {durationHint}
                                                            </span>
                                                        )}
                                                        {typeof task.progress === 'number' && task.status !== 'completed' && (
                                                            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">
                                                                {task.progress}%
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* 右侧：操作按钮 */}
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <button
                                                            onClick={() => refreshTask(task, false, true)}
                                                            className="text-[10px] px-1.5 py-0.5 rounded text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white hover:bg-light-border/50 dark:hover:bg-cine-border/50 transition-colors"
                                                        >
                                                            刷新
                                                        </button>
                                                        {videoUrl && canBindToCurrentShot(task) && (
                                                            <button
                                                                onClick={() => bindTaskToShot(task)}
                                                                className="text-[10px] px-1.5 py-0.5 rounded text-light-accent dark:text-cine-accent hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
                                                            >
                                                                绑定
                                                            </button>
                                                        )}
                                                        {videoUrl && (
                                                            <button
                                                                onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')}
                                                                className="text-[10px] px-1.5 py-0.5 rounded bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 transition-colors"
                                                            >
                                                                打开
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Video Preview Area */}
                <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-100 dark:bg-black relative">
                    {hasVideo && currentVideoUrl ? (
                        <video
                            ref={videoRef}
                            src={currentVideoUrl}
                            className="max-w-full max-h-full object-contain"
                            muted={isMuted}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onCanPlay={(e) => {
                                // Double check if it should be playing
                                if (isPlaying) {
                                    e.currentTarget.play().catch(() => { });
                                }
                            }}
                            onEnded={handleEnded}
                            onPlay={() => setIsPlaying(true)}
                            onPause={(e) => {
                                // Extremely important: Browser might fire pause when src changes
                                // We only stop the app's 'isPlaying' state if it's a REAL manual pause.
                                const video = e.currentTarget;
                                if (!video.ended && video.readyState > 0) {
                                    setIsPlaying(false);
                                }
                            }}
                            playsInline
                        />
                    ) : currentShot?.referenceImage ? (
                        <div className="text-center">
                            <img
                                src={currentShot.referenceImage}
                                alt="Shot preview"
                                className="max-w-full max-h-[50vh] object-contain mx-auto"
                            />
                            <div className="mt-4 flex items-center justify-center gap-2 text-yellow-600 dark:text-yellow-500">
                                <ImageIcon size={16} />
                                <span className="text-sm">此分镜暂无视频，显示参考图</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-light-text-muted dark:text-cine-text-muted text-center">
                            <Film size={48} className="mx-auto mb-2 opacity-50" />
                            <p>暂无内容</p>
                        </div>
                    )}

                    {/* Navigation Arrows */}
                    <button
                        onClick={prevShot}
                        disabled={currentShotIndex === 0}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 rounded-full text-light-text dark:text-white shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={nextShot}
                        disabled={currentShotIndex >= allShots.length - 1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 rounded-full text-light-text dark:text-white shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                {/* Progress Bar */}
                <div
                    className="h-2 flex-shrink-0 bg-gray-200 dark:bg-zinc-800 cursor-pointer relative"
                    onClick={handleProgressClick}
                >
                    <div
                        className="absolute left-0 top-0 h-full bg-light-accent dark:bg-emerald-500 transition-all"
                        style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                    />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-light-accent dark:bg-white rounded-full shadow-lg"
                        style={{ left: duration > 0 ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
                    />
                </div>

                {/* Playback Controls */}
                <div className="h-14 flex-shrink-0 bg-white dark:bg-cine-panel flex items-center justify-center gap-6 border-t border-light-border dark:border-cine-border">
                    <button
                        onClick={prevShot}
                        disabled={currentShotIndex === 0}
                        className="p-2 text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors disabled:opacity-30"
                    >
                        <SkipBack size={20} />
                    </button>
                    <button
                        onClick={togglePlay}
                        disabled={!hasVideo}
                        className={`p-3 rounded-full transition-all ${hasVideo
                            ? 'bg-light-accent dark:bg-white text-white dark:text-black hover:scale-105'
                            : 'bg-gray-300 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500 cursor-not-allowed'
                            }`}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
                    </button>
                    <button
                        onClick={nextShot}
                        disabled={currentShotIndex >= allShots.length - 1}
                        className="p-2 text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors disabled:opacity-30"
                    >
                        <SkipForward size={20} />
                    </button>

                    <div className="w-px h-6 bg-light-border dark:bg-cine-border" />

                    <button
                        onClick={toggleMute}
                        disabled={!hasVideo}
                        className={`p-2 transition-colors ${hasVideo ? 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white' : 'text-gray-400 dark:text-zinc-600'}`}
                    >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>

                    <div className="text-light-text-muted dark:text-cine-text-muted text-sm font-mono">
                        {formatTime(currentTime)} / {formatTime(duration || (currentShot?.duration || 3))} · 总 {formatTime(totalDuration || 0)}
                    </div>
                </div>

                {/* Timeline Strip */}
                <div className="h-20 flex-shrink-0 bg-gray-50 dark:bg-cine-black border-t border-light-border dark:border-cine-border overflow-x-auto">
                    <div className="flex gap-2 p-2 h-full">
                        {timelineItems.map((item) => {
                            if (item.type === 'shot') {
                                const { shot, index } = item;
                                const shotHasVideo = !!shot.videoClip;
                                const isSelected = index === currentShotIndex;

                                return (
                                    <div
                                        key={shot.id}
                                        onClick={() => {
                                            setCurrentShotIndex(index);
                                            selectShot(shot.id);
                                            setIsPlaying(false);
                                        }}
                                        className={`relative flex-shrink-0 w-20 h-full rounded-lg overflow-hidden cursor-pointer transition-all ${isSelected
                                            ? 'ring-2 ring-light-accent dark:ring-white scale-105 z-10'
                                            : shotHasVideo
                                                ? 'ring-1 ring-emerald-500/50 hover:ring-emerald-500'
                                                : 'ring-1 ring-light-border dark:ring-zinc-700 hover:ring-light-accent dark:hover:ring-zinc-500'
                                            }`}
                                    >
                                        {shot.videoClip ? (
                                            shot.referenceImage ? (
                                                <img
                                                    src={shot.referenceImage}
                                                    alt=""
                                                    loading="lazy"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <video
                                                    src={shot.videoClip}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    preload="metadata"
                                                    playsInline
                                                />
                                            )
                                        ) : shot.referenceImage ? (
                                            <img
                                                src={shot.referenceImage}
                                                alt=""
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
                                                <Film size={16} className="text-gray-400 dark:text-zinc-600" />
                                            </div>
                                        )}

                                        {shotHasVideo && (
                                            <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-emerald-500/90 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                                                <Film size={8} />
                                            </div>
                                        )}

                                        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                                            {(shot.duration || 3).toFixed(1)}s
                                        </div>

                                        <div className="absolute bottom-1 left-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-bold">
                                            {index + 1}
                                        </div>
                                    </div>
                                );
                            }

                            const { group } = item;
                            const groupWidth = (group.shots.length * TIMELINE_SLOT_WIDTH) +
                                (Math.max(group.shots.length - 1, 0) * TIMELINE_SLOT_GAP);
                            const isGroupSelected = currentGroup?.taskId === group.taskId;
                            const groupPoster = group.shots.find((shot) => shot.referenceImage)?.referenceImage;

                            return (
                                <div
                                    key={group.taskId}
                                    className={`relative flex-shrink-0 h-full rounded-lg overflow-hidden transition-all ${isGroupSelected
                                        ? 'ring-2 ring-light-accent dark:ring-white'
                                        : 'ring-1 ring-emerald-500/50'
                                        }`}
                                    style={{ width: groupWidth }}
                                >
                                    {groupPoster ? (
                                        <img
                                            src={groupPoster}
                                            alt=""
                                            loading="lazy"
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    ) : group.videoUrl ? (
                                        <video
                                            src={group.videoUrl}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            muted
                                            preload="metadata"
                                            playsInline
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
                                            <Film size={16} className="text-gray-400 dark:text-zinc-600" />
                                        </div>
                                    )}

                                    <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-emerald-500/90 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10">
                                        <Film size={8} />
                                        Sora
                                    </div>

                                    <div className="relative z-10 flex h-full" style={{ gap: `${TIMELINE_SLOT_GAP}px` }}>
                                        {group.shots.map((shot) => {
                                            const shotIndex = shotIndexById.get(shot.id) ?? 0;
                                            const isShotSelected = shot.id === currentShot?.id;

                                            return (
                                                <button
                                                    key={shot.id}
                                                    onClick={() => {
                                                        setCurrentShotIndex(shotIndex);
                                                        selectShot(shot.id);
                                                        setIsPlaying(false);
                                                    }}
                                                    className={`relative h-full rounded-lg overflow-hidden transition-all ${isShotSelected
                                                        ? 'ring-2 ring-light-accent dark:ring-white bg-black/40'
                                                        : 'ring-1 ring-black/30 dark:ring-white/10 bg-black/20 hover:bg-black/30'
                                                        }`}
                                                    style={{ width: TIMELINE_SLOT_WIDTH }}
                                                >
                                                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                                                        {(shot.duration || 3).toFixed(1)}s
                                                    </div>
                                                    <div className="absolute bottom-1 left-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-bold">
                                                        {shotIndex + 1}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right: Collapsible Agent/Pro Panel */}
            {showRightPanel ? (
                <div className="w-[420px] flex-shrink-0 border-l border-light-border dark:border-cine-border flex flex-col h-full bg-white dark:bg-cine-panel relative">
                    {/* Collapse Button */}
                    <button
                        onClick={() => setShowRightPanel(false)}
                        className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-8 h-8 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all shadow-xl border border-black/5 dark:border-white/10 flex items-center justify-center group"
                        title="收起面板"
                    >
                        <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                    </button>

                    {/* Mode Toggle & Header */}
                    <div className="p-4 pb-2 flex-shrink-0 flex items-center gap-3">
                        <div className="flex-1 flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
                            <button
                                onClick={() => setControlMode('agent')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${controlMode === 'agent'
                                    ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                            >
                                <Bot size={16} />
                                <span>Agent</span>
                            </button>
                            <button
                                onClick={() => setControlMode('pro')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${controlMode === 'pro'
                                    ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                            >
                                <Sliders size={16} />
                                <span>Pro</span>
                            </button>
                        </div>
                    </div>

                    {/* Panel Content */}
                    <div className="flex-1 overflow-hidden">
                        {controlMode === 'agent' ? <AgentPanel /> : <ChatPanel />}
                    </div>
                </div>
            ) : (
                <div className="w-12 flex-shrink-0 border-l border-light-border dark:border-cine-border bg-white dark:bg-cine-panel flex flex-col items-center py-4 gap-3">
                    <button
                        onClick={() => setShowRightPanel(true)}
                        className="p-2 bg-light-accent/10 dark:bg-cine-accent/10 hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 rounded-lg text-light-text dark:text-white transition-colors"
                        title="展开 Agent 面板"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {/* Quick mode indicators */}
                    <div className="flex flex-col gap-2 mt-2">
                        <button
                            onClick={() => { setShowRightPanel(true); setControlMode('agent'); }}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${controlMode === 'agent' ? 'bg-light-accent/20 dark:bg-cine-accent/20 text-light-accent dark:text-cine-accent' : 'bg-light-accent/5 dark:bg-cine-accent/5 text-light-text-muted dark:text-cine-text-muted hover:bg-light-accent/10 dark:hover:bg-cine-accent/10'}`}
                            title="Agent 模式"
                        >
                            <Bot size={16} />
                        </button>
                        <button
                            onClick={() => { setShowRightPanel(true); setControlMode('pro'); }}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${controlMode === 'pro' ? 'bg-light-accent/20 dark:bg-cine-accent/20 text-light-accent dark:text-cine-accent' : 'bg-light-accent/5 dark:bg-cine-accent/5 text-light-text-muted dark:text-cine-text-muted hover:bg-light-accent/10 dark:hover:bg-cine-accent/10'}`}
                            title="Pro 模式"
                        >
                            <Sliders size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
