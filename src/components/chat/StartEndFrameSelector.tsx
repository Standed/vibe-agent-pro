import React, { useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { FrameImage } from '@/hooks/chat/useStartEndFrames';

interface StartEndFrameSelectorProps {
    startFrame: FrameImage | null;
    endFrame: FrameImage | null;
    onStartFrameChange: (frame: FrameImage | null) => void;
    onEndFrameChange: (frame: FrameImage | null) => void;
    onPreview?: (url: string) => void; // 点击预览
    defaultStartFrameUrl?: string; // 默认首帧 URL（分镜图）
    className?: string;
}

/**
 * 通用首尾帧选择器组件
 * 用于 Vidu、Runway 等支持首尾帧的视频平台
 */
export function StartEndFrameSelector({
    startFrame,
    endFrame,
    onStartFrameChange,
    onEndFrameChange,
    onPreview,
    defaultStartFrameUrl,
    className = '',
}: StartEndFrameSelectorProps) {
    const startFrameInputRef = useRef<HTMLInputElement>(null);
    const endFrameInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (position: 'start' | 'end', file: File) => {
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB

        if (!file.type.startsWith('image/')) {
            toast.error('请上传图片文件');
            return;
        }

        if (file.size > MAX_SIZE) {
            toast.error('图片大小不能超过 10MB');
            return;
        }

        const frameData: FrameImage = {
            url: URL.createObjectURL(file),
            source: 'manual_upload',
            label: file.name,
            file: file,
        };

        if (position === 'start') {
            onStartFrameChange(frameData);
        } else {
            onEndFrameChange(frameData);
        }
    };

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            {/* 首帧 */}
            <div className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">
                    首帧 (开始)
                </span>
                <div className="relative group flex-shrink-0">
                    {startFrame ? (
                        // 有图片：显示图片 + 右上角删除按钮
                        <>
                            <img
                                src={startFrame.url}
                                alt="首帧"
                                className="w-16 h-16 object-cover rounded-lg border border-green-500/50 cursor-pointer"
                                onClick={() => onPreview?.(startFrame.url)}
                                title="点击预览"
                            />
                            {/* 移除分镜标签，保持界面简洁 */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartFrameChange(null);
                                }}
                                className="absolute -top-1 -right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="移除首帧"
                            >
                                <X size={12} />
                            </button>
                        </>
                    ) : defaultStartFrameUrl ? (
                        // 有默认分镜图：显示预览和使用按钮
                        <div className="relative">
                            <img
                                src={defaultStartFrameUrl}
                                alt="分镜图（点击使用）"
                                className="w-16 h-16 object-cover rounded-lg border-2 border-dashed border-blue-400/50 opacity-60 cursor-pointer hover:opacity-100 hover:border-blue-500 transition-all"
                                onClick={() => {
                                    onStartFrameChange({
                                        url: defaultStartFrameUrl,
                                        source: 'shot_ref',
                                        label: '分镜图',
                                    });
                                }}
                                title="点击使用分镜图作为首帧"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-[8px] text-blue-500 font-medium bg-white/80 dark:bg-black/60 px-1 rounded">
                                    使用
                                </span>
                            </div>
                        </div>
                    ) : (
                        // 空状态：显示上传区域
                        <div
                            className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 overflow-hidden cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors flex items-center justify-center"
                            onClick={() => startFrameInputRef.current?.click()}
                        >
                            <div className="flex flex-col items-center text-zinc-400 dark:text-zinc-500">
                                <Upload size={16} />
                                <span className="text-[8px] mt-0.5">上传</span>
                            </div>
                        </div>
                    )}
                    <input
                        ref={startFrameInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('start', file);
                            e.target.value = '';
                        }}
                    />
                </div>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">
                    {startFrame ? '已设置' : '必填'}
                </span>
            </div>

            {/* 箭头 */}
            <div className="text-zinc-400 dark:text-zinc-500 text-lg mb-6">→</div>

            {/* 尾帧 */}
            <div className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">
                    尾帧 (结束)
                </span>
                <div className="relative group flex-shrink-0">
                    {endFrame ? (
                        // 有图片：显示图片 + 右上角删除按钮
                        <>
                            <img
                                src={endFrame.url}
                                alt="尾帧"
                                className="w-16 h-16 object-cover rounded-lg border border-green-500/50 cursor-pointer"
                                onClick={() => onPreview?.(endFrame.url)}
                                title="点击预览"
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEndFrameChange(null);
                                }}
                                className="absolute -top-1 -right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="移除尾帧"
                            >
                                <X size={12} />
                            </button>
                        </>
                    ) : (
                        // 空状态：显示上传区域
                        <div
                            className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 overflow-hidden cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors flex items-center justify-center"
                            onClick={() => endFrameInputRef.current?.click()}
                        >
                            <div className="flex flex-col items-center text-zinc-400 dark:text-zinc-500">
                                <Upload size={16} />
                                <span className="text-[8px] mt-0.5">上传</span>
                            </div>
                        </div>
                    )}
                    <input
                        ref={endFrameInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('end', file);
                            e.target.value = '';
                        }}
                    />
                </div>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">
                    {endFrame ? '已设置' : '必填'}
                </span>
            </div>
        </div>
    );
}
