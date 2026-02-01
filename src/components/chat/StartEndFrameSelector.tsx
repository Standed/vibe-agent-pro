import React, { useRef } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import { X, Upload, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { FrameImage } from '@/hooks/chat/useStartEndFrames';
import { SHOT_TO_CHAT } from './dragTypes';

interface StartEndFrameSelectorProps {
    startFrame: FrameImage | null;
    endFrame: FrameImage | null;
    onStartFrameChange: (frame: FrameImage | null) => void;
    onEndFrameChange: (frame: FrameImage | null) => void;
    onSwapFrames?: () => void;
    onPreview?: (url: string) => void;
    defaultStartFrameUrl?: string;
    className?: string;
}

/**
 * 通用首尾帧选择器组件
 * 用于 Vidu、Runway 等支持首尾帧的视频平台
 * 支持拖拽图片到对应槽位
 */
export function StartEndFrameSelector({
    startFrame,
    endFrame,
    onStartFrameChange,
    onEndFrameChange,
    onSwapFrames,
    onPreview,
    defaultStartFrameUrl,
    className = '',
}: StartEndFrameSelectorProps) {
    const startFrameInputRef = useRef<HTMLInputElement>(null);
    const endFrameInputRef = useRef<HTMLInputElement>(null);

    const handleSwap = () => {
        if (onSwapFrames) {
            onSwapFrames();
        } else {
            // 默认交换逻辑
            const tempStart = startFrame;
            onStartFrameChange(endFrame);
            onEndFrameChange(tempStart);
        }
        toast.success('已切换首尾帧');
    };

    const canSwap = startFrame || endFrame;

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {/* 首帧 */}
            <FrameDropZone
                position="start"
                frame={startFrame}
                onFrameChange={onStartFrameChange}
                onPreview={onPreview}
                defaultUrl={defaultStartFrameUrl}
                inputRef={startFrameInputRef}
            />

            {/* 切换按钮 */}
            <div className="flex flex-col items-center gap-1 mb-6">
                <button
                    onClick={handleSwap}
                    disabled={!canSwap}
                    className={`p-1.5 rounded-full transition-all ${canSwap
                        ? 'bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-zinc-500 hover:text-indigo-500 cursor-pointer'
                        : 'bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                        }`}
                    title="切换首尾帧"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 16l-4-4 4-4" />
                        <path d="M17 8l4 4-4 4" />
                        <path d="M3 12h18" />
                    </svg>
                </button>
            </div>

            {/* 尾帧 */}
            <FrameDropZone
                position="end"
                frame={endFrame}
                onFrameChange={onEndFrameChange}
                onPreview={onPreview}
                inputRef={endFrameInputRef}
            />
        </div>
    );
}

interface FrameDropZoneProps {
    position: 'start' | 'end';
    frame: FrameImage | null;
    onFrameChange: (frame: FrameImage | null) => void;
    onPreview?: (url: string) => void;
    defaultUrl?: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * 单个帧的拖拽区域组件
 */
function FrameDropZone({
    position,
    frame,
    onFrameChange,
    onPreview,
    defaultUrl,
    inputRef,
}: FrameDropZoneProps) {
    const handleFileDrop = (file: File) => {
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
        onFrameChange(frameData);
    };

    const [{ isOver, canDrop }, drop] = useDrop({
        accept: [SHOT_TO_CHAT, NativeTypes.FILE],
        drop: (item: any, monitor) => {
            const itemType = monitor.getItemType();

            if (itemType === SHOT_TO_CHAT) {
                // 从画布拖拽的图片
                if (item.imageUrl) {
                    onFrameChange({
                        url: item.imageUrl,
                        source: 'shot_ref',
                        label: '分镜参考图',
                    });
                    toast.success(`已设置为${position === 'start' ? '首帧' : '尾帧'}`);
                }
            } else if (itemType === NativeTypes.FILE) {
                // 从电脑拖拽的文件
                const files = item.files;
                if (files && files.length > 0) {
                    handleFileDrop(files[0]);
                    toast.success(`已设置为${position === 'start' ? '首帧' : '尾帧'}`);
                }
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    });

    const isActive = isOver && canDrop;
    const positionLabel = position === 'start' ? '首帧 (开始)' : '尾帧 (结束)';
    const statusLabel = frame ? '已设置' : '必填';

    return (
        <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">
                {positionLabel}
            </span>
            <div
                ref={drop as any}
                className={`relative group flex-shrink-0 transition-all duration-200 ${isActive ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-black scale-105' : ''
                    }`}
            >
                {frame ? (
                    // 有图片：显示图片 + 右上角删除按钮
                    <>
                        <img
                            src={frame.url}
                            alt={positionLabel}
                            className={`w-16 h-16 object-cover rounded-lg border cursor-pointer ${position === 'start' ? 'border-green-500/50' : 'border-blue-500/50'
                                }`}
                            onClick={() => onPreview?.(frame.url)}
                            title="点击预览"
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onFrameChange(null);
                            }}
                            className="absolute -top-1 -right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title={`移除${position === 'start' ? '首帧' : '尾帧'}`}
                        >
                            <X size={12} />
                        </button>
                    </>
                ) : defaultUrl && position === 'start' ? (
                    // 首帧有默认分镜图：显示预览和使用按钮
                    <div className="relative">
                        <img
                            src={defaultUrl}
                            alt="分镜图（点击使用）"
                            className={`w-16 h-16 object-cover rounded-lg border-2 border-dashed border-blue-400/50 opacity-60 cursor-pointer hover:opacity-100 hover:border-blue-500 transition-all ${isActive ? 'opacity-100 border-indigo-500' : ''
                                }`}
                            onClick={() => {
                                onFrameChange({
                                    url: defaultUrl,
                                    source: 'shot_ref',
                                    label: '分镜图',
                                });
                            }}
                            title="点击使用分镜图 或 拖拽图片到此处"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-[8px] text-blue-500 font-medium bg-white/80 dark:bg-black/60 px-1 rounded">
                                {isActive ? '放开' : '使用'}
                            </span>
                        </div>
                    </div>
                ) : (
                    // 空状态：显示上传/拖拽区域
                    <div
                        className={`w-16 h-16 rounded-lg border-2 border-dashed overflow-hidden cursor-pointer transition-all flex items-center justify-center ${isActive
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-zinc-300 dark:border-zinc-600 hover:border-indigo-400 dark:hover:border-indigo-500'
                            }`}
                        onClick={() => inputRef.current?.click()}
                    >
                        <div className="flex flex-col items-center text-zinc-400 dark:text-zinc-500">
                            {isActive ? (
                                <ImagePlus size={16} className="text-indigo-500" />
                            ) : (
                                <Upload size={16} />
                            )}
                            <span className="text-[8px] mt-0.5">{isActive ? '放开' : '拖拽'}</span>
                        </div>
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileDrop(file);
                        e.target.value = '';
                    }}
                />
            </div>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">
                {statusLabel}
            </span>
        </div>
    );
}
