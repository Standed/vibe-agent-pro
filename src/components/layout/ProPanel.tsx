'use client';

import { Sparkles, Image as ImageIcon, Video, Upload, Loader2, Grid3x3, History, Wand2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { AspectRatio, ImageSize, GridHistoryItem, GenerationHistoryItem, Shot, BatchMode, AIModel } from '@/types/project';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import GridHistoryModal from '@/components/grid/GridHistoryModal';
import ShotGenerationHistory from '@/components/shot/ShotGenerationHistory';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';
import { ModelSelector } from '@/components/pro/ModelSelector';
import { BatchConfig } from '@/components/pro/BatchConfig';
import { GenerationTypeSelector } from '@/components/pro/GenerationTypeSelector';
import { PromptInput } from '@/components/pro/PromptInput';
import { ShotDetailsPanel } from '@/components/pro/ShotDetailsPanel';
import { useProGeneration } from '@/hooks/useProGeneration';

type GenerationType = 'grid' | 'single' | 'video' | 'edit' | 'batch' | null;
type EditModel = 'seedream' | 'gemini';

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
  gridRows: number;
  gridCols: number;
}

export default function ProPanel() {
  const { user } = useAuth();
  const { project, currentSceneId, selectedShotId } = useProjectStore();
  const [generationType, setGenerationType] = useState<GenerationType>(null);
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
  const [selectedModel, setSelectedModel] = useState<AIModel>('seedream');
  const [jimengModel, setJimengModel] = useState('jimeng-4.0');
  const [jimengVideoModel, setJimengVideoModel] = useState('video-S3.0-Pro');

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

  const {
    isGenerating,
    handleGenerateSingleImage,
    handleGenerateGrid,
    handleGridAssignment,
    handleSelectGridHistory: handleSelectGridHistoryFromHook,
    handleGenerateVideo,
    handleRegenerate,
    handleDownload,
    handleFavorite,
    handleDubbing,
    handleApplyHistory,
    handleEditImage,
    handleBatchGenerate,
  } = useProGeneration({
    prompt,
    setPrompt,
    gridSize,
    aspectRatio,
    setAspectRatio,
    referenceImages,
    selectedModel,
    jimengModel,
    jimengVideoModel,
    editModel,
    batchMode,
    batchScope,
    setShowBatchConfig,
    setGridResult,
    setGenerationType,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReferenceImages((prev) => [...prev, ...files]);
  };

  const handleSelectGridHistory = (historyItem: GridHistoryItem) => {
    handleSelectGridHistoryFromHook(historyItem, selectedSceneId);
  };

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-light-text-muted dark:text-cine-text-muted">
        请先选择或创建一个项目
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-light-bg dark:bg-cine-bg overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

        {/* Generation Type Selector */}
        <GenerationTypeSelector
          generationType={generationType}
          setGenerationType={setGenerationType}
          isShotSelected={isShotSelected}
          isSceneSelected={!!isSceneSelected}
        />

        {/* Model Selection */}
        <ModelSelector
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          jimengModel={jimengModel}
          setJimengModel={setJimengModel}
          jimengVideoModel={jimengVideoModel}
          setJimengVideoModel={setJimengVideoModel}
          generationType={generationType}
        />

        {/* Batch Generation Configuration */}
        <BatchConfig
          showBatchConfig={showBatchConfig}
          setShowBatchConfig={setShowBatchConfig}
          batchScope={batchScope}
          setBatchScope={setBatchScope}
          batchMode={batchMode}
          setBatchMode={setBatchMode}
          isGenerating={isGenerating}
          handleBatchGenerate={() => handleBatchGenerate(selectedSceneId)}
        />

        {/* Edit Mode Configuration */}
        {generationType === 'edit' && (
          <div className="bg-light-bg-secondary dark:bg-cine-panel rounded-xl p-4 border border-light-border dark:border-cine-border space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-light-text dark:text-white flex items-center gap-2">
                <Wand2 size={16} className="text-light-accent dark:text-cine-accent" />
                图片编辑模式
              </h3>
              <div className="flex bg-light-bg dark:bg-cine-bg rounded-lg p-1 border border-light-border dark:border-cine-border">
                <button
                  onClick={() => setEditModel('gemini')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${editModel === 'gemini'
                    ? 'bg-light-accent dark:bg-cine-accent text-white shadow-sm'
                    : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
                    }`}
                >
                  Gemini
                </button>
                <button
                  onClick={() => setEditModel('seedream')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${editModel === 'seedream'
                    ? 'bg-light-accent dark:bg-cine-accent text-white shadow-sm'
                    : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
                    }`}
                >
                  SeeDream
                </button>
              </div>
            </div>

            {selectedShot?.referenceImage ? (
              <div className="relative aspect-video rounded-lg overflow-hidden border border-light-border dark:border-cine-border group">
                <img
                  src={selectedShot.referenceImage}
                  alt="Original"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-medium">当前原图</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-light-text-muted dark:text-cine-text-muted border border-dashed border-light-border dark:border-cine-border rounded-lg">
                请先选择一张有图片的镜头进行编辑
              </div>
            )}
          </div>
        )}

        {/* Grid Generation Configuration */}
        {generationType === 'grid' && (
          <div className="bg-light-bg-secondary dark:bg-cine-panel rounded-xl p-4 border border-light-border dark:border-cine-border space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3x3 size={16} className="text-light-accent dark:text-cine-accent" />
                <span className="text-sm font-bold text-light-text dark:text-white">Grid 生成设置</span>
              </div>
              <button
                onClick={() => setShowGridHistory(true)}
                className="text-xs flex items-center gap-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent transition-colors"
              >
                <History size={14} />
                历史记录
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider mb-1.5 block">
                  Grid 大小
                </label>
                <div className="flex bg-light-bg dark:bg-cine-bg rounded-lg p-1 border border-light-border dark:border-cine-border">
                  <button
                    onClick={() => setGridSize('2x2')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${gridSize === '2x2'
                      ? 'bg-light-accent dark:bg-cine-accent text-white shadow-sm'
                      : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
                      }`}
                  >
                    2x2 (4图)
                  </button>
                  <button
                    onClick={() => setGridSize('3x3')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${gridSize === '3x3'
                      ? 'bg-light-accent dark:bg-cine-accent text-white shadow-sm'
                      : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white'
                      }`}
                  >
                    3x3 (9图)
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider mb-1.5 block">
                  画幅比例
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="w-full bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                >
                  <option value={AspectRatio.WIDE}>16:9 宽画幅</option>
                  <option value={AspectRatio.CINEMA}>2.39:1 电影级</option>
                  <option value={AspectRatio.SQUARE}>1:1 正方形</option>
                  <option value={AspectRatio.PORTRAIT}>9:16 竖屏</option>
                </select>
              </div>
            </div>

            {/* Reference Image Upload */}
            <div>
              <label className="text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider mb-1.5 block">
                参考图 (可选)
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer group">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-light-border dark:border-cine-border rounded-lg text-xs text-light-text-muted dark:text-cine-text-muted group-hover:border-light-accent dark:group-hover:border-cine-accent group-hover:text-light-accent dark:group-hover:text-cine-accent transition-all">
                    <Upload size={14} />
                    <span>上传参考图 ({referenceImages.length})</span>
                  </div>
                </label>
                {referenceImages.length > 0 && (
                  <button
                    onClick={() => setReferenceImages([])}
                    className="p-2 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 transition-colors"
                    title="清除所有参考图"
                  >
                    <span className="text-xs">清除</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Prompt Input & Generate Button */}
        <div className="space-y-4">
          <PromptInput
            prompt={prompt}
            setPrompt={setPrompt}
            generationType={generationType}
          />

          <button
            onClick={() => {
              if (generationType === 'grid') {
                handleGenerateGrid(selectedSceneId);
              } else if (generationType === 'video') {
                handleGenerateVideo();
              } else if (generationType === 'edit') {
                handleEditImage();
              } else {
                handleGenerateSingleImage();
              }
            }}
            disabled={isGenerating}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] ${isGenerating
              ? 'bg-light-bg-secondary dark:bg-cine-panel text-light-text-muted dark:text-cine-text-muted cursor-not-allowed'
              : 'bg-gradient-to-r from-light-accent to-purple-600 dark:from-cine-accent dark:to-purple-500 text-white'
              }`}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>
                  {generationType === 'video' ? '视频生成中...' :
                    generationType === 'grid' ? 'Grid 生成中...' :
                      generationType === 'edit' ? 'AI 编辑中...' :
                        'AI 生成中...'}
                </span>
              </>
            ) : (
              <>
                {generationType === 'video' ? <Video size={16} /> :
                  generationType === 'edit' ? <Wand2 size={16} /> :
                    <Sparkles size={16} />}
                <span>
                  {generationType === 'video' ? '生成视频 (20积分)' :
                    generationType === 'grid' ? `生成 Grid (${gridSize === '2x2' ? '4' : '8'}积分)` :
                      generationType === 'edit' ? '开始编辑' :
                        '立即生成'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Shot Details & History */}
        {selectedShotId && selectedShot && (
          <ShotDetailsPanel
            selectedShot={selectedShot}
            handleDownload={handleDownload}
            handleRegenerate={handleRegenerate}
            handleApplyHistory={handleApplyHistory}
            handleFavorite={handleFavorite}
            handleDubbing={handleDubbing}
          />
        )}
      </div>

      {/* Modals */}
      {gridResult && (
        <GridPreviewModal
          gridImages={gridResult.slices}
          fullGridUrl={gridResult.fullImage}
          shots={shots.filter(s => s.sceneId === gridResult.sceneId)}
          sceneId={gridResult.sceneId}
          gridRows={gridResult.gridRows}
          gridCols={gridResult.gridCols}
          sceneOrder={scenes.find(s => s.id === gridResult.sceneId)?.order}
          onAssign={(assignments, favoriteSlices) => handleGridAssignment(gridResult, assignments, favoriteSlices)}
          onClose={() => setGridResult(null)}
        />
      )}

      {showGridHistory && (
        <GridHistoryModal
          sceneId={selectedSceneId}
          sceneName={scenes.find(s => s.id === selectedSceneId)?.name || '未知场景'}
          gridHistory={scenes.find(s => s.id === selectedSceneId)?.gridHistory || []}
          shots={shots.filter(s => s.sceneId === selectedSceneId)}
          onSelectHistory={handleSelectGridHistory}
          onClose={() => setShowGridHistory(false)}
        />
      )}
    </div>
  );
}
