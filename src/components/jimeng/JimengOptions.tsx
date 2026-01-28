import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Sparkles, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export type JimengModel = 'jimeng-4.5' | 'jimeng-4.1' | 'jimeng-4.0';
export type JimengResolution = '2k' | '4k';

interface JimengOptionsProps {
    model: JimengModel;
    resolution: JimengResolution;
    onModelChange: (model: JimengModel) => void;
    onResolutionChange: (resolution: JimengResolution) => void;
}

const MODELS: { id: JimengModel; name: string; desc: string; badge?: string }[] = [
    {
        id: 'jimeng-4.5',
        name: '图片 4.5',
        desc: '强化一致性、风格与图文响应',
        badge: 'New'
    },
    {
        id: 'jimeng-4.1',
        name: '图片 4.1',
        desc: '更专业的创意、美学和一致性保持',
        badge: 'New'
    },
    {
        id: 'jimeng-4.0',
        name: '图片 4.0',
        desc: '支持多参考图、系列组图生成'
    }
];

const RESOLUTIONS: { id: JimengResolution; name: string; icon: React.ReactNode }[] = [
    { id: '2k', name: '2K 高清', icon: <ImageIcon className="w-3 h-3" /> },
    { id: '4k', name: '4K 超清', icon: <Sparkles className="w-3 h-3" /> },
];

export function JimengOptions({
    model,
    resolution,
    onModelChange,
    onResolutionChange
}: JimengOptionsProps) {
    const [isModelOpen, setIsModelOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        const updatePosition = () => {
            if (isModelOpen && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setPopupStyle({
                    position: 'fixed',
                    // Display above if close to bottom, otherwise below. 
                    // But simpler: just display below usually, or use fixed arithmetic.
                    // Given the screenshot, the input is at bottom right. So "Top" is safer (dropdown going UP).
                    // Example screenshot shows dropdown might go UP if space limited, but "bottom-full" was original.
                    // Let's position it above the button.
                    left: rect.left,
                    bottom: window.innerHeight - rect.top + 8, // 8px gap
                    width: '300px',
                    zIndex: 9999,
                });
            }
        };

        if (isModelOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }

        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isModelOpen]);

    // Click outside to close (global)
    useEffect(() => {
        if (!isModelOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
            // Also check if clicking inside the portal (complicated). 
            // Actually, we can just put a backdrop or check target.
            // Since portal is in body, we can just check if target closest .jimeng-popover
            const target = e.target as Element;
            if (target.closest('.jimeng-popover')) return;
            setIsModelOpen(false);
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [isModelOpen]);

    const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

    return (
        <div className="flex flex-wrap gap-3">
            {/* Model Selector */}
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={() => setIsModelOpen(!isModelOpen)}
                    className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-800/80 border border-black/5 dark:border-white/5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group text-left min-w-[180px]"
                >
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center text-xs text-white dark:text-black font-bold shadow-lg shadow-black/10 dark:shadow-white/10 group-hover:scale-105 transition-transform">
                        J
                    </div>
                    <div className="flex flex-col flex-1">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">{selectedModel.name}</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">即梦 AI 模型</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform duration-300", isModelOpen && "rotate-180")} />
                </button>

                {isModelOpen && createPortal(
                    <div className="jimeng-popover" style={popupStyle}>
                        <AnimatePresence>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl p-2 overflow-hidden"
                            >
                                <div className="space-y-1">
                                    {MODELS.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                onModelChange(m.id);
                                                setIsModelOpen(false);
                                            }}
                                            className={cn(
                                                "w-full relative flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 group",
                                                model === m.id
                                                    ? "bg-zinc-100 dark:bg-white/10"
                                                    : "hover:bg-zinc-50 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all duration-300",
                                                model === m.id
                                                    ? "bg-zinc-900 dark:bg-white text-white dark:text-black shadow-md"
                                                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                                            )}>
                                                {m.id.split('-')[1]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-sm font-semibold transition-colors",
                                                        model === m.id ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400"
                                                    )}>
                                                        {m.name}
                                                    </span>
                                                    {m.badge && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500 text-white shadow-sm">
                                                            {m.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
                                                    {m.desc}
                                                </p>
                                            </div>
                                            {model === m.id && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <Check className="w-4 h-4 text-zinc-900 dark:text-white" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>,
                    document.body
                )}
            </div>

            {/* Resolution Selector */}
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-zinc-800/80 border border-black/5 dark:border-white/5 backdrop-blur-sm self-center">
                {RESOLUTIONS.map((res) => (
                    <button
                        key={res.id}
                        onClick={() => onResolutionChange(res.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all duration-300",
                            resolution === res.id
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-black shadow-md scale-105"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5"
                        )}
                    >
                        {res.icon}
                        {res.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
