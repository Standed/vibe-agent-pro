'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2 } from 'lucide-react';
import { AspectRatio } from '@/types/project';

interface NewProjectDialogProps {
  onConfirm: (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => Promise<void>;
  onClose: () => void;
  initialDescription?: string;
  initialTitle?: string;
  initialArtStyle?: string;
  initialAspectRatio?: string;
}

const aspectRatioOptions = [
  {
    value: AspectRatio.WIDE,
    label: '16:9 横屏视频',
    description: '1920x1080 - 适合横屏视频、YouTube',
    resolution: '1920×1080',
  },
  {
    value: AspectRatio.MOBILE,
    label: '9:16 竖屏短视频',
    description: '1080x1920 - 适合抖音、快手、Instagram Stories',
    resolution: '1080×1920',
    recommended: true,
  },
  {
    value: AspectRatio.SQUARE,
    label: '1:1 方形',
    description: '1080x1080 - 适合社交媒体方形视频',
    resolution: '1080×1080',
  },
  {
    value: AspectRatio.STANDARD,
    label: '4:3 传统',
    description: '1440x1080 - 传统电视比例',
    resolution: '1440×1080',
  },
  {
    value: AspectRatio.CINEMA,
    label: '21:9 电影',
    description: '2560x1080 - 电影宽屏',
    resolution: '2560×1080',
  },
];

export default function NewProjectDialog({
  onConfirm,
  onClose,
  initialDescription = '',
  initialTitle = '',
  initialArtStyle = '',
  initialAspectRatio = AspectRatio.MOBILE,
}: NewProjectDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [artStyle, setArtStyle] = useState(initialArtStyle);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(
    // Ensure the aspect ratio from AI matches one of our enums, otherwise fallback to MOBILE
    Object.values(AspectRatio).includes(initialAspectRatio as AspectRatio)
      ? initialAspectRatio
      : AspectRatio.MOBILE
  );
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Update state when initial props change (e.g. when AI returns)
  useEffect(() => {
    if (initialTitle) setTitle(initialTitle);
    if (initialDescription) setDescription(initialDescription);
    if (initialArtStyle) setArtStyle(initialArtStyle);
    if (initialAspectRatio && Object.values(AspectRatio).includes(initialAspectRatio as AspectRatio)) {
      setSelectedAspectRatio(initialAspectRatio);
    }
  }, [initialTitle, initialDescription, initialArtStyle, initialAspectRatio]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('请输入项目名称');
      return;
    }

    setIsCreating(true);
    try {
      await onConfirm(title, description, artStyle, selectedAspectRatio);
      // 成功后由父组件关闭弹窗
    } catch (error) {
      console.error('创建项目失败:', error);
      setIsCreating(false);
      // 失败后让用户重试
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="glass-panel rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 glass-panel border-b border-black/5 dark:border-white/5 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-light-text dark:text-white">
              {isCreating ? '正在创建项目...' : '✨ 创建新项目'}
            </h2>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
              {isCreating ? '请稍候，正在保存项目数据...' : '设置项目基本信息和画面比例'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
              📝 项目名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：《森林奇遇记》"
              disabled={isCreating}
              className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          {/* Project Description */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
              📖 项目概要
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述你的项目内容和主题..."
              rows={3}
              disabled={isCreating}
              className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Art Style */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
              🎨 画风描述
            </label>
            <input
              type="text"
              value={artStyle}
              onChange={(e) => setArtStyle(e.target.value)}
              placeholder="例如：国风3D动漫、赛博朋克、写实风格"
              disabled={isCreating}
              className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-2">
              画风信息将用于生成分镜图片时的提示词
            </p>
          </div>

          {/* Aspect Ratio Selection */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-3">
              🎬 画面比例 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {aspectRatioOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedAspectRatio(option.value)}
                  disabled={isCreating}
                  className={`w-full p-4 rounded-xl border transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed group ${selectedAspectRatio === option.value
                    ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                    : 'glass-card border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-bold transition-colors ${selectedAspectRatio === option.value ? 'text-light-accent dark:text-cine-accent' : 'text-light-text dark:text-white'}`}>
                          {option.label}
                        </span>
                        {option.recommended && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-light-accent dark:bg-cine-accent text-white dark:text-black shadow-sm">
                            推荐
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-light-text-muted dark:text-cine-text-muted mb-1 group-hover:text-light-text dark:group-hover:text-gray-300 transition-colors">
                        {option.description}
                      </p>
                      <p className="text-xs text-light-text-muted dark:text-cine-text-muted opacity-70">
                        分辨率: {option.resolution}
                      </p>
                    </div>
                    <div className={`ml-4 rounded-full p-1 transition-all duration-300 ${selectedAspectRatio === option.value
                      ? 'bg-light-accent dark:bg-cine-accent text-white dark:text-black scale-100'
                      : 'bg-gray-200 dark:bg-gray-700 text-transparent scale-90'
                      }`}>
                      <Check size={16} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-3 pl-1">
              💡 画面比例一旦设置，整个项目的所有分镜都将使用此比例。后续可在项目设置中调整。
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="sticky bottom-0 glass-panel border-t border-black/5 dark:border-white/5 p-6 flex justify-end gap-3 z-10">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="px-6 py-2.5 rounded-lg glass-button text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isCreating}
            className="px-6 py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>创建中...</span>
              </>
            ) : (
              <>创建项目 →</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
