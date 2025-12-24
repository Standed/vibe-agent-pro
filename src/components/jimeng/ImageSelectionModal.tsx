import React from 'react';
import ReactDOM from 'react-dom';
import { X, Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedUrl: string) => void;
    imageUrls: string[];
    isLoading?: boolean;
}

export function ImageSelectionModal({
    isOpen,
    onClose,
    onConfirm,
    imageUrls,
    isLoading
}: ImageSelectionModalProps) {
    const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

    if (!isOpen) return null;

    return typeof document !== 'undefined' ? (
        ReactDOM.createPortal(
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(10px)' }}
                            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                            className="relative w-full max-w-4xl seko-panel overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-8 py-6 border-b border-black/5 dark:border-white/5">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10">
                                            <Sparkles className="w-3.5 h-3.5 text-white dark:text-black" />
                                        </div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">选择生成结果</h2>
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">即梦 AI 已为您生成 {imageUrls.length} 张创意方案</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-300 hover:rotate-90"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Image Grid */}
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {imageUrls.map((url, index) => (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                            onClick={() => setSelectedIndex(index)}
                                            className={cn(
                                                "group relative aspect-video rounded-2xl overflow-hidden cursor-pointer transition-all duration-300",
                                                selectedIndex === index
                                                    ? "ring-4 ring-zinc-900 dark:ring-white ring-offset-4 ring-offset-white dark:ring-offset-[#181818] shadow-2xl shadow-black/20 dark:shadow-white/10 scale-[1.02]"
                                                    : "hover:shadow-xl hover:shadow-black/10 hover:scale-[1.01]"
                                            )}
                                        >
                                            <img
                                                src={url}
                                                alt={`Generated ${index + 1}`}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                            {/* Index Badge */}
                                            <div className="absolute top-4 left-4 w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-sm font-bold text-white border border-white/20 shadow-lg">
                                                {index + 1}
                                            </div>

                                            {/* Selected Overlay */}
                                            {selectedIndex === index && (
                                                <div className="absolute inset-0 bg-black/20 dark:bg-white/10 backdrop-blur-[2px] flex items-center justify-center">
                                                    <motion.div
                                                        initial={{ scale: 0, rotate: -45 }}
                                                        animate={{ scale: 1, rotate: 0 }}
                                                        className="w-16 h-16 rounded-2xl bg-zinc-900 dark:bg-white flex items-center justify-center shadow-2xl shadow-black/40 dark:shadow-white/20"
                                                    >
                                                        <Check className="w-8 h-8 text-white dark:text-black stroke-[3]" />
                                                    </motion.div>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-8 py-6 border-t border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20 backdrop-blur-xl flex justify-end gap-4">
                                <button
                                    onClick={onClose}
                                    className="seko-button px-6 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => selectedIndex !== null && onConfirm(imageUrls[selectedIndex])}
                                    disabled={selectedIndex === null || isLoading}
                                    className={cn(
                                        "seko-button seko-button-primary px-8 py-2.5 flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                                        isLoading && "cursor-wait"
                                    )}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>处理中...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4 stroke-[3]" />
                                            <span>确认选择</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )
    ) : null;
}
