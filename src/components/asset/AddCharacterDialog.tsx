'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Upload, Trash2, Sparkles, Loader2, ChevronDown, Wand2, CheckCircle2, AlertCircle, Video, Pencil, Check } from 'lucide-react';
import type { Character } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { toast } from 'sonner';
import { storageService } from '@/lib/storageService';
import { dataService } from '@/lib/dataService';
import { useAuth } from '@/components/auth/AuthProvider';
import { JimengModel } from '@/components/jimeng/JimengOptions';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoraCharacter } from '@/hooks/useSoraCharacter';
import { SoraReferenceSection } from './SoraReferenceSection';
import { useThreeViewGeneration } from '@/hooks/useThreeViewGeneration';
import { ThreeViewGenerator, ThreeViewPrompt } from './ThreeViewSection';
import { CharacterImageManager } from './CharacterImageManager';

type SaveOptions = {
  keepOpen?: boolean;
};

interface AddCharacterDialogProps {
  onAdd: (character: Character, options?: SaveOptions) => void | Promise<void>;
  onClose: () => void;
  mode?: 'add' | 'edit';
  initialCharacter?: Character | null;
}

export default function AddCharacterDialog({ onAdd, onClose, mode = 'add', initialCharacter }: AddCharacterDialogProps) {
  const { user } = useAuth();

  // ===== 通用角色信息状态 =====
  const [name, setName] = useState(initialCharacter?.name || '');
  const [description, setDescription] = useState(initialCharacter?.description || '');
  const [appearance, setAppearance] = useState(initialCharacter?.appearance || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(initialCharacter?.referenceImages || []);
  const [selectedRefIndex, setSelectedRefIndex] = useState<number>(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);



  // ===== Sora 参考模式状态（使用独立 Hook）=====
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  // 一致性模式切换
  type ConsistencyMode = 'three-view' | 'sora-reference';
  const [consistencyMode, setConsistencyMode] = useState<ConsistencyMode>(
    initialCharacter?.soraIdentity?.username ? 'sora-reference' : 'three-view'
  );

  // 使用 Sora 角色管理 Hook（封装所有 Sora 相关状态和逻辑）
  const sora = useSoraCharacter({
    initialCharacter,
    name,
    description,
    appearance,
    referenceImages,
    userId: user?.id,
    persistCharacter: async () => {
      // 提供一个简化的持久化函数供 hook 使用
      const result = await persistCharacter({ closeAfter: false, showToast: false });
      return result;
    }
  });

  // 从 hook 解构常用值（保持向后兼容）
  const {
    soraStatus, setSoraStatus,
    soraUsername, setSoraUsername,
    soraReferenceVideoUrl, setSoraReferenceVideoUrl,
    isSoraProcessing, setIsSoraProcessing,
    isRefreshing, isWritingSoraCode,
    currentTaskId,
    videoDuration, setVideoDuration,
    segmentStart, setSegmentStart,
    segmentEnd, setSegmentEnd,
    hasSoraCode,
    savedCharacterId, setSavedCharacterId,
    // Sora 操作方法（来自 hook）
    handleSoraRegister,
    handleManualRefresh,
    handleManualSoraCodeWriteback,
    writebackSoraCode,
    getSoraIdentityForSave,
    lastWrittenSoraUsernameRef,
    // 额外导出（供组件内遗留代码使用）
    setCurrentTaskId,
    setIsWritingSoraCode,
  } = sora;

  const threeView = useThreeViewGeneration({
    name,
    description,
    appearance,
    userId: user?.id,
    setReferenceImages,
    setPreviewImage,
    setSoraStatus,
    setSelectedRefIndex
  });



  // 注意：MAX_POLL_ATTEMPTS 和 POLL_INTERVAL_MS 常量已在 useSoraCharacter hook 中定义


  // 注意：pollTaskStatus, polling useEffect, startPolling, stopPolling 已移至 useSoraCharacter hook

  const parseSeconds = (value: string) => {
    if (!value) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveVideoDuration = async (url: string) => {
    const current = videoPreviewRef.current?.duration;
    if (current && !Number.isNaN(current)) return current;

    return await new Promise<number | null>((resolve) => {
      const temp = document.createElement('video');
      temp.preload = 'metadata';
      temp.src = url;
      temp.onloadedmetadata = () => resolve(temp.duration);
      temp.onerror = () => resolve(null);
    });
  };

  // 注意：handleSoraRegister 已移至 useSoraCharacter hook

  // 注意：handleManualSoraCodeWriteback 和 writebackSoraCode 已移至 useSoraCharacter hook

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 注意：handleManualRefresh 已移至 useSoraCharacter hook


  useEffect(() => {
    if (mode !== 'edit' || !initialCharacter?.id) return;
    let isActive = true;

    const loadLatestTaskVideo = async (characterId: string) => {
      try {
        const res = await fetch(`/api/sora/character/latest-video?characterId=${characterId}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.success || !data?.videoUrl) return null;
        return data;
      } catch (error) {
        console.warn('Failed to load latest task video:', error);
        return null;
      }
    };

    const fetchLatest = async () => {
      try {
        const latest = await dataService.getCharacterById(initialCharacter.id);
        if (!latest || !isActive) return;

        setName(latest.name || '');
        setDescription(latest.description || '');
        setAppearance(latest.appearance || '');

        const latestImages = latest.referenceImages || [];
        setReferenceImages(latestImages);
        setSelectedRefIndex(latestImages.length > 0 ? 0 : 0);

        const latestVideoUrl = latest.soraReferenceVideoUrl || latest.soraIdentity?.referenceVideoUrl || '';
        setSoraReferenceVideoUrl(latestVideoUrl);

        const latestUsername = latest.soraIdentity?.username || '';
        const latestStatus = (latest.soraIdentity?.status as any) || (latestUsername ? 'registered' : 'none');
        setSoraUsername(latestUsername);
        setSoraStatus(latestStatus);
        setCurrentTaskId(latest.soraIdentity?.taskId);
        setIsSoraProcessing(['generating', 'registering'].includes(latestStatus));

        setSavedCharacterId(latest.id || null);

        const hasVideo = !!latestVideoUrl;
        const hasCode = latestUsername.trim().length > 0;

        if (hasVideo && !hasCode && latestStatus === 'generating') {
          setSoraStatus('none');
          setIsSoraProcessing(false);
        }

        const hasTaskId = !!latest.soraIdentity?.taskId;
        const shouldFetchTaskVideo = hasTaskId && !hasCode && (latestStatus === 'generating' || !hasVideo);
        if (shouldFetchTaskVideo) {
          const taskVideo = await loadLatestTaskVideo(initialCharacter.id);
          if (!isActive || !taskVideo?.videoUrl) return;
          setSoraReferenceVideoUrl(taskVideo.videoUrl);
          setCurrentTaskId(taskVideo.taskId || undefined);
          if (!hasCode) {
            setSoraStatus('none');
            setIsSoraProcessing(false);
            setSoraUsername('');
          }
        }
      } catch (error) {
        console.warn('Failed to refresh character data:', error);
      }
    };

    void fetchLatest();
    return () => {
      isActive = false;
    };
  }, [mode, initialCharacter?.id]);

  useEffect(() => {
    setSavedCharacterId(initialCharacter?.id || null);
  }, [initialCharacter?.id]);

  useEffect(() => {
    lastWrittenSoraUsernameRef.current = initialCharacter?.soraIdentity?.username || '';
  }, [initialCharacter?.id, initialCharacter?.soraIdentity?.username]);

  useEffect(() => {
    if (!soraReferenceVideoUrl) {
      setVideoDuration(null);
      return;
    }
    setVideoDuration(null);
    setSegmentStart('1');
    setSegmentEnd('3');
  }, [soraReferenceVideoUrl]);



  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadingToast = toast.loading('正在上传图片...');
    const uploadPromises: Promise<string | null>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        toast.error(`文件 ${file.name} 不是图片格式`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过 10MB 限制`);
        continue;
      }

      uploadPromises.push(
        (async () => {
          try {
            const folder = `projects/characters/${user?.id || 'anonymous'}`;
            // Upload to R2 (or fallback)
            const { url } = await storageService.uploadFile(file, folder, user?.id || 'anonymous');
            return url;
          } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            toast.error(`${file.name} 上传失败`);
            return null;
          }
        })()
      );
    }

    try {
      const results = await Promise.all(uploadPromises);
      const successfulUrls = results.filter((url): url is string => url !== null);

      if (successfulUrls.length > 0) {
        setReferenceImages(prev => {
          const combined = [...prev, ...successfulUrls];
          if (prev.length === 0 && successfulUrls.length > 0) {
            // If this is the first batch, reset selection to 0 in a separate effect or handled by parent
            // But setSelectedRefIndex(0) relies on render cycle check potentially?
            // Actually setSelectedRefIndex(0) is safe here as state update triggers.
            setTimeout(() => setSelectedRefIndex(0), 0);
          }
          return combined;
        });
        toast.success(`已添加 ${successfulUrls.length} 张图片`);
      }
    } finally {
      toast.dismiss(uploadingToast);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    const updated = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(updated);
    if (updated.length === 0) setSelectedRefIndex(0);
    else if (index === selectedRefIndex) setSelectedRefIndex(0);
    else if (index < selectedRefIndex) setSelectedRefIndex((prev) => Math.max(prev - 1, 0));
    toast.success('图片已删除');
  };



  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('请上传视频文件');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error('视频文件不能超过 100MB');
      return;
    }

    setIsUploadingVideo(true);
    const uploadingToast = toast.loading('正在上传 Sora 参考视频...');

    try {
      const folder = `projects/characters/${user?.id || 'anonymous'}/videos`;
      const { url } = await storageService.uploadFile(file, folder, user?.id || 'anonymous');
      setSoraReferenceVideoUrl(url);
      toast.success('Sora 参考视频上传成功！');
    } catch (error: any) {
      console.error('Video upload failed:', error);
      toast.error('视频上传失败', { description: error.message });
    } finally {
      setIsUploadingVideo(false);
      toast.dismiss(uploadingToast);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void persistCharacter({ closeAfter: true, showToast: true });
  };

  const persistCharacter = async (options: { closeAfter: boolean; showToast: boolean }): Promise<Character | null> => {
    if (!name.trim()) { toast.error('请输入角色名称'); return null; }
    if (!description.trim()) { toast.error('请输入角色描述'); return null; }

    const hasReferenceInput = referenceImages.length > 0 || !!soraReferenceVideoUrl || hasSoraCode;
    if (!hasReferenceInput) {
      toast.error('请至少上传 1 张参考图，或填写 Sora 角色码 / 上传角色视频');
      return null;
    }

    let finalImages = [...referenceImages];
    if (finalImages.length > 1 && selectedRefIndex >= 0 && selectedRefIndex < finalImages.length) {
      const [primary] = finalImages.splice(selectedRefIndex, 1);
      finalImages = [primary, ...finalImages];
    }

    // 清理被移除的云端资源（仅在确认保存时）
    const initialImages = initialCharacter?.referenceImages || [];
    const removedImages = initialImages.filter((img) => !finalImages.includes(img));
    const previousVideoUrl = initialCharacter?.soraReferenceVideoUrl || initialCharacter?.soraIdentity?.referenceVideoUrl || '';
    const shouldDeleteVideo = !!previousVideoUrl && previousVideoUrl !== (soraReferenceVideoUrl || '');
    const cleanupUrls = [...removedImages, ...(shouldDeleteVideo ? [previousVideoUrl] : [])];
    if (cleanupUrls.length > 0) {
      void Promise.all(
        cleanupUrls.map((url) => storageService.deleteFile(url))
      ).catch((err) => {
        console.warn('Failed to cleanup unused files:', err);
      });
    }

    // 构建 Sora 身份信息
    // 关键点：初始化为 null (而非 undefined)，确保当条件不满足时，数据库中的字段会被清空
    // 构建 Sora 身份信息 (使用 hook 提供的逻辑)
    const finalSoraIdentity = getSoraIdentityForSave();
    const normalizedSoraUsername = soraUsername.trim();

    const character: Character = {
      id: savedCharacterId || initialCharacter?.id || `character_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      appearance: appearance.trim(),
      referenceImages: finalImages,
      // 关键点：如果为空，发送 null 以清空数据库字段
      soraReferenceVideoUrl: soraReferenceVideoUrl || null as any,
      soraIdentity: finalSoraIdentity as any // 强制发送 null 以清除 JSONB 数据
    };

    try {
      await onAdd(character, { keepOpen: !options.closeAfter });
      setSavedCharacterId(character.id);

      const shouldWriteback =
        normalizedSoraUsername &&
        normalizedSoraUsername !== lastWrittenSoraUsernameRef.current;
      if (shouldWriteback && !isWritingSoraCode) {
        void writebackSoraCode({
          characterId: character.id,
          username: normalizedSoraUsername,
          referenceVideoUrl: soraReferenceVideoUrl || undefined,
          silent: true,
          retries: 2
        });
      }
    } catch (error) {
      console.error('Failed to save character:', error);
      toast.error('保存失败');
      return null;
    }

    if (options.showToast) {
      toast.success(mode === 'add' ? `角色 "${name}" 已添加！` : `角色 "${name}" 已更新！`);
    }
    if (options.closeAfter) onClose();
    return character;
  };


  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence mode="wait">
          <div key="character-dialog-main" className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="relative w-full max-w-2xl seko-panel overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 dark:border-white/5">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{mode === 'add' ? '添加角色' : '编辑角色'}</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                    上传参考图片，提升生成质量
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-300 hover:rotate-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Consistency Mode Switcher */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                    角色一致性方案
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setConsistencyMode('three-view')}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all duration-200 text-left",
                        consistencyMode === 'three-view'
                          ? "border-zinc-900 dark:border-white bg-zinc-900/5 dark:bg-white/5"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center",
                          consistencyMode === 'three-view'
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                        )}>
                          <Wand2 className="w-3.5 h-3.5" />
                        </div>
                        <span className={cn(
                          "font-bold text-sm",
                          consistencyMode === 'three-view'
                            ? "text-zinc-900 dark:text-white"
                            : "text-zinc-700 dark:text-zinc-300"
                        )}>三视图模式</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        使用即梦生成角色三视图，适合风格化、动漫、插画类项目
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsistencyMode('sora-reference')}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all duration-200 text-left",
                        consistencyMode === 'sora-reference'
                          ? "border-zinc-900 dark:border-white bg-zinc-900/5 dark:bg-white/5"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center",
                          consistencyMode === 'sora-reference'
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                        )}>
                          <Video className="w-3.5 h-3.5" />
                        </div>
                        <span className={cn(
                          "font-bold text-sm",
                          consistencyMode === 'sora-reference'
                            ? "text-zinc-900 dark:text-white"
                            : "text-zinc-700 dark:text-zinc-300"
                        )}>Sora 参考模式</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        上传参考视频注册 Sora ID，适合动漫、卡通风格项目
                      </p>
                    </button>
                  </div>
                </div>

                {/* Character Name */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    角色名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：苏白、李明、张医生..."
                    className="w-full px-4 py-3 seko-input"
                    required
                  />
                </div>

                {/* Character Description */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    角色描述/性格 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="角色的背景、性格、职业等...&#10;&#10;示例：30 岁左右的男性程序员，性格内向，经常熬夜工作。"
                    className="w-full h-24 px-4 py-3 seko-input resize-none"
                    required
                  />
                </div>

                {/* Character Appearance */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    外貌特征（选填）
                  </label>
                  <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    placeholder="详细描述外貌特征...&#10;&#10;示例：短发，戴黑框眼镜，中等身材，常穿格子衬衫。"
                    className="w-full h-20 px-4 py-3 seko-input resize-none"
                  />
                </div>

                {/* Reference Images */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>参考图片 <span className="text-red-500">*</span></span>
                    <span className="text-xs font-normal text-zinc-400">至少 1 张</span>
                  </label>

                  {consistencyMode === 'three-view' && (
                    <ThreeViewGenerator hook={threeView} name={name} />
                  )}

                  <CharacterImageManager
                    referenceImages={referenceImages}
                    selectedRefIndex={selectedRefIndex}
                    onImageUpload={handleImageUpload}
                    onRemoveImage={removeImage}
                    onSelectImage={setSelectedRefIndex}
                    onPreviewImage={setPreviewImage}
                    fileInputRef={fileInputRef}
                  />

                  {consistencyMode === 'three-view' && (
                    <ThreeViewPrompt hook={threeView} />
                  )}

                  {/* Sora Reference Video Upload - 仅在 Sora 模式显示 */}
                  <div className={cn(
                    "mt-4 pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-800",
                    consistencyMode !== 'sora-reference' && "hidden"
                  )}>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                      <span>Sora 参考视频</span>
                      <span className="text-xs font-normal text-zinc-400">(可选)</span>
                    </label>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                      上传 3-10s 的角色动态视频，可跳过&quot;图生视频&quot;步骤，直接注册 Sora 角色 ID。
                    </p>

                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        handleVideoUpload(e);
                        // Ensure status is reset so we can register this new video
                        if (soraStatus === 'registered') {
                          setSoraStatus('none');
                          setSoraUsername('');
                        }
                      }}
                      className="hidden"
                    />

                    {soraReferenceVideoUrl ? (
                      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                        <video
                          ref={videoPreviewRef}
                          src={soraReferenceVideoUrl}
                          controls
                          className="w-full h-full object-contain"
                          onLoadedMetadata={(e) => {
                            const duration = e.currentTarget.duration;
                            if (Number.isFinite(duration)) setVideoDuration(duration);
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const urlToDelete = soraReferenceVideoUrl;
                            if (!urlToDelete) return;
                            try {
                              await storageService.deleteFile(urlToDelete);
                              setSoraReferenceVideoUrl('');
                              setSoraStatus('none');
                              setSoraUsername('');
                              setCurrentTaskId(undefined);
                              setIsSoraProcessing(false);
                              toast.success('云端视频源文件已清理');
                            } catch (e: any) {
                              console.warn('Failed to delete file from R2:', e);
                              toast.error(e?.message || '删除失败，请稍后重试');
                            }
                          }}
                          className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={isUploadingVideo}
                        className="w-full group relative overflow-hidden rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-zinc-50/50 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all duration-300 p-6 flex flex-col items-center justify-center gap-2"
                      >
                        {isUploadingVideo ? (
                          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                        ) : (
                          <Upload className="w-6 h-6 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                        )}
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {isUploadingVideo ? '上传中...' : '点击上传 Sora 视频'}
                        </p>
                        <p className="text-xs text-zinc-400">MP4, MOV (最大 100MB)</p>
                      </button>
                    )}
                  </div>
                </div>


                {/* Sora Identity Section */}
                {consistencyMode === 'sora-reference' && (
                  <SoraReferenceSection sora={sora} persistCharacter={persistCharacter} />
                )}


              </form>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={onClose}
                  className="seko-button px-5 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void persistCharacter({ closeAfter: false, showToast: true })}
                  className="seko-button px-5 py-2.5"
                >
                  保存并继续
                </button>
                <button
                  onClick={handleSubmit}
                  className="seko-button seko-button-primary px-6 py-2.5 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  {mode === 'add' && !savedCharacterId ? '添加角色' : '保存修改'}
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {
        previewImage && createPortal(
          <div
            key="character-preview-overlay"
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={previewImage}
                alt="预览"
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
}
