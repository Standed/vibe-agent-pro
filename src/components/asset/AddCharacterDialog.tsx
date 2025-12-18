'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Upload, Trash2, Sparkles, Loader2, Eye } from 'lucide-react';
import type { Character } from '@/types/project';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { toast } from 'sonner';
import { storageService } from '@/lib/storageService';
import { useAuth } from '@/components/auth/AuthProvider';

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
  const [selectedRefIndex, setSelectedRefIndex] = useState<number>(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'21:9' | '16:9'>('21:9');
  const [genMode, setGenMode] = useState<'seedream' | 'gemini'>('gemini');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 默认拼装提示词（不包含角色名，方便用户自行输入）
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

    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error(`文件 ${file.name} 不是图片格式`);
        continue;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过 5MB 限制`);
        continue;
      }

      // Convert to data URL
      try {
        const dataUrl = await fileToDataURL(file);
        newImages.push(dataUrl);
      } catch (error) {
        console.error('Failed to read file:', error);
        toast.error(`读取文件 ${file.name} 失败`);
      }
    }

    const combined = [...referenceImages, ...newImages];
    setReferenceImages(combined);
    if (combined.length === newImages.length) {
      setSelectedRefIndex(0);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (newImages.length > 0) {
      toast.success(`已添加 ${newImages.length} 张图片`);
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
    if (updated.length === 0) {
      setSelectedRefIndex(0);
    } else if (index === selectedRefIndex) {
      setSelectedRefIndex(0);
    } else if (index < selectedRefIndex) {
      setSelectedRefIndex((prev) => Math.max(prev - 1, 0));
    }
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
      } else {
        // Gemini Direct
        const { generateCharacterThreeView } = await import('@/services/geminiService');
        const { urlsToReferenceImages } = await import('@/services/geminiService');
        const refImages = await urlsToReferenceImages(referenceImages);
        // 修正：使用 UI 中选择的 aspectRatio，Gemini 模式下三视图通常推荐 21:9
        base64Url = await generateCharacterThreeView(prompt, 'Cinematic', refImages, aspectRatio);
      }

      // 1. Immediate UI update (Base64)
      setReferenceImages(prev => [...prev, base64Url]);

      // 2. Background Upload to R2
      const folder = `projects/characters/${user?.id || 'anonymous'}`;
      storageService.uploadBase64ToR2(base64Url, folder, `char_${Date.now()}.png`, user?.id || 'anonymous')
        .then(r2Url => {
          // Replace base64 with R2 URL
          setReferenceImages(prev => prev.map(img => img === base64Url ? r2Url : img));
        })
        .catch(error => {
          console.error('R2 upload failed, keeping base64:', error);
        });

      toast.success('三视图生成成功！');
    } catch (error: any) {
      console.error('Failed to generate three-view:', error);
      toast.error('三视图生成失败', {
        description: error.message || '请检查 API 配置或网络连接'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('请输入角色名称');
      return;
    }

    if (!description.trim()) {
      toast.error('请输入角色描述');
      return;
    }
    if (referenceImages.length === 0) {
      toast.error('请至少上传 1 张参考图');
      return;
    }

    // 把选中的参考图排到第一张，方便后续引用
    let finalImages = [...referenceImages];
    if (finalImages.length > 1 && selectedRefIndex >= 0 && selectedRefIndex < finalImages.length) {
      const [primary] = finalImages.splice(selectedRefIndex, 1);
      finalImages = [primary, ...finalImages];
    }

    const character: Character = {
      id: initialCharacter?.id || `character_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      appearance: appearance.trim(),
      referenceImages: finalImages,
    };

    onAdd(character);
    toast.success(mode === 'add' ? `角色 "${name}" 已添加！` : `角色 "${name}" 已更新！`);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-cine-border">
            <div>
              <h2 className="text-lg font-bold text-light-text dark:text-white">{mode === 'add' ? '添加角色' : '编辑角色'}</h2>
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                上传参考图片，提升生成质量
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-light-bg dark:hover:bg-cine-panel rounded-lg transition-colors"
            >
              <X size={20} className="text-light-text-muted dark:text-cine-text-muted" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Character Name */}
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
                角色名称 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：苏白、李明、张医生..."
                className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                required
              />
            </div>

            {/* Character Description */}
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
                角色描述/性格 *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="角色的背景、性格、职业等...&#10;&#10;示例：30 岁左右的男性程序员，性格内向，经常熬夜工作。"
                className="w-full h-24 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                required
              />
            </div>

            {/* Character Appearance */}
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
                外貌特征（选填）
              </label>
              <textarea
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                placeholder="详细描述外貌特征...&#10;&#10;示例：短发，戴黑框眼镜，中等身材，常穿格子衬衫。"
                className="w-full h-20 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              />
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                可以留空，上传参考图片更直观
              </p>
            </div>

            {/* Reference Images */}
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-white mb-2 flex items-center gap-2">
                参考图片（必填）
                <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted">至少 1 张，点击可放大预览</span>
              </label>

              {/* AI Generate Three-View Button */}
              <button
                type="button"
                onClick={handleGenerateThreeView}
                disabled={isGenerating || !name.trim()}
                className="w-full bg-light-accent/10 dark:bg-cine-accent/10 hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 border-2 border-dashed border-light-accent dark:border-cine-accent rounded-lg p-4 transition-colors flex flex-col items-center justify-center gap-2 mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={24} className="text-light-accent dark:text-cine-accent animate-spin" />
                    <span className="text-sm text-light-accent dark:text-cine-accent font-medium">
                      AI 生成中...
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles size={24} className="text-light-accent dark:text-cine-accent" />
                    <span className="text-sm text-light-accent dark:text-cine-accent font-medium">
                      AI 生成三视图
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                      基于角色描述自动生成参考图
                    </span>
                  </>
                )}
              </button>

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
                className="w-full bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-2 border-dashed border-light-border dark:border-cine-border rounded-lg p-6 transition-colors flex flex-col items-center justify-center gap-2"
              >
                <Upload size={24} className="text-light-text-muted dark:text-cine-text-muted" />
                <span className="text-sm text-light-text-muted dark:text-cine-text-muted">
                  点击上传图片
                </span>
                <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  支持 JPG、PNG，最大 5MB
                </span>
              </button>

              {/* Image Preview Grid */}
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {referenceImages.map((imageUrl, index) => (
                    <div
                      key={index}
                      className={`relative aspect-square bg-light-bg dark:bg-cine-black rounded-lg overflow-hidden group border ${selectedRefIndex === index ? 'border-light-accent dark:border-cine-accent' : 'border-transparent'}`}
                    >
                      <img
                        src={imageUrl}
                        alt={`参考图 ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => {
                          setPreviewImage(imageUrl);
                          setSelectedRefIndex(index);
                        }}
                      />
                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="删除图片"
                      >
                        <Trash2 size={12} />
                      </button>
                      {/* Image Index */}
                      <div className="absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                        {selectedRefIndex === index && <span className="text-yellow-300">★</span>}
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '21:9' | '16:9')}
                  className="text-xs border border-light-border dark:border-cine-border rounded px-2 py-1"
                >
                  <option value="21:9">21:9 超宽</option>
                  <option value="16:9">16:9 宽屏</option>
                </select>
                <span className="text-[11px] text-light-text-muted dark:text-cine-text-muted">
                  选择生成比例
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setGenMode('gemini')}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${genMode === 'gemini' ? 'bg-light-accent dark:bg-cine-accent text-white' : 'bg-light-bg dark:bg-cine-panel text-light-text-muted dark:text-cine-text-muted border border-light-border dark:border-cine-border'}`}
                  >
                    Gemini (推荐)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenMode('seedream')}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${genMode === 'seedream' ? 'bg-light-accent dark:bg-cine-accent text-white' : 'bg-light-bg dark:bg-cine-panel text-light-text-muted dark:text-cine-text-muted border border-light-border dark:border-cine-border'}`}
                  >
                    SeeDream
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-1">
                  三视图提示词（可微调后再生成）
                </label>
                <textarea
                  value={generationPrompt}
                  onChange={(e) => setGenerationPrompt(e.target.value)}
                  className="w-full h-24 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-2 text-xs resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white"
                />
              </div>
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-2">
                💡 上传角色参考图后，生成时会优先使用这些图片作为参考，保持角色一致性
              </p>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-light-border dark:border-cine-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              {mode === 'add' ? '添加角色' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="预览"
              className="max-w-full max-h-full rounded-lg object-contain shadow-2xl"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors border border-white/20"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
