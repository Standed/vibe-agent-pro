'use client';

import { Home, Settings, ChevronLeft, Sparkles, Wand2, History } from 'lucide-react';
import Link from 'next/link';
import { Project } from '@/types/project';

interface PlanningHeaderProps {
    project: Project;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    showHomeButton?: boolean;
    onAiAssistantClick: () => void;
    onHistoryClick: () => void;
}

export default function PlanningHeader({
    project,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    showHomeButton = true,
    onAiAssistantClick,
    onHistoryClick
}: PlanningHeaderProps) {
    return (
        <div className="h-20 px-8 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-black/20 backdrop-blur-md z-20">
            <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-black/5 overflow-hidden transition-transform group-hover:scale-105">
                        <img
                            src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                            alt="Logo"
                            className="w-7 h-7 object-contain"
                        />
                    </div>
                </Link>
                <div>
                    <div className="font-black text-zinc-900 dark:text-white tracking-tight">策划模式</div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Online & Ready</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 pr-12">
                <button
                    onClick={onAiAssistantClick}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-all"
                >
                    <Wand2 size={16} />
                    <span>AI 助手</span>
                </button>
                {/* 历史记录按钮保留，但可以触发聊天中的历史视图 */}
                <button
                    onClick={onHistoryClick}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-100 dark:bg-white/5 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
                >
                    <History size={16} />
                    <span>历史记录</span>
                </button>
            </div>
        </div>
    );
}
