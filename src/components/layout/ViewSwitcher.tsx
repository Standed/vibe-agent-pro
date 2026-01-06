'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Layout,
    Scissors,
    FileText,
    ChevronDown,
    Sparkles,
    Check,
    Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewType = 'canvas' | 'planning' | 'timeline' | 'drafts';

interface ViewSwitcherProps {
    activeView: ViewType;
    onViewChange: (view: ViewType) => void;
    className?: string;
}

export default function ViewSwitcher({ activeView, onViewChange, className }: ViewSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const views = [
        { id: 'canvas', label: '画布视图', icon: Layout, color: 'text-blue-500' },
        { id: 'planning', label: '策划模式', icon: FileText, color: 'text-purple-500' },
        { id: 'timeline', label: '时间轴', icon: Scissors, color: 'text-emerald-500' },
        { id: 'drafts', label: '草稿库', icon: Plus, color: 'text-zinc-400', disabled: true },
    ] as const;

    const currentView = views.find(v => v.id === activeView) || views[0];

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={cn("fixed top-6 left-6 z-[110] pointer-events-auto", className)} ref={containerRef}>
            <div className="relative">
                {/* Main Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "flex items-center gap-3 px-4 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-black/5 dark:border-white/10 shadow-2xl transition-all duration-300 group",
                        isOpen ? "ring-2 ring-zinc-900/10 dark:ring-white/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    )}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-colors bg-zinc-900 dark:bg-white"
                    )}>
                        <currentView.icon size={16} className="text-white dark:text-zinc-900" />
                    </div>

                    <div className="flex flex-col items-start">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">视图模式</span>
                        <span className="text-sm font-black text-zinc-900 dark:text-white leading-none">{currentView.label}</span>
                    </div>

                    <ChevronDown
                        size={14}
                        className={cn(
                            "text-zinc-400 transition-transform duration-300 ml-1",
                            isOpen ? "rotate-180" : ""
                        )}
                    />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            className="absolute top-full left-0 mt-2 w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-black/5 dark:border-white/10 shadow-2xl overflow-hidden p-1.5"
                        >
                            <div className="space-y-1">
                                {views.map((view) => (
                                    <button
                                        key={view.id}
                                        disabled={view.disabled}
                                        onClick={() => {
                                            if (!view.disabled) {
                                                onViewChange(view.id as ViewType);
                                                setIsOpen(false);
                                            }
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group",
                                            activeView === view.id
                                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-black/10 dark:shadow-white/10"
                                                : view.disabled
                                                    ? "opacity-30 cursor-not-allowed"
                                                    : "hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <view.icon size={16} className={cn(
                                                activeView === view.id ? "text-inherit" : "text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                                            )} />
                                            <div className="flex flex-col items-start">
                                                <span className="text-xs font-bold">{view.label}</span>
                                                {view.disabled && <span className="text-[7px] font-black uppercase tracking-tighter opacity-60">Coming Soon</span>}
                                            </div>
                                        </div>
                                        {activeView === view.id && <Check size={12} className="text-inherit" />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
