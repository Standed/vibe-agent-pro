import React, { useRef, useState, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, X, ChevronDown, Command, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import MentionInput from '@/components/chat/MentionInput';
import { JimengOptions, JimengModel, JimengResolution } from '@/components/jimeng/JimengOptions';
import { cn } from '@/lib/utils';
import { getCommandSuggestions, SLASH_COMMANDS, type SlashCommand } from '@/utils/slashCommands';
import { GenerationModel, Character, Location } from '@/types/project';

interface ChatInputProps {
    inputText: string;
    setInputText: (text: string) => void;
    onSend: () => void;
    isGenerating: boolean;
    selectedModel: GenerationModel;
    setSelectedModel: (model: GenerationModel) => void;
    uploadedImages: File[];
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveImage: (index: number) => void;
    onMention: (query: string) => Promise<any[]>;
    onAssetSelected?: (type: 'character' | 'location', item: Character | Location) => void;
    // Jimeng specific
    jimengModel: JimengModel;
    setJimengModel: (model: JimengModel) => void;
    jimengResolution: JimengResolution;
    setJimengResolution: (res: JimengResolution) => void;
    // Grid specific
    gridSize: '2x2' | '3x3';
    setGridSize: (size: '2x2' | '3x3') => void;
    manualReferenceUrls?: string[];
    onRemoveReferenceUrl?: (index: number) => void;
    // Gemini Direct specific
    geminiImageSize?: '2K' | '4K';
    setGeminiImageSize?: (size: '2K' | '4K') => void;
    // Sora specific
    soraAspectRatio?: '16:9' | '9:16';
    setSoraAspectRatio?: (ratio: '16:9' | '9:16') => void;
    soraDuration?: 10 | 15;
    setSoraDuration?: (duration: 10 | 15) => void;
    // Vidu specific
    viduMode?: 'img2video' | 'start-end2video' | 'reference2video';
    setViduMode?: (mode: 'img2video' | 'start-end2video' | 'reference2video') => void;
    viduDuration?: number; // 1-10s
    setViduDuration?: (duration: number) => void;
    viduResolution?: '720p' | '1080p';
    setViduResolution?: (res: '720p' | '1080p') => void;
    viduOffPeak?: boolean;
    setViduOffPeak?: (offPeak: boolean) => void;
}

export function ChatInput({
    inputText,
    setInputText,
    onSend,
    isGenerating,
    selectedModel,
    setSelectedModel,
    uploadedImages,
    onFileUpload,
    onRemoveImage,
    onMention,
    jimengModel,
    setJimengModel,
    jimengResolution,
    setJimengResolution,
    gridSize,
    setGridSize,
    manualReferenceUrls = [],
    onRemoveReferenceUrl,
    geminiImageSize = '2K',
    setGeminiImageSize,
    soraAspectRatio = '16:9',
    setSoraAspectRatio,
    soraDuration = 10,
    setSoraDuration,
    viduMode = 'img2video',
    setViduMode,
    viduDuration = 5,
    setViduDuration,
    viduResolution = '1080p',
    setViduResolution,
    viduOffPeak = false,
    setViduOffPeak,
    onAssetSelected
}: ChatInputProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [commandSuggestions, setCommandSuggestions] = useState<SlashCommand[]>([]);
    const [showCommands, setShowCommands] = useState(false);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputHeight, setInputHeight] = useState(120); // Default height
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

    // Resize Handlers
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        resizeRef.current = { startY: e.clientY, startHeight: inputHeight };
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !resizeRef.current) return;
            // Dragging UP (negative delta) should INCREASE height
            const deltaY = resizeRef.current.startY - e.clientY;
            const newHeight = Math.min(Math.max(resizeRef.current.startHeight + deltaY, 120), 800); // 120px min, 800px max
            setInputHeight(newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            resizeRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // 监听输入变化，检测斜杠命令
    useEffect(() => {
        if (inputText.startsWith('/')) {
            const suggestions = getCommandSuggestions(inputText);
            setCommandSuggestions(suggestions);
            setShowCommands(suggestions.length > 0);
            setSelectedCommandIndex(0);
        } else {
            setShowCommands(false);
            setCommandSuggestions([]);
        }
    }, [inputText]);

    // 选择命令
    const handleSelectCommand = (cmd: SlashCommand) => {
        // 切换模型并清空输入
        if (cmd.modelId) {
            const modelMap: Record<string, GenerationModel> = {
                'gemini-direct': 'gemini-direct',
                'gemini-grid': 'gemini-grid',
                'jimeng': 'jimeng',
                'seedream': 'seedream',
            };
            if (modelMap[cmd.modelId]) {
                setSelectedModel(modelMap[cmd.modelId]);
            }
        }
        // 清空命令，保留用户可能输入的提示词
        const parts = inputText.split(/\s+/);
        const promptParts = parts.slice(1).filter(p => !p.startsWith('-'));
        setInputText(promptParts.join(' '));
        setShowCommands(false);
    };

    const models: { id: GenerationModel; label: string; category?: 'image' | 'video' }[] = [
        { id: 'gemini-grid', label: 'Grid', category: 'image' },
        { id: 'gemini-direct', label: 'Gemini', category: 'image' },
        { id: 'seedream', label: 'SeeDream', category: 'image' },
        { id: 'jimeng', label: '即梦', category: 'image' },
        { id: 'vidu-video', label: 'Vidu', category: 'video' },
        { id: 'sora-video', label: 'Sora', category: 'video' },
    ];

    return (
        <div className="flex-shrink-0 p-4 m-4 mt-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-lg z-20 relative transition-all duration-75 ease-out">
            {/* Top Resize Handle */}
            <div
                onMouseDown={startResize}
                className="absolute top-0 left-0 right-0 h-4 -mt-2 cursor-row-resize z-50 flex items-center justify-center group"
                title="拖拽调整高度"
            >
                {/* Visual Indicator (Pill) - Only visible on hover/drag */}
                <div className={`w-12 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 transition-all ${isResizing ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`} />
            </div>

            {/* Slash Command Suggestions */}
            {showCommands && commandSuggestions.length > 0 && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-zinc-900 rounded-xl border border-black/10 dark:border-white/10 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-50">
                    <div className="p-2 border-b border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <Command size={12} />
                            <span>斜杠命令</span>
                        </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {commandSuggestions.map((cmd, idx) => (
                            <button
                                key={cmd.name}
                                onClick={() => handleSelectCommand(cmd)}
                                className={cn(
                                    "w-full px-3 py-2 text-left flex items-center gap-3 transition-colors",
                                    idx === selectedCommandIndex
                                        ? "bg-light-accent/10 dark:bg-cine-accent/10"
                                        : "hover:bg-zinc-50 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-light-accent/20 to-light-accent/10 dark:from-cine-accent/20 dark:to-cine-accent/10 flex items-center justify-center">
                                    <Sparkles size={14} className="text-light-accent dark:text-cine-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-zinc-900 dark:text-white">
                                        /{cmd.name}
                                        {cmd.aliases && cmd.aliases.length > 0 && (
                                            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
                                                ({cmd.aliases.map(a => `/${a}`).join(', ')})
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                        {cmd.description}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Uploaded Images Preview */}
            {uploadedImages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
                    {/* Uploaded Files */}
                    {uploadedImages.map((file, idx) => (
                        <div key={`file-${idx}`} className="relative group">
                            <img
                                src={URL.createObjectURL(file)}
                                alt={`Upload ${idx + 1}`}
                                className="h-16 w-16 rounded-lg border border-black/5 dark:border-white/10 object-cover"
                            />
                            <button
                                onClick={() => onRemoveImage(idx)}
                                className="absolute -top-2 -right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm scale-75"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-1 mb-3 px-1">
                <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                    <button
                        onClick={() => {
                            // Switch to Image mode default
                            const firstImageModel = models.find(m => m.category === 'image')?.id;
                            if (firstImageModel) setSelectedModel(firstImageModel);
                        }}
                        className={cn(
                            "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                            models.find(m => m.id === selectedModel)?.category === 'image'
                                ? "bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                        )}
                    >
                        图片生成
                    </button>
                    <button
                        onClick={() => {
                            // Switch to Video mode default
                            const firstVideoModel = models.find(m => m.category === 'video')?.id;
                            if (firstVideoModel) setSelectedModel(firstVideoModel);
                        }}
                        className={cn(
                            "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                            models.find(m => m.id === selectedModel)?.category === 'video'
                                ? "bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                        )}
                    >
                        视频生成
                    </button>
                </div>
            </div>

            {/* Model Selection Bar */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-xl overflow-x-auto scrollbar-hide">
                    {models
                        .filter(m => {
                            const currentCategory = models.find(curr => curr.id === selectedModel)?.category || 'image';
                            return m.category === currentCategory;
                        })
                        .map((m) => (
                            <button
                                key={m.id}
                                onClick={() => setSelectedModel(m.id)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 min-w-fit whitespace-nowrap",
                                    selectedModel === m.id
                                        ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                </div>

                {/* Sub-options for specific models */}
                {selectedModel === 'gemini-grid' && (
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-xl ml-2 flex-shrink-0">
                        {(['2x2', '3x3'] as const).map((size) => (
                            <button
                                key={size}
                                onClick={() => setGridSize(size)}
                                className={cn(
                                    "px-2 py-1 text-xs font-medium rounded-lg transition-all duration-300",
                                    gridSize === size
                                        ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                                )}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                )}

                {/* Gemini Direct Resolution Options */}
                {selectedModel === 'gemini-direct' && (
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-xl ml-2 flex-shrink-0">
                        {(['2K', '4K'] as const).map((size) => (
                            <button
                                key={size}
                                onClick={() => setGeminiImageSize?.(size)}
                                className={cn(
                                    "px-2 py-1 text-xs font-medium rounded-lg transition-all duration-300",
                                    geminiImageSize === size
                                        ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                                )}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-2">
                {/* Scrollable Settings Area */}
                <div className="max-h-[20vh] overflow-y-auto custom-scrollbar px-1 -mx-1 flex flex-col gap-2">
                    {/* Jimeng Options Panel */}
                    {selectedModel === 'jimeng' && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <JimengOptions
                                model={jimengModel}
                                resolution={jimengResolution}
                                onModelChange={setJimengModel}
                                onResolutionChange={setJimengResolution}
                            />
                        </div>
                    )}

                    {/* Vidu Video Options Panel */}
                    {selectedModel === 'vidu-video' && (
                        <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-3 flex-wrap">
                            {/* 模式选择 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">模式:</span>
                                <div className="flex p-0.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
                                    {(['img2video', 'start-end2video', 'reference2video'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setViduMode?.(mode)}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-medium rounded transition-all whitespace-nowrap",
                                                viduMode === mode
                                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                            )}
                                        >
                                            {mode === 'img2video' ? '图生视频' : mode === 'start-end2video' ? '首尾帧' : '参考生视频'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 时长选择 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">时长:</span>
                                <select
                                    value={viduDuration}
                                    onChange={(e) => setViduDuration?.(Number(e.target.value))}
                                    className="px-2 py-1 text-[10px] font-medium rounded-lg bg-white dark:bg-white/10 text-black dark:text-white border border-zinc-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 cursor-pointer"
                                >
                                    {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const)
                                        .filter(dur => viduMode === 'start-end2video' ? dur <= 8 : true)
                                        .map((dur) => (
                                            <option key={dur} value={dur}>
                                                {dur}s
                                            </option>
                                        ))}
                                </select>
                            </div>
                            {/* 分辨率选择 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">分辨率:</span>
                                <div className="flex p-0.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
                                    {(['720p', '1080p'] as const).map((res) => (
                                        <button
                                            key={res}
                                            onClick={() => setViduResolution?.(res)}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-medium rounded transition-all",
                                                viduResolution === res
                                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                            )}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 错峰模式 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">错峰:</span>
                                <button
                                    onClick={() => setViduOffPeak?.(!viduOffPeak)}
                                    className={cn(
                                        "px-2 py-1 text-[10px] font-medium rounded-lg transition-all",
                                        viduOffPeak
                                            ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                            : "bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                    )}
                                >
                                    {viduOffPeak ? '开' : '关'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sora Video Options Panel */}
                    {selectedModel === 'sora-video' && (
                        <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-4">
                            {/* 尺寸选择 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">尺寸:</span>
                                <div className="flex p-0.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
                                    {(['16:9', '9:16'] as const).map((ratio) => (
                                        <button
                                            key={ratio}
                                            onClick={() => setSoraAspectRatio?.(ratio)}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-medium rounded transition-all",
                                                soraAspectRatio === ratio
                                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                            )}
                                        >
                                            {ratio === '16:9' ? '横屏' : '竖屏'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 时长选择 */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500">时长:</span>
                                <div className="flex p-0.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
                                    {([10, 15] as const).map((dur) => (
                                        <button
                                            key={dur}
                                            onClick={() => setSoraDuration?.(dur)}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-medium rounded transition-all",
                                                soraDuration === dur
                                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                            )}
                                        >
                                            {dur}s
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 items-end relative">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onFileUpload}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isGenerating}
                        className="flex-shrink-0 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-1"
                        title="上传参考图"
                    >
                        <ImageIcon size={20} />
                    </button>

                    <div className="flex-1 relative">
                        <MentionInput
                            value={inputText}
                            onChange={setInputText}
                            onMention={onAssetSelected || (() => { })}
                            onEnterSend={onSend}
                            placeholder="输入提示词... (@ 引用资源)"
                            disabled={isGenerating}
                            autoResize={false}
                            style={{ height: inputHeight, minHeight: inputHeight }}
                            className="w-full bg-transparent border-none px-2 py-3 text-sm focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 custom-scrollbar pb-12"
                        />
                        {/* Expand Button */}
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-white/50 dark:bg-black/50 hover:bg-white dark:hover:bg-black rounded-lg transition-all backdrop-blur-sm opacity-50 hover:opacity-100"
                            title="展开编辑"
                        >
                            <Maximize2 size={14} />
                        </button>
                    </div>

                    <div className="absolute bottom-2 right-2 flex gap-2">
                        <button
                            onClick={onSend}
                            disabled={isGenerating || (!inputText.trim() && uploadedImages.length === 0)}
                            className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Editor Overlay */}
            {isExpanded && typeof document !== 'undefined' && (() => {
                const container = document.getElementById('chat-panel-container');
                if (!container) return null;
                return createPortal(
                    <div className="absolute inset-0 z-[100] bg-white dark:bg-[#1a1a1a] flex flex-col animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
                            <span className="font-bold text-sm text-zinc-900 dark:text-gray-100">提示词详情</span>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                            >
                                <Minimize2 size={16} className="text-zinc-500" />
                            </button>
                        </div>
                        <div className="flex-1 p-4 relative overflow-hidden">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                className="w-full h-full bg-transparent border-none focus:ring-0 text-sm leading-relaxed resize-none custom-scrollbar focus:outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium"
                                placeholder="输入提示词..."
                                autoFocus
                            />
                            <div className="absolute bottom-4 right-4 flex gap-2">
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-xs font-medium transition-colors"
                                >
                                    完成
                                </button>
                                <button
                                    onClick={() => { setIsExpanded(false); onSend(); }}
                                    className="px-5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 transition-all text-xs font-bold shadow-lg flex items-center gap-1.5"
                                >
                                    <Send size={14} />
                                    发送
                                </button>
                            </div>
                        </div>
                    </div>,
                    container
                );
            })()}

            <div className="mt-2 px-1 text-[10px] text-zinc-400 dark:text-zinc-600 flex justify-between">
                <span>Shift + Enter 换行 · / 快捷命令</span>
                <span>@ 引用角色/场景</span>
            </div>
        </div>
    );
}
