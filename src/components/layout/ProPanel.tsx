'use client';

import { Sparkles, Image as ImageIcon, Video, Upload, Loader2, Grid3x3, History, Wand2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, fileToBase64, editImageWithGemini, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, ImageSize, GridHistoryItem, GenerationHistoryItem, Shot } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import GridHistoryModal from '@/components/grid/GridHistoryModal';
import ShotGenerationHistory from '@/components/shot/ShotGenerationHistory';
import { toast } from 'sonner';
import { validateGenerationConfig } from '@/utils/promptSecurity';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';

type GenerationType = 'grid' | 'single' | 'video' | 'edit' | 'batch' | null;
type EditModel = 'seedream' | 'gemini';
type BatchMode = 'grid' | 'seedream';

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
  gridRows: number;
  gridCols: number;
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
  const [editModel, setEditModel] = useState<EditModel>('gemini');
  const [batchMode, setBatchMode] = useState<BatchMode>('grid');
  const [batchScope, setBatchScope] = useState<'scene' | 'project'>('scene');
  const [showBatchConfig, setShowBatchConfig] = useState(false);

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

  // Sync selected scene ID safely
  useEffect(() => {
    if (currentScene && selectedSceneId !== currentScene.id) {
      setSelectedSceneId(currentScene.id);
    } else if (isSceneSelected && currentSceneId && selectedSceneId !== currentSceneId) {
      setSelectedSceneId(currentSceneId);
    }
  }, [currentScene, currentSceneId, isSceneSelected, selectedSceneId]);

  // Auto-select generation type based on selection
  useEffect(() => {
    if (isShotSelected) {
      // When shot is selected, default to single image generation
      if (!generationType || generationType === 'grid') {
        setGenerationType('single');
      }
    } else if (isSceneSelected) {
      // When scene is selected, default to grid generation
      if (!generationType || generationType === 'single') {
        setGenerationType('grid');
      }
    }
  }, [isShotSelected, isSceneSelected]);

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

      // Get selected shot for context
      const selectedShot = project?.shots.find(s => s.id === selectedShotId);

      // Enrich prompt with character and location context
      const { enrichedPrompt, usedCharacters, usedLocations } = enrichPromptWithAssets(
        prompt,
        project,
        selectedShot?.description
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

      // 使用项目的画面比例生成图片
      const projectAspectRatio = project?.settings.aspectRatio;
      const imageUrl = await volcanoService.generateSingleImage(enrichedPrompt, projectAspectRatio);

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
    // 🔍 调试：确认函数被调用
    console.log('[ProPanel] ========== handleGenerateGrid CALLED ==========');
    console.log('[ProPanel] prompt:', prompt);
    console.log('[ProPanel] selectedSceneId:', selectedSceneId);

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
      const sortedSceneShots = [...sceneShots].sort((a, b) => (a.order || 0) - (b.order || 0));
      const unassignedShots = sortedSceneShots.filter((shot) => !shot.referenceImage);

      if (unassignedShots.length === 0) {
        toast.warning('该场景所有镜头都已分配图片', {
          description: '如需重新生成，请先删除镜头的现有图片'
        });
        return;
      }

      // 先取未分配的镜头，不足则从场景中相邻（按 order）补齐
      const targetShots: typeof sceneShots = [];
      for (const shot of unassignedShots) {
        if (targetShots.length >= totalSlices) break;
        targetShots.push(shot);
      }
      if (targetShots.length < totalSlices) {
        for (const shot of sortedSceneShots) {
          if (targetShots.length >= totalSlices) break;
          if (targetShots.find((s) => s.id === shot.id)) continue;
          targetShots.push(shot);
        }
      }

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

      // 🔍 调试：输出增强提示词
      console.log('[ProPanel Grid Debug] ========== START ==========');
      console.log('[ProPanel Grid Debug] selectedSceneId:', selectedSceneId);
      console.log('[ProPanel Grid Debug] targetScene.name:', targetScene.name);
      console.log('[ProPanel Grid Debug] targetScene.description:', targetScene.description);
      console.log('[ProPanel Grid Debug] project?.metadata.artStyle:', project?.metadata.artStyle);
      console.log('[ProPanel Grid Debug] targetShots:', targetShots.map(s => ({
        id: s.id,
        order: s.order,
        shotSize: s.shotSize,
        cameraMovement: s.cameraMovement,
        description: s.description,
        narration: s.narration,
        dialogue: s.dialogue
      })));
      console.log('[ProPanel Grid Debug] targetShots.length:', targetShots.length);
      console.log('[ProPanel Grid Debug] enhancedPrompt:', enhancedPrompt);
      console.log('[ProPanel Grid Debug] user input prompt:', prompt);
      console.log('[ProPanel Grid Debug] ========== END ==========');

      // 聚合参考图：上传 + 角色/场景资源库 + 场景/镜头的引用
      const refImagesFromUpload = await Promise.all(
        referenceImages.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            mimeType: file.type,
            data: base64,
          };
        })
      );

      const refUrlSet = new Set<string>();
      const addUrls = (urls?: string[]) => {
        urls?.forEach((u) => refUrlSet.add(u));
      };

      targetShots.forEach((shot) => {
        shot.mainCharacters?.forEach((name) => {
          const c = project?.characters.find((ch) => ch.name === name);
          addUrls(c?.referenceImages);
        });
        shot.mainScenes?.forEach((name) => {
          const l = project?.locations.find((loc) => loc.name === name);
          addUrls(l?.referenceImages);
        });
      });

      const refImagesFromAssets = await urlsToReferenceImages(Array.from(refUrlSet));
      const refImages = [...refImagesFromUpload, ...refImagesFromAssets];

      // 🔍 调试：输出参考图信息
      console.log('[ProPanel Grid Debug] refUrlSet:', refUrlSet);
      console.log('[ProPanel Grid Debug] refImages.length:', refImages.length);

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
        gridRows: rows,
        gridCols: cols,
      });
    } catch (error: any) {
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
    const [rows, cols] = historyItem.gridSize === '2x2' ? [2, 2] : [3, 3];
    setGridResult({
      fullImage: historyItem.fullGridUrl,
      slices: historyItem.slices,
      sceneId: selectedSceneId,
      gridRows: rows,
      gridCols: cols,
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
        videoTask.id,
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

  const handleApplyHistory = (item: GenerationHistoryItem) => {
    if (!selectedShotId) return;

    if (item.type === 'image') {
      updateShot(selectedShotId, {
        referenceImage: item.result,
        fullGridUrl: item.parameters.fullGridUrl as string | undefined, // Restore grid source if available
        status: 'done',
      });
      toast.success('已应用此版本图片');
    } else if (item.type === 'video') {
      updateShot(selectedShotId, {
        videoClip: item.result,
        status: 'done',
      });
      toast.success('已应用此版本视频');
    }
  };

  const handleEditImage = async () => {
    if (!prompt.trim()) {
      toast.error('请输入编辑提示词');
      return;
    }

    if (!selectedShotId || !selectedShot?.referenceImage) {
      toast.error('请先选择有图片的镜头');
      return;
    }

    // 🔒 安全验证
    const validation = validateGenerationConfig({ prompt });
    if (!validation.isValid) {
      toast.error('提示词包含不安全内容', {
        description: validation.errors.join('\n')
      });
      return;
    }

    setIsGenerating(true);
    const loadingToast = toast.loading(`使用 ${editModel === 'gemini' ? 'Gemini' : 'SeeDream'} 编辑图片中...`);

    try {
      const projectAspectRatio = project?.settings.aspectRatio || AspectRatio.WIDE;
      let editedImageUrl: string;

      if (editModel === 'gemini') {
        // 使用 Gemini 编辑
        editedImageUrl = await editImageWithGemini(
          selectedShot.referenceImage,
          prompt,
          projectAspectRatio
        );
      } else {
        // 使用 SeeDream 编辑
        const volcanoService = new VolcanoEngineService();
        editedImageUrl = await volcanoService.editImage(
          selectedShot.referenceImage,
          prompt,
          projectAspectRatio
        );
      }

      // 更新镜头图片
      updateShot(selectedShotId, {
        referenceImage: editedImageUrl,
        status: 'done',
      });

      // 添加到生成历史
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}`,
        type: 'image',
        timestamp: new Date(),
        result: editedImageUrl,
        prompt: prompt,
        parameters: {
          model: editModel === 'gemini' ? 'Gemini Image Edit' : 'SeeDream Edit',
          aspectRatio: projectAspectRatio,
          originalImage: selectedShot.referenceImage,
        },
        status: 'success',
      };
      addGenerationHistory(selectedShotId, historyItem);

      toast.success('图片编辑成功！', {
        id: loadingToast,
      });
    } catch (error) {
      console.error('Image edit error:', error);
      const errorMessage = error instanceof Error ? error.message : '图片编辑失败';
      toast.error('图片编辑失败', {
        id: loadingToast,
        description: `${errorMessage}\n\n请检查：\n1. API 配置是否正确\n2. 图片格式是否支持\n3. 提示词是否有效`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchGenerate = async () => {
    // Only validate scene selection for scene-level generation
    if (batchScope === 'scene' && !selectedSceneId) {
      toast.warning('请先选择一个场景');
      return;
    }

    setIsGenerating(true);

    // Find target shots based on scope
    let targetShots: Shot[] = [];

    if (batchScope === 'scene') {
      // Scene-level batch generation
      const targetScene = scenes.find(s => s.id === selectedSceneId);
      if (!targetScene) {
        toast.error('请先选择一个场景');
        setIsGenerating(false);
        return;
      }

      const unassignedShots = shots.filter(s => s.sceneId === selectedSceneId && !s.referenceImage);

      if (unassignedShots.length === 0) {
        const confirmAll = confirm('该场景所有镜头都已有图片。是否重新生成所有镜头的图片？');
        if (!confirmAll) {
          setIsGenerating(false);
          return;
        }
        targetShots = shots.filter(s => s.sceneId === selectedSceneId);
      } else {
        targetShots = unassignedShots;
      }
    } else {
      // Project-level batch generation
      const unassignedShots = shots.filter(s => !s.referenceImage);

      if (unassignedShots.length === 0) {
        const confirmAll = confirm('项目中所有镜头都已有图片。是否重新生成所有镜头的图片？');
        if (!confirmAll) {
          setIsGenerating(false);
          return;
        }
        targetShots = shots;
      } else {
        targetShots = unassignedShots;
      }
    }

    const modeLabel = batchMode === 'grid' ? 'Grid (Gemini)' : 'SeeDream (火山引擎)';
    const scopeLabel = batchScope === 'scene' ? '当前场景' : '整个项目';
    const initialToast = toast.info(`开始批量生成 ${targetShots.length} 个镜头...`, {
      description: `${scopeLabel} | 使用 ${modeLabel} 模式`
    });

    try {
      const volcanoService = new VolcanoEngineService();
      let successCount = 0;
      let failCount = 0;
      let currentToast = initialToast;

      // Process sequentially to avoid rate limits
      for (let i = 0; i < targetShots.length; i++) {
        const shot = targetShots[i];
        try {
          // Update toast with current progress
          toast.loading(`正在生成 [${i + 1}/${targetShots.length}] 镜头 #${shot.order}`, {
            id: currentToast,
            description: `预计还需 ${Math.ceil((targetShots.length - i) * 3)} 秒`
          });

          // Mark shot as generating
          updateShot(shot.id, { status: 'generating' as any });

          // Construct prompt
          let shotPrompt = shot.description || 'Cinematic shot';
          const shotScene = scenes.find(s => s.id === shot.sceneId);
          if (shotScene?.description) shotPrompt = `Scene: ${shotScene.description}. ` + shotPrompt;
          if (project?.metadata.artStyle) shotPrompt += `. Style: ${project.metadata.artStyle}`;

          // Enrich prompt with character and location context
          const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(
            shotPrompt,
            project,
            shot.description
          );
          shotPrompt = enrichedPrompt;

          if (batchMode === 'grid') {
            // 使用 Grid 模式 (Gemini)
            // 转换参考图 URL 为 Gemini 格式
            const refImages = referenceImageUrls.length > 0
              ? await urlsToReferenceImages(referenceImageUrls)
              : [];

            const result = await generateMultiViewGrid(
              shotPrompt,
              2, 2,
              project?.settings.aspectRatio || AspectRatio.WIDE,
              ImageSize.K4,
              refImages // 传递参考图
            );

            updateShot(shot.id, {
              referenceImage: result.slices[0],
              fullGridUrl: result.fullImage,
              gridImages: result.slices,
              status: 'done'
            });

            addGenerationHistory(shot.id, {
              id: `gen_${Date.now()}`,
              type: 'image',
              timestamp: new Date(),
              result: result.slices[0],
              prompt: shotPrompt,
              parameters: {
                model: 'Gemini Grid',
                gridSize: '2x2',
                fullGridUrl: result.fullImage
              },
              status: 'success'
            });
          } else {
            // 使用 SeeDream 模式 (Volcano)
            try {
              const imageUrl = await volcanoService.generateSingleImage(
                shotPrompt,
                project?.settings.aspectRatio
              );

              updateShot(shot.id, {
                referenceImage: imageUrl,
                status: 'done'
              });

              addGenerationHistory(shot.id, {
                id: `gen_${Date.now()}`,
                type: 'image',
                timestamp: new Date(),
                result: imageUrl,
                prompt: shotPrompt,
                parameters: {
                  model: 'SeeDream',
                  aspectRatio: project?.settings.aspectRatio
                },
                status: 'success'
              });
            } catch (seedreamError: any) {
              // 检测是否为模型未激活错误
              const isModelNotOpen = seedreamError.message?.includes('ModelNotOpen') ||
                                    seedreamError.message?.includes('404');

              if (isModelNotOpen) {
                // 降级到 Gemini Grid
                toast.warning(`SeeDream 模型未激活，降级使用 Gemini Grid`, {
                  description: `镜头 #${shot.order}`
                });

                // 转换参考图 URL 为 Gemini 格式
                const refImages = referenceImageUrls.length > 0
                  ? await urlsToReferenceImages(referenceImageUrls)
                  : [];

                const result = await generateMultiViewGrid(
                  shotPrompt,
                  2, 2,
                  project?.settings.aspectRatio || AspectRatio.WIDE,
                  ImageSize.K4,
                  refImages // 传递参考图
                );

                updateShot(shot.id, {
                  referenceImage: result.slices[0],
                  fullGridUrl: result.fullImage,
                  gridImages: result.slices,
                  status: 'done'
                });

                addGenerationHistory(shot.id, {
                  id: `gen_${Date.now()}`,
                  type: 'image',
                  timestamp: new Date(),
                  result: result.slices[0],
                  prompt: shotPrompt,
                  parameters: {
                    model: 'Gemini Grid (降级)',
                    gridSize: '2x2',
                    fullGridUrl: result.fullImage
                  },
                  status: 'success'
                });
              } else {
                throw seedreamError;
              }
            }
          }

          successCount++;
        } catch (error: any) {
          console.error(`Failed to generate for shot ${shot.id}:`, error);
          const errorMsg = error.message || '生成失败';
          toast.error(`镜头 #${shot.order} 生成失败`, {
            description: errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg
          });
          updateShot(shot.id, { status: 'error' });
          failCount++;
        }
      }

      toast.success('批量生成完成', {
        id: currentToast,
        description: `✅ 成功: ${successCount} 个 | ❌ 失败: ${failCount} 个`
      });
    } catch (e) {
      console.error(e);
      toast.error('批量生成过程中断');
    } finally {
      setIsGenerating(false);
      setShowBatchConfig(false);
    }
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
        <div className={`grid gap-2 ${isShotSelected ? 'grid-cols-3' : 'grid-cols-3'}`}>
          <button
            onClick={() => setGenerationType('single')}
            className={`border rounded-lg p-3 transition-colors ${generationType === 'single'
              ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
              : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
              }`}
          >
            <ImageIcon size={20} className="mx-auto mb-1" />
            <div className="text-xs">单图生成</div>
          </button>

          {/* Edit button - Only show for shot-level with existing image */}
          {isShotSelected && selectedShot?.referenceImage && (
            <button
              onClick={() => setGenerationType('edit')}
              className={`border rounded-lg p-3 transition-colors ${generationType === 'edit'
                ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                }`}
              title="编辑当前图片"
            >
              <Wand2 size={20} className="mx-auto mb-1" />
              <div className="text-xs">图片编辑</div>
            </button>
          )}

          {/* Grid button - Only show for scene-level */}
          {isSceneSelected && (
            <>
              <button
                onClick={() => setGenerationType('grid')}
                className={`border rounded-lg p-3 transition-colors ${generationType === 'grid'
                  ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                  }`}
              >
                <Grid3x3 size={20} className="mx-auto mb-1" />
                <div className="text-xs">Grid 多视图</div>
              </button>

              <button
                onClick={() => setShowBatchConfig(true)}
                disabled={isGenerating}
                className={`border rounded-lg p-3 transition-colors ${showBatchConfig
                  ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                  }`}
                title="一键为当前场景所有空缺镜头生成图片"
              >
                <Sparkles size={20} className="mx-auto mb-1 text-purple-400" />
                <div className="text-xs">批量生成</div>
              </button>
            </>
          )}

          <button
            onClick={() => setGenerationType('video')}
            className={`border rounded-lg p-3 transition-colors ${generationType === 'video'
              ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
              : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
              }`}
          >
            <Video size={20} className="mx-auto mb-1" />
            <div className="text-xs">视频生成</div>
          </button>
        </div>
      </div>

      {showBatchConfig && (
        <>
          {/* Batch Generation Configuration */}
          <div className="bg-light-accent/5 dark:bg-cine-accent/5 border border-light-accent/30 dark:border-cine-accent/30 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-light-text dark:text-white">批量生成配置</h3>
              <button
                onClick={() => setShowBatchConfig(false)}
                className="text-xs text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white"
              >
                ✕ 关闭
              </button>
            </div>

            {/* Generation Scope Selection */}
            <div>
              <h4 className="text-xs font-bold mb-2 text-light-text dark:text-white">生成范围</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setBatchScope('scene')}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${batchScope === 'scene'
                    ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                    }`}
                >
                  当前场景
                </button>
                <button
                  onClick={() => setBatchScope('project')}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${batchScope === 'project'
                    ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                    }`}
                >
                  整个项目
                </button>
              </div>
            </div>

            {/* Generation Mode Selection */}
            <div>
              <h4 className="text-xs font-bold mb-2 text-light-text dark:text-white">生成模式</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setBatchMode('grid')}
                  className={`flex-1 border rounded-lg px-3 py-3 text-sm transition-colors ${batchMode === 'grid'
                    ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                    }`}
                >
                  <div className="font-bold">Grid 多视图</div>
                  <div className="text-xs opacity-80 mt-1">Gemini 生成 2x2 切片</div>
                </button>
                <button
                  onClick={() => setBatchMode('seedream')}
                  className={`flex-1 border rounded-lg px-3 py-3 text-sm transition-colors ${batchMode === 'seedream'
                    ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                    }`}
                >
                  <div className="font-bold">SeeDream 单图</div>
                  <div className="text-xs opacity-80 mt-1">火山引擎高质量生成</div>
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted bg-light-bg/50 dark:bg-cine-black/30 rounded p-3">
              <div className="font-bold mb-1">📋 说明：</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  {batchScope === 'scene'
                    ? '将为当前场景的所有未生成图片的镜头批量生成'
                    : '将为整个项目的所有未生成图片的镜头批量生成'}
                </li>
                <li>已有图片的镜头会跳过（可手动重新生成）</li>
                <li>Grid 模式：生成 4 张变体，自动选择第一张</li>
                <li>SeeDream 模式：直接生成单张高质量图片</li>
              </ul>
            </div>

            {/* Start Button */}
            <button
              onClick={handleBatchGenerate}
              disabled={isGenerating}
              className="w-full bg-light-accent dark:bg-cine-accent text-white py-3 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  批量生成中...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  开始批量生成
                </>
              )}
            </button>
          </div>
        </>
      )}

      {generationType === 'edit' && selectedShot?.referenceImage && (
        <>
          {/* Current Image Preview */}
          <div>
            <h3 className="text-sm font-bold mb-3">当前图片</h3>
            <div className="relative group">
              <img
                src={selectedShot.referenceImage}
                alt="Current Image"
                className="w-full rounded-lg border border-light-border dark:border-cine-border"
              />
              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                原图
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <h3 className="text-sm font-bold mb-3">编辑模型</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setEditModel('gemini')}
                className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${editModel === 'gemini'
                  ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                  }`}
              >
                Gemini 3 Pro
              </button>
              <button
                onClick={() => setEditModel('seedream')}
                className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${editModel === 'seedream'
                  ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                  }`}
              >
                SeeDream 4.5
              </button>
            </div>
            <div className="mt-2 text-xs text-light-text-muted dark:text-cine-text-muted">
              {editModel === 'gemini'
                ? '使用 Gemini 编辑：支持风格转换、构图调整、细节修改等各种编辑'
                : '使用 SeeDream 编辑：基于原图生成变体，支持风格和内容的灵活调整'}
            </div>
          </div>
        </>
      )}

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
                    const latestGrid = selectedScene!.gridHistory![0];
                    return (
                      <div className="bg-light-bg dark:bg-cine-black/30 border border-light-border dark:border-cine-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium text-light-accent dark:text-cine-accent">
                            历史记录 ({selectedScene!.gridHistory!.length} 条)
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
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${gridSize === size
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
              : generationType === 'edit'
                ? '描述你想要的修改...\n例如：\n- 改为赛博朋克风格\n- 将背景改为白天的街道\n- 增加更多人物和细节\n- 完全重新构图，改为俯视角度'
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
          } else if (generationType === 'edit') {
            handleEditImage();
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
                  : generationType === 'edit'
                    ? '编辑图片'
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
                className={`text-xs px-2 py-1 rounded ${selectedShot.status === 'done'
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
                  onApply={handleApplyHistory}
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
          gridRows={gridResult.gridRows}
          gridCols={gridResult.gridCols}
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
