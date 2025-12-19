import React from 'react';
import { Grid3x3 } from 'lucide-react';
import { Shot, GenerationHistoryItem } from '@/types/project';
import ShotGenerationHistory from '@/components/shot/ShotGenerationHistory';

interface ShotDetailsPanelProps {
    selectedShot: Shot;
    handleRegenerate: (item: GenerationHistoryItem) => void;
    handleApplyHistory: (item: GenerationHistoryItem) => void;
    handleDownload: (item: GenerationHistoryItem) => void;
    handleFavorite: (item: GenerationHistoryItem) => void;
    handleDubbing: (item: GenerationHistoryItem) => void;
}

export const ShotDetailsPanel: React.FC<ShotDetailsPanelProps> = ({
    selectedShot,
    handleRegenerate,
    handleApplyHistory,
    handleDownload,
    handleFavorite,
    handleDubbing
}) => {
    return (
        <div className="pt-4 border-t border-light-border dark:border-cine-border">
            <h3 className="text-sm font-bold mb-3">当前镜头详情</h3>
            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-light-text-muted dark:text-cine-text-muted">编号:</span>
                    <span className="font-mono text-xs">{selectedShot.id.split('_')[2] || '01'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-light-text-muted dark:text-cine-text-muted">景别:</span>
                    <span>{selectedShot.shotSize}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-light-text-muted dark:text-cine-text-muted">运镜:</span>
                    <span>{selectedShot.cameraMovement}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-light-text-muted dark:text-cine-text-muted">时长:</span>
                    <span>{selectedShot.duration}s</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-light-text-muted dark:text-cine-text-muted">状态:</span>
                    <span
                        className={`text-xs px-2 py-1 rounded ${selectedShot.status === 'done'
                            ? 'bg-green-500/20 text-green-400'
                            : selectedShot.status === 'processing'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : selectedShot.status === 'error'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-gray-500/20 text-gray-400'
                            }`}
                    >
                        {selectedShot.status}
                    </span>
                </div>
                {selectedShot.description && (
                    <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">视觉描述:</div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted leading-relaxed">
                            {selectedShot.description}
                        </div>
                    </div>
                )}

                {/* Dialogue */}
                {selectedShot.dialogue && (
                    <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">对话:</div>
                        <div className="text-xs text-light-text dark:text-white bg-light-bg dark:bg-cine-black/50 p-2 rounded leading-relaxed">
                            &ldquo;{selectedShot.dialogue}&rdquo;
                        </div>
                    </div>
                )}

                {/* Narration */}
                {selectedShot.narration && (
                    <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-1">旁白:</div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted bg-light-bg-secondary dark:bg-cine-bg-secondary p-2 rounded leading-relaxed italic">
                            {selectedShot.narration}
                        </div>
                    </div>
                )}

                {/* Grid Source Info */}
                {selectedShot.fullGridUrl && (
                    <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">图片来源:</div>
                        <div className="bg-light-bg dark:bg-cine-black/50 p-2 rounded space-y-2">
                            <div className="flex items-center gap-2">
                                <Grid3x3 size={14} className="text-light-accent dark:text-cine-accent" />
                                <span className="text-xs text-light-accent dark:text-cine-accent">来自 Grid 多视图切片</span>
                            </div>
                            {selectedShot.fullGridUrl && (
                                <div className="relative group">
                                    <img
                                        src={selectedShot.fullGridUrl}
                                        alt="Grid Source"
                                        className="w-full rounded border border-light-border dark:border-cine-border"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors rounded flex items-center justify-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-light-text dark:text-white">
                                            完整 Grid 图
                                        </div>
                                    </div>
                                </div>
                            )}
                            {selectedShot.referenceImage && (
                                <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                    <div className="mb-1">当前镜头使用的切片:</div>
                                    <img
                                        src={selectedShot.referenceImage}
                                        alt="Current Slice"
                                        className="w-full rounded border border-light-accent dark:border-cine-accent"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Generation History */}
                {selectedShot.generationHistory && selectedShot.generationHistory.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-light-border dark:border-cine-border">
                        <ShotGenerationHistory
                            history={selectedShot.generationHistory}
                            onRegenerate={handleRegenerate}
                            onApply={handleApplyHistory}
                            onDownload={handleDownload}
                            onFavorite={handleFavorite}
                            onDubbing={handleDubbing}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
