import React from 'react';
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
    const [isModelOpen, setIsModelOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsModelOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

    return (
        <div className="flex flex-wrap gap-3" ref={containerRef}>
            {/* Model Selector */}
            <div className="relative">
                <button
                    onClick={() => setIsModelOpen(!isModelOpen)}
                    className="seko-button flex items-center gap-3 px-4 py-2 text-zinc-700 dark:text-zinc-200 group"
                >
                    <div className="w-5 h-5 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center text-[10px] text-white dark:text-black font-bold shadow-sm group-hover:shadow-black/10 dark:group-hover:shadow-white/10 transition-shadow">
                        J
                    </div>
                    <div className="flex flex-col items-start text-xs">
                        <span className="font-semibold leading-none mb-0.5">{selectedModel.name}</span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-none">即梦 AI</span>
                    </div>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-400 transition-transform duration-300", isModelOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                    {isModelOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: 8, scale: 0.95, filter: 'blur(8px)' }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="absolute bottom-full left-0 mb-2 w-72 p-2 seko-popover z-50 flex flex-col gap-1"
                        >
                            <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                选择模型
                            </div>
                            {MODELS.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => {
                                        onModelChange(m.id);
                                        setIsModelOpen(false);
                                    }}
                                    className={cn(
                                        "relative flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 group",
                                        model === m.id
                                            ? "bg-zinc-100 dark:bg-white/10"
                                            : "hover:bg-black/5 dark:hover:bg-white/5"
                                    )}
                                >
                                    <div className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all duration-300",
                                        model === m.id
                                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black shadow-lg shadow-black/20 dark:shadow-white/20 scale-105"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:scale-105"
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
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-zinc-900 dark:bg-white text-white dark:text-black shadow-sm">
                                                    {m.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-1 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
                                            {m.desc}
                                        </p>
                                    </div>
                                    {model === m.id && (
                                        <motion.div
                                            layoutId="check"
                                            className="absolute right-3 top-3"
                                        >
                                            <Check className="w-4 h-4 text-zinc-900 dark:text-white" />
                                        </motion.div>
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Resolution Selector */}
            <div className="flex items-center p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 backdrop-blur-sm">
                {RESOLUTIONS.map((res) => (
                    <button
                        key={res.id}
                        onClick={() => onResolutionChange(res.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300",
                            resolution === res.id
                                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm scale-105"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
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
