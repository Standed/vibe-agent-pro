'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Settings, Coins, ChevronDown, CreditCard } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { SettingsPanel, SettingsModal } from '@/components/settings/SettingsPanel';
import { AnimatePresence, motion } from 'framer-motion';

export function UserNav() {
    const router = useRouter();
    const { user, profile, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        try {
            await signOut();
            router.push('/auth/login');
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.push('/auth/login')}
                    className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-light-accent dark:bg-cine-accent text-white hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors font-medium"
                >
                    <User size={16} />
                    登录 / 注册
                </button>
                <SettingsPanel />
            </div>
        );
    }

    return (
        <div className="relative flex items-center gap-4" ref={menuRef}>
            {/* User Menu Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-white/20 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md hover:bg-white/80 dark:hover:bg-black/70 transition-all group shadow-sm"
            >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-light-accent dark:bg-cine-accent flex items-center justify-center text-white dark:text-black font-bold text-sm overflow-hidden shadow-sm">
                    {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        (profile?.full_name?.[0] || user.email?.[0] || 'U').toUpperCase()
                    )}
                </div>

                {/* Name & Arrow */}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-light-text dark:text-white max-w-[100px] truncate">
                        {profile?.full_name || user.email?.split('@')[0] || 'User'}
                    </span>
                    <ChevronDown
                        size={14}
                        className={`text-light-text-muted dark:text-cine-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-full right-0 mt-3 w-72 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] overflow-hidden z-50 ring-1 ring-black/5"
                    >
                        {/* Header Info */}
                        <div className="p-5 border-b border-black/5 dark:border-white/5 bg-gradient-to-b from-white/50 to-transparent dark:from-white/5">
                            <p className="text-sm font-bold text-light-text dark:text-white truncate">
                                {profile?.full_name || '用户'}
                            </p>
                            <p className="text-xs text-light-text-muted dark:text-cine-text-muted truncate mt-0.5">
                                {user.email}
                            </p>
                        </div>

                        {/* Credits Section - Integrated Style */}
                        <div className="px-2 py-2">
                            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-light-bg-secondary/50 dark:bg-cine-bg-secondary/50 border border-light-border/50 dark:border-cine-border/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-yellow-500/10 rounded-full">
                                        <Coins size={14} className="text-yellow-600 dark:text-yellow-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider font-semibold">积分余额</span>
                                        <span className="text-sm font-bold text-light-text dark:text-white leading-none">{profile?.credits || 0}</span>
                                    </div>
                                </div>
                                <button className="text-xs font-medium bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white dark:text-black px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                                    充值
                                </button>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="p-2 space-y-1">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsSettingsOpen(true);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-left font-medium"
                            >
                                <User size={16} className="text-light-text-muted dark:text-cine-text-muted" />
                                <span>个人资料</span>
                            </button>

                            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-left font-medium">
                                <CreditCard size={16} className="text-light-text-muted dark:text-cine-text-muted" />
                                <span>订阅管理</span>
                            </button>

                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsSettingsOpen(true);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-left font-medium"
                            >
                                <Settings size={16} className="text-light-text-muted dark:text-cine-text-muted" />
                                <span>通用设置</span>
                            </button>

                            <div className="h-px bg-light-border dark:bg-cine-border my-1 mx-2" />

                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors text-left font-medium"
                            >
                                <LogOut size={16} />
                                <span>退出登录</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Settings Modal */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
}
