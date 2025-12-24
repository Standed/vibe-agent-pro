import React from 'react';
import { Image as ImageIcon, Video, Wand2, Grid3x3, Sparkles } from 'lucide-react';

interface GenerationTypeSelectorProps {
    generationType: string | null;
    setGenerationType: (type: any) => void;
    isShotSelected: boolean;
    isSceneSelected: boolean;
}

export const GenerationTypeSelector: React.FC<GenerationTypeSelectorProps> = ({
    generationType,
    setGenerationType,
    isShotSelected,
    isSceneSelected,
}) => {
    return (
        <div>
            <h3 className="text-sm font-bold mb-3">
                生成类型
                {isSceneSelected && <span className="text-xs text-light-text-muted dark:text-cine-text-muted ml-2">(场景级)</span>}
                {isShotSelected && <span className="text-xs text-light-text-muted dark:text-cine-text-muted ml-2">(镜头级)</span>}
            </h3>
            <div className={`grid gap-2 ${isShotSelected ? 'grid-cols-3' : 'grid-cols-3'}`}>
                <button
                    onClick={() => setGenerationType('single')}
                    className={`border rounded-lg p-3 transition-colors ${generationType === 'single'
                        ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                        : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                        }`}
                >
                    <ImageIcon size={20} className="mx-auto mb-1" />
                    <div className="text-xs">单图生成</div>
                </button>

                {/* Edit button - Only show for shot-level */}
                {isShotSelected && (
                    <button
                        onClick={() => setGenerationType('edit')}
                        className={`border rounded-lg p-3 transition-colors ${generationType === 'edit'
                            ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                            : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                            }`}
                        title="编辑当前图片"
                    >
                        <Wand2 size={20} className="mx-auto mb-1" />
                        <div className="text-xs">图片编辑</div>
                    </button>
                )}

                {/* Grid button - Only show for scene-level */}
                {isSceneSelected && (
                    <>
                        <button
                            onClick={() => setGenerationType('grid')}
                            className={`border rounded-lg p-3 transition-colors ${generationType === 'grid'
                                ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                                : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                                }`}
                        >
                            <Grid3x3 size={20} className="mx-auto mb-1" />
                            <div className="text-xs">Grid 多视图</div>
                        </button>

                        <button
                            onClick={() => setGenerationType('batch')}
                            className={`border rounded-lg p-3 transition-colors ${generationType === 'batch'
                                ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                                : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                                }`}
                            title="一键为当前场景所有空缺镜头生成图片"
                        >
                            <Sparkles size={20} className="mx-auto mb-1 text-light-accent dark:text-cine-accent" />
                            <div className="text-xs">批量生成</div>
                        </button>
                    </>
                )}

                <button
                    onClick={() => setGenerationType('video')}
                    className={`border rounded-lg p-3 transition-colors ${generationType === 'video'
                        ? 'bg-light-accent dark:bg-cine-accent border-light-accent dark:border-cine-accent text-white dark:text-black'
                        : 'bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border-light-border dark:border-cine-border'
                        }`}
                >
                    <Video size={20} className="mx-auto mb-1" />
                    <div className="text-xs">视频生成</div>
                </button>
            </div>
        </div>
    );
};
