'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2 } from 'lucide-react';
import { AspectRatio } from '@/types/project';
import { useI18n } from '@/components/providers/I18nProvider';

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

export default function NewProjectDialog({
  onConfirm,
  onClose,
  initialDescription = '',
  initialTitle = '',
  initialArtStyle = '',
  initialAspectRatio = AspectRatio.MOBILE,
}: NewProjectDialogProps) {
  const { t } = useI18n();
  const aspectRatioOptions = [
    {
      value: AspectRatio.WIDE,
      label: t('newProject.aspectRatios.wideLabel'),
      description: t('newProject.aspectRatios.wideDesc'),
      resolution: '1920×1080',
    },
    {
      value: AspectRatio.MOBILE,
      label: t('newProject.aspectRatios.mobileLabel'),
      description: t('newProject.aspectRatios.mobileDesc'),
      resolution: '1080×1920',
      recommended: true,
    },
    {
      value: AspectRatio.SQUARE,
      label: t('newProject.aspectRatios.squareLabel'),
      description: t('newProject.aspectRatios.squareDesc'),
      resolution: '1080×1080',
    },
    {
      value: AspectRatio.STANDARD,
      label: t('newProject.aspectRatios.standardLabel'),
      description: t('newProject.aspectRatios.standardDesc'),
      resolution: '1440×1080',
    },
    {
      value: AspectRatio.CINEMA,
      label: t('newProject.aspectRatios.cinemaLabel'),
      description: t('newProject.aspectRatios.cinemaDesc'),
      resolution: '2560×1080',
    },
  ];
  const artStyleOptions = [
    {
      value: 'realistic',
      label: t('newProject.artStyles.realisticLabel'),
      prompt: '真实写实风格',
      description: t('newProject.artStyles.realisticDesc'),
      color: 'from-gray-400 to-gray-600',
    },
    {
      value: 'cyberpunk',
      label: t('newProject.artStyles.cyberpunkLabel'),
      prompt: '赛博朋克风格',
      description: t('newProject.artStyles.cyberpunkDesc'),
      color: 'from-purple-500 to-blue-500',
    },
    {
      value: 'anime',
      label: t('newProject.artStyles.animeLabel'),
      prompt: '日本2D动漫风格',
      description: t('newProject.artStyles.animeDesc'),
      color: 'from-pink-400 to-rose-400',
    },
    {
      value: 'chinese_ink',
      label: t('newProject.artStyles.inkLabel'),
      prompt: '中国水墨画风格',
      description: t('newProject.artStyles.inkDesc'),
      color: 'from-slate-400 to-slate-600',
    },
    {
      value: '3d_cartoon',
      label: t('newProject.artStyles.cartoonLabel'),
      prompt: '3D皮克斯卡通风格',
      description: t('newProject.artStyles.cartoonDesc'),
      color: 'from-orange-400 to-red-400',
    },
    {
      value: 'custom',
      label: t('newProject.artStyles.customLabel'),
      prompt: '',
      description: t('newProject.artStyles.customDesc'),
      color: 'from-gray-300 to-gray-400',
    },
  ];
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [artStyle, setArtStyle] = useState(initialArtStyle);
  const [selectedArtStyleType, setSelectedArtStyleType] = useState<string>('custom');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(
    // Ensure the aspect ratio from AI matches one of our enums, otherwise fallback to MOBILE
    Object.values(AspectRatio).includes(initialAspectRatio as AspectRatio)
      ? initialAspectRatio
      : AspectRatio.MOBILE
  );
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 处理画风选择
  const handleArtStyleSelect = (option: typeof artStyleOptions[0]) => {
    setSelectedArtStyleType(option.value);
    if (option.value !== 'custom') {
      setArtStyle(option.prompt);
    }
  };

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
      alert(t('newProject.titleRequired'));
      return;
    }

    setIsCreating(true);
    try {
      await onConfirm(title, description, artStyle, selectedAspectRatio);
      // 成功后由父组件关闭弹窗
    } catch (error) {
      console.error('Create project failed:', error);
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
              {isCreating ? t('newProject.creatingTitle') : t('newProject.title')}
            </h2>
            <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
              {isCreating ? t('newProject.creatingDesc') : t('newProject.subtitle')}
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
              {t('newProject.projectName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('newProject.projectNamePlaceholder')}
              disabled={isCreating}
              className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          {/* Project Description */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
              {t('newProject.summary')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('newProject.summaryPlaceholder')}
              rows={3}
              disabled={isCreating}
              className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>


          {/* Art Style Selection */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-3">
              {t('newProject.artStyle')}
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {artStyleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleArtStyleSelect(option)}
                  disabled={isCreating}
                  className={`p-3 rounded-xl border transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed group ${selectedArtStyleType === option.value
                    ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent'
                    : 'glass-card border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'
                    }`}
                >
                  <div className="flex flex-col items-center text-center gap-1">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${option.color} opacity-80`} />
                    <span className={`text-sm font-medium ${selectedArtStyleType === option.value
                      ? 'text-light-accent dark:text-cine-accent'
                      : 'text-light-text dark:text-white'
                      }`}>
                      {option.label}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-cine-text-muted">
                      {option.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* 自定义画风输入（仅在选择"自定义"时显示，或允许用户编辑预设） */}
            <div className="mt-3">
              <label className="block text-xs text-light-text-muted dark:text-cine-text-muted mb-1">
                {t('newProject.artStylePrompt')} {selectedArtStyleType !== 'custom' && `(${t('newProject.editable')})`}
              </label>
              <textarea
                value={artStyle}
                onChange={(e) => {
                  setArtStyle(e.target.value);
                  if (selectedArtStyleType !== 'custom') {
                    setSelectedArtStyleType('custom');
                  }
                }}
                placeholder={t('newProject.artStylePromptPlaceholder')}
                rows={2}
                disabled={isCreating}
                className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none text-sm"
              />
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                {t('newProject.artStyleHint')}
              </p>
            </div>
          </div>

          {/* Aspect Ratio Selection */}
          <div>
            <label className="block text-sm font-bold text-light-text dark:text-white mb-3">
              {t('newProject.aspectRatio')} <span className="text-red-500">*</span>
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
                            {t('newProject.recommended')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-light-text-muted dark:text-cine-text-muted mb-1 group-hover:text-light-text dark:group-hover:text-gray-300 transition-colors">
                        {option.description}
                      </p>
                      <p className="text-xs text-light-text-muted dark:text-cine-text-muted opacity-70">
                        {t('newProject.resolution', { value: option.resolution })}
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
              {t('newProject.aspectRatioHint')}
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
            {t('common.cancel')}
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
                <span>{t('newProject.creatingButton')}</span>
              </>
            ) : (
              <>{t('newProject.createButton')} →</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
