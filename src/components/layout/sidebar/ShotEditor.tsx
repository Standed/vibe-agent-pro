import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, MoreHorizontal, X, ImageIcon, Check } from 'lucide-react';
import { Shot, ShotSize, CameraMovement, SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS } from '@/types/project';
import { translateShotSize, translateCameraMovement } from '@/utils/translations';
import ShotGenerationHistory from '@/components/shot/ShotGenerationHistory';

interface ShotEditorProps {
    editingShot: Shot | null;
    setEditingShot: (shot: Shot | null) => void;
    shotForm: {
        description: string;
        narration: string;
        dialogue: string;
        shotSize: ShotSize | '';
        cameraMovement: CameraMovement | '';
        duration: number;
    };
    setShotForm: React.Dispatch<React.SetStateAction<{
        description: string;
        narration: string;
        dialogue: string;
        shotSize: ShotSize | '';
        cameraMovement: CameraMovement | '';
        duration: number;
    }>>;
    saveShotEdit: () => void;
    shotHistoryImages: string[];
    selectedHistoryImage: string | null;
    setSelectedHistoryImage: (url: string | null) => void;
    liveEditingShot: Shot | null;
    updateShot: (id: string, updates: Partial<Shot>) => void;
    setShotImagePreview: (url: string | null) => void;
    onOpenGridSelection?: (fullGridUrl: string, slices: string[]) => void;
}

export const ShotEditor: React.FC<ShotEditorProps> = ({
    editingShot,
    setEditingShot,
    shotForm,
    setShotForm,
    saveShotEdit,
    shotHistoryImages,
    selectedHistoryImage,
    setSelectedHistoryImage,
    liveEditingShot,
    updateShot,
    setShotImagePreview,
    onOpenGridSelection
}) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!editingShot || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 md:p-8">
            <div className="bg-white dark:bg-[#0c0c0e] border border-light-border dark:border-cine-border rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header Toolbar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-dark/50 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-light-accent dark:bg-cine-accent rounded-xl text-white dark:text-black">
                            <Edit2 size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-light-text dark:text-white">分镜详情编辑</span>
                                <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-light-text-muted dark:text-cine-text-muted mt-0.5">
                                <span>镜头 #{editingShot.order}</span>
                                <span className="opacity-30">•</span>
                                <span>{translateShotSize(editingShot.shotSize)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEditingShot(null)}
                            className="p-2 rounded-xl border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left Column: Description & Text */}
                        <div className="lg:col-span-7 space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头描述</label>
                                <textarea
                                    value={shotForm.description}
                                    onChange={(e) => setShotForm((prev) => ({ ...prev, description: e.target.value }))}
                                    className="w-full h-48 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                                    placeholder="详细描述镜头画面内容..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">对白</label>
                                    <textarea
                                        value={shotForm.dialogue}
                                        onChange={(e) => setShotForm((prev) => ({ ...prev, dialogue: e.target.value }))}
                                        className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                                        placeholder="角色对白（可选）"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">旁白</label>
                                    <textarea
                                        value={shotForm.narration}
                                        onChange={(e) => setShotForm((prev) => ({ ...prev, narration: e.target.value }))}
                                        className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                                        placeholder="旁白/场景说明"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Settings & History */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary rounded-3xl p-6 border border-light-border dark:border-cine-border space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头景别</label>
                                        <select
                                            value={shotForm.shotSize}
                                            onChange={(e) => setShotForm((prev) => ({ ...prev, shotSize: e.target.value as ShotSize }))}
                                            className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                                        >
                                            <option value="">选择景别</option>
                                            {SHOT_SIZE_OPTIONS.map((size) => (
                                                <option key={size} value={size}>{translateShotSize(size)} ({size})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头运动</label>
                                        <select
                                            value={shotForm.cameraMovement}
                                            onChange={(e) => setShotForm((prev) => ({ ...prev, cameraMovement: e.target.value as CameraMovement }))}
                                            className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                                        >
                                            <option value="">选择运动</option>
                                            {CAMERA_MOVEMENT_OPTIONS.map((move) => (
                                                <option key={move} value={move}>{translateCameraMovement(move)} ({move})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">时长 (秒)</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={0.5}
                                            value={shotForm.duration}
                                            onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                                            className="flex-1 accent-light-accent dark:accent-cine-accent"
                                        />
                                        <input
                                            type="number"
                                            min={1}
                                            value={shotForm.duration}
                                            onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                                            className="w-16 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2 text-center text-sm font-bold text-light-text dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">历史分镜图片</label>
                                    <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                                        {editingShot.generationHistory?.length || 0} 条记录
                                    </span>
                                </div>

                                {(!editingShot.generationHistory || editingShot.generationHistory.length === 0) ? (
                                    <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary border border-dashed border-light-border dark:border-cine-border rounded-2xl py-8 text-center">
                                        <ImageIcon size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted opacity-30" />
                                        <p className="text-xs text-light-text-muted dark:text-cine-text-muted">暂无历史图片</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                        {editingShot.generationHistory.map((item, idx) => (
                                            <div
                                                key={item.id}
                                                className={`group relative aspect-video bg-light-bg dark:bg-cine-black rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${editingShot.referenceImage === item.result ? 'border-light-accent dark:border-cine-accent ring-2 ring-light-accent/10 dark:ring-cine-accent/10' : 'border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'}`}
                                                onClick={() => setShotImagePreview(item.result)}
                                            >
                                                <img src={item.result} alt={`history-${idx + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />

                                                {/* Apply Button - Visible on Hover or if Selected */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateShot(editingShot.id, {
                                                            referenceImage: item.result,
                                                            status: 'done',
                                                            fullGridUrl: item.parameters?.fullGridUrl as string,
                                                            gridImages: item.parameters?.slices as string[]
                                                        });
                                                        setSelectedHistoryImage(item.result);
                                                    }}
                                                    className={`absolute bottom-1 right-1 p-1.5 rounded-full shadow-lg transition-all z-10 ${editingShot.referenceImage === item.result
                                                            ? 'bg-light-accent dark:bg-cine-accent text-white dark:text-black opacity-100'
                                                            : 'bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-light-accent dark:hover:bg-cine-accent hover:text-white dark:hover:text-black'
                                                        }`}
                                                    title="应用此图片"
                                                >
                                                    <Check size={12} />
                                                </button>

                                                {/* Grid Badge */}
                                                {item.parameters?.gridSize && (
                                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-white backdrop-blur-sm">
                                                        Grid
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between px-8 py-6 border-t border-light-border dark:border-cine-border bg-light-bg-secondary dark:bg-cine-bg-secondary">
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                        最后修改: {new Date().toLocaleTimeString()}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setEditingShot(null)}
                            className="px-6 py-2.5 text-sm font-bold rounded-xl glass-button text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                        >
                            取消
                        </button>
                        <button
                            onClick={saveShotEdit}
                            className="px-8 py-2.5 text-sm font-bold rounded-xl bg-black dark:bg-white text-white dark:text-black shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <span>保存并应用</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
