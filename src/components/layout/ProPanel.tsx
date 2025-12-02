'use client';

import { Sparkles, Image as ImageIcon, Video, Upload, Loader2, Grid3x3 } from 'lucide-react';
import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, fileToBase64 } from '@/services/geminiService';
import { AspectRatio, ImageSize } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import GridPreviewModal from '@/components/grid/GridPreviewModal';

type GenerationType = 'grid' | 'single' | 'video' | null;

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
}

export default function ProPanel() {
  const { project, selectedShotId, updateShot } = useProjectStore();
  const [generationType, setGenerationType] = useState<GenerationType>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [gridResult, setGridResult] = useState<GridGenerationResult | null>(null);

  const shots = project?.shots || [];
  const selectedShot = shots.find((s) => s.id === selectedShotId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReferenceImages((prev) => [...prev, ...files]);
  };

  const handleGenerateSingleImage = async () => {
    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    setIsGenerating(true);
    try {
      const volcanoService = new VolcanoEngineService();
      const imageUrl = await volcanoService.generateSingleImage(prompt);

      // Update selected shot with single image
      if (selectedShotId) {
        updateShot(selectedShotId, {
          referenceImage: imageUrl,
          status: 'done',
        });
      }

      alert('单图生成成功！');
    } catch (error) {
      console.error('Single image generation error:', error);
      const errorMessage = error instanceof Error ? error.message : '单图生成失败';
      alert(`单图生成失败：${errorMessage}\n\n请检查：\n1. Volcano Engine API 配置是否正确\n2. SeeDream 模型 ID 是否已设置\n3. API 密钥是否有效`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateGrid = async () => {
    if (!prompt.trim() && !selectedShot) {
      alert('请输入提示词或选择一个镜头');
      return;
    }

    setIsGenerating(true);
    try {
      // Find the scene containing the selected shot
      const currentScene = project?.scenes.find((scene) =>
        scene.shotIds.includes(selectedShotId || '')
      );

      // Build enhanced prompt combining scene description and user input
      let enhancedPrompt = prompt;
      if (currentScene) {
        enhancedPrompt = `场景：${currentScene.description}\n角色设定：${project?.metadata.artStyle || ''}\n具体要求：${prompt}`;
      }

      // Convert reference images to base64
      const refImages = await Promise.all(
        referenceImages.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            mimeType: file.type,
            data: base64,
          };
        })
      );

      const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
      const totalSlices = rows * cols;

      const result = await generateMultiViewGrid(
        enhancedPrompt,
        rows,
        cols,
        aspectRatio,
        ImageSize.K4,
        refImages
      );

      // Distribute slices to shots in the scene
      if (currentScene && selectedShotId) {
        // Show Grid preview modal instead of auto-assigning
        setGridResult({
          fullImage: result.fullImage,
          slices: result.slices,
          sceneId: currentScene.id,
        });
      } else {
        // Fallback: Update only the selected shot if no scene found
        if (selectedShotId) {
          updateShot(selectedShotId, {
            gridImages: result.slices,
            fullGridUrl: result.fullImage,
            referenceImage: result.slices[0],
            status: 'done',
          });
        }
        alert(`Grid 生成成功！已生成 ${result.slices.length} 个视图`);
      }
    } catch (error) {
      console.error('Grid generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Grid 生成失败';
      alert(`${errorMessage}\n\n请检查：\n1. Gemini API 配置是否正确\n2. 提示词是否完整\n3. API 密钥是否有效`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Grid assignment from modal
  const handleGridAssignment = (assignments: Record<string, string>) => {
    Object.entries(assignments).forEach(([shotId, imageUrl]) => {
      updateShot(shotId, {
        referenceImage: imageUrl,
        fullGridUrl: gridResult?.fullImage,
        status: 'done',
      });
    });

    const assignedCount = Object.keys(assignments).length;
    alert(`Grid 分配成功！已为 ${assignedCount} 个镜头分配图片`);
    setGridResult(null);
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    if (!selectedShot) {
      alert('请先选择一个镜头');
      return;
    }

    // 检查是否有图片（Grid 图片或参考图片）
    const hasImage = selectedShot.referenceImage || (selectedShot.gridImages && selectedShot.gridImages.length > 0);

    if (!hasImage) {
      alert('请先生成 Grid 图片，然后再生成视频');
      return;
    }

    setIsGenerating(true);
    try {
      const volcanoService = new VolcanoEngineService();

      // 使用第一张 Grid 图片或参考图片
      const imageUrl = selectedShot.gridImages?.[0] || selectedShot.referenceImage || '';

      // 生成视频提示词（基于用户输入的提示词）
      const videoPrompt = prompt || selectedShot.description || '镜头运动，平稳流畅';

      // 步骤1：生成视频任务
      alert('正在提交视频生成任务，预计需要 2-3 分钟...');

      const videoTask = await volcanoService.generateSceneVideo(
        videoPrompt,
        imageUrl // 直接使用 base64 或 URL
      );

      // 步骤2：轮询等待视频生成完成
      updateShot(selectedShotId!, { status: 'processing' });

      const videoUrl = await volcanoService.waitForVideoCompletion(
        videoTask.taskId,
        (status) => {
          console.log('视频生成状态:', status);
        }
      );

      // 步骤3：更新镜头数据
      updateShot(selectedShotId!, {
        videoClip: videoUrl,
        status: 'done',
      });

      alert(`视频生成成功！\n视频 URL: ${videoUrl}`);
    } catch (error) {
      console.error('Video generation error:', error);
      updateShot(selectedShotId!, { status: 'error' });

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`视频生成失败：${errorMessage}\n\n请检查：\n1. Volcano Engine API 配置是否正确\n2. 模型 endpoint_id 是否已创建\n3. API 密钥是否有效`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Generation Type */}
      <div>
        <h3 className="text-sm font-bold mb-3">生成类型</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setGenerationType('single')}
            className={`border rounded-lg p-3 transition-colors ${
              generationType === 'single'
                ? 'bg-cine-accent border-cine-accent text-white'
                : 'bg-cine-panel hover:bg-cine-border border-cine-border'
            }`}
          >
            <ImageIcon size={20} className="mx-auto mb-1" />
            <div className="text-xs">单图生成</div>
          </button>
          <button
            onClick={() => setGenerationType('grid')}
            className={`border rounded-lg p-3 transition-colors ${
              generationType === 'grid'
                ? 'bg-cine-accent border-cine-accent text-white'
                : 'bg-cine-panel hover:bg-cine-border border-cine-border'
            }`}
          >
            <Grid3x3 size={20} className="mx-auto mb-1" />
            <div className="text-xs">Grid 多视图</div>
          </button>
          <button
            onClick={() => setGenerationType('video')}
            className={`border rounded-lg p-3 transition-colors ${
              generationType === 'video'
                ? 'bg-cine-accent border-cine-accent text-white'
                : 'bg-cine-panel hover:bg-cine-border border-cine-border'
            }`}
          >
            <Video size={20} className="mx-auto mb-1" />
            <div className="text-xs">视频生成</div>
          </button>
        </div>
      </div>

      {generationType === 'grid' && (
        <>
          {/* Grid Size */}
          <div>
            <h3 className="text-sm font-bold mb-3">Grid 大小</h3>
            <div className="flex gap-2">
              {(['2x2', '3x3'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setGridSize(size)}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${
                    gridSize === size
                      ? 'bg-cine-accent border-cine-accent text-white'
                      : 'bg-cine-panel hover:bg-cine-border border-cine-border'
                  }`}
                >
                  {size} ({size === '2x2' ? '4视图' : '9视图'})
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <h3 className="text-sm font-bold mb-3">画面比例</h3>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="w-full bg-cine-panel border border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cine-accent"
            >
              <option value={AspectRatio.WIDE}>16:9 (宽屏)</option>
              <option value={AspectRatio.STANDARD}>4:3 (标准)</option>
              <option value={AspectRatio.CINEMA}>21:9 (电影)</option>
              <option value={AspectRatio.SQUARE}>1:1 (方形)</option>
              <option value={AspectRatio.PORTRAIT}>3:4 (竖屏)</option>
              <option value={AspectRatio.MOBILE}>9:16 (手机)</option>
            </select>
          </div>

          {/* Reference Images */}
          <div>
            <h3 className="text-sm font-bold mb-3">参考图片</h3>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-full bg-cine-panel hover:bg-cine-border border border-cine-border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors">
                <Upload size={24} className="mx-auto mb-2 text-cine-text-muted" />
                <div className="text-xs text-cine-text-muted">
                  点击上传参考图片（可选）
                </div>
              </div>
            </label>
            {referenceImages.length > 0 && (
              <div className="mt-2 text-xs text-cine-text-muted">
                已选择 {referenceImages.length} 张图片
              </div>
            )}
          </div>
        </>
      )}

      {/* Prompt */}
      <div>
        <h3 className="text-sm font-bold mb-3">提示词</h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            generationType === 'grid'
              ? '描述角色或场景...\n例如：一位穿着黑色西装的赛博朋克侦探，背景是霓虹灯闪烁的街道'
              : '描述你想要生成的画面...'
          }
          className="w-full h-32 bg-cine-panel border border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-cine-accent"
        />
      </div>

      {/* Style Presets */}
      <div>
        <h3 className="text-sm font-bold mb-3">风格预设</h3>
        <div className="grid grid-cols-2 gap-2">
          {['电影级', '动画', '写实', '赛博朋克'].map((style) => (
            <button
              key={style}
              onClick={() => setPrompt((prev) => `${prev}, ${style}风格`)}
              className="bg-cine-panel hover:bg-cine-border border border-cine-border rounded-lg px-3 py-2 text-xs transition-colors"
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={() => {
          if (generationType === 'grid') {
            handleGenerateGrid();
          } else if (generationType === 'single') {
            handleGenerateSingleImage();
          } else if (generationType === 'video') {
            handleGenerateVideo();
          }
        }}
        disabled={isGenerating || !generationType}
        className="w-full bg-cine-accent text-white py-3 px-4 rounded-lg font-bold hover:bg-cine-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            生成中...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            {generationType === 'single'
              ? '生成单图'
              : generationType === 'grid'
              ? '生成 Grid'
              : generationType === 'video'
              ? '生成视频'
              : '选择生成类型'}
          </>
        )}
      </button>

      {/* Shot Details */}
      {selectedShot && (
        <div className="pt-4 border-t border-cine-border">
          <h3 className="text-sm font-bold mb-3">当前镜头详情</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-cine-text-muted">编号:</span>
              <span className="font-mono text-xs">{selectedShot.id.split('_')[2] || '01'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cine-text-muted">景别:</span>
              <span>{selectedShot.shotSize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cine-text-muted">运镜:</span>
              <span>{selectedShot.cameraMovement}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cine-text-muted">时长:</span>
              <span>{selectedShot.duration}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cine-text-muted">状态:</span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  selectedShot.status === 'done'
                    ? 'bg-green-500/20 text-green-400'
                    : selectedShot.status === 'processing'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : selectedShot.status === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {selectedShot.status}
              </span>
            </div>
            {selectedShot.description && (
              <div className="mt-3 pt-3 border-t border-cine-border">
                <div className="text-xs text-cine-text-muted mb-1">视觉描述:</div>
                <div className="text-xs text-cine-text-muted leading-relaxed">
                  {selectedShot.description}
                </div>
              </div>
            )}

            {/* Dialogue */}
            {selectedShot.dialogue && (
              <div className="mt-3 pt-3 border-t border-cine-border">
                <div className="text-xs text-cine-text-muted mb-1">对话:</div>
                <div className="text-xs text-white bg-cine-black/50 p-2 rounded leading-relaxed">
                  "{selectedShot.dialogue}"
                </div>
              </div>
            )}

            {/* Narration */}
            {selectedShot.narration && (
              <div className="mt-3 pt-3 border-t border-cine-border">
                <div className="text-xs text-cine-text-muted mb-1">旁白:</div>
                <div className="text-xs text-purple-200 bg-purple-900/20 p-2 rounded leading-relaxed italic">
                  {selectedShot.narration}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid Preview Modal */}
      {gridResult && project && (
        <GridPreviewModal
          gridImages={gridResult.slices}
          fullGridUrl={gridResult.fullImage}
          shots={shots}
          sceneId={gridResult.sceneId}
          onAssign={handleGridAssignment}
          onClose={() => setGridResult(null)}
        />
      )}
    </div>
  );
}
