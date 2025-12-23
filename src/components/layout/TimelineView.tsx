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
} from 'lucide-react';
import AgentPanel from '../agent/AgentPanel';
import ChatPanel from '@/components/chat/ChatPanel';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import type { SoraTask } from '@/types/project';
import { toast } from 'sonner';

interface TimelineViewProps {
    onClose: () => void;
}

export default function TimelineView({ onClose }: TimelineViewProps) {
    const { project, selectShot, selectedShotId, controlMode, setControlMode } = useProjectStore();

    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false); // 默认不静音
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentShotIndex, setCurrentShotIndex] = useState(0);
    const [showRightPanel, setShowRightPanel] = useState(false); // 默认折叠右侧面板

    // Get all shots sorted by global order - Memoized to prevent effect re-runs
    const allShots = useMemo(() => {
        return project?.shots
            .slice()
            .sort((a, b) => (a.globalOrder || 0) - (b.globalOrder || 0)) || [];
    }, [project?.shots]);

    // Find current shot
    const currentShot = allShots[currentShotIndex];
    const hasVideo = !!currentShot?.videoClip;

    // Sync with selected shot
    useEffect(() => {
        if (selectedShotId) {
            const index = allShots.findIndex((s) => s.id === selectedShotId);
            if (index !== -1) setCurrentShotIndex(index);
        }
    }, [selectedShotId, allShots]);

    // Reset video state when shot changes
    useEffect(() => {
        setCurrentTime(0);
        setDuration(0);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
        }
    }, [currentShotIndex]);

    // Handle video time update
    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    // Handle video loaded
    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    }, []);

    // Handle video ended - auto play next (skip shots without video)
    const handleEnded = useCallback(() => {
        // Find next shot with video
        let nextIndex = currentShotIndex + 1;
        while (nextIndex < allShots.length && !allShots[nextIndex].videoClip) {
            nextIndex++;
        }

        if (nextIndex < allShots.length) {
            console.log('Video ended, jumping to next index:', nextIndex);

            // Critical: Ensure isPlaying remains true so the next video auto-starts
            setIsPlaying(true);

            // Update index and sync with store
            setCurrentShotIndex(nextIndex);
            selectShot(allShots[nextIndex].id);
        } else {
            // Last shot reached
            console.log('Reached the last video, stopping.');
            setIsPlaying(false);
        }
    }, [currentShotIndex, allShots, selectShot]);

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

            // Critical: If the src changed, we might need a small delay or load() call
            const playVideo = async () => {
                try {
                    await video.play();
                    console.log('[TimelineView] Play success');
                } catch (err) {
                    console.warn('[TimelineView] Play failed after source change:', err);
                    // If blocked by browser, we might need a user gesture, 
                    // but since they clicked once, it should generally be allowed.
                }
            };

            playVideo();
        }
    }, [currentShotIndex, isPlaying, hasVideo, currentShot?.videoClip]);

    // Subscribe to Sora task updates
    const { user } = useAuth(); // Get user for chat message
    const [soraTasks, setSoraTasks] = useState<Map<string, SoraTask>>(new Map());

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

    // Polling for Sora task status
    useEffect(() => {
        const pollInterval = setInterval(async () => {
            const processingTasks = Array.from(soraTasks.values()).filter(
                (t) => t.status === 'processing' || t.status === 'queued'
            );

            if (processingTasks.length === 0) return;

            for (const task of processingTasks) {
                try {
                    const res = await fetch(`/api/sora/status?taskId=${task.id}`);
                    if (!res.ok) continue;

                    const data = await res.json();
                    const remoteStatus = data.status; // 'SUCCESS', 'FAILED', 'RUNNING', 'QUEUED'

                    if (remoteStatus === 'SUCCESS') {
                        const videoUrl = data.result_url || data.url;

                        // 1. Update Task
                        const updatedTask: SoraTask = {
                            ...task,
                            status: 'completed',
                            progress: 100,
                            r2Url: videoUrl,
                            updatedAt: new Date(),
                        };
                        setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
                        await dataService.saveSoraTask(updatedTask);

                        // 2. Update Shot
                        if (task.shotId && task.sceneId) {
                            await dataService.saveShot(task.sceneId, {
                                id: task.shotId,
                                status: 'done',
                                videoClip: videoUrl,
                            } as any);
                        }

                        // 3. Add to Chat History (Feature Request)
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
                            toast.success('视频生成成功！已添加到聊天记录');
                        }

                    } else if (remoteStatus === 'FAILED') {
                        const errorMsg = data.error_msg || 'Unknown error';
                        const updatedTask: SoraTask = {
                            ...task,
                            status: 'failed',
                            errorMessage: errorMsg,
                            updatedAt: new Date(),
                        };
                        setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
                        await dataService.saveSoraTask(updatedTask);
                        toast.error(`视频生成失败: ${errorMsg}`);
                    } else {
                        // Update progress if available
                        if (data.progress && data.progress !== task.progress) {
                            const updatedTask = { ...task, progress: data.progress };
                            setSoraTasks((prev) => new Map(prev).set(task.shotId || task.id, updatedTask));
                        }
                    }
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

    return (
        <div className="fixed inset-0 z-50 bg-light-bg dark:bg-cine-black flex overflow-hidden">
            {/* Left: Video Player Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <div className="h-12 flex-shrink-0 bg-white dark:bg-cine-panel flex items-center justify-between px-4 border-b border-light-border dark:border-cine-border">
                    <div className="text-light-text dark:text-white font-bold text-sm">
                        时间轴预览
                    </div>
                    <div className="text-light-text-muted dark:text-cine-text-muted text-sm">
                        分镜 {currentShotIndex + 1} / {allShots.length}
                        {!hasVideo && <span className="ml-2 text-yellow-600 dark:text-yellow-500">(无视频)</span>}
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-3 py-1.5 bg-light-accent/10 dark:bg-cine-accent/10 hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 rounded text-sm text-light-text dark:text-white transition-colors"
                    >
                        <Grid3X3 size={14} />
                        <span>故事板视图</span>
                    </button>
                </div>

                {/* Video Preview Area */}
                <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-100 dark:bg-black relative">
                    {hasVideo && currentShot?.videoClip ? (
                        <video
                            ref={videoRef}
                            src={currentShot.videoClip}
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
                        {formatTime(currentTime)} / {formatTime(duration || (currentShot?.duration || 3))}
                    </div>
                </div>

                {/* Timeline Strip */}
                <div className="h-20 flex-shrink-0 bg-gray-50 dark:bg-cine-black border-t border-light-border dark:border-cine-border overflow-x-auto">
                    <div className="flex gap-2 p-2 h-full">
                        {allShots.map((shot, index) => {
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
                                        <video
                                            src={shot.videoClip}
                                            className="w-full h-full object-cover"
                                            muted
                                        />
                                    ) : shot.referenceImage ? (
                                        <img
                                            src={shot.referenceImage}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
                                            <Film size={16} className="text-gray-400 dark:text-zinc-600" />
                                        </div>
                                    )}

                                    {/* Video badge */}
                                    {shotHasVideo && (
                                        <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-emerald-500/90 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                                            <Film size={8} />
                                        </div>
                                    )}

                                    {/* Duration */}
                                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                                        {(shot.duration || 3).toFixed(1)}s
                                    </div>

                                    {/* Index */}
                                    <div className="absolute bottom-1 left-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded font-bold">
                                        {index + 1}
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
                        className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-1.5 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full text-light-text dark:text-white transition-colors shadow-lg border border-light-border dark:border-cine-border"
                        title="收起面板"
                    >
                        <ChevronRight size={16} />
                    </button>

                    {/* Mode Toggle */}
                    <div className="p-4 pb-2 flex-shrink-0">
                        <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
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

