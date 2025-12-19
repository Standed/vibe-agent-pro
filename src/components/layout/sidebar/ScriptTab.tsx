import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Project } from '@/types/project';

interface ScriptTabProps {
    project: Project | null;
    updateScript: (script: string) => void;
    isGenerating: boolean;
    handleAIStoryboard: () => void;
}

export const ScriptTab: React.FC<ScriptTabProps> = ({
    project,
    updateScript,
    isGenerating,
    handleAIStoryboard
}) => {
    return (
        <div className="p-4 space-y-4">
            {/* Project Overview */}
            <div>
                <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                    项目概要
                </h3>
                <div className="glass-card p-3 space-y-2 text-xs">
                    <div>
                        <span className="text-gray-500 dark:text-gray-400">项目名称：</span>
                        <span className="text-gray-900 dark:text-white font-medium">{project?.metadata.title}</span>
                    </div>
                    {project?.settings.aspectRatio && (
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">画面比例：</span>
                            <span className="text-gray-900 dark:text-white font-medium">{project.settings.aspectRatio}</span>
                        </div>
                    )}
                    {project?.metadata.artStyle && (
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">画风：</span>
                            <span className="text-gray-900 dark:text-white font-medium">{project.metadata.artStyle}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Script Content */}
            <div>
                <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                    剧本文本
                </h3>
                <textarea
                    value={project?.script || ''}
                    onChange={(e) => updateScript(e.target.value)}
                    placeholder="在此输入剧本内容..."
                    className="glass-input w-full h-64 rounded-xl p-3 text-sm resize-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            {/* AI Storyboard Button */}
            <button
                onClick={handleAIStoryboard}
                disabled={isGenerating || !project?.script?.trim()}
                className="w-full bg-black dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-[0.98] py-3 px-4 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
                {isGenerating ? (
                    <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>AI 分镜生成中...</span>
                    </>
                ) : (
                    <>
                        <Sparkles size={18} />
                        <span>AI 自动分镜</span>
                    </>
                )}
            </button>
        </div>
    );
};
