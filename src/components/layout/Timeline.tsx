'use client';

import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import type { SoraTask } from '@/types/project';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  Film,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

export default function Timeline() {
  const { timelineMode, setTimelineMode, project, selectShot, updateShot } = useProjectStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [soraTasks, setSoraTasks] = useState<Map<string, SoraTask>>(new Map());
  const syncedTaskIdsRef = useRef(new Set<string>());

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

  const refreshSelectedTask = async () => {
    const currentShotId = useProjectStore.getState().selectedShotId;
    if (!currentShotId) {
      toast.info('请先选择一个镜头');
      return;
    }

    let task =
      soraTasks.get(currentShotId) ||
      Array.from(soraTasks.values()).find((t) => t.shotId === currentShotId);

    if (!task) {
      const shot = project?.shots.find((s) => s.id === currentShotId);
      const sceneTaskIds = shot
        ? project?.scenes.find((s) => s.id === shot.sceneId)?.soraGeneration?.tasks || []
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
      toast.info('该镜头没有可刷新任务');
      return;
    }

    try {
      const res = await fetch(`/api/sora/status?taskId=${task.id}`);
      if (!res.ok) {
        const text = await res.text();
        toast.error(`刷新失败: ${text || res.status}`);
        return;
      }
      const data = await res.json();
      await applyStatusUpdate(task, data, true);
    } catch (error) {
      console.error('Error refreshing sora task:', error);
      toast.error('刷新失败，请稍后重试');
    }
  };

  const refreshAllTasks = async () => {
    if (!project?.id) return;

    let latestTasks: SoraTask[] = [];
    try {
      latestTasks = await dataService.getSoraTasks(project.id);
      const taskMap = new Map<string, SoraTask>();
      latestTasks.forEach((t) => taskMap.set(t.shotId || t.id, t));
      setSoraTasks(taskMap);
    } catch (error) {
      console.error('Error reloading sora tasks:', error);
      latestTasks = Array.from(soraTasks.values());
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
  };

  // Subscribe to Sora task updates
  const { user } = useAuth(); // Get user for chat message

  useEffect(() => {
    if (!project?.id) return;

    // Load existing tasks
    dataService.getSoraTasks(project.id).then((tasks) => {
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
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) return;
    const tasks = Array.from(soraTasks.values());
    const updates: Promise<any>[] = [];
    tasks.forEach((task) => {
      if (task.status !== 'completed') return;
      const videoUrl = task.r2Url || task.kaponaiUrl;
      if (!videoUrl) return;

      const targetShotIds = task.shotId ? [task.shotId] : (task.shotIds || []);
      if (targetShotIds.length === 0) return;

      targetShotIds.forEach((shotId) => {
        const shot = project?.shots.find((s) => s.id === shotId);
        if (!shot?.sceneId) return;
        if (shot.videoClip === videoUrl) return;
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
      Promise.allSettled(updates).catch(() => {});
    }
  }, [soraTasks, project?.id, project?.shots, updateShot]);

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

  const toggleTimeline = () => {
    if (timelineMode === 'collapsed') {
      setTimelineMode('default');
    } else if (timelineMode === 'default') {
      setTimelineMode('expanded');
    } else {
      setTimelineMode('collapsed');
    }
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
    // TODO: 实际播放逻辑
  };

  // Get all shots sorted by scene order and shot order
  const allShots = project?.shots
    .slice()
    .sort((a, b) => (a.globalOrder || 0) - (b.globalOrder || 0)) || [];

  // Calculate cumulative start times for each shot
  const shotsWithTiming = allShots.map((shot, index) => {
    const startTime = allShots
      .slice(0, index)
      .reduce((sum, s) => sum + (s.duration || 3), 0);
    return {
      shot,
      startTime,
      duration: shot.duration || 3,
    };
  });

  // Calculate total duration from all shots
  const totalDuration = shotsWithTiming.reduce(
    (max, item) => Math.max(max, item.startTime + item.duration),
    0
  ) || 60;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Generate time markers every 5 seconds
  const timeMarkers = [];
  for (let i = 0; i <= totalDuration; i += 5) {
    timeMarkers.push(i);
  }

  // Helper to get task status for a shot
  const getTaskForShot = (shotId: string) => soraTasks.get(shotId);

  // Render status indicator
  const renderStatusIndicator = (task: SoraTask | undefined) => {
    if (!task) return null;

    switch (task.status) {
      case 'queued':
        return (
          <div className="absolute top-1 right-1 flex items-center gap-1 bg-yellow-500/20 dark:bg-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-[9px] px-1.5 py-0.5 rounded">
            <Loader2 size={10} className="animate-spin" />
            <span>排队中</span>
          </div>
        );
      case 'processing':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded">
            <Loader2 size={16} className="animate-spin text-cine-accent mb-1" />
            <span className="text-[10px] text-white font-bold">{task.progress}%</span>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
              <div
                className="h-full bg-cine-accent transition-all duration-300"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        );
      case 'completed':
        return (
          <div className="absolute top-1 right-1">
            <CheckCircle2 size={14} className="text-green-500" />
          </div>
        );
      case 'failed':
        return (
          <div className="absolute top-1 right-1 flex items-center gap-1 bg-red-500/20 dark:bg-red-500/30 text-red-600 dark:text-red-400 text-[9px] px-1.5 py-0.5 rounded">
            <AlertCircle size={10} />
            <span>失败</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (timelineMode === 'collapsed') {
    return (
      <div className="h-12 bg-light-panel dark:bg-cine-dark border-t border-light-border dark:border-cine-border flex items-center justify-between px-4">
        <button
          onClick={toggleTimeline}
          className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
        >
          <ChevronUp size={16} />
          <span className="font-bold">TIMELINE</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayPause}
            className="p-1.5 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
          >
            {isPlaying ? (
              <Pause size={16} className="text-light-accent dark:text-cine-accent" />
            ) : (
              <Play size={16} className="text-light-accent dark:text-cine-accent" />
            )}
          </button>
          <span className="text-xs text-light-text-muted dark:text-cine-text-muted font-mono">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    );
  }

  const height = timelineMode === 'default' ? 'h-56' : 'h-96';

  return (
    <div
      className={`${height} bg-light-panel dark:bg-cine-dark border-t border-light-border dark:border-cine-border flex flex-col transition-all duration-300`}
    >
      {/* Timeline Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-light-border dark:border-cine-border bg-light-bg dark:bg-cine-black/30">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTimeline}
            className="flex items-center gap-2 text-xs font-bold text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors uppercase tracking-wider"
          >
            <ChevronDown size={16} />
            <span>Timeline</span>
          </button>

          {/* Playback Controls */}
          <div className="flex items-center gap-1 border-l border-light-border dark:border-cine-border pl-4">
            <button
              className="p-1.5 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              title="回到开始"
            >
              <SkipBack
                size={14}
                className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white"
              />
            </button>
            <button
              onClick={togglePlayPause}
              className="p-1.5 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <Pause size={16} className="text-light-accent dark:text-cine-accent" fill="currentColor" />
              ) : (
                <Play size={16} className="text-light-accent dark:text-cine-accent" fill="currentColor" />
              )}
            </button>
            <button
              className="p-1.5 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              title="跳到结尾"
            >
              <SkipForward
                size={14}
                className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white"
              />
            </button>
            <span className="text-xs text-light-text-muted dark:text-cine-text-muted font-mono ml-2">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Regenerate Button */}
          <button
            onClick={() => {
              const currentShotId = useProjectStore.getState().selectedShotId;
              if (!currentShotId) {
                // Show toast if no shot selected?
                return;
              }
              const project = useProjectStore.getState().project;
              const shot = project?.shots.find(s => s.id === currentShotId);
              if (!shot) return;

              const scene = project?.scenes.find(s => s.id === shot.sceneId);
              const sceneContext = scene?.description ? `\n场景环境: ${scene.description}` : '';
              const fullPrompt = `镜头画面: ${shot.description || ''}${sceneContext}`;

              useProjectStore.getState().setGenerationRequest({
                prompt: fullPrompt,
                model: 'jimeng',
                jimengModel: 'jimeng-4.5',
                jimengResolution: '2k'
              });

              useProjectStore.getState().setControlMode('pro');
              if (useProjectStore.getState().rightSidebarCollapsed) {
                useProjectStore.getState().toggleRightSidebar();
              }
            }}
            className="flex items-center gap-1.5 text-xs bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white px-3 py-1.5 rounded transition-colors"
          >
            <RefreshCw size={14} />
            <span>重新生成</span>
          </button>

          <button
            onClick={refreshAllTasks}
            className="flex items-center gap-1.5 text-xs bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white px-3 py-1.5 rounded transition-colors"
          >
            <RefreshCw size={14} />
            <span>刷新状态</span>
          </button>

          {/* Preview Button */}
          <button className="flex items-center gap-1.5 text-xs bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            <Film size={14} />
            <span>预览</span>
          </button>

          {/* Export Button */}
          <button className="flex items-center gap-1.5 text-xs bg-light-accent dark:bg-cine-accent text-white dark:text-black px-4 py-1.5 rounded font-bold hover:opacity-90 transition-colors">
            <Download size={14} />
            <span>导出视频</span>
          </button>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Labels */}
        <div className="w-20 bg-light-bg dark:bg-cine-black/30 border-r border-light-border dark:border-cine-border flex flex-col">
          <div className="flex-1 flex items-center justify-center border-b border-light-border dark:border-cine-border">
            <span className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">
              Video
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">
              Audio
            </span>
          </div>
        </div>

        {/* Timeline Ruler and Tracks */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ minWidth: `${totalDuration * 10}px` }}>
            {/* Time Ruler */}
            <div className="h-8 bg-light-bg dark:bg-cine-black/50 border-b border-light-border dark:border-cine-border relative">
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 bottom-0 flex flex-col items-start"
                  style={{ left: `${(time / totalDuration) * 100}%` }}
                >
                  <div className="h-2 w-px bg-light-border dark:bg-cine-border"></div>
                  <span className="text-[9px] text-light-text-muted dark:text-cine-text-muted font-mono mt-0.5">
                    {formatTime(time)}
                  </span>
                </div>
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-light-accent dark:bg-cine-accent z-10"
                style={{ left: `${(currentTime / totalDuration) * 100}%` }}
              >
                <div className="w-3 h-3 bg-light-accent dark:bg-cine-accent rounded-sm -ml-1.5 -mt-0.5"></div>
              </div>
            </div>

            {/* Video Track */}
            <div className="h-24 bg-light-bg dark:bg-cine-panel border-b border-light-border dark:border-cine-border relative p-2">
              {shotsWithTiming.map(({ shot, startTime, duration }) => {
                const task = getTaskForShot(shot.id);
                const isProcessing = task?.status === 'processing';
                const hasVideo = !!shot.videoClip;

                return (
                  <div
                    key={shot.id}
                    onClick={() => selectShot(shot.id)}
                    className={`absolute h-20 rounded cursor-pointer transition-all group ${isProcessing
                      ? 'border-2 border-dashed border-cine-accent/50 bg-cine-accent/5'
                      : hasVideo
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/10 border-2 border-emerald-500/50 dark:border-emerald-500/50 hover:border-emerald-500 dark:hover:border-emerald-500'
                        : 'bg-light-accent/10 dark:bg-cine-accent/10 border-2 border-light-accent/50 dark:border-cine-accent/50 hover:border-light-accent dark:hover:border-cine-accent'
                      }`}
                    style={{
                      left: `${(startTime / totalDuration) * 100}%`,
                      width: `${(duration / totalDuration) * 100}%`,
                      top: '8px',
                      minWidth: '60px',
                    }}
                  >
                    {/* Video preview (if available) */}
                    {hasVideo && shot.videoClip && (
                      <div className="absolute inset-0 rounded overflow-hidden">
                        <video
                          src={shot.videoClip}
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={(e) => {
                            const video = e.target as HTMLVideoElement;
                            video.pause();
                            video.currentTime = 0;
                          }}
                        />
                        {/* Video badge */}
                        <div className="absolute top-1 left-1 flex items-center gap-1 bg-emerald-500/80 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                          <Film size={8} />
                          <span>视频</span>
                        </div>
                      </div>
                    )}

                    {/* Clip thumbnail (if no video but has image) */}
                    {!hasVideo && shot.referenceImage && (
                      <div className="absolute inset-0 rounded overflow-hidden opacity-40 group-hover:opacity-60 transition-opacity">
                        <img src={shot.referenceImage} alt="Shot" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {/* Status indicator overlay */}
                    {renderStatusIndicator(task)}

                    {/* Clip info */}
                    <div className="relative z-10 p-2 flex flex-col justify-between h-full">
                      <div className="text-[10px] font-bold text-light-text dark:text-white truncate">
                        {shot.id.split('_').pop() || 'Shot'}
                      </div>
                      <div className="text-[9px] text-light-text-muted dark:text-cine-text-muted font-mono">
                        {duration.toFixed(1)}s
                      </div>
                    </div>

                    {/* Resize handles */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-light-accent dark:bg-cine-accent opacity-0 group-hover:opacity-100 cursor-ew-resize"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-light-accent dark:bg-cine-accent opacity-0 group-hover:opacity-100 cursor-ew-resize"></div>
                  </div>
                );
              })}

              {/* Drop zone hint */}
              {shotsWithTiming.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                    暂无分镜，请先生成分镜脚本
                  </span>
                </div>
              )}
            </div>


            {/* Audio Track */}
            <div className="h-24 bg-light-bg dark:bg-cine-panel relative p-2">
              {/* Empty state */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-light-text-muted dark:text-cine-text-muted">暂无音频轨道</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
