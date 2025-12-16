'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Settings, Coins, ChevronDown, CreditCard } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { AnimatePresence, motion } from 'framer-motion';

export function UserNav() {
    const router = useRouter();
    const { user, profile, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
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
            {/* Settings Button (Independent) */}
            <SettingsPanel />

            {/* User Menu Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-light-border dark:border-cine-border bg-light-panel dark:bg-cine-panel hover:border-light-accent dark:hover:border-cine-accent transition-all group"
            >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden shadow-sm">
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
                        className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl shadow-xl overflow-hidden z-50"
                    >
                        {/* Header Info */}
                        <div className="p-4 border-b border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-black/20">
                            <p className="text-sm font-bold text-light-text dark:text-white truncate">
                                {profile?.full_name || '用户'}
                            </p>
                            <p className="text-xs text-light-text-muted dark:text-cine-text-muted truncate mt-0.5">
                                {user.email}
                            </p>
                        </div>

                        {/* Credits Section */}
                        <div className="p-3">
                            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-purple-500/20 rounded-full">
                                        <Coins size={16} className="text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-light-text-muted dark:text-cine-text-muted">积分余额</p>
                                        <p className="text-sm font-bold text-purple-600 dark:text-purple-400">
                                            {profile?.credits || 0}
                                        </p>
                                    </div>
                                </div>
                                <button className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1.5 rounded transition-colors">
                                    充值
                                </button>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="p-2 space-y-1">
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-light-text dark:text-white hover:bg-light-bg dark:hover:bg-cine-black/40 rounded-lg transition-colors text-left">
                                <User size={16} className="text-light-text-muted dark:text-cine-text-muted" />
                                <span>个人资料</span>
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-light-text dark:text-white hover:bg-light-bg dark:hover:bg-cine-black/40 rounded-lg transition-colors text-left">
                                <CreditCard size={16} className="text-light-text-muted dark:text-cine-text-muted" />
                                <span>订阅管理</span>
                            </button>
                            <div className="h-px bg-light-border dark:bg-cine-border my-1" />
                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors text-left"
                            >
                                <LogOut size={16} />
                                <span>退出登录</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
