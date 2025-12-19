'use client';

import React from 'react';
import { AIModel } from '@/types/project';

interface ModelSelectorProps {
    selectedModel: AIModel;
    setSelectedModel: (model: AIModel) => void;
    jimengModel: string;
    setJimengModel: (model: string) => void;
    jimengVideoModel: string;
    setJimengVideoModel: (model: string) => void;
    generationType: string | null;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
    selectedModel,
    setSelectedModel,
    jimengModel,
    setJimengModel,
    jimengVideoModel,
    setJimengVideoModel,
    generationType
}) => {
    return (
        <div>
            <h3 className="text-sm font-bold mb-3">选择模型</h3>
            <div className="flex gap-2">
                <button
                    onClick={() => setSelectedModel('seedream')}
                    className={`flex-1 border rounded-lg p-2 text-xs transition-colors ${selectedModel === 'seedream'
                        ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                        : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                        }`}
                >
                    SeeDream
                </button>
                <button
                    onClick={() => setSelectedModel('jimeng')}
                    className={`flex-1 border rounded-lg p-2 text-xs transition-colors ${selectedModel === 'jimeng'
                        ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                        : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border text-light-text dark:text-white'
                        }`}
                >
                    即梦 (Jimeng)
                </button>
            </div>
            {selectedModel === 'jimeng' && (
                <div className="mt-3 space-y-3">
                    <div>
                        <label className="text-[10px] text-light-text-muted dark:text-cine-text-muted ml-1">图像模型</label>
                        <select
                            value={jimengModel}
                            onChange={(e) => setJimengModel(e.target.value)}
                            className="w-full mt-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-light-accent dark:border-cine-accent"
                        >
                            <option value="jimeng-4.0">即梦 4.0</option>
                            <option value="jimeng-3.1">即梦 3.1</option>
                            <option value="jimeng-3.0">即梦 3.0</option>
                            <option value="jimeng-2.1">即梦 2.1</option>
                            <option value="jimeng-2.0-pro">即梦 2.0 Pro</option>
                            <option value="jimeng-xl-pro">即梦 XL Pro</option>
                        </select>
                    </div>
                    {generationType === 'video' && (
                        <div>
                            <label className="text-[10px] text-light-text-muted dark:text-cine-text-muted ml-1">视频模型</label>
                            <select
                                value={jimengVideoModel}
                                onChange={(e) => setJimengVideoModel(e.target.value)}
                                className="w-full mt-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-light-accent dark:border-cine-accent"
                            >
                                <option value="video-S3.0-Pro">视频 3.0 Pro (最新)</option>
                                <option value="video-S3.0">视频 3.0</option>
                                <option value="video-S2.0-Pro">视频 2.0 Pro</option>
                                <option value="video-S2.0">视频 2.0</option>
                            </select>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
