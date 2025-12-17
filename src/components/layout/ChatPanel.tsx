'use client';
// deprecated
import {
  Send,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  X,
  Upload,
  Grid3x3,
  History
} from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, generateSingleImage, editImageWithGemini, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, ImageSize, GenerationHistoryItem } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { toast } from 'sonner';
import { storageService } from '@/lib/storageService';
import { validateGenerationConfig } from '@/utils/promptSecurity';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatShotLabel } from '@/utils/shotOrder';

// Model types
type GenerationModel = 'seedream' | 'gemini-direct' | 'gemini-grid';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: string[]; // User uploaded images or generated images
  referenceImages?: string[]; // Reference images used
  model?: GenerationModel;
  gridData?: {
    fullImage: string;
    slices: string[];
  };
}

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
  gridRows: number;
  gridCols: number;
}

export default function ChatPanel() {
  const {
    project,
    selectedShotId,
    updateShot,
    addGenerationHistory,
    currentSceneId,
  } = useProjectStore();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState<GenerationModel>('gemini-grid');
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [pendingState, setPendingState] = useState<Record<string, { loading: boolean; message?: string }>>({});

  // Grid specific state
  const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
  const [gridResult, setGridResult] = useState<GridGenerationResult | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shots = project?.shots || [];
  const scenes = project?.scenes || [];
  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const selectedScene = scenes.find((s) => s.id === (selectedShot?.sceneId || currentSceneId));
  const selectedShotLabel = selectedShot ? formatShotLabel(selectedScene?.order, selectedShot.order, selectedShot.globalOrder) : undefined;
  const projectId = project?.id || 'default';
  const { user } = useAuth();

  const requireAuthForAI = () => {
    if (!user) {
      toast.error('请先登录以使用 AI 功能', {
        action: {
          label: '去登录',
          onClick: () => {
            window.location.href = '/auth/login';
          },
        },
      });
      return false;
    }
    return true;
  };

  const contextKey = useMemo(() => {
    if (selectedShotId) return `pro-chat:${projectId}:shot:${selectedShotId}`;
    if (currentSceneId) return `pro-chat:${projectId}:scene:${currentSceneId}`;
    return `pro-chat:${projectId}:global`;
  }, [projectId, selectedShotId, currentSceneId]);

  const currentPending = contextKey ? pendingState[contextKey] : undefined;
  const isGenerating = Boolean(currentPending?.loading);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history per上下文
  useEffect(() => {
    try {
      const saved = contextKey ? localStorage.getItem(contextKey) : null;
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(parsed);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.warn('Failed to load pro chat history', e);
      setMessages([]);
    }
  }, [contextKey]);

  // Persist chat history per上下文
  useEffect(() => {
    if (!contextKey) return;
    try {
      const serializable = messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }));
      localStorage.setItem(contextKey, JSON.stringify(serializable));
    } catch (e) {
      console.warn('Failed to save pro chat history', e);
    }
  }, [messages, contextKey]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedImages(prev => [...prev, ...files]);
  };

  // Remove uploaded image
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Convert File to base64 for display
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle send message
  const handleSend = async () => {
    if (!inputText.trim() && uploadedImages.length === 0) {
      toast.error('请输入提示词或上传图片');
      return;
    }

    // Validate prompt
    const validation = validateGenerationConfig({ prompt: inputText });
    if (!validation.isValid) {
      toast.error('提示词包含不安全内容', {
        description: validation.errors.join('\n')
      });
      return;
    }

    if (!requireAuthForAI()) return;

    // Convert uploaded images to data URLs for display
    const imageDataUrls = await Promise.all(
      uploadedImages.map(file => fileToDataURL(file))
    );

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      images: imageDataUrls,
      model: selectedModel,
    };

    setMessages(prev => [...prev, userMessage]);

    // Clear input
    const promptText = inputText;
    const imageFiles = [...uploadedImages];
    setInputText('');
    setUploadedImages([]);

    // Generate based on selected model（只锁定当前上下文）
    setPendingState((prev) => ({
      ...prev,
      [contextKey]: { loading: true, message: '正在生成...' }
    }));
    try {
      switch (selectedModel) {
        case 'seedream':
          await handleSeeDreamGeneration(promptText, imageFiles);
          break;
        case 'gemini-direct':
          await handleGeminiDirectGeneration(promptText, imageFiles);
          break;
        case 'gemini-grid':
          await handleGeminiGridGeneration(promptText, imageFiles);
          break;
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `生成失败: ${error.message || '未知错误'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error('生成失败', {
        description: error.message
      });
    } finally {
      setPendingState((prev) => {
        const next = { ...prev };
        if (contextKey) {
          delete next[contextKey];
        }
        return next;
      });
    }
  };

  // SeeDream generation
  const handleSeeDreamGeneration = async (prompt: string, imageFiles: File[]) => {
    const volcanoService = new VolcanoEngineService();

    // Enrich prompt with assets
    const { enrichedPrompt, usedCharacters, usedLocations } = enrichPromptWithAssets(
      prompt,
      project,
      selectedShot?.description
    );

    // Show asset usage info
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

    const projectAspectRatio = project?.settings.aspectRatio;
    let imageUrl = await volcanoService.generateSingleImage(enrichedPrompt, projectAspectRatio);

    // Upload to R2
    try {
      const folder = `projects/${project?.id}/shots/${selectedShotId || 'chat'}`;
      imageUrl = await storageService.uploadBase64ToR2(imageUrl, folder, `gen_${Date.now()}.png`, user?.id || 'anonymous');
    } catch (error) {
      console.error('R2 upload failed, using base64 fallback:', error);
    }

    // Update shot if selected
    if (selectedShotId) {
      updateShot(selectedShotId, {
        referenceImage: imageUrl,
        status: 'done',
      });

      // Add to history
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}`,
        type: 'image',
        timestamp: new Date(),
        result: imageUrl,
        prompt: prompt,
        parameters: {
          model: 'SeeDream',
          aspectRatio: projectAspectRatio,
        },
        status: 'success',
      };
      addGenerationHistory(selectedShotId, historyItem);
    }

    // Add assistant message with result
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: '已使用 SeeDream 生成图片',
      timestamp: new Date(),
      images: [imageUrl],
      model: 'seedream',
    };
    setMessages(prev => [...prev, assistantMessage]);

    toast.success('SeeDream 生成成功！');
  };

  // Gemini direct generation (single image without grid)
  const handleGeminiDirectGeneration = async (prompt: string, imageFiles: File[]) => {
    const skipAssetRefs = imageFiles.length > 0;

    // Enrich prompt with assets
    const { enrichedPrompt, referenceImageUrls, usedCharacters, usedLocations } = enrichPromptWithAssets(
      prompt,
      project,
      selectedShot?.description
    );

    // Show asset usage info
    if (!skipAssetRefs && (usedCharacters.length > 0 || usedLocations.length > 0)) {
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

    // Convert uploaded files to ReferenceImageData
    const uploadedRefImages = await Promise.all(
      imageFiles.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          mimeType: file.type,
          data: base64,
        };
      })
    );

    // Convert asset reference URLs to ReferenceImageData
    const assetRefImages = !skipAssetRefs && referenceImageUrls.length > 0
      ? await urlsToReferenceImages(referenceImageUrls)
      : [];

    // 用户上传则只用用户参考图，否则自动使用资产参考图
    const allRefImages = uploadedRefImages.length > 0
      ? uploadedRefImages
      : assetRefImages;

    // Generate single image with Gemini
    let imageUrl = await generateSingleImage(
      enrichedPrompt,
      project?.settings.aspectRatio || AspectRatio.WIDE,
      allRefImages
    );

    // Upload to R2
    try {
      const folder = `projects/${project?.id}/shots/${selectedShotId || 'chat'}`;
      imageUrl = await storageService.uploadBase64ToR2(imageUrl, folder, `gen_${Date.now()}.png`, user?.id || 'anonymous');
    } catch (error) {
      console.error('R2 upload failed, using base64 fallback:', error);
    }

    // Update shot if selected
    if (selectedShotId) {
      updateShot(selectedShotId, {
        referenceImage: imageUrl,
        status: 'done',
      });

      // Add to history
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}`,
        type: 'image',
        timestamp: new Date(),
        result: imageUrl,
        prompt: prompt,
        parameters: {
          model: 'Gemini Direct',
          aspectRatio: project?.settings.aspectRatio,
        },
        status: 'success',
      };
      addGenerationHistory(selectedShotId, historyItem);
    }

    // Add assistant message with result
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: '已使用 Gemini 直接生成图片',
      timestamp: new Date(),
      images: [imageUrl],
      model: 'gemini-direct',
    };
    setMessages(prev => [...prev, assistantMessage]);

    toast.success('Gemini 直出成功！');
  };

  // Gemini Grid generation
  const handleGeminiGridGeneration = async (prompt: string, imageFiles: File[]) => {
    // 补充镜头/场景的角色/地点名称，确保参考图被识别
    const assetNameHints: string[] = [];
    if (selectedShot?.mainCharacters?.length) {
      assetNameHints.push(`角色: ${selectedShot.mainCharacters.join(', ')}`);
    }
    if (selectedShot?.mainScenes?.length) {
      assetNameHints.push(`场景: ${selectedShot.mainScenes.join(', ')}`);
    }

    // Enrich prompt with assets (包含参考图编号标记)
    const { enrichedPrompt, referenceImageUrls, referenceImageMap, usedCharacters, usedLocations } = enrichPromptWithAssets(
      [prompt, assetNameHints.join(' | ')].filter(Boolean).join('\n'),
      project,
      selectedShot?.description
    );
    const finalPrompt = enrichedPrompt;

    // 参考图顺序：按 referenceImageMap 的编号，避免与提示词标记错位
    const orderedAssetUrls = referenceImageMap.map((ref) => ref.imageUrl);

    // Convert uploaded files to ReferenceImageData
    const uploadedRefImages = await Promise.all(
      imageFiles.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          mimeType: file.type,
          data: base64,
        };
      })
    );

    // Convert asset reference URLs to ReferenceImageData（严格按顺序）
    const assetRefImages = orderedAssetUrls.length > 0
      ? await urlsToReferenceImages(orderedAssetUrls)
      : [];

    // Combine all reference images（资产在前，上传在后，保证编号对应资产参考图）
    const allRefImages = [...assetRefImages, ...uploadedRefImages];

    // 资产提示信息
    if (usedCharacters.length > 0 || usedLocations.length > 0) {
      const info: string[] = [];
      if (usedCharacters.length > 0) info.push(`角色: ${usedCharacters.map(c => c.name).join(', ')}`);
      if (usedLocations.length > 0) info.push(`场景: ${usedLocations.map(l => l.name).join(', ')}`);
      toast.info('正在使用参考图保持一致性', { description: info.join(' | ') });
    }

    // Generate Grid
    const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
    setPendingState((prev) => ({
      ...prev,
      [contextKey]: { loading: true, message: `正在生成 ${gridSize} Grid (${rows * cols} 张切片)...` }
    }));
    let result;
    try {
      result = await generateMultiViewGrid(
        finalPrompt,
        rows,
        cols,
        project?.settings.aspectRatio || AspectRatio.WIDE,
        ImageSize.K4,
        allRefImages
      );
    } catch (error: any) {
      throw error;
    }

    // Find current scene
    const currentScene = currentSceneId
      ? scenes.find(s => s.id === currentSceneId)
      : selectedShot
        ? scenes.find(s => s.shotIds.includes(selectedShotId!))
        : null;

    // Show Grid preview modal (Immediate Base64)
    if (currentScene) {
      setGridResult({
        fullImage: result.fullImage,
        slices: result.slices,
        sceneId: currentScene.id,
        gridRows: rows,
        gridCols: cols,
      });

      // Background Upload to R2
      const folder = `projects/${project?.id}/grids`;
      Promise.all([
        storageService.uploadBase64ToR2(result.fullImage, folder, `grid_full_${Date.now()}.png`, user?.id || 'anonymous'),
        storageService.uploadBase64ArrayToR2(result.slices, folder, user?.id || 'anonymous')
      ]).then(([fullGridUrl, slices]) => {
        // Update Grid result with R2 URLs (only if modal is still open)
        setGridResult(prev => prev ? ({
          ...prev,
          fullImage: fullGridUrl,
          slices: slices
        }) : null);
      }).catch(err => {
        console.error('Grid background upload failed:', err);
      });
    }

    // Add assistant message with grid result
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `已生成 ${gridSize} Grid (${rows * cols} 个视图)`,
      timestamp: new Date(),
      images: [result.fullImage],
      model: 'gemini-grid',
      gridData: {
        fullImage: result.fullImage,
        slices: result.slices,
      },
    };
    setMessages(prev => [...prev, assistantMessage]);

    // success toast removed; inline消息和pending提示即可
  };

  // Helper: Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Render message
  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex justify-end mb-4">
          <div className="max-w-[70%]">
            {msg.images && msg.images.length > 0 && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {msg.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Upload ${idx + 1}`}
                    className="rounded-lg border border-light-border dark:border-cine-border max-h-32 object-cover"
                  />
                ))}
              </div>
            )}
            <div className="bg-black/5 dark:bg-white/10 text-light-text dark:text-white rounded-2xl rounded-tr-sm px-5 py-3 backdrop-blur-md border border-black/5 dark:border-white/5">
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              <div className="text-[10px] opacity-60 mt-1 text-right">
                {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Assistant message
    return (
      <div key={msg.id} className="flex justify-start mb-4">
        <div className="max-w-[70%]">
          <div className="bg-white/80 dark:bg-[#1a1a1a]/80 border border-black/5 dark:border-white/10 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm backdrop-blur-md">
            <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap mb-2 leading-relaxed">
              {msg.content}
            </div>
            {msg.images && msg.images.length > 0 && (
              <div className="mt-3 space-y-2">
                {msg.images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img}
                      alt={`Result ${idx + 1}`}
                      className="rounded-lg border border-light-border dark:border-cine-border w-full cursor-pointer hover:border-light-accent dark:hover:border-cine-accent transition-colors"
                      onClick={() => {
                        // TODO: Open image in fullscreen
                      }}
                    />
                    {msg.gridData && (
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Grid3x3 size={12} />
                        Grid {gridSize}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-2">
              {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              {msg.model && (
                <span className="ml-2">
                  · {msg.model === 'seedream' ? 'SeeDream' : msg.model === 'gemini-direct' ? 'Gemini 直出' : 'Gemini Grid'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-3xl">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5">
        <h2 className="text-lg font-bold text-light-text dark:text-white">
          Pro 模式 - AI 对话生成
        </h2>
        <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
          {selectedShotId
            ? `当前镜头: ${selectedShotLabel || '未知'}`
            : currentSceneId
              ? `当前场景: ${scenes.find(s => s.id === currentSceneId)?.name || '未知'}`
              : '未选择镜头或场景'}
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isGenerating && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border text-xs text-light-text-muted dark:text-cine-text-muted">
            {currentPending?.message || '正在生成当前场景/镜头的内容...'}
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles size={48} className="text-light-accent dark:text-cine-accent mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-light-text dark:text-white mb-2">
              开始创作
            </h3>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted max-w-md">
              输入提示词,选择生成模型,开始创作您的分镜图片。支持上传参考图、使用角色/场景资源库。
            </p>
          </div>
        )}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 m-4 mt-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-lg">
        {/* Uploaded Images Preview */}
        {uploadedImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadedImages.map((file, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Upload ${idx + 1}`}
                  className="h-16 w-16 rounded-lg border border-light-border dark:border-cine-border object-cover"
                />
                <button
                  onClick={() => removeUploadedImage(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Model Selection & Grid Size */}
        <div className="flex items-center gap-2 mb-3">
          <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
            模型:
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as GenerationModel)}
            className="text-xs bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded px-2 py-1 focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
          >
            <option value="seedream">SeeDream (火山引擎)</option>
            <option value="gemini-direct">Gemini 直出</option>
            <option value="gemini-grid">Gemini Grid</option>
          </select>

          {selectedModel === 'gemini-grid' && (
            <>
              <div className="text-xs text-light-text-muted dark:text-cine-text-muted ml-2">
                Grid:
              </div>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(e.target.value as '2x2' | '3x3')}
                className="text-xs bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded px-2 py-1 focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              >
                <option value="2x2">2x2 (4视图)</option>
                <option value="3x3">3x3 (9视图)</option>
              </select>
            </>
          )}
        </div>

        {/* Input Box */}
        <div className="flex gap-2">
          {/* Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            className="flex-shrink-0 p-2.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="上传参考图"
          >
            <ImageIcon size={22} className="text-gray-500 dark:text-gray-400" />
          </button>

          {/* Text Input */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入提示词... (Enter 发送, Shift+Enter 换行)"
            disabled={isGenerating}
            className="flex-1 bg-transparent border-none px-2 py-3 text-sm focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={isGenerating || (!inputText.trim() && uploadedImages.length === 0)}
            className="flex-shrink-0 w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {isGenerating ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        {/* Tips */}
        <div className="mt-2 text-xs text-light-text-muted dark:text-cine-text-muted">
          提示: 可以在提示词中提及角色或场景名称,系统会自动引用资源库中的参考图
        </div>
      </div>

      {/* Grid Preview Modal */}
      {gridResult && (
        <GridPreviewModal
          fullGridUrl={gridResult.fullImage}
          gridImages={gridResult.slices}
          sceneId={gridResult.sceneId}
          sceneOrder={scenes.find((s) => s.id === gridResult.sceneId)?.order}
          shots={shots}
          gridRows={gridResult.gridRows}
          gridCols={gridResult.gridCols}
          onAssign={(assignments) => {
            // 简单落盘到选中镜头：仅用于兼容旧入口
            Object.entries(assignments).forEach(([shotId, imageUrl]) => {
              updateShot(shotId, {
                referenceImage: imageUrl,
                fullGridUrl: gridResult.fullImage,
                status: 'done',
              });
            });
            setGridResult(null);
          }}
          onClose={() => setGridResult(null)}
        />
      )}
    </div>
  );
}
