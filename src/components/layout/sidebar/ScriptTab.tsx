import React, { useState } from 'react';
import { Loader2, Sparkles, Grid2x2, Video } from 'lucide-react';
import { Project } from '@/types/project';
import { useAgent } from '@/hooks/agent/useAgent';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
    const { sendMessage, isProcessing, pendingConfirmation } = useAgent({ chatChannel: 'planning' });
    const [localConfirmation, setLocalConfirmation] = useState<{ message: string, credits: number, onConfirm: () => void, onCancel: () => void } | null>(null);

    const activeConfirmation = pendingConfirmation || localConfirmation;

    const handleQuickCommand = async (text: string) => {
        if (isProcessing) return;
        await sendMessage(text);
    };

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

            {/* AI Quick Commands & Storyboard */}
            <div className="space-y-3">
                <h3 className="text-sm font-bold text-light-text dark:text-white">
                    AI 辅助创作
                </h3>

                {/* Original AI Storyboard Button */}
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
                            <span>AI 自动分镜 (基于剧本)</span>
                        </>
                    )}
                </button>

                {/* Relocated Quick Commands */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => handleQuickCommand('请帮我在现有分镜基础上进行细化，增加画面细节，但请保持目前的场景结构，不要添加新场景。')}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all border border-blue-500/20 bg-blue-500/5 group disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />}
                        🔍 细化现有分镜
                    </button>
                    <button
                        onClick={() => handleQuickCommand('请发挥你的创意，为当前故事构思新的情节和场景，尽可能丰富故事内容。')}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all border border-purple-500/20 bg-purple-500/5 group disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-purple-500 group-hover:scale-110 transition-transform" />}
                        ✨ 脑暴新剧情
                    </button>
                    <button
                        onClick={() => handleQuickCommand('Gemini Grid 2x2 生成所有分镜')}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all opacity-70 hover:opacity-100 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Grid2x2 size={14} className="text-indigo-500" />}
                        Grid 绘图
                    </button>
                    <button
                        onClick={() => handleQuickCommand('Sora2 生成所有分镜视频')}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all opacity-70 hover:opacity-100 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} className="text-purple-500" />}
                        Sora 视频
                    </button>
                </div>
            </div>

            {/* Confirm Dialog for Agent Actions */}
            <ConfirmDialog
                isOpen={!!activeConfirmation}
                title="积分消耗确认"
                description={`此操作预计消耗 ${activeConfirmation?.credits || 0} 积分。确定要继续吗？`}
                variant="default"
                confirmText="确认继续"
                onConfirm={activeConfirmation?.onConfirm || (() => { })}
                onCancel={activeConfirmation?.onCancel || (() => { })}
            />
        </div>
    );
};
