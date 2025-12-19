import React from 'react';

interface PromptInputProps {
    prompt: string;
    setPrompt: (prompt: string | ((prev: string) => string)) => void;
    generationType: string | null;
}

export const PromptInput: React.FC<PromptInputProps> = ({
    prompt,
    setPrompt,
    generationType
}) => {
    return (
        <>
            {/* Prompt */}
            <div>
                <h3 className="text-sm font-bold mb-3">提示词</h3>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                        generationType === 'grid'
                            ? '描述角色或场景...\n例如：一位穿着黑色西装的赛博朋克侦探，背景是霓虹灯闪烁的街道'
                            : generationType === 'edit'
                                ? '描述你想要的修改...\n例如：\n- 改为赛博朋克风格\n- 将背景改为白天的街道\n- 增加更多人物和细节\n- 完全重新构图，改为俯视角度'
                                : '描述你想要生成的画面...'
                    }
                    className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:border-cine-accent"
                />
            </div>

            {/* Style Presets */}
            <div>
                <h3 className="text-sm font-bold mb-3">风格预设</h3>
                <div className="grid grid-cols-2 gap-2">
                    {['电影级', '动画', '写实', '赛博朋克'].map((style) => (
                        <button
                            key={style}
                            onClick={() => setPrompt((prev) => `${prev}, ${style}风格`)}
                            className="bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-xs transition-colors"
                        >
                            {style}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
};
