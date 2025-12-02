'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChevronDown, ChevronUp, Play, Pause, SkipBack, SkipForward, Download, Film } from 'lucide-react';

export default function Timeline() {
  const { timelineMode, setTimelineMode, project, selectShot } = useProjectStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

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

  // Calculate total duration from all clips
  const videoTrack = project?.timeline.find((t) => t.type === 'video');
  const totalDuration = videoTrack?.clips.reduce(
    (max, clip) => Math.max(max, clip.startTime + clip.duration),
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
            className="p-1.5 rounded hover:bg-light-bg dark:bg-cine-panel transition-colors"
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
    <div className={`${height} bg-light-panel dark:bg-cine-dark border-t border-light-border dark:border-cine-border flex flex-col transition-all duration-300`}>
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
            <button className="p-1.5 rounded hover:bg-light-bg dark:bg-cine-panel transition-colors" title="回到开始">
              <SkipBack size={14} className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white" />
            </button>
            <button
              onClick={togglePlayPause}
              className="p-1.5 rounded hover:bg-light-bg dark:bg-cine-panel transition-colors"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <Pause size={16} className="text-light-accent dark:text-cine-accent" fill="currentColor" />
              ) : (
                <Play size={16} className="text-light-accent dark:text-cine-accent" fill="currentColor" />
              )}
            </button>
            <button className="p-1.5 rounded hover:bg-light-bg dark:bg-cine-panel transition-colors" title="跳到结尾">
              <SkipForward size={14} className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white" />
            </button>
            <span className="text-xs text-light-text-muted dark:text-cine-text-muted font-mono ml-2">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Preview Button */}
          <button className="flex items-center gap-1.5 text-xs bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:text-white px-3 py-1.5 rounded transition-colors">
            <Film size={14} />
            <span>预览</span>
          </button>

          {/* Export Button */}
          <button className="flex items-center gap-1.5 text-xs bg-light-accent dark:bg-cine-accent text-light-text dark:text-white px-4 py-1.5 rounded font-bold hover:bg-light-accent-hover dark:bg-cine-accent-hover transition-colors">
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
            <span className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">Video</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">Audio</span>
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
                  <div className="h-2 w-px bg-cine-border"></div>
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
              {videoTrack?.clips.map((clip) => {
                const shot = project?.shots.find((s) => s.id === clip.shotId);
                return (
                  <div
                    key={clip.id}
                    onClick={() => shot && selectShot(shot.id)}
                    className="absolute h-20 bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-2 border-purple-500/50 rounded cursor-pointer hover:border-purple-400 transition-all group"
                    style={{
                      left: `${(clip.startTime / totalDuration) * 100}%`,
                      width: `${(clip.duration / totalDuration) * 100}%`,
                      top: '8px',
                    }}
                  >
                    {/* Clip thumbnail (if available) */}
                    {shot?.referenceImage && (
                      <div className="absolute inset-0 rounded overflow-hidden opacity-40 group-hover:opacity-60 transition-opacity">
                        <img
                          src={shot.referenceImage}
                          alt="Shot"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Clip info */}
                    <div className="relative z-10 p-2 flex flex-col justify-between h-full">
                      <div className="text-[10px] font-bold text-light-text dark:text-white truncate">
                        {shot?.id.split('_').pop() || 'Shot'}
                      </div>
                      <div className="text-[9px] text-purple-200 font-mono">
                        {clip.duration.toFixed(1)}s
                      </div>
                    </div>

                    {/* Resize handles */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-400 opacity-0 group-hover:opacity-100 cursor-ew-resize"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-purple-400 opacity-0 group-hover:opacity-100 cursor-ew-resize"></div>
                  </div>
                );
              })}

              {/* Drop zone hint */}
              {!videoTrack?.clips.length && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                    从画布拖拽镜头到此处
                  </span>
                </div>
              )}
            </div>

            {/* Audio Track */}
            <div className="h-24 bg-light-bg dark:bg-cine-panel relative p-2">
              {/* Empty state */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  暂无音频轨道
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
