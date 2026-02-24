'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useI18n } from '@/components/providers/I18nProvider';

interface NewSeriesDialogProps {
    onConfirm: (title: string, description: string) => Promise<void>;
    onClose: () => void;
}

export default function NewSeriesDialog({
    onConfirm,
    onClose,
}: NewSeriesDialogProps) {
    const { t } = useI18n();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            alert(t('newSeries.titleRequired'));
            return;
        }

        setIsCreating(true);
        try {
            await onConfirm(title, description);
        } catch (error) {
            console.error('Create series failed:', error);
            setIsCreating(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="premium-panel max-w-lg w-full ring-1 ring-black/5 dark:ring-white/10 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="sticky top-0 border-b border-black/5 dark:border-white/10 p-6 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-xl font-bold text-light-text dark:text-white">
                            {isCreating ? t('newSeries.creatingTitle') : t('newSeries.title')}
                        </h2>
                        <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
                            {t('newSeries.subtitle')}
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
                    {/* Series Name */}
                    <div>
                        <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
                            {t('newSeries.name')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t('newSeries.namePlaceholder')}
                            disabled={isCreating}
                            className="premium-input w-full px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
                            {t('newSeries.description')}
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('newSeries.descriptionPlaceholder')}
                            rows={3}
                            disabled={isCreating}
                            className="premium-input w-full px-4 py-3 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </form>

                {/* Footer Actions */}
                <div className="border-t border-black/5 dark:border-white/10 p-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCreating}
                        className="px-6 py-2.5 premium-button disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        onClick={handleSubmit}
                        disabled={isCreating}
                        className="px-6 py-2.5 premium-button-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>{t('newSeries.creatingButton')}</span>
                            </>
                        ) : (
                            <>{t('newSeries.createButton')}</>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
