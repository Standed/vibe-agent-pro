import React from 'react';
import { Upload, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface CharacterImageManagerProps {
    referenceImages: string[];
    selectedRefIndex: number;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveImage: (index: number) => void;
    onSelectImage: (index: number) => void;
    onPreviewImage: (url: string) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function CharacterImageManager({
    referenceImages,
    selectedRefIndex,
    onImageUpload,
    onRemoveImage,
    onSelectImage,
    onPreviewImage,
    fileInputRef
}: CharacterImageManagerProps) {
    return (
        <>
            {/* Upload Button */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onImageUpload}
                className="hidden"
            />
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full group relative overflow-hidden rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50/50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all duration-300 p-8 flex flex-col items-center justify-center gap-3"
            >
                <div className="w-12 h-12 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">点击上传参考图</p>
                    <p className="text-xs text-zinc-400 mt-1">支持 JPG, PNG (Max 10MB)</p>
                </div>
            </button>

            {/* Image Preview Grid */}
            {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                    {referenceImages.map((imageUrl, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={cn(
                                "group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-300",
                                selectedRefIndex === index
                                    ? "ring-2 ring-zinc-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-[#181818]"
                                    : "hover:ring-2 hover:ring-zinc-200 dark:hover:ring-zinc-700"
                            )}
                            onClick={() => {
                                onPreviewImage(imageUrl);
                            }}
                        >
                            <img
                                src={imageUrl}
                                alt={`参考图 ${index + 1}`}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                            {selectedRefIndex !== index && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectImage(index);
                                    }}
                                    className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-green-500 transition-all duration-200 scale-90 group-hover:scale-100 z-10"
                                    title="设为主图"
                                >
                                    <Check className="w-3 h-3" />
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveImage(index);
                                }}
                                className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all duration-200 scale-90 group-hover:scale-100"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>

                            {selectedRefIndex === index && (
                                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-zinc-900/90 dark:bg-white/90 backdrop-blur-sm text-[10px] font-bold text-white dark:text-black shadow-sm">
                                    主图
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}
        </>
    );
}
