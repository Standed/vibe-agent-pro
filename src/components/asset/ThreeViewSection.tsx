import React from 'react';
import { Sparkles, Wand2, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UseThreeViewGenerationReturn } from '@/hooks/useThreeViewGeneration';
import { JimengModel } from '@/components/jimeng/JimengOptions';

interface ThreeViewComponentProps {
    hook: UseThreeViewGenerationReturn;
    name?: string;
}

export function ThreeViewGenerator({ hook, name }: ThreeViewComponentProps) {
    const {
        aspectRatio, setAspectRatio,
        genMode, setGenMode,
        jimengModel, setJimengModel,
        isGenerating,
        handleGenerateThreeView
    } = hook;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-3">
            {/* AI Generate Three-View Button */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-white/5 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Sparkles className="w-24 h-24 text-zinc-900 dark:text-white" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10">
                                <Wand2 className="w-4 h-4 text-white dark:text-black" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">AI 生成三视图</h3>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">基于描述自动生成角色参考图</p>
                            </div>
                        </div>

                        {/* Model & Mode Selector */}
                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <select
                                    value={genMode}
                                    onChange={(e) => setGenMode(e.target.value as any)}
                                    className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-lg focus:outline-none cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                                >
                                    <option value="jimeng" className="dark:bg-zinc-900">即梦 AI</option>
                                    <option value="gemini" className="dark:bg-zinc-900">Gemini</option>
                                    <option value="seedream" className="dark:bg-zinc-900">SeeDream</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
                            </div>

                            {genMode === 'jimeng' && (
                                <div className="relative group">
                                    <select
                                        value={jimengModel}
                                        onChange={(e) => setJimengModel(e.target.value as JimengModel)}
                                        className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-lg focus:outline-none cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                                    >
                                        <option value="jimeng-4.5" className="dark:bg-zinc-900">图片 4.5</option>
                                        <option value="jimeng-4.1" className="dark:bg-zinc-900">图片 4.1</option>
                                        <option value="jimeng-4.0" className="dark:bg-zinc-900">图片 4.0</option>
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGenerateThreeView}
                        disabled={isGenerating || !name?.trim()}
                        className={cn(
                            "w-full seko-button seko-button-primary py-2.5 flex items-center justify-center gap-2.5 transition-all duration-300",
                            isGenerating && "cursor-wait opacity-80"
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>正在生成创意方案...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                <span>开始生成</span>
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">比例:</span>
                            <select
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value as '21:9' | '16:9')}
                                className="text-[10px] font-medium bg-transparent text-zinc-700 dark:text-zinc-300 border-none p-0 focus:ring-0 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                            >
                                <option value="21:9" className="dark:bg-zinc-900">21:9 超宽</option>
                                <option value="16:9" className="dark:bg-zinc-900">16:9 宽屏</option>
                            </select>
                        </div>
                        <span className="text-[10px] text-zinc-400">消耗 1 次生成额度</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ThreeViewPrompt({ hook }: ThreeViewComponentProps) {
    const { generationPrompt, setGenerationPrompt } = hook;

    return (
        <div className="mt-4 pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                生成提示词（高级）
            </label>
            <textarea
                value={generationPrompt}
                onChange={(e) => setGenerationPrompt(e.target.value)}
                className="w-full h-20 px-3 py-2 text-xs seko-input resize-none font-mono opacity-80 focus:opacity-100 transition-opacity"
            />
        </div>
    );
}
