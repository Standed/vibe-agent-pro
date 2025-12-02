'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Edit3,
  FileText,
  MoreHorizontal,
  Play,
  Pause,
  Image as ImageIcon,
  Video as VideoIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { Shot, ShotSize, CameraMovement } from '@/types/project';

interface ShotDetailPanelProps {
  shotId: string;
  onClose: () => void;
}

export default function ShotDetailPanel({ shotId, onClose }: ShotDetailPanelProps) {
  const { project, updateShot, selectedShotId } = useProjectStore();
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const shot = project?.shots.find((s) => s.id === shotId);
  const scene = project?.scenes.find((sc) => sc.shotIds.includes(shotId));

  if (!shot) return null;

  const hasImage = shot.referenceImage || (shot.gridImages && shot.gridImages.length > 0);
  const hasVideo = !!shot.videoClip;

  const handleFieldUpdate = (field: keyof Shot, value: any) => {
    updateShot(shotId, { [field]: value });
  };

  const handleRegenerate = () => {
    // TODO: Implement regenerate logic
    alert('重新生成功能即将上线！');
  };

  const handleDownload = () => {
    if (hasVideo && shot.videoClip) {
      // Download video
      const link = document.createElement('a');
      link.href = shot.videoClip;
      link.download = `shot_${shot.order}_video.mp4`;
      link.click();
    } else if (hasImage) {
      // Download image
      const imageUrl = shot.referenceImage || shot.gridImages?.[0] || '';
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `shot_${shot.order}_image.png`;
      link.click();
    }
  };

  return (
    <div className="h-full flex flex-col bg-light-bg dark:bg-cine-dark">
      {/* Header */}
      <div className="border-b border-light-border dark:border-cine-border p-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors mb-3"
        >
          <ArrowLeft size={16} />
          <span>返回</span>
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-light-text dark:text-white">
              Shot #{shot.order}
            </h2>
            {scene && (
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                {scene.name}
              </p>
            )}
          </div>
          <div
            className={`text-xs px-2 py-1 rounded ${
              shot.status === 'done'
                ? 'bg-green-500/20 text-green-400'
                : shot.status === 'processing'
                ? 'bg-yellow-500/20 text-yellow-400'
                : shot.status === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {shot.status}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Preview Area */}
        <div className="bg-light-panel dark:bg-cine-panel rounded-lg overflow-hidden">
          {hasVideo ? (
            // Video Preview
            <div className="aspect-video bg-black relative group">
              <video
                src={shot.videoClip}
                className="w-full h-full object-contain"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              >
                您的浏览器不支持视频播放
              </video>
              <div className="absolute bottom-4 left-4 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <VideoIcon size={12} />
                <span>{shot.duration}s</span>
              </div>
            </div>
          ) : hasImage ? (
            // Image Preview
            <div className="relative group">
              <img
                src={shot.referenceImage || shot.gridImages?.[0]}
                alt={`Shot ${shot.order}`}
                className="w-full object-contain"
              />
              <div className="absolute bottom-4 left-4 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <ImageIcon size={12} />
                <span>图片</span>
              </div>
            </div>
          ) : (
            // Placeholder
            <div className="aspect-video bg-light-bg dark:bg-cine-black flex flex-col items-center justify-center text-light-text-muted dark:text-cine-text-muted">
              <ImageIcon size={48} className="mb-2 opacity-50" />
              <p className="text-sm">未生成</p>
              <p className="text-xs mt-1">点击下方生成图片</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleRegenerate}
            className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <RotateCcw size={16} />
            <span>重生成</span>
          </button>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <Edit3 size={16} />
            <span>编辑</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={!hasImage && !hasVideo}
            className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            <span>下载</span>
          </button>
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-light-text dark:text-white">基本信息</h3>

          {/* Shot Size */}
          <div>
            <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
              景别
            </label>
            {isEditing ? (
              <select
                value={shot.shotSize}
                onChange={(e) => handleFieldUpdate('shotSize', e.target.value as ShotSize)}
                className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              >
                <option value="Extreme Wide Shot">Extreme Wide Shot</option>
                <option value="Wide Shot">Wide Shot</option>
                <option value="Medium Shot">Medium Shot</option>
                <option value="Close-Up">Close-Up</option>
                <option value="Extreme Close-Up">Extreme Close-Up</option>
              </select>
            ) : (
              <div className="text-sm text-light-text dark:text-white">{shot.shotSize}</div>
            )}
          </div>

          {/* Camera Movement */}
          <div>
            <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
              运镜
            </label>
            {isEditing ? (
              <select
                value={shot.cameraMovement}
                onChange={(e) => handleFieldUpdate('cameraMovement', e.target.value as CameraMovement)}
                className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              >
                <option value="Static">Static</option>
                <option value="Pan Left">Pan Left</option>
                <option value="Pan Right">Pan Right</option>
                <option value="Tilt Up">Tilt Up</option>
                <option value="Tilt Down">Tilt Down</option>
                <option value="Dolly In">Dolly In</option>
                <option value="Dolly Out">Dolly Out</option>
                <option value="Zoom In">Zoom In</option>
                <option value="Zoom Out">Zoom Out</option>
                <option value="Handheld">Handheld</option>
              </select>
            ) : (
              <div className="text-sm text-light-text dark:text-white">{shot.cameraMovement}</div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
              时长 (秒)
            </label>
            {isEditing ? (
              <input
                type="number"
                value={shot.duration}
                onChange={(e) => handleFieldUpdate('duration', parseFloat(e.target.value))}
                min="0.5"
                step="0.5"
                className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              />
            ) : (
              <div className="text-sm text-light-text dark:text-white">{shot.duration}s</div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
              视觉描述
            </label>
            {isEditing ? (
              <textarea
                value={shot.description}
                onChange={(e) => handleFieldUpdate('description', e.target.value)}
                rows={4}
                className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none"
              />
            ) : (
              <div className="text-sm text-light-text dark:text-white leading-relaxed">
                {shot.description}
              </div>
            )}
          </div>
        </div>

        {/* Advanced Options */}
        <div className="border-t border-light-border dark:border-cine-border pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-sm font-bold text-light-text dark:text-white mb-3"
          >
            <span>高级选项</span>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div className="space-y-4">
              {/* Dialogue */}
              {(isEditing || shot.dialogue) && (
                <div>
                  <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
                    对话
                  </label>
                  {isEditing ? (
                    <textarea
                      value={shot.dialogue || ''}
                      onChange={(e) => handleFieldUpdate('dialogue', e.target.value)}
                      placeholder="角色对话..."
                      rows={2}
                      className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none"
                    />
                  ) : (
                    <div className="text-sm text-light-text dark:text-white bg-light-panel dark:bg-cine-panel p-3 rounded-lg">
                      "{shot.dialogue}"
                    </div>
                  )}
                </div>
              )}

              {/* Narration */}
              {(isEditing || shot.narration) && (
                <div>
                  <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
                    旁白
                  </label>
                  {isEditing ? (
                    <textarea
                      value={shot.narration || ''}
                      onChange={(e) => handleFieldUpdate('narration', e.target.value)}
                      placeholder="旁白文本..."
                      rows={2}
                      className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none"
                    />
                  ) : (
                    <div className="text-sm text-purple-200 bg-purple-900/20 p-3 rounded-lg italic">
                      {shot.narration}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Generation History */}
        {shot.generationHistory && shot.generationHistory.length > 0 && (
          <div className="border-t border-light-border dark:border-cine-border pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-sm font-bold text-light-text dark:text-white mb-3"
            >
              <span>生成历史 ({shot.generationHistory.length})</span>
              {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showHistory && (
              <div className="grid grid-cols-3 gap-2">
                {shot.generationHistory.slice(0, 6).map((item, idx) => (
                  <div
                    key={item.id}
                    className="aspect-square bg-light-panel dark:bg-cine-panel rounded-lg overflow-hidden border border-light-border dark:border-cine-border hover:border-light-accent dark:hover:border-cine-accent cursor-pointer transition-colors group relative"
                    onClick={() => handleFieldUpdate('referenceImage', item.result)}
                  >
                    <img
                      src={item.result}
                      alt={`History ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                      <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        使用此版本
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions (if editing) */}
      {isEditing && (
        <div className="border-t border-light-border dark:border-cine-border p-4 flex gap-3">
          <button
            onClick={() => setIsEditing(false)}
            className="flex-1 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-4 py-2 text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              alert('保存成功！');
            }}
            className="flex-1 bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white rounded-lg px-4 py-2 text-sm font-bold transition-colors"
          >
            保存更改
          </button>
        </div>
      )}
    </div>
  );
}
