'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Upload } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { storageService } from '@/lib/storageService';
import { useAuth } from '@/components/auth/AuthProvider';

interface JimengImageSelectorProps {
    images: string[]; // 即梦返回的所有图片 URL
    prompt: string;
    shotId?: string;
    sceneId?: string;
    aspectRatio?: string;
    onSelect: (r2Url: string, originalUrl: string) => void;
    onClose: () => void;
}

export function JimengImageSelector({
    images,
    prompt,
    shotId,
    sceneId,
    aspectRatio,
    onSelect,
    onClose,
}: JimengImageSelectorProps) {
    const { user } = useAuth();
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleConfirm = async () => {
        if (selectedIndex === null) {
            toast.error('请先选择一张图片');
            return;
        }

        if (!user) {
            toast.error('请先登录');
            return;
        }

        const selectedUrl = images[selectedIndex];
        setIsUploading(true);

        try {
            // 下载图片并转换为 base64
            const response = await fetch('/api/image-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: selectedUrl }),
            });

            if (!response.ok) {
                throw new Error('图片下载失败');
            }

            const { data: base64Data, mimeType } = await response.json();

            // 上传到 R2
            const timestamp = Date.now();
            const filename = `jimeng_${timestamp}_${selectedIndex}.webp`;
            const folder = shotId ? `shots/${shotId}` : sceneId ? `scenes/${sceneId}` : 'jimeng';

            const r2Url = await storageService.uploadBase64ToR2(
                `data:${mimeType};base64,${base64Data}`,
                folder,
                filename,
                user.id
            );

            toast.success('图片已保存！');
            onSelect(r2Url, selectedUrl);
        } catch (error: any) {
            console.error('[JimengImageSelector] Upload failed:', error);
            toast.error('图片上传失败，使用原始链接', {
                description: error.message,
            });
            // 回退到原始 URL
            onSelect(selectedUrl, selectedUrl);
        } finally {
            setIsUploading(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            选择即梦生成的图片
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            即梦 4.0 已生成 {images.length} 张图片，请选择一张保存
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Prompt preview */}
                <div className="px-6 py-2 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        <span className="font-medium">提示词：</span>
                        {prompt.slice(0, 150)}...
                    </p>
                </div>

                {/* Image Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-4">
                        {images.map((url, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedIndex(index)}
                                disabled={isUploading}
                                className={`relative aspect-video rounded-xl overflow-hidden border-4 transition-all duration-200 ${selectedIndex === index
                                        ? 'border-purple-500 ring-4 ring-purple-500/30 scale-[1.02]'
                                        : 'border-transparent hover:border-purple-300 dark:hover:border-purple-700'
                                    } ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                <Image
                                    src={url}
                                    alt={`即梦生成图片 ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />

                                {/* Selection indicator */}
                                {selectedIndex === index && (
                                    <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                        <div className="bg-purple-500 text-white rounded-full p-2">
                                            <Check size={24} />
                                        </div>
                                    </div>
                                )}

                                {/* Index badge */}
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                                    {index + 1}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIndex === null || isUploading}
                        className="flex items-center gap-2 px-6 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                上传中...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                确认选择并保存
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
