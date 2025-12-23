'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';

interface NewSeriesDialogProps {
    onConfirm: (title: string, description: string) => Promise<void>;
    onClose: () => void;
}

export default function NewSeriesDialog({
    onConfirm,
    onClose,
}: NewSeriesDialogProps) {
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
            alert('请输入剧集名称');
            return;
        }

        setIsCreating(true);
        try {
            await onConfirm(title, description);
        } catch (error) {
            console.error('创建剧集失败:', error);
            setIsCreating(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="glass-panel rounded-3xl max-w-lg w-full shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="sticky top-0 glass-panel border-b border-black/5 dark:border-white/5 p-6 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-xl font-bold text-light-text dark:text-white">
                            {isCreating ? '正在创建剧集...' : '📂 创建新剧集'}
                        </h2>
                        <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
                            剧集用于管理一系列相关的分集项目
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
                            剧集名称 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="例如：《赛博朋克侦探故事》"
                            disabled={isCreating}
                            className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-bold text-light-text dark:text-white mb-2">
                            简介
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="简要描述剧集的世界观和背景..."
                            rows={3}
                            disabled={isCreating}
                            className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </form>

                {/* Footer Actions */}
                <div className="glass-panel border-t border-black/5 dark:border-white/5 p-6 flex justify-end gap-3">
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
                            <>创建剧集</>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
