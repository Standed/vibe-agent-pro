'use client';

import { Sparkles, Image as ImageIcon, Video, Upload, Loader2, Grid3x3, History } from 'lucide-react';
import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, fileToBase64 } from '@/services/geminiService';
import { AspectRatio, ImageSize, GridHistoryItem, GenerationHistoryItem } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import GridHistoryModal from '@/components/grid/GridHistoryModal';
import ShotGenerationHistory from '@/components/shot/ShotGenerationHistory';
import { toast } from 'sonner';
import { validateGenerationConfig } from '@/utils/promptSecurity';

type GenerationType = 'grid' | 'single' | 'video' | null;

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
}

export default function ProPanel() {
  const { project, currentSceneId, selectedShotId, updateShot, addGridHistory, saveFavoriteSlices, addGenerationHistory } = useProjectStore();
  const [generationType, setGenerationType] = useState<GenerationType>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [gridResult, setGridResult] = useState<GridGenerationResult | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [showGridHistory, setShowGridHistory] = useState(false);

  const shots = project?.shots || [];
  const scenes = project?.scenes || [];
  const selectedShot = shots.find((s) => s.id === selectedShotId);

  // Determine selection mode
  const isSceneSelected = currentSceneId && !selectedShotId;
  const isShotSelected = !!selectedShotId;

  // Auto-select scene when a shot is selected
  const currentScene = scenes.find((scene) =>
    scene.shotIds.includes(selectedShotId || '')
  );

  // Set selected scene ID when shot changes
  if (currentScene && selectedSceneId !== currentScene.id) {
    setSelectedSceneId(currentScene.id);
  }

  // Also set selectedSceneId from currentSceneId if scene is selected
  if (isSceneSelected && selectedSceneId !== currentSceneId) {
    setSelectedSceneId(currentSceneId);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReferenceImages((prev) => [...prev, ...files]);
  };

  const handleGenerateSingleImage = async () => {
    if (!prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    // 🔒 安全验证：检查提示词是否安全
    const validation = validateGenerationConfig({ prompt });
    if (!validation.isValid) {
      toast.error('提示词包含不安全内容', {
        description: validation.errors.join('\n')
      });
      return;
    }

    setIsGenerating(true);
    try {
      const volcanoService = new VolcanoEngineService();
      // 使用项目的画面比例生成图片
      const projectAspectRatio = project?.settings.aspectRatio;
      const imageUrl = await volcanoService.generateSingleImage(prompt, projectAspectRatio);

      // Update selected shot with single image
      if (selectedShotId) {
        updateShot(selectedShotId, {
          referenceImage: imageUrl,
          status: 'done',
        });

        // Add to generation history
        const historyItem: GenerationHistoryItem = {
          id: `gen_${Date.now()}`,
          type: 'image',
          timestamp: new Date(),
          result: imageUrl,
          prompt: prompt,
          parameters: {
            model: 'SeeDream',
            aspectRatio: aspectRatio,
          },
          status: 'success',
        };
        addGenerationHistory(selectedShotId, historyItem);
      }

      toast.success('单图生成成功！');
    } catch (error) {
      console.error('Single image generation error:', error);
      const errorMessage = error instanceof Error ? error.message : '单图生成失败';
      toast.error('单图生成失败', {
        description: `${errorMessage}\n\n请检查：\n1. Volcano Engine API 配置是否正确\n2. SeeDream 模型 ID 是否已设置\n3. API 密钥是否有效`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateGrid = async () => {
    if (!prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    // 🔒 安全验证：检查提示词是否安全
    const validation = validateGenerationConfig({ prompt });
    if (!validation.isValid) {
      toast.error('提示词包含不安全内容', {
        description: validation.errors.join('\n')
      });
      return;
    }

    if (!selectedSceneId) {
      toast.warning('请先选择一个场景');
      return;
    }

    setIsGenerating(true);
    try {
      // Find the selected scene
      const targetScene = scenes.find((scene) => scene.id === selectedSceneId);

      if (!targetScene) {
        toast.error('未找到选中的场景');
        return;
      }

      // Get shots for this scene
      const sceneShots = shots.filter((s) => s.sceneId === targetScene.id);
      const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
      const totalSlices = rows * cols;

      // 动态选择未分配图片的镜头（跳过已有 referenceImage 的镜头）
      const unassignedShots = sceneShots.filter((shot) => !shot.referenceImage);

      if (unassignedShots.length === 0) {
        toast.warning('该场景所有镜头都已分配图片', {
          description: '如需重新生成，请先删除镜头的现有图片'
        });
        return;
      }

      // Take first N unassigned shots to match grid size
      const targetShots = unassignedShots.slice(0, totalSlices);

      if (targetShots.length < totalSlices) {
        const confirmed = confirm(
          `当前场景只有 ${targetShots.length} 个未分配镜头，但 Grid 大小为 ${gridSize}（${totalSlices} 个切片）。\n\n` +
          `生成的 Grid 将只为这 ${targetShots.length} 个镜头提供切片，剩余切片可收藏备用。\n\n是否继续？`
        );
        if (!confirmed) {
          return;
        }
      }

      // Build enhanced prompt combining scene, shots descriptions, and user input
      let enhancedPrompt = '';

      // Add scene context
      if (targetScene.description) {
        enhancedPrompt += `场景：${targetScene.description}\n`;
      }
      if (project?.metadata.artStyle) {
        enhancedPrompt += `画风：${project.metadata.artStyle}\n`;
      }

      // Add shot descriptions
      if (targetShots.length > 0) {
        enhancedPrompt += `\n分镜要求（${targetShots.length} 个镜头）：\n`;
        targetShots.forEach((shot, idx) => {
          // For 3x3, simplify shot descriptions to avoid too much detail
          if (gridSize === '3x3') {
            // Simplified: only shot size, camera movement, and brief description
            enhancedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}`;
            if (shot.description) {
              // Truncate description to ~50 chars for 3x3
              const briefDesc = shot.description.length > 50
                ? shot.description.substring(0, 50) + '...'
                : shot.description;
              enhancedPrompt += ` - ${briefDesc}`;
            }
            enhancedPrompt += '\n';
          } else {
            // Full description for 2x2
            enhancedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}\n`;
            if (shot.description) {
              enhancedPrompt += `   ${shot.description}\n`;
            }
          }
        });
      }

      // Add user's specific requirements
      if (prompt.trim()) {
        enhancedPrompt += `\n额外要求：${prompt}`;
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

      const result = await generateMultiViewGrid(
        enhancedPrompt,
        rows,
        cols,
        aspectRatio,
        ImageSize.K4,
        refImages
      );

      // Show Grid preview modal for manual assignment
      setGridResult({
        fullImage: result.fullImage,
        slices: result.slices,
        sceneId: targetScene.id,
      });
    } catch (error) {
      console.error('Grid generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Grid 生成失败';
      toast.error('Grid 生成失败', {
        description: `${errorMessage}\n\n请检查：\n1. Gemini API 配置是否正确\n2. 提示词是否完整\n3. API 密钥是否有效`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Grid assignment from modal
  const handleGridAssignment = (assignments: Record<string, string>, favoriteSlices?: string[]) => {
    if (!gridResult) return;

    // Update shots with assigned images AND add to generation history
    Object.entries(assignments).forEach(([shotId, imageUrl]) => {
      updateShot(shotId, {
        referenceImage: imageUrl,
        fullGridUrl: gridResult.fullImage,
        status: 'done',
      });

      // ✨ 添加到 Shot 的生成历史记录
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}_${shotId}`,
        type: 'image',
        timestamp: new Date(),
        result: imageUrl,
        prompt: prompt,
        parameters: {
          model: 'Gemini Grid',
          gridSize: gridSize,
          aspectRatio: aspectRatio,
          fullGridUrl: gridResult.fullImage,
        },
        status: 'success',
      };
      addGenerationHistory(shotId, historyItem);
    });

    // Save Grid to scene history
    const gridHistory: GridHistoryItem = {
      id: `grid_${Date.now()}`,
      timestamp: new Date(),
      fullGridUrl: gridResult.fullImage,
      slices: gridResult.slices,
      gridSize,
      prompt,
      aspectRatio,
      assignments,
    };
    addGridHistory(gridResult.sceneId, gridHistory);

    // Save favorited slices if any
    if (favoriteSlices && favoriteSlices.length > 0) {
      saveFavoriteSlices(gridResult.sceneId, favoriteSlices);
    }

    const assignedCount = Object.keys(assignments).length;
    const favoriteCount = favoriteSlices?.length || 0;

    let message = `已为 ${assignedCount} 个镜头分配图片`;
    if (favoriteCount > 0) {
      message += `，${favoriteCount} 个切片已收藏`;
    }

    toast.success('Grid 分配成功！', {
      description: message
    });
    setGridResult(null);
  };

  // Handle selecting a Grid from history
  const handleSelectGridHistory = (historyItem: GridHistoryItem) => {
    setGridResult({
      fullImage: historyItem.fullGridUrl,
      slices: historyItem.slices,
      sceneId: selectedSceneId,
    });
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    // 🔒 安全验证：检查提示词是否安全
    const validation = validateGenerationConfig({
      prompt,
      videoPrompt: prompt
    });
    if (!validation.isValid) {
      toast.error('提示词包含不安全内容', {
        description: validation.errors.join('\n')
      });
      return;
    }

    if (!selectedShot) {
      toast.warning('请先选择一个镜头');
      return;
    }

    // 检查是否有图片（Grid 图片或参考图片）
    const hasImage = selectedShot.referenceImage || (selectedShot.gridImages && selectedShot.gridImages.length > 0);

    if (!hasImage) {
      toast.warning('请先生成图片', {
        description: '视频生成需要先有参考图片'
      });
      return;
    }

    setIsGenerating(true);
    const loadingToast = toast.loading('正在提交视频生成任务，预计需要 2-3 分钟...');

    try {
      const volcanoService = new VolcanoEngineService();

      // 使用第一张 Grid 图片或参考图片
      const imageUrl = selectedShot.gridImages?.[0] || selectedShot.referenceImage || '';

      // 生成视频提示词（基于用户输入的提示词）
      const videoPrompt = prompt || selectedShot.description || '镜头运动，平稳流畅';

      // 步骤1：生成视频任务
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

      // Add to generation history
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}`,
        type: 'video',
        timestamp: new Date(),
        result: videoUrl,
        prompt: videoPrompt,
        parameters: {
          model: 'VolcanoEngine I2V',
          referenceImages: [imageUrl],
        },
        status: 'success',
      };
      addGenerationHistory(selectedShotId!, historyItem);

      toast.success('视频生成成功！', {
        id: loadingToast,
        description: `视频已保存到镜头`
      });
    } catch (error) {
      console.error('Video generation error:', error);
      updateShot(selectedShotId!, { status: 'error' });

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast.error('视频生成失败', {
        id: loadingToast,
        description: `${errorMessage}\n\n请检查：\n1. Volcano Engine API 配置是否正确\n2. 模型 endpoint_id 是否已创建\n3. API 密钥是否有效`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // History action handlers
  const handleRegenerate = async (item: GenerationHistoryItem) => {
    if (!selectedShotId) return;

    // Set prompt and reference images from history
    setPrompt(item.prompt);

    // Set generation type based on history item type
    if (item.type === 'image') {
      setGenerationType('single');

      // Set parameters from history
      if (item.parameters.aspectRatio) {
        setAspectRatio(item.parameters.aspectRatio as AspectRatio);
      }

      toast.info('已加载历史参数', {
        description: '请点击"生成单图"按钮重新生成'
      });
    } else if (item.type === 'video') {
      setGenerationType('video');
      toast.info('已加载历史参数', {
        description: '请点击"生成视频"按钮重新生成'
      });
    }
  };

  const handleDownload = (item: GenerationHistoryItem) => {
    // Download the image or video
    const link = document.createElement('a');
    link.href = item.result;
    link.download = `${item.type}_${item.id}.${item.type === 'image' ? 'png' : 'mp4'}`;
    link.click();
  };

  const handleFavorite = (item: GenerationHistoryItem) => {
    // TODO: Implement favorite functionality (could save to a favorites list)
    toast.info('收藏功能即将上线！');
  };

  const handleDubbing = (item: GenerationHistoryItem) => {
    // TODO: Implement dubbing functionality
    toast.info('配音功能即将上线！');
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Generation Type */}
      <div>
        <h3 className="text-sm font-bold mb-3">
          生成类型
          {isSceneSelected && <span className="text-xs text-light-text-muted dark:text-cine-text-muted ml-2">(场景级)</span>}
          {isShotSelected && <span className="text-xs text-light-text-muted dark:text-cine-text-muted ml-2">(镜头级)</span>}
        </h3>
        <div className={`grid gap-2 ${isShotSelected ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <button
            onClick={() => setGenerationType('single')}
            className={`border rounded-lg p-3 transition-colors ${
              generationType === 'single'
                ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
            }`}
          >
            <ImageIcon size={20} className="mx-auto mb-1" />
            <div className="text-xs">单图生成</div>
          </button>

          {/* Grid button - Only show for scene-level */}
          {isSceneSelected && (
            <button
              onClick={() => setGenerationType('grid')}
              className={`border rounded-lg p-3 transition-colors ${
                generationType === 'grid'
                  ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
              }`}
            >
              <Grid3x3 size={20} className="mx-auto mb-1" />
              <div className="text-xs">Grid 多视图</div>
            </button>
          )}

          <button
            onClick={() => setGenerationType('video')}
            className={`border rounded-lg p-3 transition-colors ${
              generationType === 'video'
                ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
            }`}
          >
            <Video size={20} className="mx-auto mb-1" />
            <div className="text-xs">视频生成</div>
          </button>
        </div>
      </div>

      {generationType === 'grid' && (
        <>
          {/* Scene Selector */}
          <div>
            <h3 className="text-sm font-bold mb-3">选择场景</h3>
            <select
              value={selectedSceneId}
              onChange={(e) => setSelectedSceneId(e.target.value)}
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:border-cine-accent"
            >
              <option value="">-- 请选择场景 --</option>
              {scenes.map((scene) => {
                const shotCount = shots.filter((s) => s.sceneId === scene.id).length;
                return (
                  <option key={scene.id} value={scene.id}>
                    {scene.name} ({shotCount} 个镜头)
                  </option>
                );
              })}
            </select>
            {selectedSceneId && (
              <div className="mt-2 space-y-2">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  提示：Grid 大小建议与镜头数量匹配（4个镜头→2x2，9个镜头→3x3）
                </div>

                {/* Grid History Preview */}
                {(() => {
                  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
                  const hasHistory = selectedScene?.gridHistory && selectedScene.gridHistory.length > 0;

                  if (hasHistory) {
                    const latestGrid = selectedScene.gridHistory[0];
                    return (
                      <div className="bg-light-bg dark:bg-cine-black/30 border border-light-border dark:border-cine-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium text-light-accent dark:text-cine-accent">
                            历史记录 ({selectedScene.gridHistory.length} 条)
                          </div>
                          <button
                            onClick={() => setShowGridHistory(true)}
                            className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent dark:text-cine-accent-hover transition-colors"
                          >
                            查看全部 →
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <img
                            src={latestGrid.fullGridUrl}
                            alt="Latest Grid"
                            className="w-20 h-20 rounded border border-light-border dark:border-cine-border object-cover cursor-pointer hover:border-light-accent dark:border-cine-accent transition-colors"
                            onClick={() => handleSelectGridHistory(latestGrid)}
                            title="点击重新使用此 Grid"
                          />
                          <div className="flex-1 text-xs text-light-text-muted dark:text-cine-text-muted">
                            <div className="line-clamp-2 mb-1">{latestGrid.prompt}</div>
                            <div className="text-[10px]">
                              {latestGrid.gridSize} · {latestGrid.aspectRatio}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

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
                      ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                      : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
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
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:border-cine-accent"
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
              <div className="w-full bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors">
                <Upload size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted" />
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  点击上传参考图片（可选）
                </div>
              </div>
            </label>
            {referenceImages.length > 0 && (
              <div className="mt-2 text-xs text-light-text-muted dark:text-cine-text-muted">
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
          className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:border-cine-accent"
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
              className="bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-xs transition-colors"
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
        className="w-full bg-light-accent dark:bg-cine-accent text-white py-3 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:bg-cine-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="pt-4 border-t border-light-border dark:border-cine-border">
          <h3 className="text-sm font-bold mb-3">当前镜头详情</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-light-text-muted dark:text-cine-text-muted">编号:</span>
              <span className="font-mono text-xs">{selectedShot.id.split('_')[2] || '01'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-light-text-muted dark:text-cine-text-muted">景别:</span>
              <span>{selectedShot.shotSize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-light-text-muted dark:text-cine-text-muted">运镜:</span>
              <span>{selectedShot.cameraMovement}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-light-text-muted dark:text-cine-text-muted">时长:</span>
              <span>{selectedShot.duration}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-light-text-muted dark:text-cine-text-muted">状态:</span>
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
              <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">视觉描述:</div>
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted leading-relaxed">
                  {selectedShot.description}
                </div>
              </div>
            )}

            {/* Dialogue */}
            {selectedShot.dialogue && (
              <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">对话:</div>
                <div className="text-xs text-light-text dark:text-white bg-light-bg dark:bg-cine-black/50 p-2 rounded leading-relaxed">
                  "{selectedShot.dialogue}"
                </div>
              </div>
            )}

            {/* Narration */}
            {selectedShot.narration && (
              <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">旁白:</div>
                <div className="text-xs text-purple-200 bg-purple-900/20 p-2 rounded leading-relaxed italic">
                  {selectedShot.narration}
                </div>
              </div>
            )}

            {/* Grid Source Info */}
            {selectedShot.fullGridUrl && (
              <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">图片来源:</div>
                <div className="bg-light-bg dark:bg-cine-black/50 p-2 rounded space-y-2">
                  <div className="flex items-center gap-2">
                    <Grid3x3 size={14} className="text-light-accent dark:text-cine-accent" />
                    <span className="text-xs text-light-accent dark:text-cine-accent">来自 Grid 多视图切片</span>
                  </div>
                  {selectedShot.fullGridUrl && (
                    <div className="relative group">
                      <img
                        src={selectedShot.fullGridUrl}
                        alt="Grid Source"
                        className="w-full rounded border border-light-border dark:border-cine-border"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors rounded flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-light-text dark:text-white">
                          完整 Grid 图
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedShot.referenceImage && (
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                      <div className="mb-1">当前镜头使用的切片:</div>
                      <img
                        src={selectedShot.referenceImage}
                        alt="Current Slice"
                        className="w-full rounded border border-light-accent dark:border-cine-accent"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generation History */}
            {selectedShot.generationHistory && selectedShot.generationHistory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                <ShotGenerationHistory
                  history={selectedShot.generationHistory}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onFavorite={handleFavorite}
                  onDubbing={handleDubbing}
                />
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

      {/* Grid History Modal */}
      {showGridHistory && selectedSceneId && (
        <GridHistoryModal
          sceneId={selectedSceneId}
          sceneName={scenes.find((s) => s.id === selectedSceneId)?.name || ''}
          gridHistory={scenes.find((s) => s.id === selectedSceneId)?.gridHistory || []}
          shots={shots}
          onSelectHistory={handleSelectGridHistory}
          onClose={() => setShowGridHistory(false)}
        />
      )}
    </div>
  );
}
