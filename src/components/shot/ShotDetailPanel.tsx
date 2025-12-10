'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { Shot, ShotSize, CameraMovement, GenerationHistoryItem } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { toast } from 'sonner';

interface ShotDetailPanelProps {
  shotId: string;
  onClose: () => void;
}

export default function ShotDetailPanel({ shotId, onClose }: ShotDetailPanelProps) {
  const { project, updateShot, selectedShotId, addGenerationHistory } = useProjectStore();
  const [isEditing, setIsEditing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateType, setRegenerateType] = useState<'image' | 'video' | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [shotImagePreview, setShotImagePreview] = useState<string | null>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);

  // 添加历史记录区域的 ref，用于自动滚动
  const historyRef = useRef<HTMLDivElement>(null);

  const shot = project?.shots.find((s) => s.id === shotId);
  const scene = project?.scenes.find((sc) => sc.shotIds.includes(shotId));

  const hasImage = Boolean(
    shot?.referenceImage || (shot?.gridImages && shot.gridImages.length > 0)
  );
  const hasVideo = Boolean(shot?.videoClip);

  const shotHistoryImages = useMemo(() => {
    if (!shot) return [];
    const urls = new Set<string>();
    if (shot.referenceImage) urls.add(shot.referenceImage);
    shot.gridImages?.forEach((u) => u && urls.add(u));
    shot.generationHistory?.forEach((h) => {
      if (h.type === 'image' && typeof h.result === 'string') urls.add(h.result);
      if ((h.parameters as any)?.fullGridUrl) urls.add((h.parameters as any).fullGridUrl);
    });
    return Array.from(urls);
  }, [shot]);

  useEffect(() => {
    if (shot?.referenceImage) {
      setSelectedHistoryImage(shot.referenceImage);
    } else {
      setSelectedHistoryImage(null);
    }
  }, [shot?.referenceImage, shotId]);

  if (!shot) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-light-text-muted dark:text-cine-text-muted">
        分镜不存在或已被删除。
      </div>
    );
  }

  const handleFieldUpdate = (field: keyof Shot, value: any) => {
    updateShot(shotId, { [field]: value });
  };

  const handleRegenerate = () => {
    // 获取最后一次生成的提示词
    const lastGeneration = shot.generationHistory?.[0];
    const lastPrompt = lastGeneration?.prompt || shot.description || '';

    // 判断重生成类型：如果有视频则重生成视频，否则重生成图片
    const type = hasVideo ? 'video' : 'image';

    setRegenerateType(type);
    setRegeneratePrompt(lastPrompt);
    setShowRegenerateModal(true);
  };

  const handleConfirmRegenerate = async () => {
    if (!regeneratePrompt.trim() || !regenerateType) return;

    setIsRegenerating(true);
    try {
      if (regenerateType === 'image') {
        // 重生成图片
        const volcanoService = new VolcanoEngineService();

        // Enrich prompt with character and location context
        const { enrichedPrompt, usedCharacters, usedLocations } = enrichPromptWithAssets(
          regeneratePrompt,
          project,
          shot.description
        );

        // Show toast if assets are being used
        if (usedCharacters.length > 0 || usedLocations.length > 0) {
          const assetInfo = [];
          if (usedCharacters.length > 0) {
            assetInfo.push(`角色: ${usedCharacters.map(c => c.name).join(', ')}`);
          }
          if (usedLocations.length > 0) {
            assetInfo.push(`场景: ${usedLocations.map(l => l.name).join(', ')}`);
          }
          toast.info('正在使用资源库参考', {
            description: assetInfo.join(' | ')
          });
        }

        // 使用项目的画面比例
        const projectAspectRatio = project?.settings.aspectRatio;
        const imageUrl = await volcanoService.generateSingleImage(enrichedPrompt, projectAspectRatio);

        updateShot(shotId, {
          referenceImage: imageUrl,
          status: 'done',
        });

        // 添加到生成历史
        const historyItem: GenerationHistoryItem = {
          id: `gen_${Date.now()}`,
          type: 'image',
          timestamp: new Date(),
          result: imageUrl,
          prompt: regeneratePrompt,
          parameters: {
            model: 'SeeDream',
          },
          status: 'success',
        };
        addGenerationHistory(shotId, historyItem);

        toast.success('图片重生成成功！');

        // 自动滚动到历史记录区域
        setTimeout(() => {
          historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      } else if (regenerateType === 'video') {
        // 重生成视频
        if (!hasImage) {
          toast.warning('重生成视频需要先有参考图片');
          return;
        }

        const volcanoService = new VolcanoEngineService();
        const imageUrl = shot.referenceImage || shot.gridImages?.[0] || '';

        // Enrich prompt with character and location context
        const { enrichedPrompt, usedCharacters, usedLocations } = enrichPromptWithAssets(
          regeneratePrompt,
          project,
          shot.description
        );

        // Show toast if assets are being used
        if (usedCharacters.length > 0 || usedLocations.length > 0) {
          const assetInfo = [];
          if (usedCharacters.length > 0) {
            assetInfo.push(`角色: ${usedCharacters.map(c => c.name).join(', ')}`);
          }
          if (usedLocations.length > 0) {
            assetInfo.push(`场景: ${usedLocations.map(l => l.name).join(', ')}`);
          }
          toast.info('正在使用资源库参考', {
            description: assetInfo.join(' | ')
          });
        }

        // 提交视频生成任务
        const videoTask = await volcanoService.generateSceneVideo(
          enrichedPrompt,
          imageUrl
        );

        updateShot(shotId, { status: 'processing' });

        // 等待视频完成
        const videoUrl = await volcanoService.waitForVideoCompletion(videoTask.id);

        updateShot(shotId, {
          videoClip: videoUrl,
          status: 'done',
        });

        // 添加到生成历史
        const historyItem: GenerationHistoryItem = {
          id: `gen_${Date.now()}`,
          type: 'video',
          timestamp: new Date(),
          result: videoUrl,
          prompt: regeneratePrompt,
          parameters: {
            model: 'VolcanoEngine I2V',
            referenceImages: [imageUrl],
          },
          status: 'success',
        };
        addGenerationHistory(shotId, historyItem);

        toast.success('视频重生成成功！');

        // 自动滚动到历史记录区域
        setTimeout(() => {
          historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }

      setShowRegenerateModal(false);
      setRegeneratePrompt('');
      setRegenerateType(null);
    } catch (error) {
      console.error('Regeneration error:', error);
      const errorMessage = error instanceof Error ? error.message : '重生成失败';
      toast.error('重生成失败', {
        description: errorMessage
      });
      updateShot(shotId, { status: 'error' });
    } finally {
      setIsRegenerating(false);
    }
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
    <>
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
            className={`text-xs px-2 py-1 rounded ${shot.status === 'done'
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Preview Area with Fullscreen Button */}
        <div className="bg-light-panel dark:bg-cine-panel rounded-lg overflow-hidden relative group">
          {hasVideo ? (
            // Video Preview
            <div className="w-full bg-black relative aspect-video">
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
              {/* Fullscreen Button */}
              <button
                onClick={() => setShowFullscreen(true)}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="全屏预览"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
            </div>
          ) : hasImage ? (
            // Image Preview - 使用 aspect-video 代替固定高度
            <div className="relative aspect-video">
              <img
                src={shot.referenceImage || shot.gridImages?.[0]}
                alt={`Shot ${shot.order}`}
                className="w-full h-full object-contain"
              />
              <div className="absolute bottom-4 left-4 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <ImageIcon size={12} />
                <span>图片</span>
              </div>
              {/* Fullscreen Button */}
              <button
                onClick={() => setShowFullscreen(true)}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="全屏预览"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
            </div>
          ) : (
            // Placeholder - 使用较小的高度
            <div className="bg-light-bg dark:bg-cine-black flex flex-col items-center justify-center text-light-text-muted dark:text-cine-text-muted py-16">
              <ImageIcon size={48} className="mb-2 opacity-50" />
              <p className="text-sm">未生成</p>
              <p className="text-xs mt-1">点击下方生成图片</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <Edit3 size={16} />
            <span>编辑</span>
          </button>

          {/* 如果没有图片，显示"生成"按钮；否则显示"重生成"按钮 */}
          {!hasImage ? (
            <button
              onClick={handleRegenerate}
              className="flex items-center justify-center gap-2 bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white rounded-lg px-3 py-2 text-sm transition-colors font-medium"
            >
              <Sparkles size={16} />
              <span>生成</span>
            </button>
          ) : (
            <button
              onClick={handleRegenerate}
              className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors"
            >
              <RotateCcw size={16} />
              <span>重生成</span>
            </button>
          )}

          <button
            onClick={handleDownload}
            disabled={!hasImage && !hasVideo}
            className="flex items-center justify-center gap-2 bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            <span>下载</span>
          </button>
        </div>

        {/* 历史分镜图片 */}
        <div>
          <div className="text-sm font-medium text-light-text dark:text-white mb-2">历史分镜图片</div>
          {shotHistoryImages.length === 0 ? (
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted">暂无历史图片</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {shotHistoryImages.map((url, idx) => (
                <div
                  key={idx}
                  className={`relative aspect-video rounded-lg overflow-hidden border cursor-pointer transition-colors ${selectedHistoryImage === url ? 'border-light-accent dark:border-cine-accent ring-2 ring-light-accent/40 dark:ring-cine-accent/40' : 'border-light-border/70 dark:border-cine-border/70 hover:border-light-accent dark:hover:border-cine-accent'}`}
                  onClick={() => {
                    setSelectedHistoryImage(url);
                    updateShot(shotId, { referenceImage: url, status: 'done' });
                  }}
                  onDoubleClick={() => setShotImagePreview(url)}
                >
                  <img src={url} alt={`history-${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 视觉描述 - 放在最前面 */}
        <div>
          <h3 className="text-sm font-bold text-light-text dark:text-white mb-2">视觉描述</h3>
          {isEditing ? (
            <textarea
              value={shot.description}
              onChange={(e) => handleFieldUpdate('description', e.target.value)}
              rows={4}
              className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none"
            />
          ) : (
            <div className="text-sm text-light-text dark:text-white leading-relaxed bg-light-panel dark:bg-cine-panel p-3 rounded-lg">
              {shot.description}
            </div>
          )}
        </div>

        {/* Advanced Options - 对话和旁白 */}
        <div className="border-t border-light-border dark:border-cine-border pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-sm font-bold text-light-text dark:text-white mb-3"
          >
            <span>对话与旁白</span>
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
                      &ldquo;{shot.dialogue}&rdquo;
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

        {/* Basic Info - 景别、运镜、时长放在后面 */}
        <div className="border-t border-light-border dark:border-cine-border pt-4 space-y-4">
          <h3 className="text-sm font-bold text-light-text dark:text-white">镜头参数</h3>

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
        </div>

        {/* Generation History - 对话形式 */}
        {shot.generationHistory && shot.generationHistory.length > 0 && (
          <div ref={historyRef} className="border-t border-light-border dark:border-cine-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-light-text dark:text-white flex items-center gap-2">
                <Sparkles size={16} className="text-light-accent dark:text-cine-accent" />
                生成历史 ({shot.generationHistory.length})
              </h3>
              <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                点击图片使用该版本
              </span>
            </div>

            {/* 对话形式的历史记录 */}
            <div className="space-y-4">
              {shot.generationHistory.map((item, idx) => (
                <div key={item.id} className="space-y-2">
                  {/* User Prompt - 用户提示词 */}
                  {item.prompt && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] bg-light-accent/10 dark:bg-cine-accent/10 border border-light-accent/30 dark:border-cine-accent/30 rounded-lg p-3">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">
                          提示词 · {new Date(item.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-light-text dark:text-white leading-relaxed">
                          {item.prompt}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Response - AI生成结果 */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg overflow-hidden">
                      {/* Result Preview */}
                      <div className="relative group">
                        {item.type === 'image' ? (
                          <img
                            src={item.result}
                            alt={`生成 ${idx + 1}`}
                            className="w-full h-48 object-cover cursor-pointer"
                            onClick={() => handleFieldUpdate('referenceImage', item.result)}
                          />
                        ) : (
                          <video
                            src={item.result}
                            className="w-full h-48 object-cover cursor-pointer"
                            onClick={() => handleFieldUpdate('videoClip', item.result)}
                          />
                        )}

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                          <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            点击使用此版本
                          </span>
                        </div>

                        {/* Type Badge */}
                        <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                          {item.type === 'image' ? <ImageIcon size={12} /> : <VideoIcon size={12} />}
                          <span>{item.type === 'image' ? '图片' : '视频'}</span>
                        </div>
                      </div>

                      {/* Metadata & Actions */}
                      <div className="p-3 space-y-2">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                          {item.parameters?.model || 'Unknown Model'}
                        </div>

                        <button
                          onClick={() => {
                            setRegenerateType(item.type);
                            setRegeneratePrompt(item.prompt || shot.description);
                            setShowRegenerateModal(true);
                          }}
                          className="w-full bg-light-bg dark:bg-cine-black hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded px-3 py-2 text-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <RotateCcw size={14} />
                          <span>基于此重生成</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-lg p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-light-text dark:text-white">
                重生成{regenerateType === 'video' ? '视频' : '图片'}
              </h3>
              <button
                onClick={() => {
                  setShowRegenerateModal(false);
                  setRegeneratePrompt('');
                  setRegenerateType(null);
                }}
                className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">
                  提示词 (可微调)
                </label>
                <textarea
                  value={regeneratePrompt}
                  onChange={(e) => setRegeneratePrompt(e.target.value)}
                  placeholder="输入生成提示词..."
                  rows={6}
                  className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                />
              </div>

              {regenerateType === 'video' && (
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted bg-light-bg dark:bg-cine-panel p-3 rounded-lg">
                  <p>⚠️ 视频生成需要 2-3 分钟，请耐心等待</p>
                  <p className="mt-1">参考图片：{shot.referenceImage ? '已设置' : '使用 Grid 切片'}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRegenerateModal(false);
                    setRegeneratePrompt('');
                    setRegenerateType(null);
                  }}
                  disabled={isRegenerating}
                  className="flex-1 bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmRegenerate}
                  disabled={isRegenerating || !regeneratePrompt.trim()}
                  className="flex-1 bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      开始生成
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      {showFullscreen && (
        <div
          className="fixed inset-0 bg-black z-[60] flex items-center justify-center"
          onClick={() => setShowFullscreen(false)}
        >
          <button
            onClick={() => setShowFullscreen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            title="关闭"
          >
            <X size={32} />
          </button>

          {hasVideo ? (
            <video
              src={shot.videoClip}
              className="max-w-full max-h-full object-contain"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            >
              您的浏览器不支持视频播放
            </video>
          ) : hasImage ? (
            <img
              src={shot.referenceImage || shot.gridImages?.[0]}
              alt={`Shot ${shot.order} 全屏预览`}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
        </div>
      )}
    </div>

    {/* 历史图片全屏预览 */}
    {shotImagePreview && (
      <div
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
        onClick={() => setShotImagePreview(null)}
      >
        <div className="max-w-5xl w-full max-h-[90vh]">
          <img src={shotImagePreview} alt="历史预览" className="w-full h-full object-contain rounded-lg" />
        </div>
      </div>
    )}
    </>
  );
}
