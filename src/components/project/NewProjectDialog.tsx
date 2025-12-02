'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { AspectRatio } from '@/types/project';

interface NewProjectDialogProps {
  onConfirm: (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => void;
  onClose: () => void;
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
}: NewProjectDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artStyle, setArtStyle] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(
    AspectRatio.MOBILE
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('请输入项目名称');
      return;
    }
    onConfirm(title, description, artStyle, selectedAspectRatio);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-light-bg dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-light-bg dark:bg-cine-dark border-b border-light-border dark:border-cine-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-light-text dark:text-white">
              ✨ 创建新项目
            </h2>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
              设置项目基本信息和画面比例
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
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
              className="w-full px-4 py-3 rounded-lg bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent"
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
              className="w-full px-4 py-3 rounded-lg bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent resize-none"
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
              className="w-full px-4 py-3 rounded-lg bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent"
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
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedAspectRatio === option.value
                      ? 'border-light-accent dark:border-cine-accent bg-light-accent/10 dark:bg-cine-accent/10'
                      : 'border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-light-text dark:text-white">
                          {option.label}
                        </span>
                        {option.recommended && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-light-accent dark:bg-cine-accent text-white">
                            推荐
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-light-text-muted dark:text-cine-text-muted mb-1">
                        {option.description}
                      </p>
                      <p className="text-xs text-light-text-muted dark:text-cine-text-muted">
                        分辨率: {option.resolution}
                      </p>
                    </div>
                    {selectedAspectRatio === option.value && (
                      <div className="ml-4 bg-light-accent dark:bg-cine-accent text-white rounded-full p-1">
                        <Check size={16} />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-3">
              💡 画面比例一旦设置，整个项目的所有分镜都将使用此比例。后续可在项目设置中调整。
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-light-bg dark:bg-cine-dark border-t border-light-border dark:border-cine-border p-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border text-light-text dark:text-white transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-lg bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white font-bold transition-colors"
          >
            创建项目 →
          </button>
        </div>
      </div>
    </div>
  );
}
