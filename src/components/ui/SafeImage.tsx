'use client';

import React, { useState, useEffect } from 'react';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fallbackSrc?: string;
    onRegenerate?: () => void;
    showRegenerateButton?: boolean;
}

export function SafeImage({
    src,
    alt,
    className,
    fallbackSrc,
    onRegenerate,
    showRegenerateButton,
    ...props
}: SafeImageProps) {
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [imgSrc, setImgSrc] = useState<string | undefined>(src as string);

    useEffect(() => {
        setImgSrc(src as string);
        setError(false);
        setLoading(true);
    }, [src]);

    const handleError = () => {
        setLoading(false);
        setError(true);
        if (fallbackSrc) {
            setImgSrc(fallbackSrc);
        }
    };

    const handleLoad = () => {
        setLoading(false);
    };

    // 尝试修复协议缺失的常见问题
    const effectiveSrc = imgSrc?.startsWith('//') ? `https:${imgSrc}` : imgSrc;
    // 检查是否是 R2 域名但缺少 HTTPS
    const finalSrc = (effectiveSrc && !effectiveSrc.startsWith('http') && !effectiveSrc.startsWith('data:'))
        ? `https://${effectiveSrc}`
        : effectiveSrc;

    if (error && !fallbackSrc) {
        return (
            <div className={cn("flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400 p-4 rounded-lg", className)}>
                <ImageOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs text-center">图片无法加载</span>
                {showRegenerateButton && onRegenerate && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                        className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:underline hover:text-blue-400 transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        点击重试
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={cn("relative overflow-hidden", className)}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-800/50 z-10 backdrop-blur-sm">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
            )}
            <img
                src={finalSrc}
                alt={alt}
                className={cn("w-full h-full object-cover transition-opacity duration-300", loading ? "opacity-0" : "opacity-100")}
                onError={handleError}
                onLoad={handleLoad}
                {...props}
            />
        </div>
    );
}
