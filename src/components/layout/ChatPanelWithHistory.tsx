'use client';

import {
  Send,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  X,
  Upload,
  Grid3x3,
  History,
  Clock
} from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMultiViewGrid, generateSingleImage, editImageWithGemini, urlsToReferenceImages } from '@/services/geminiService';
import { AspectRatio, ImageSize, GenerationHistoryItem, GridHistoryItem, Character, Location } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { toast } from 'sonner';
import { validateGenerationConfig } from '@/utils/promptSecurity';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import GridPreviewModal from '@/components/grid/GridPreviewModal';
import MentionInput from '@/components/input/MentionInput';

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
    sceneId?: string;
    gridRows?: number;
    gridCols?: number;
    prompt?: string;
    aspectRatio?: AspectRatio;
    gridSize?: '2x2' | '3x3';
  };
}

interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
  gridRows: number;
  gridCols: number;
  prompt: string;
  aspectRatio: AspectRatio;
  gridSize: '2x2' | '3x3';
}

export default function ChatPanelWithHistory() {
  const {
    project,
    selectedShotId,
    updateShot,
    addGenerationHistory,
    addGridHistory,
    currentSceneId,
  } = useProjectStore();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState<GenerationModel>('gemini-grid');
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [pendingState, setPendingState] = useState<Record<string, { loading: boolean; message?: string }>>({});
  const [showHistory, setShowHistory] = useState(true);
  const [historyWidth, setHistoryWidth] = useState(320);
  const [isResizingHistory, setIsResizingHistory] = useState(false);
  const [manualReferenceUrls, setManualReferenceUrls] = useState<string[]>([]);
  const [mentionedAssets, setMentionedAssets] = useState<{
    characters: Character[];
    locations: Location[];
  }>({ characters: [], locations: [] });

  // Grid specific state
  const [gridSize, setGridSize] = useState<'2x2' | '3x3'>('2x2');
  const [gridResult, setGridResult] = useState<GridGenerationResult | null>(null);
  const prevInputContextRef = useRef<string | null>(null);
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 45000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return resp;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const prevContextRef = useRef<{ shotId: string | null; sceneId: string | null }>({ shotId: null, sceneId: null });

  const shots = project?.shots || [];
  const scenes = project?.scenes || [];
  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const generationHistory = selectedShot?.generationHistory || [];
  const projectId = project?.id || 'default';

  const contextKey = useMemo(() => {
    if (selectedShotId) return `pro-chat:${projectId}:shot:${selectedShotId}`;
    if (currentSceneId) return `pro-chat:${projectId}:scene:${currentSceneId}`;
    return `pro-chat:${projectId}:global`;
  }, [projectId, selectedShotId, currentSceneId]);
  const currentPending = contextKey ? pendingState[contextKey] : undefined;
  const isGenerating = Boolean(currentPending?.loading);

  // Reset chat when上下文切换（按镜头/场景隔离 Pro 历史）
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
    setMentionedAssets({ characters: [], locations: [] });
  }, [contextKey]);

  // 选中未生成图片的镜头时，自动把分镜描述填入输入框，便于直接生成
  useEffect(() => {
    if (!selectedShot) return;
    const ctxKey = selectedShot.id;
    const hasImage = Boolean(selectedShot.referenceImage || selectedShot.gridImages?.length);
    if (!hasImage && prevInputContextRef.current !== ctxKey) {
      setInputText(selectedShot.description || '');
      prevInputContextRef.current = ctxKey;
    }
  }, [selectedShot]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // 默认模型：镜头选中默认 SeeDream，场景默认 Gemini Grid；仅在上下文切换时切换默认值
  useEffect(() => {
    const prev = prevContextRef.current;
    if (selectedShotId && selectedShotId !== prev.shotId) {
      setSelectedModel('seedream');
    } else if (!selectedShotId && currentSceneId && currentSceneId !== prev.sceneId) {
      setSelectedModel('gemini-grid');
    }
    prevContextRef.current = { shotId: selectedShotId || null, sceneId: currentSceneId || null };
  }, [selectedShotId, currentSceneId]);

  // 历史栏拖拽调整宽度
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizingHistory || !resizeStateRef.current) return;
      const delta = e.clientX - resizeStateRef.current.startX;
      const next = Math.min(Math.max(resizeStateRef.current.startWidth + delta, 240), 540);
      setHistoryWidth(next);
    };
    const handleUp = () => setIsResizingHistory(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingHistory]);

  const startResizeHistory = (e: React.MouseEvent) => {
    setIsResizingHistory(true);
    resizeStateRef.current = { startX: e.clientX, startWidth: historyWidth };
  };

  const buildPromptWithReferences = (prompt: string) => {
    // 自动附加该镜头关联的角色/场景名，便于 @ 引用
    let basePrompt = prompt;
    if (selectedShot) {
      const autoMentions: string[] = [];
      if (selectedShot.mainCharacters) {
        autoMentions.push(...selectedShot.mainCharacters.map((c) => `@${c}`));
      }
      if (selectedShot.mainScenes) {
        autoMentions.push(...selectedShot.mainScenes.map((s) => `@${s}`));
      }
      if (autoMentions.length > 0) {
        basePrompt = `${prompt}\n${autoMentions.join(' ')}`;
      }
    }

    const { enrichedPrompt, usedCharacters, usedLocations, referenceImageUrls, concisePrompt, missingAssets } = enrichPromptWithAssets(
      basePrompt,
      project,
      selectedShot?.description
    );

    // 强制参考图校验：提到角色/场景但没有图时阻止发送
    if (missingAssets.length > 0 || referenceImageUrls.length === 0 && (usedCharacters.length > 0 || usedLocations.length > 0)) {
      const detail = missingAssets.length > 0
        ? missingAssets.map(a => `${a.type === 'character' ? '角色' : '场景'}「${a.name}」`).join('、')
        : `${usedCharacters.length ? `角色(${usedCharacters.map(c => c.name).join(',')})` : ''}${usedLocations.length ? ` 场景(${usedLocations.map(l => l.name).join(',')})` : ''}`;
      toast.error('请先上传参考图', {
        description: `缺少参考图：${detail}`
      });
      throw new Error('缺少参考图');
    }

    const promptForModel = concisePrompt || enrichedPrompt || prompt;
    return { promptForModel, referenceImageUrls, usedCharacters, usedLocations };
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedImages(prev => [...prev, ...files]);
  };

  // Remove uploaded image
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Use history item (quick select)
  const handleUseHistoryPrompt = (item: GenerationHistoryItem) => {
    setInputText(item.prompt);
    toast.success('已加载历史提示词', {
      description: `模型: ${item.parameters.model || '未知'}`
    });
    document.getElementById('chat-input')?.focus();
  };

  const handleUseHistoryImage = async (item: GenerationHistoryItem) => {
    try {
      const resp = await fetch(item.result);
      const blob = await resp.blob();
      const file = new File([blob], `history-${item.id}.png`, { type: blob.type || 'image/png' });
      setUploadedImages([file]);
      setInputText(item.prompt || '');
      toast.success('已加载历史图片', {
        description: '已添加到参考图'
      });
    } catch (error) {
      console.error('Failed to load history image', error);
      // 无法 fetch 时，改为直接把 URL 作为参考图使用
      setManualReferenceUrls([item.result]);
      setUploadedImages([]);
      setInputText(item.prompt || '');
      toast.warning('无法直接下载历史图片，已将链接作为参考图使用');
    } finally {
      document.getElementById('chat-input')?.focus();
    }
  };

  // Handle asset mention
  const handleMention = (type: 'character' | 'location', item: Character | Location) => {
    setMentionedAssets(prev => {
      if (type === 'character') {
        // Check if already mentioned
        if (prev.characters.some(c => c.id === item.id)) {
          return prev;
        }
        return {
          ...prev,
          characters: [...prev.characters, item as Character]
        };
      } else {
        // Check if already mentioned
        if (prev.locations.some(l => l.id === item.id)) {
          return prev;
        }
        return {
          ...prev,
          locations: [...prev.locations, item as Location]
        };
      }
    });

    // Show toast
    toast.info(`已引用${type === 'character' ? '角色' : '场景'}: ${item.name}`, {
      description: item.description
    });
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
    setMentionedAssets({ characters: [], locations: [] });

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
        if (contextKey) delete next[contextKey];
        return next;
      });
      setManualReferenceUrls([]); // 清空临时参考 URL
    }
  };

  // SeeDream generation
  const handleSeeDreamGeneration = async (prompt: string, imageFiles: File[]) => {
    const volcanoService = new VolcanoEngineService();

    const { promptForModel, usedCharacters, usedLocations, referenceImageUrls } = buildPromptWithReferences(prompt);

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

    // 如果有参考图或用户上传图，优先通过服务器代理的 seedream 多图接口；如果失败再降级
    const mentionedImageUrls: string[] = [
      ...mentionedAssets.characters.flatMap(c => c.referenceImages || []),
      ...mentionedAssets.locations.flatMap(l => l.referenceImages || []),
    ];
    const allReferenceUrls = Array.from(new Set([...referenceImageUrls, ...mentionedImageUrls, ...manualReferenceUrls]));

    const uploadedRefImages = await Promise.all(
      imageFiles.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          mimeType: file.type,
          data: base64,
        };
      })
    );

    const projectAspectRatio = project?.settings.aspectRatio;
    let imageUrl = '';

    if (allReferenceUrls.length > 0) {
      try {
        const resp = await fetchWithTimeout('/api/seedream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptForModel,
            imageUrls: allReferenceUrls,
            size: projectAspectRatio === AspectRatio.MOBILE ? '1440x2560' : '2560x1440'
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          imageUrl = data.url;
          toast.info('已通过 SeeDream 多图接口生成（含参考图）');
        } else {
          const errText = await resp.text();
          console.error('seedream proxy error', errText);
          toast.warning('SeeDream 多图接口不可用，已自动降级单图生成');
        }
      } catch (e) {
        console.error('seedream proxy failed', e);
      }
    }

    if (!imageUrl) {
      const promptWithRefs = referenceImageUrls.length > 0
        ? `${promptForModel}\n参考图：${referenceImageUrls.map((_, i) => `(图${i + 1})`).join(' ')}`
        : promptForModel;
      imageUrl = await volcanoService.generateSingleImage(promptWithRefs, projectAspectRatio);
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
    const { promptForModel, referenceImageUrls, usedCharacters, usedLocations } = buildPromptWithReferences(prompt);

    // Collect all reference image URLs from mentioned assets
    const mentionedImageUrls: string[] = [
      ...mentionedAssets.characters.flatMap(c => c.referenceImages || []),
      ...mentionedAssets.locations.flatMap(l => l.referenceImages || []),
    ];

    // Combine with enriched prompt reference images (remove duplicates)
    const allReferenceUrls = Array.from(new Set([...referenceImageUrls, ...mentionedImageUrls, ...manualReferenceUrls]));

    // Show asset usage info
    const allUsedCharacters = Array.from(new Map(
      [...usedCharacters, ...mentionedAssets.characters].map(c => [c.id, c])
    ).values());
    const allUsedLocations = Array.from(new Map(
      [...usedLocations, ...mentionedAssets.locations].map(l => [l.id, l])
    ).values());

    if (allUsedCharacters.length > 0 || allUsedLocations.length > 0) {
      const assetInfo = [];
      if (allUsedCharacters.length > 0) {
        assetInfo.push(`角色: ${allUsedCharacters.map(c => c.name).join(', ')}`);
      }
      if (allUsedLocations.length > 0) {
        assetInfo.push(`场景: ${allUsedLocations.map(l => l.name).join(', ')}`);
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
    const assetRefImages = allReferenceUrls.length > 0
      ? await urlsToReferenceImages(allReferenceUrls)
      : [];

    // Combine all reference images
    const allRefImages = [...uploadedRefImages, ...assetRefImages];

    // Generate single image with Gemini
    const imageUrl = await generateSingleImage(
      promptForModel,
      project?.settings.aspectRatio || AspectRatio.WIDE,
      allRefImages
    );

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
    // 🎬 场景级别 Grid 生成：自动聚合场景的镜头描述

    // Find current scene FIRST (before prompt building)
    const currentScene = currentSceneId
      ? scenes.find(s => s.id === currentSceneId)
      : selectedShot
        ? scenes.find(s => s.shotIds.includes(selectedShotId!))
        : null;

    let enhancedPrompt = '';
    let assetNameHints = '';
    const refUrlSet = new Set<string>();

    // 🔍 调试：输出场景信息
    console.log('[ChatPanel Grid Debug] ========== START ==========');
    console.log('[ChatPanel Grid Debug] currentSceneId:', currentSceneId);
    console.log('[ChatPanel Grid Debug] currentScene:', currentScene ? {
      id: currentScene.id,
      name: currentScene.name,
      description: currentScene.description,
      shotIds: currentScene.shotIds
    } : null);

    if (currentScene) {
      // 🎬 场景级 Grid：聚合场景的所有镜头信息
      const sceneShots = shots.filter(s => s.sceneId === currentScene.id);
      const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
      const totalSlices = rows * cols; // 2x2=4张, 3x3=9张

      // 按 order 排序所有镜头
      const sortedSceneShots = [...sceneShots].sort((a, b) => (a.order || 0) - (b.order || 0));

      // 分离未分配和已分配的镜头
      const unassignedShots = sortedSceneShots.filter(shot => !shot.referenceImage);
      const assignedShots = sortedSceneShots.filter(shot => shot.referenceImage);

      // 构建目标镜头列表：优先未分配，不足则选择最靠近的已分配镜头
      const targetShots = [];

      // 先添加所有未分配的镜头（最多 totalSlices 个）
      for (const shot of unassignedShots) {
        if (targetShots.length >= totalSlices) break;
        targetShots.push(shot);
      }

      // 如果未分配的不够，从已分配的中选择"最靠近"的镜头补充
      if (targetShots.length < totalSlices && assignedShots.length > 0) {
        // 找到未分配镜头的 order 范围
        const unassignedOrders = targetShots.map(s => s.order || 0);
        const minOrder = Math.min(...unassignedOrders);
        const maxOrder = Math.max(...unassignedOrders);

        // 计算每个已分配镜头到未分配范围的"距离"
        const assignedWithDistance = assignedShots.map(shot => {
          const order = shot.order || 0;
          let distance: number;

          // 如果在未分配范围内，距离为 0（优先选择）
          if (order >= minOrder && order <= maxOrder) {
            distance = 0;
          } else if (order < minOrder) {
            // 在范围左边，距离 = minOrder - order
            distance = minOrder - order;
          } else {
            // 在范围右边，距离 = order - maxOrder
            distance = order - maxOrder;
          }

          return { shot, distance, order };
        });

        // 按距离排序（距离相同时按 order 排序）
        assignedWithDistance.sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }
          return a.order - b.order;
        });

        // 补充需要的镜头
        const needed = totalSlices - targetShots.length;
        for (let i = 0; i < needed && i < assignedWithDistance.length; i++) {
          targetShots.push(assignedWithDistance[i].shot);
        }

        // 按 order 重新排序 targetShots，保持镜头顺序
        targetShots.sort((a, b) => (a.order || 0) - (b.order || 0));
      }

      console.log('[ChatPanel Grid Debug] sceneShots.length:', sceneShots.length);
      console.log('[ChatPanel Grid Debug] unassignedShots.length:', unassignedShots.length);
      console.log('[ChatPanel Grid Debug] assignedShots.length:', assignedShots.length);
      console.log('[ChatPanel Grid Debug] totalSlices needed:', totalSlices);
      console.log('[ChatPanel Grid Debug] targetShots.length:', targetShots.length);
      console.log('[ChatPanel Grid Debug] targetShots:', targetShots.map(s => ({
        id: s.id,
        order: s.order,
        shotSize: s.shotSize,
        cameraMovement: s.cameraMovement,
        description: s.description?.substring(0, 50),
        hasImage: !!s.referenceImage
      })));

      // Build enhanced prompt combining scene, shots descriptions, and user input
      // Add scene context
      if (currentScene.description) {
        enhancedPrompt += `场景：${currentScene.description}\n`;
      }
      if (project?.metadata.artStyle) {
        enhancedPrompt += `画风：${project.metadata.artStyle}\n`;
      }

      // Add shot descriptions with CLEAR mapping to grid positions
      if (targetShots.length > 0) {
        enhancedPrompt += `\n分镜要求（${targetShots.length} 个镜头，按顺序对应 Grid 从左到右、从上到下的位置）：\n`;
        targetShots.forEach((shot, idx) => {
          // For 3x3 (9张), simplify shot descriptions - keep only core info
          if (gridSize === '3x3') {
            // 只保留核心关键信息：序号 + 景别 + 运镜 + 核心描述
            enhancedPrompt += `Grid位置${idx + 1}（镜头#${shot.order}）: ${shot.shotSize} ${shot.cameraMovement}`;
            // 如果有描述，只取前30字符的核心内容
            if (shot.description) {
              const coreDesc = shot.description.length > 30
                ? shot.description.substring(0, 30).trim()
                : shot.description;
              enhancedPrompt += ` - ${coreDesc}`;
            }
            enhancedPrompt += '\n';
          } else {
            // For 2x2 (4张), use full description
            enhancedPrompt += `Grid位置${idx + 1}（镜头#${shot.order}）: ${shot.shotSize} - ${shot.cameraMovement}\n`;
            if (shot.description) {
              enhancedPrompt += `   ${shot.description}\n`;
            }
          }
        });
      }

      // 生成资产名称提示，便于参考图匹配
      assetNameHints = targetShots
        .map((shot) => {
          const parts: string[] = [];
          if (shot.mainCharacters?.length) {
            parts.push(`角色: ${shot.mainCharacters.join(', ')}`);
          }
          if (shot.mainScenes?.length) {
            parts.push(`场景: ${shot.mainScenes.join(', ')}`);
          }
          return parts.join(' | ');
        })
        .filter(Boolean)
        .join('\n');

      // Add user's specific requirements
      if (prompt.trim()) {
        enhancedPrompt += `\n额外要求：${prompt}`;
      }

      // 聚合参考图：从镜头的 mainCharacters 和 mainScenes
      targetShots.forEach((shot) => {
        shot.mainCharacters?.forEach((name) => {
          const c = project?.characters.find((ch) => ch.name === name);
          c?.referenceImages?.forEach((url) => refUrlSet.add(url));
        });
        shot.mainScenes?.forEach((name) => {
          const l = project?.locations.find((loc) => loc.name === name);
          l?.referenceImages?.forEach((url) => refUrlSet.add(url));
        });
      });

      console.log('[ChatPanel Grid Debug] enhancedPrompt:', enhancedPrompt);
      console.log('[ChatPanel Grid Debug] refUrlSet.size:', refUrlSet.size);
    } else {
      // 🖼️ 单镜头级：使用原有逻辑
      const { promptForModel, referenceImageUrls } = buildPromptWithReferences(prompt);
      enhancedPrompt = promptForModel;

      // Collect reference images from mentioned assets
      mentionedAssets.characters.forEach(c => {
        c.referenceImages?.forEach(url => refUrlSet.add(url));
      });
      mentionedAssets.locations.forEach(l => {
        l.referenceImages?.forEach(url => refUrlSet.add(url));
      });
      referenceImageUrls.forEach(url => refUrlSet.add(url));

      const shotHints: string[] = [];
      if (selectedShot?.mainCharacters?.length) {
        shotHints.push(`角色: ${selectedShot.mainCharacters.join(', ')}`);
      }
      if (selectedShot?.mainScenes?.length) {
        shotHints.push(`场景: ${selectedShot.mainScenes.join(', ')}`);
      }
      assetNameHints = shotHints.join(' | ');

      console.log('[ChatPanel Grid Debug] No scene selected, using shot-level prompt');
      console.log('[ChatPanel Grid Debug] promptForModel:', promptForModel);
    }

    const { enrichedPrompt, referenceImageUrls: enrichedRefUrls, referenceImageMap, usedCharacters, usedLocations } = enrichPromptWithAssets(
      [enhancedPrompt, assetNameHints].filter(Boolean).join('\n'),
      project,
      currentScene ? undefined : selectedShot?.description
    );
    const finalPrompt = enrichedPrompt;
    enrichedRefUrls.forEach((url) => refUrlSet.add(url));

    if (usedCharacters.length > 0 || usedLocations.length > 0) {
      const info: string[] = [];
      if (usedCharacters.length > 0) info.push(`角色: ${usedCharacters.map(c => c.name).join(', ')}`);
      if (usedLocations.length > 0) info.push(`场景: ${usedLocations.map(l => l.name).join(', ')}`);
      toast.info('正在使用参考图保持一致性', { description: info.join(' | ') });
    }

    console.log('[ChatPanel Grid Debug] ========== END ==========');
    console.log('[ChatPanel Grid Debug] referenceImageMap:', referenceImageMap);

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

    // Convert asset reference URLs to ReferenceImageData（顺序与 referenceImageMap 对齐）
    const orderedAssetUrls = referenceImageMap.map((ref) => ref.imageUrl);
    const extraUrls = Array.from(refUrlSet).filter((url) => !orderedAssetUrls.includes(url));
    const assetRefImages = refUrlSet.size > 0
      ? await urlsToReferenceImages([...orderedAssetUrls, ...extraUrls])
      : [];

    // Combine all reference images（资产在前，上传在后，保证编号对应资产参考图）
    const allRefImages = [...assetRefImages, ...uploadedRefImages];

    console.log('[ChatPanel Grid Debug] allRefImages.length:', allRefImages.length);

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

    // Show Grid preview modal
    if (currentScene) {
      setGridResult({
        fullImage: result.fullImage,
        slices: result.slices,
        sceneId: currentScene.id,
        gridRows: rows,
        gridCols: cols,
        prompt: finalPrompt,
        aspectRatio: project?.settings.aspectRatio || AspectRatio.WIDE,
        gridSize: gridSize,
      });

      // Save Grid to scene history
      const gridHistory: GridHistoryItem = {
        id: `grid_${Date.now()}`,
        timestamp: new Date(),
        fullGridUrl: result.fullImage,
        slices: result.slices,
        gridSize: gridSize,
        prompt: finalPrompt,
        aspectRatio: project?.settings.aspectRatio || AspectRatio.WIDE,
      };
      addGridHistory(currentScene.id, gridHistory);
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
        sceneId: currentScene?.id,
        gridRows: rows,
        gridCols: cols,
        prompt: finalPrompt,
        aspectRatio: project?.settings.aspectRatio || AspectRatio.WIDE,
        gridSize: gridSize,
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
            <div className="bg-light-accent dark:bg-cine-accent text-white rounded-2xl rounded-tr-sm px-4 py-3">
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              <div className="text-xs opacity-70 mt-1">
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
          <div className="bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl rounded-tl-sm px-4 py-3">
            <div className="text-sm text-light-text dark:text-white whitespace-pre-wrap mb-2">
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
                        if (msg.gridData?.fullImage && msg.gridData?.slices?.length) {
                          const rows = msg.gridData.gridRows || (gridSize === '3x3' ? 3 : 2);
                          const cols = msg.gridData.gridCols || (gridSize === '3x3' ? 3 : 2);
                          const sceneId = msg.gridData.sceneId || currentSceneId || currentScene?.id || null;
                          if (sceneId) {
                            setGridResult({
                              fullImage: msg.gridData.fullImage,
                              slices: msg.gridData.slices,
                              sceneId,
                              gridRows: rows,
                              gridCols: cols,
                              prompt: msg.gridData.prompt || '',
                              aspectRatio: msg.gridData.aspectRatio || AspectRatio.WIDE,
                              gridSize: msg.gridData.gridSize || gridSize,
                            });
                          }
                        }
                      }}
                    />
                    {msg.gridData && (
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Grid3x3 size={12} />
                        Grid {msg.gridData.gridRows && msg.gridData.gridCols ? `${msg.gridData.gridRows}x${msg.gridData.gridCols}` : gridSize}
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
    <div className="h-full flex bg-light-bg dark:bg-cine-bg">
      {/* History Sidebar */}
      {showHistory && generationHistory.length > 0 && (
        <div
          className="border-r border-light-border dark:border-cine-border bg-light-panel dark:bg-cine-panel flex flex-col relative"
          style={{ width: historyWidth }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-cine-border">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-light-accent dark:text-cine-accent" />
              <h3 className="text-sm font-bold text-light-text dark:text-white">历史记录</h3>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white text-xs"
            >
              隐藏
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {generationHistory.slice().reverse().map((item) => (
              <div
                key={item.id}
                className="w-full bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded-lg p-2 text-left group"
              >
                <img
                  src={item.result}
                  alt="History"
                  className="w-full aspect-video object-cover rounded mb-2"
                />
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted line-clamp-2 group-hover:text-light-accent dark:group-hover:text-cine-accent">
                  {item.prompt}
                </div>
                <div className="text-[10px] text-light-text-muted dark:text-cine-text-muted mt-1">
                  {item.parameters.model || '未知模型'} · {new Date(item.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleUseHistoryPrompt(item)}
                    className="flex-1 px-2 py-1 text-xs rounded border border-light-border dark:border-cine-border hover:border-light-accent dark:hover:border-cine-accent transition-colors"
                  >
                    用提示词
                  </button>
                  <button
                    onClick={() => handleUseHistoryImage(item)}
                    className="flex-1 px-2 py-1 text-xs rounded border border-light-border dark:border-cine-border hover:border-light-accent dark:hover:border-cine-accent transition-colors"
                  >
                    用图片
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Resize handle */}
          <div
            onMouseDown={startResizeHistory}
            className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${isResizingHistory ? 'bg-light-accent/40 dark:bg-cine-accent/40' : 'bg-transparent hover:bg-light-border dark:hover:bg-cine-border'}`}
            title="拖拽调整宽度"
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-light-border dark:border-cine-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-light-text dark:text-white">
                Pro 模式 - AI 对话生成
              </h2>
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                {selectedShotId
                  ? `当前镜头: ${selectedShot?.order || '未知'}`
                  : currentSceneId
                    ? `当前场景: ${scenes.find(s => s.id === currentSceneId)?.name || '未知'}`
                    : '未选择镜头或场景'}
              </p>
            </div>
            {!showHistory && generationHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover"
              >
                <History size={16} />
                显示历史
              </button>
            )}
          </div>
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
              {generationHistory.length > 0 && (
                <p className="text-xs text-light-accent dark:text-cine-accent mt-4">
                  👈 点击左侧历史记录可快速重用提示词
                </p>
              )}
            </div>
          )}
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-light-border dark:border-cine-border p-4 bg-light-panel dark:bg-cine-panel">
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
              className="flex-shrink-0 p-3 bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded-lg hover:bg-light-border dark:hover:bg-cine-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="上传参考图"
            >
              <ImageIcon size={20} className="text-light-text dark:text-white" />
            </button>

            {/* Text Input */}
            <MentionInput
              value={inputText}
              onChange={setInputText}
              onMention={handleMention}
              onEnterSend={handleSend}
              placeholder="输入提示词... (输入 @ 引用资源, Enter 发送, Shift+Enter 换行)"
              disabled={isGenerating}
              className="flex-1 bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-light-text dark:text-white"
            />

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isGenerating || (!inputText.trim() && uploadedImages.length === 0)}
              className="flex-shrink-0 px-6 bg-light-accent dark:bg-cine-accent text-white rounded-lg font-medium hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
            提示: 输入 @ 引用角色或场景资源,系统会自动包含参考图到生成请求中
          </div>
        </div>

        {/* Grid Preview Modal */}
        {gridResult && (
          <GridPreviewModal
            fullGridUrl={gridResult.fullImage}
            gridImages={gridResult.slices}
            sceneId={gridResult.sceneId}
            shots={shots}
            gridRows={gridResult.gridRows}
            gridCols={gridResult.gridCols}
            onAssign={(assignments) => {
              Object.entries(assignments).forEach(([shotId, imageUrl]) => {
                updateShot(shotId, {
                  referenceImage: imageUrl,
                  fullGridUrl: gridResult.fullImage,
                  status: 'done',
                });

                // Add to shot generation history
                const historyItem: GenerationHistoryItem = {
                  id: `gen_${Date.now()}_${shotId}`,
                  type: 'image',
                  timestamp: new Date(),
                  result: imageUrl,
                  prompt: gridResult.prompt,
                  parameters: {
                    model: 'Gemini Grid',
                    gridSize: gridResult.gridSize,
                    aspectRatio: gridResult.aspectRatio,
                    fullGridUrl: gridResult.fullImage,
                  },
                  status: 'success',
                };
                addGenerationHistory(shotId, historyItem);
              });
              setGridResult(null);
            }}
            onClose={() => setGridResult(null)}
          />
        )}
      </div>
    </div>
  );
}
