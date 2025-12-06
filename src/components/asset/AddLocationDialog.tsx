'use client';

import { useState, useRef } from 'react';
import { X, Plus, Upload, Trash2 } from 'lucide-react';
import type { Location, LocationType } from '@/types/project';
import { toast } from 'sonner';

interface AddLocationDialogProps {
  onAdd: (location: Location) => void;
  onClose: () => void;
  mode?: 'add' | 'edit';
  initialLocation?: Location | null;
}

export default function AddLocationDialog({ onAdd, onClose, mode = 'add', initialLocation }: AddLocationDialogProps) {
  const [name, setName] = useState(initialLocation?.name || '');
  const [type, setType] = useState<LocationType>(initialLocation?.type || 'interior');
  const [description, setDescription] = useState(initialLocation?.description || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(initialLocation?.referenceImages || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    setReferenceImages([...referenceImages, ...newImages]);

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
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
    toast.success('图片已删除');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('请输入场景地点名称');
      return;
    }

    if (!description.trim()) {
      toast.error('请输入场景描述');
      return;
    }
    if (referenceImages.length === 0) {
      toast.error('请至少上传 1 张参考图');
      return;
    }

    const location: Location = {
      id: initialLocation?.id || `location_${Date.now()}`,
      name: name.trim(),
      type,
      description: description.trim(),
      referenceImages,
    };

    onAdd(location);
    toast.success(mode === 'add' ? `场景地点 "${name}" 已添加！` : `场景地点 "${name}" 已更新！`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-cine-border">
          <div>
            <h2 className="text-lg font-bold text-light-text dark:text-white">{mode === 'add' ? '添加场景地点' : '编辑场景地点'}</h2>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              上传参考图片，提升场景生成质量
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
          {/* Location Name */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              场景地点名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：咖啡厅、办公室、城市街道..."
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              required
            />
          </div>

          {/* Location Type */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              场景类型 *
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('interior')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  type === 'interior'
                    ? 'bg-light-accent dark:bg-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white hover:bg-light-border dark:hover:bg-cine-border'
                }`}
              >
                室内
              </button>
              <button
                type="button"
                onClick={() => setType('exterior')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  type === 'exterior'
                    ? 'bg-light-accent dark:bg-cine-accent text-white'
                    : 'bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white hover:bg-light-border dark:hover:bg-cine-border'
                }`}
              >
                室外
              </button>
            </div>
          </div>

          {/* Location Description */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              场景描述 *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述场景的氛围、特点、环境等...&#10;&#10;示例：温馨的咖啡厅，木质装修，暖黄色灯光，靠窗的位置可以看到街景。"
              className="w-full h-24 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              required
            />
          </div>

          {/* Reference Images */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              参考图片（选填）
            </label>

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
                    className="relative aspect-square bg-light-bg dark:bg-cine-black rounded-lg overflow-hidden group"
                  >
                    <img
                      src={imageUrl}
                      alt={`参考图 ${index + 1}`}
                      className="w-full h-full object-cover"
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
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-xs">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-2">
              💡 上传场景参考图后，生成分镜时会使用这些图片作为环境参考
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
            添加场景地点
          </button>
        </div>
      </div>
    </div>
  );
}
