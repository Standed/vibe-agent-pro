'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Upload, Trash2, Sparkles, Loader2, ChevronDown, MapPin, Wand2 } from 'lucide-react';
import type { Location, LocationType } from '@/types/project';
import { toast } from 'sonner';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { storageService } from '@/lib/storageService';
import { useAuth } from '@/components/auth/AuthProvider';
import { JimengModel } from '@/components/jimeng/JimengOptions';
import { ImageSelectionModal } from '@/components/jimeng/ImageSelectionModal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AddLocationDialogProps {
  onAdd: (location: Location) => void;
  onClose: () => void;
  mode?: 'add' | 'edit';
  initialLocation?: Location | null;
}

export default function AddLocationDialog({ onAdd, onClose, mode = 'add', initialLocation }: AddLocationDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(initialLocation?.name || '');
  const [type, setType] = useState<LocationType>(initialLocation?.type || 'interior');
  const [description, setDescription] = useState(initialLocation?.description || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(initialLocation?.referenceImages || []);
  const [selectedRefIndex, setSelectedRefIndex] = useState<number>(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'21:9' | '16:9'>('21:9');
  const [genMode, setGenMode] = useState<'seedream' | 'gemini' | 'jimeng'>('jimeng');
  const [jimengModel, setJimengModel] = useState<JimengModel>('jimeng-4.5');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jimengCandidates, setJimengCandidates] = useState<string[]>([]);
  const [isJimengModalOpen, setIsJimengModalOpen] = useState(false);
  const [isJimengSaving, setIsJimengSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 默认拼装提示词
  useEffect(() => {
    if (generationPrompt.trim()) return;
    const parts: string[] = [];
    if (description.trim()) parts.push(`场景描述/氛围：${description}`);
    if (type === 'interior') parts.push('室内场景');
    else parts.push('室外场景');
    parts.push('生成一张高质量的环境概念设计图，电影质感，细节丰富，光影考究。');
    setGenerationPrompt(parts.join('\n'));
  }, [description, type, generationPrompt]);

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
            const folder = `projects/locations/${user?.id || 'anonymous'}`;
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

  const handleGenerateConcept = async () => {
    if (!name.trim()) { toast.error('请先输入场景名称'); return; }
    const prompt = generationPrompt.trim();
    if (!prompt) { toast.error('请完善生成提示词'); return; }

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
        const imageUrls = [
          ...(pollResult.urls || []),
          ...(pollResult.url ? [pollResult.url] : [])
        ].filter(Boolean);

        if (imageUrls.length === 0) throw new Error('即梦未返回图片');

        const limitedUrls = imageUrls.slice(0, 4);
        if (limitedUrls.length === 1) {
          await handleJimengSelection(limitedUrls[0]);
        } else {
          setJimengCandidates(limitedUrls);
          setIsJimengModalOpen(true);
          toast.success('即梦图片生成完成，请选择一张保存');
        }
      } else {
        const { generateCharacterThreeView } = await import('@/services/geminiService');
        const { urlsToReferenceImages } = await import('@/services/geminiService');
        const refImages = await urlsToReferenceImages(referenceImages);
        base64Url = await generateCharacterThreeView(prompt, 'Cinematic', refImages, aspectRatio);
      }

      if (genMode !== 'jimeng') {
        setReferenceImages(prev => [...prev, base64Url]);
        const folder = `projects/locations/${user?.id || 'anonymous'}`;
        storageService.uploadBase64ToR2(base64Url, folder, `loc_${Date.now()}.png`, user?.id || 'anonymous')
          .then(r2Url => {
            setReferenceImages(prev => prev.map(img => img === base64Url ? r2Url : img));
          })
          .catch(error => {
            console.error('R2 upload failed, keeping base64:', error);
          });

        toast.success('场景概念图生成成功！');
      }
    } catch (error: any) {
      console.error('Failed to generate concept:', error);
      toast.error('生成失败', { description: error.message || '请检查 API 配置或网络连接' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJimengSelection = async (selectedUrl: string) => {
    if (!user) {
      toast.error('请先登录');
      return;
    }

    setIsJimengSaving(true);
    try {
      const proxyResp = await fetch('/api/image-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selectedUrl }),
      });

      if (!proxyResp.ok) throw new Error('图片下载失败');
      const { data: base64Data, mimeType } = await proxyResp.json();
      const base64Url = `data:${mimeType};base64,${base64Data}`;

      const folder = `projects/locations/${user?.id || 'anonymous'}`;
      const r2Url = await storageService.uploadBase64ToR2(base64Url, folder, `loc_${Date.now()}.png`, user?.id || 'anonymous');

      setReferenceImages(prev => [r2Url, ...prev]);
      setPreviewImage(r2Url);
      setSelectedRefIndex(0);
      toast.success('场景概念图生成成功！');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '保存失败');
    } finally {
      setIsJimengSaving(false);
      setIsJimengModalOpen(false);
      setJimengCandidates([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('请输入场景地点名称'); return; }
    if (!description.trim()) { toast.error('请输入场景描述'); return; }
    // if (referenceImages.length === 0) { toast.error('请至少上传 1 张参考图'); return; } // 已移除校验

    let finalImages = [...referenceImages];
    if (finalImages.length > 1 && selectedRefIndex >= 0 && selectedRefIndex < finalImages.length) {
      const [primary] = finalImages.splice(selectedRefIndex, 1);
      finalImages = [primary, ...finalImages];
    }

    const location: Location = {
      id: initialLocation?.id || `location_${Date.now()}`,
      name: name.trim(),
      type,
      description: description.trim(),
      referenceImages: finalImages,
    };

    onAdd(location);
    toast.success(mode === 'add' ? `场景地点 "${name}" 已添加！` : `场景地点 "${name}" 已更新！`);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" key="location-dialog-root">
        <motion.div
          key="location-dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-md"
        />

        <motion.div
          key="location-dialog-content"
          initial={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
          className="relative w-full max-w-2xl seko-panel overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 dark:border-white/5">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{mode === 'add' ? '添加场景地点' : '编辑场景地点'}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                上传参考图片，提升场景生成质量
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
            {/* Location Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                场景地点名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：咖啡厅、办公室、城市街道..."
                className="w-full px-4 py-3 seko-input"
                required
              />
            </div>

            {/* Location Type */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                场景类型 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('interior')}
                  className={cn(
                    "py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 border",
                    type === 'interior'
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-transparent shadow-lg shadow-black/20 dark:shadow-white/20"
                      : "bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10"
                  )}
                >
                  室内场景
                </button>
                <button
                  type="button"
                  onClick={() => setType('exterior')}
                  className={cn(
                    "py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 border",
                    type === 'exterior'
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-transparent shadow-lg shadow-black/20 dark:shadow-white/20"
                      : "bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10"
                  )}
                >
                  室外场景
                </button>
              </div>
            </div>

            {/* Location Description */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                场景描述 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述场景的氛围、特点、环境等...&#10;&#10;示例：温馨的咖啡厅，木质装修，暖黄色灯光，靠窗的位置可以看到街景。"
                className="w-full h-24 px-4 py-3 seko-input resize-none"
                required
              />
            </div>

            {/* Reference Images */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>参考图片 <span className="text-zinc-400 font-normal">(可选)</span></span>

              </label>

              {/* AI Generate Button */}
              <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-white/5 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Sparkles className="w-24 h-24 text-zinc-900 dark:text-white" />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10">
                        <MapPin className="w-4 h-4 text-white dark:text-black" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">AI 生成概念图</h3>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">基于描述自动生成场景参考图</p>
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
                    onClick={handleGenerateConcept}
                    disabled={isGenerating || !name.trim()}
                    className={cn(
                      "w-full seko-button seko-button-primary py-2.5 flex items-center justify-center gap-2.5 transition-all duration-300",
                      isGenerating && "cursor-wait opacity-80"
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在生成概念图...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
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
              {mode === 'add' ? '添加场景地点' : '保存修改'}
            </button>
          </div>
        </motion.div>
      </div>

      <ImageSelectionModal
        isOpen={isJimengModalOpen}
        onClose={() => {
          if (isJimengSaving) return;
          setIsJimengModalOpen(false);
          setJimengCandidates([]);
        }}
        onConfirm={handleJimengSelection}
        imageUrls={jimengCandidates}
        isLoading={isJimengSaving}
      />

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
