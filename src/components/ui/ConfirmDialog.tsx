'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    description,
    confirmText = '确定',
    cancelText = '取消',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Handle ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onCancel]);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 scale-100">

                {/* Header */}
                <div className="p-6 pb-2 flex items-start gap-4">
                    <div className={cn(
                        "p-3 rounded-full flex-shrink-0",
                        variant === 'destructive'
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    )}>
                        <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-6">
                            {title}
                        </h3>
                        {description && (
                            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 pt-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={cn(
                            "px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all hover:opacity-90 active:scale-95",
                            variant === 'destructive'
                                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                                : "bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20"
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
