'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Upload, Trash2, Sparkles, Loader2, ChevronDown, Wand2, CheckCircle2, AlertCircle, Video, Pencil } from 'lucide-react';
import type { Character } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { toast } from 'sonner';
import { storageService } from '@/lib/storageService';
import { useAuth } from '@/components/auth/AuthProvider';
import { JimengModel } from '@/components/jimeng/JimengOptions';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AddCharacterDialogProps {
  onAdd: (character: Character) => void;
  onClose: () => void;
  mode?: 'add' | 'edit';
  initialCharacter?: Character | null;
}

export default function AddCharacterDialog({ onAdd, onClose, mode = 'add', initialCharacter }: AddCharacterDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(initialCharacter?.name || '');
  const [description, setDescription] = useState(initialCharacter?.description || '');
  const [appearance, setAppearance] = useState(initialCharacter?.appearance || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(initialCharacter?.referenceImages || []);
  const [soraReferenceVideoUrl, setSoraReferenceVideoUrl] = useState<string>(initialCharacter?.soraReferenceVideoUrl || '');
  const [selectedRefIndex, setSelectedRefIndex] = useState<number>(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'21:9' | '16:9'>('21:9');
  const [genMode, setGenMode] = useState<'seedream' | 'gemini' | 'jimeng'>('jimeng');
  const [jimengModel, setJimengModel] = useState<JimengModel>('jimeng-4.5');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [isSoraProcessing, setIsSoraProcessing] = useState(initialCharacter?.soraIdentity?.status === 'generating' || false);
  const [soraStatus, setSoraStatus] = useState<'none' | 'generating' | 'registering' | 'registered' | 'failed'>(
    initialCharacter?.soraIdentity?.status as any || 'none'
  );
  const [soraUsername, setSoraUsername] = useState(initialCharacter?.soraIdentity?.username || '');
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Polling for Sora Task (if generating)
  useEffect(() => {
    const taskId = initialCharacter?.soraIdentity?.taskId;
    if ((soraStatus === 'generating' || soraStatus === 'registering') && taskId) {
      startPolling(taskId);
    }
    return () => stopPolling();
  }, []);

  const stopPolling = () => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
  };

  const startPolling = (taskId: string) => {
    stopPolling();
    pollingTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sora/character/status?taskId=${taskId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          setSoraStatus('registered'); // Optimistic
          setIsSoraProcessing(false);
          stopPolling();
          if (data.videoUrl) setSoraReferenceVideoUrl(data.videoUrl);
          if (data.username) setSoraUsername(data.username);
          toast.success('Sora 角色注册流程完成！');
        } else if (data.status === 'failed') {
          setSoraStatus('failed');
          setIsSoraProcessing(false);
          stopPolling();
          toast.error('Sora 任务失败');
        }
      } catch (e) { console.error(e); }
    }, 5000);
  };

  const handleSoraRegister = async () => {
    if (!name.trim()) return toast.error('请先填写角色名称');

    setIsSoraProcessing(true);
    setSoraStatus('generating'); // or registering

    try {
      // Mode: direct if video exists, else generate
      const mode = soraReferenceVideoUrl ? 'register_direct' : 'generate_and_register';

      if (mode === 'generate_and_register' && referenceImages.length === 0) {
        setIsSoraProcessing(false);
        return toast.error('生成视频需要至少 1 张参考图');
      }

      const res = await fetch('/api/sora/character/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: initialCharacter?.id || undefined,
          character: {
            id: initialCharacter?.id || `temp_${Date.now()}`,
            name,
            description,
            appearance,
            referenceImages: referenceImages.length ? referenceImages : [],
            soraReferenceVideoUrl
          },
          projectId: initialCharacter?.projectId,
          mode
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (mode === 'register_direct') {
        setSoraStatus('registered');
        setSoraUsername(data.character.soraIdentity.username);
        setIsSoraProcessing(false);
        toast.success(`注册成功: ${data.character.soraIdentity.username}`);
      } else {
        setSoraStatus('generating');
        toast.success('已开始生成参考视频并自动注册...');
        if (data.task?.id) startPolling(data.task.id);
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
      setIsSoraProcessing(false);
      setSoraStatus('failed');
    }
  };


  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 默认拼装提示词
  useEffect(() => {
    if (generationPrompt.trim()) return;
    const parts: string[] = [];
    if (description.trim()) parts.push(`角色描述/性格：${description}`);
    if (appearance.trim()) parts.push(`外貌特征：${appearance}`);
    parts.push('生成全身三视图以及一张面部特写。(最左边占满 1/3 的位置是超大的面部特写，右边 2/3 放正视图、侧视图、后视图)，纯白背景。');
    setGenerationPrompt(parts.join('\n'));
  }, [description, appearance, generationPrompt]);

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

  const handleGenerateThreeView = async () => {
    if (!name.trim()) {
      toast.error('请先输入角色名称');
      return;
    }
    const prompt = generationPrompt.trim();
    if (!prompt) {
      toast.error('请完善三视图提示词');
      return;
    }

    setIsGenerating(true);
    try {
      let base64Url = '';

      if (genMode === 'seedream') {
        const volcanoService = VolcanoEngineService.getInstance();
        base64Url = await volcanoService.generateSingleImage(prompt, aspectRatio);
      } else if (genMode === 'jimeng') {
        const { jimengService } = await import('@/services/jimengService');
        const sessionid = localStorage.getItem('jimeng_session_id');
        if (!sessionid) throw new Error('请先在设置中配置即梦 Session ID');

        const genResult = await jimengService.generateImage({
          prompt,
          model: jimengModel,
          aspectRatio,
          sessionid
        });

        const historyId = genResult.data?.aigc_data?.history_record_id;
        if (!historyId) throw new Error('即梦任务提交失败');

        const pollResult = await jimengService.pollTask(historyId, sessionid);
        const imageUrl = pollResult.url || (pollResult.urls && pollResult.urls[0]);
        if (!imageUrl) throw new Error('即梦未返回图片');

        const proxyResp = await fetch('/api/image-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imageUrl }),
        });

        if (!proxyResp.ok) throw new Error('图片下载失败');
        const { data: base64Data, mimeType } = await proxyResp.json();
        base64Url = `data:${mimeType};base64,${base64Data}`;
      } else {
        const { generateCharacterThreeView } = await import('@/services/geminiService');
        const { urlsToReferenceImages } = await import('@/services/geminiService');
        const refImages = await urlsToReferenceImages(referenceImages);
        base64Url = await generateCharacterThreeView(prompt, 'Cinematic', refImages, aspectRatio);
      }

      setReferenceImages(prev => [...prev, base64Url]);
      const folder = `projects/characters/${user?.id || 'anonymous'}`;
      storageService.uploadBase64ToR2(base64Url, folder, `char_${Date.now()}.png`, user?.id || 'anonymous')
        .then(r2Url => {
          setReferenceImages(prev => prev.map(img => img === base64Url ? r2Url : img));
        })
        .catch(error => {
          console.error('R2 upload failed, keeping base64:', error);
        });

      toast.success('三视图生成成功！');
    } catch (error: any) {
      console.error('Failed to generate three-view:', error);
      toast.error('三视图生成失败', { description: error.message || '请检查 API 配置或网络连接' });
    } finally {
      setIsGenerating(false);
    }
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
    if (!name.trim()) { toast.error('请输入角色名称'); return; }
    if (!description.trim()) { toast.error('请输入角色描述'); return; }
    if (referenceImages.length === 0) { toast.error('请至少上传 1 张参考图'); return; }

    let finalImages = [...referenceImages];
    if (finalImages.length > 1 && selectedRefIndex >= 0 && selectedRefIndex < finalImages.length) {
      const [primary] = finalImages.splice(selectedRefIndex, 1);
      finalImages = [primary, ...finalImages];
    }

    // 构建 Sora 身份信息
    // 关键点：初始化为 null (而非 undefined)，确保当条件不满足时，数据库中的字段会被清空
    let finalSoraIdentity: Character['soraIdentity'] | null = null;

    // 数据模型中的有效状态
    const validStatuses = ['pending', 'generating', 'registered', 'failed'];

    if (validStatuses.includes(soraStatus) && (soraUsername || soraReferenceVideoUrl)) {
      finalSoraIdentity = {
        username: soraUsername || '',
        referenceVideoUrl: soraReferenceVideoUrl || '',
        status: soraStatus as any,
        // 仅在继续生成任务时继承 Task ID，如果是手动注册视频/ID 则不需要
        // 如果状态已注册，Task ID 属于历史数据，无需保留
        taskId: initialCharacter?.soraIdentity?.taskId
      };
    }

    const character: Character = {
      id: initialCharacter?.id || `character_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      appearance: appearance.trim(),
      referenceImages: finalImages,
      // 关键点：如果为空，发送 null 以清空数据库字段
      soraReferenceVideoUrl: soraReferenceVideoUrl || null as any,
      soraIdentity: finalSoraIdentity as any // 强制发送 null 以清除 JSONB 数据
    };

    onAdd(character);
    toast.success(mode === 'add' ? `角色 "${name}" 已添加！` : `角色 "${name}" 已更新！`);
    onClose();
  };


  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
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

              {/* AI Generate Three-View Button */}
              <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-white/5 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Sparkles className="w-24 h-24 text-zinc-900 dark:text-white" />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10">
                        <Wand2 className="w-4 h-4 text-white dark:text-black" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">AI 生成三视图</h3>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">基于描述自动生成角色参考图</p>
                      </div>
                    </div>

                    {/* Model & Mode Selector */}
                    <div className="flex items-center gap-2">
                      <div className="relative group">
                        <select
                          value={genMode}
                          onChange={(e) => setGenMode(e.target.value as any)}
                          className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-lg focus:outline-none cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                        >
                          <option value="jimeng" className="dark:bg-zinc-900">即梦 AI</option>
                          <option value="gemini" className="dark:bg-zinc-900">Gemini</option>
                          <option value="seedream" className="dark:bg-zinc-900">SeeDream</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
                      </div>

                      {genMode === 'jimeng' && (
                        <div className="relative group">
                          <select
                            value={jimengModel}
                            onChange={(e) => setJimengModel(e.target.value as JimengModel)}
                            className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-lg focus:outline-none cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                          >
                            <option value="jimeng-4.5" className="dark:bg-zinc-900">图片 4.5</option>
                            <option value="jimeng-4.1" className="dark:bg-zinc-900">图片 4.1</option>
                            <option value="jimeng-4.0" className="dark:bg-zinc-900">图片 4.0</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateThreeView}
                    disabled={isGenerating || !name.trim()}
                    className={cn(
                      "w-full seko-button seko-button-primary py-2.5 flex items-center justify-center gap-2.5 transition-all duration-300",
                      isGenerating && "cursor-wait opacity-80"
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在生成创意方案...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>开始生成</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">比例:</span>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as '21:9' | '16:9')}
                        className="text-[10px] font-medium bg-transparent text-zinc-700 dark:text-zinc-300 border-none p-0 focus:ring-0 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                      >
                        <option value="21:9" className="dark:bg-zinc-900">21:9 超宽</option>
                        <option value="16:9" className="dark:bg-zinc-900">16:9 宽屏</option>
                      </select>
                    </div>
                    <span className="text-[10px] text-zinc-400">消耗 1 次生成额度</span>
                  </div>
                </div>
              </div>

              {/* Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full group relative overflow-hidden rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50/50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all duration-300 p-8 flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">点击上传参考图</p>
                  <p className="text-xs text-zinc-400 mt-1">支持 JPG, PNG (Max 10MB)</p>
                </div>
              </button>

              {/* Image Preview Grid */}
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {referenceImages.map((imageUrl, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-300",
                        selectedRefIndex === index
                          ? "ring-2 ring-zinc-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-[#181818]"
                          : "hover:ring-2 hover:ring-zinc-200 dark:hover:ring-zinc-700"
                      )}
                      onClick={() => {
                        setPreviewImage(imageUrl);
                        setSelectedRefIndex(index);
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={`参考图 ${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all duration-200 scale-90 group-hover:scale-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      {selectedRefIndex === index && (
                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-zinc-900/90 dark:bg-white/90 backdrop-blur-sm text-[10px] font-bold text-white dark:text-black shadow-sm">
                          主图
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                  生成提示词（高级）
                </label>
                <textarea
                  value={generationPrompt}
                  onChange={(e) => setGenerationPrompt(e.target.value)}
                  className="w-full h-20 px-3 py-2 text-xs seko-input resize-none font-mono opacity-80 focus:opacity-100 transition-opacity"
                />
              </div>

              {/* Sora Reference Video Upload */}
              <div className="mt-4 pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                  <span>Sora 参考视频</span>
                  <span className="text-xs font-normal text-zinc-400">(可选)</span>
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  上传 3-10s 的角色动态视频，可跳过"图生视频"步骤，直接注册 Sora 角色 ID。
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
                      src={soraReferenceVideoUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const urlToDelete = soraReferenceVideoUrl;
                        // Clear UI state immediately
                        setSoraReferenceVideoUrl('');
                        setSoraStatus('none');
                        setSoraUsername('');

                        // Attempt to delete from R2
                        if (urlToDelete) {
                          try {
                            await storageService.deleteFile(urlToDelete);
                            toast.success('云端视频源文件已清理');
                          } catch (e) {
                            console.warn('Failed to delete file from R2:', e);
                            // Don't block UI on cleanup failure
                          }
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
            <div className="mt-6 pt-6 border-t border-dashed border-zinc-200 dark:border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Sora 角色一致性</h3>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">注册角色 ID 以确保视频生成的一致性</p>
                  </div>
                </div>
                <div className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                  soraStatus === 'registered'
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                    : soraStatus === 'generating'
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                      : "bg-zinc-50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10"
                )}>
                  {soraStatus === 'registered' ? 'Active' :
                    soraStatus === 'generating' ? 'Processing' : 'Inactive'}
                </div>
              </div>

              <div className="relative group overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                {/* Status Background Effect */}
                <div className={cn(
                  "absolute inset-0 opacity-0 transition-opacity duration-500",
                  soraStatus === 'registered' ? "bg-gradient-to-br from-emerald-500/5 to-transparent opacity-100" :
                    soraStatus === 'generating' ? "bg-gradient-to-br from-amber-500/5 to-transparent opacity-100" : ""
                )} />

                <div className="relative p-5">
                  {soraStatus === 'registered' ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center border-4 border-white dark:border-white/5 shadow-sm">
                          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Sora Identity Reference</p>
                          <div className="flex items-center gap-2 group/edit relative w-fit">
                            <input
                              type="text"
                              value={soraUsername}
                              onChange={(e) => {
                                setSoraUsername(e.target.value);
                                if (e.target.value.trim() === '') {
                                  setSoraStatus('none');
                                  // Optionally clear video if they want a fresh start, but maybe keep it?
                                  // User said: "If I delete Sora code... hope to have place to create Sora video".
                                  // If video persists, they can't create new video unless they delete video too.
                                  // Safe to just reset status.
                                }
                              }}
                              className="px-3 py-1.5 rounded-md bg-white dark:bg-black/50 border-2 border-zinc-200 dark:border-white/10 text-sm font-mono font-bold text-black dark:text-white w-48 shadow-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                            />
                            <Pencil className="w-3 h-3 text-zinc-400 opacity-0 group-hover/edit:opacity-100 transition-opacity absolute -right-5 top-1/2 -translate-y-1/2 cursor-pointer" />
                          </div>
                        </div>
                      </div>
                      {soraReferenceVideoUrl && (
                        <div className="mt-1 p-2 rounded-lg bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 flex items-center gap-3">
                          <div className="h-8 w-12 rounded bg-black flex items-center justify-center overflow-hidden">
                            <video src={soraReferenceVideoUrl} className="w-full h-full object-cover opacity-80" />
                          </div>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">参考视频已绑定</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2",
                          isSoraProcessing
                            ? "border-amber-100 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10"
                            : "border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10"
                        )}>
                          {isSoraProcessing ? (
                            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                          ) : (
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-1">
                            {isSoraProcessing ? "正在处理中..." : "建立角色一致性"}
                          </h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            {soraReferenceVideoUrl
                              ? "使用当前上传的参考视频直接注册 Sora 身份 ID。"
                              : "系统将使用参考图片生成 10s 标准动态视频，并自动注册角色 ID (消耗积分)。"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSoraRegister}
                        disabled={isSoraProcessing}
                        className={cn(
                          "w-full py-3 text-sm font-bold rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group",
                          isSoraProcessing
                            ? "bg-zinc-100 dark:bg-white/5 text-zinc-400 cursor-not-allowed"
                            : "bg-black/90 text-white dark:bg-white/90 dark:text-black backdrop-blur-md shadow-xl shadow-black/10 dark:shadow-white/5 hover:scale-[1.02] active:scale-[0.98] ring-1 ring-white/10 dark:ring-black/5"
                        )}
                      >
                        {/* Glossy Reflection Effect */}
                        {!isSoraProcessing && (
                          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        )}

                        {isSoraProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>处理中...</span>
                          </>
                        ) : (
                          <>
                            {soraReferenceVideoUrl ? '立即注册角色 ID' : '生成视频并注册'}
                            <Wand2 className="w-4 h-4 opacity-80 group-hover:rotate-12 transition-transform duration-300" />
                          </>
                        )}
                      </button>
                      <div className="mt-3 flex items-center justify-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">已有 Sora ID?</span>
                        <input
                          type="text"
                          placeholder="输入 @ch_..."
                          className="bg-transparent border-b-2 border-zinc-400 dark:border-white/20 text-xs py-1 focus:outline-none focus:border-emerald-500 w-28 text-zinc-900 dark:text-white placeholder-zinc-500 font-mono text-center font-medium"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.length > 2) {
                              setSoraUsername(val);
                              setSoraStatus('registered');
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>


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
              onClick={handleSubmit}
              className="seko-button seko-button-primary px-6 py-2.5 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              {mode === 'add' ? '添加角色' : '保存修改'}
            </button>
          </div>
        </motion.div>
      </div>

      {previewImage && (
        <div
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
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
