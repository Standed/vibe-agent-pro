import React, { useRef, useState, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, X, ChevronDown, Command, Sparkles } from 'lucide-react';
import MentionInput from '@/components/input/MentionInput';
import { JimengOptions, JimengModel, JimengResolution } from '@/components/jimeng/JimengOptions';
import { cn } from '@/lib/utils';
import { getCommandSuggestions, SLASH_COMMANDS, type SlashCommand } from '@/utils/slashCommands';
import { GenerationModel } from '@/types/project';

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
    // Sora specific
    soraAspectRatio?: '16:9' | '9:16';
    setSoraAspectRatio?: (ratio: '16:9' | '9:16') => void;
    soraDuration?: 10 | 15;
    setSoraDuration?: (duration: 10 | 15) => void;
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
    soraAspectRatio = '16:9',
    setSoraAspectRatio,
    soraDuration = 10,
    setSoraDuration
}: ChatInputProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [commandSuggestions, setCommandSuggestions] = useState<SlashCommand[]>([]);
    const [showCommands, setShowCommands] = useState(false);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

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
        { id: 'sora-video', label: 'Sora视频', category: 'video' },
    ];

    return (
        <div className="flex-shrink-0 p-4 m-4 mt-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-lg z-20 relative">
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

            {/* Uploaded Images & Reference URLs Preview */}
            {(uploadedImages.length > 0 || manualReferenceUrls.length > 0) && (
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
                    {/* Reference URLs */}
                    {manualReferenceUrls.map((url, idx) => (
                        <div key={`url-${idx}`} className="relative group">
                            <img
                                src={url}
                                alt={`Ref ${idx + 1}`}
                                className="h-16 w-16 rounded-lg border border-black/5 dark:border-white/10 object-cover"
                            />
                            {onRemoveReferenceUrl && (
                                <button
                                    onClick={() => onRemoveReferenceUrl(idx)}
                                    className="absolute -top-2 -right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm scale-75"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Model Selection Bar */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-xl">
                    {models.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setSelectedModel(m.id)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300",
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
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-xl">
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
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-2">
                {/* Jimeng Options Panel */}
                {selectedModel === 'jimeng' && (
                    <div className="px-1 animate-in fade-in slide-in-from-top-2">
                        <JimengOptions
                            model={jimengModel}
                            resolution={jimengResolution}
                            onModelChange={setJimengModel}
                            onResolutionChange={setJimengResolution}
                        />
                    </div>
                )}

                {/* Sora Video Options Panel */}
                {selectedModel === 'sora-video' && (
                    <div className="px-1 animate-in fade-in slide-in-from-top-2 flex items-center gap-4">
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

                <div className="flex gap-2 items-end">
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
                        className="flex-shrink-0 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                        title="上传参考图"
                    >
                        <ImageIcon size={20} />
                    </button>

                    <MentionInput
                        value={inputText}
                        onChange={setInputText}
                        onMention={onMention}
                        onEnterSend={onSend}
                        placeholder="输入提示词... (@ 引用资源)"
                        disabled={isGenerating}
                        className="flex-1 bg-transparent border-none px-2 py-3 text-sm focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                    />

                    <button
                        onClick={onSend}
                        disabled={isGenerating || (!inputText.trim() && uploadedImages.length === 0)}
                        className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </div>
            </div>

            <div className="mt-2 px-1 text-[10px] text-zinc-400 dark:text-zinc-600 flex justify-between">
                <span>Shift + Enter 换行 · / 快捷命令</span>
                <span>@ 引用角色/场景</span>
            </div>
        </div>
    );
}
