'use client';

import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { BatchMode } from '@/types/project';

interface BatchConfigProps {
    showBatchConfig: boolean;
    setShowBatchConfig: (show: boolean) => void;
    batchScope: 'scene' | 'project';
    setBatchScope: (scope: 'scene' | 'project') => void;
    batchMode: BatchMode;
    setBatchMode: (mode: BatchMode) => void;
    isGenerating: boolean;
    handleBatchGenerate: () => void;
}

export const BatchConfig: React.FC<BatchConfigProps> = ({
    showBatchConfig,
    setShowBatchConfig,
    batchScope,
    setBatchScope,
    batchMode,
    setBatchMode,
    isGenerating,
    handleBatchGenerate
}) => {
    if (!showBatchConfig) return null;

    return (
        <div className="bg-light-accent/5 dark:bg-cine-accent/5 border border-light-accent/30 dark:border-cine-accent/30 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-light-text dark:text-white">批量生成配置</h3>
                <button
                    onClick={() => setShowBatchConfig(false)}
                    className="text-xs text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white"
                >
                    ✕ 关闭
                </button>
            </div>

            {/* Generation Scope Selection */}
            <div>
                <h4 className="text-xs font-bold mb-2 text-light-text dark:text-white">生成范围</h4>
                <div className="flex gap-2">
                    <button
                        onClick={() => setBatchScope('scene')}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${batchScope === 'scene'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                            }`}
                    >
                        当前场景
                    </button>
                    <button
                        onClick={() => setBatchScope('project')}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm transition-colors ${batchScope === 'project'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                            }`}
                    >
                        整个项目
                    </button>
                </div>
            </div>

            {/* Generation Mode Selection */}
            <div>
                <h4 className="text-xs font-bold mb-2 text-light-text dark:text-white">生成模式</h4>
                <div className="flex gap-2">
                    <button
                        onClick={() => setBatchMode('grid')}
                        className={`flex-1 border rounded-lg px-3 py-3 text-sm transition-colors ${batchMode === 'grid'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                            }`}
                    >
                        <div className="font-bold">Grid 多视图</div>
                        <div className="text-xs opacity-80 mt-1">Gemini 生成 2x2 切片</div>
                    </button>
                    <button
                        onClick={() => setBatchMode('seedream')}
                        className={`flex-1 border rounded-lg px-3 py-3 text-sm transition-colors ${batchMode === 'seedream'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                            }`}
                    >
                        <div className="font-bold">SeeDream</div>
                        <div className="text-xs opacity-80 mt-1">火山引擎单图生成</div>
                    </button>
                    <button
                        onClick={() => setBatchMode('jimeng')}
                        className={`flex-1 border rounded-lg px-3 py-3 text-sm transition-colors ${batchMode === 'jimeng'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                            }`}
                    >
                        <div className="font-bold">即梦 (Jimeng)</div>
                        <div className="text-xs opacity-80 mt-1">即梦单图批量生成</div>
                    </button>
                </div>
            </div>

            {/* Info */}
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted bg-light-bg/50 dark:bg-cine-black/30 rounded p-3">
                <div className="font-bold mb-1">📋 说明：</div>
                <ul className="space-y-1 list-disc list-inside">
                    <li>
                        {batchScope === 'scene'
                            ? '将为当前场景的所有未生成图片的镜头批量生成'
                            : '将为整个项目的所有未生成图片的镜头批量生成'}
                    </li>
                    <li>已有图片的镜头会跳过（可手动重新生成）</li>
                    <li>Grid 模式：生成 4 张变体，自动选择第一张</li>
                    <li>SeeDream / 即梦模式：直接生成单张高质量图片</li>
                </ul>
            </div>

            {/* Start Button */}
            <button
                onClick={handleBatchGenerate}
                disabled={isGenerating}
                className="w-full bg-light-accent dark:bg-cine-accent text-white dark:text-black py-3 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGenerating ? (
                    <>
                        <Loader2 size={18} className="animate-spin" />
                        批量生成中...
                    </>
                ) : (
                    <>
                        <Sparkles size={18} />
                        开始批量生成
                    </>
                )}
            </button>
        </div>
    );
};
