'use client';

import { useState, useRef, useEffect } from 'react';
import { Coins, Plus, User, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { AnimatePresence, motion } from 'framer-motion';

export function CanvasUserWidget() {
    const { user, profile, refreshProfile } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);
    const widgetRef = useRef<HTMLDivElement>(null);

    // Refresh profile on mount to ensure credits are up to date
    useEffect(() => {
        refreshProfile();
    }, []);

    // Close widget when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    return (
        <motion.div
            ref={widgetRef}
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
            className="absolute bottom-6 left-6 z-50 flex flex-col items-start gap-2 cursor-grab"
            style={{ touchAction: 'none' }}
        >
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="mb-3 p-5 rounded-[2rem] glass-card w-72 overflow-hidden ring-1 ring-black/5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">账户信息</h3>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-light-accent dark:bg-cine-accent flex items-center justify-center text-white dark:text-black font-bold text-sm shadow-inner">
                                {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (profile?.full_name?.[0] || user.email?.[0] || 'U').toUpperCase()
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[140px]">
                                    {profile?.full_name || 'User'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-white/60 truncate max-w-[140px]">
                                    {user.email}
                                </p>
                            </div>
                        </div>

                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 border border-black/5 dark:border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-500 dark:text-white/70">当前积分</span>
                                <Coins size={14} className="text-yellow-500 dark:text-yellow-400" />
                            </div>
                            <div className="flex items-end justify-between">
                                <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                                    {profile?.credits || 0}
                                </span>
                                <button className="text-xs bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white dark:text-black px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
                                    <Plus size={12} />
                                    充值
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Trigger Button (Floating Orb/Capsule) */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className={`
          flex items-center gap-2 px-1.5 py-1.5 rounded-full 
          glass-button
          shadow-[0_8px_30px_rgba(0,0,0,0.12)] 
          hover:scale-105
          transition-all duration-300 group
          ${isExpanded ? 'bg-white/90 dark:bg-black/70 ring-2 ring-light-accent/20 dark:ring-cine-accent/20' : ''}
        `}
            >
                <div className="w-8 h-8 rounded-full bg-light-accent dark:bg-cine-accent flex items-center justify-center text-white dark:text-black font-bold text-xs shadow-sm group-hover:shadow-md transition-shadow">
                    {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        (profile?.full_name?.[0] || user.email?.[0] || 'U').toUpperCase()
                    )}
                </div>

                {!isExpanded && (
                    <div className="flex flex-col items-start mr-2">
                        <span className="text-[10px] font-bold text-gray-900 dark:text-white/90 leading-tight">
                            {profile?.credits || 0}
                        </span>
                        <span className="text-[8px] text-gray-500 dark:text-white/60 leading-tight">积分</span>
                    </div>
                )}
            </motion.button>
        </motion.div>
    );
}
