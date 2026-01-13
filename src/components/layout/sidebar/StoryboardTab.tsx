import React from 'react';
import { Plus, Edit2, ChevronRight, ChevronDown, Trash2, Film, MapPin } from 'lucide-react';
import { Scene, Shot } from '@/types/project';
import ShotListItem from '@/components/shot/ShotListItem';
import { formatShotLabel } from '@/utils/shotOrder';

interface StoryboardTabProps {
    shots: Shot[];
    scenes: Scene[];
    collapsedScenes: Set<string>;
    toggleSceneCollapse: (sceneId: string) => void;
    handleAddScene: () => void;
    setShowScriptEditor?: (show: boolean) => void;
    editingSceneId: string | null;
    editingSceneName: string;
    setEditingSceneName: (name: string) => void;
    handleSaveSceneName: (sceneId: string) => void;
    handleCancelEditScene: () => void;
    handleStartEditScene: (sceneId: string, currentName: string) => void;
    handleEditSceneDetails: (sceneId: string) => void;
    handleDeleteScene: (sceneId: string, sceneName: string) => void;
    handleAddShotClick: (sceneId: string, insertIndex?: number) => void;
    selectedShotId: string | null;
    handleShotClick: (shotId: string) => void;
    openShotEditor: (shot: Shot) => void;
    handleDeleteShot: (shotId: string, shotOrder: number, sceneName: string) => void;
    handleShotImageClick: (shot: Shot) => void;
}

export const StoryboardTab: React.FC<StoryboardTabProps> = ({
    shots,
    scenes,
    collapsedScenes,
    toggleSceneCollapse,
    handleAddScene,
    setShowScriptEditor,
    editingSceneId,
    editingSceneName,
    setEditingSceneName,
    handleSaveSceneName,
    handleCancelEditScene,
    handleStartEditScene,
    handleEditSceneDetails,
    handleDeleteScene,
    handleAddShotClick,
    selectedShotId,
    handleShotClick,
    openShotEditor,
    handleDeleteShot,
    handleShotImageClick,
}) => {
    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-light-text dark:text-white">
                    分镜脚本 ({shots.length} 个镜头)
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAddScene}
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-light-border dark:border-cine-border rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
                        title="添加新场景"
                    >
                        <Plus size={12} />
                        <span>添加场景</span>
                    </button>
                    {setShowScriptEditor && (
                        <button
                            onClick={() => setShowScriptEditor(true)}
                            className="flex items-center gap-1 text-xs px-2 py-1 glass-button rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                            <Edit2 size={12} />
                            <span>编辑分镜脚本</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Scene List */}
            <div className="space-y-3">
                {scenes.map((scene) => {
                    // 直接按 sceneId 取镜头，避免 shotIds 异常导致数量不一致，再按 order 排序
                    const sceneShots: Shot[] = shots
                        .filter(s => s.sceneId === scene.id)
                        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
                    const isCollapsed = collapsedScenes.has(scene.id);

                    return (
                        <div
                            key={scene.id}
                            className="glass-card rounded-xl overflow-hidden"
                        >
                            {/* Scene Header */}
                            <div className="flex items-center justify-between p-3 hover:bg-light-border/50 dark:hover:bg-cine-panel/50 transition-colors">
                                <button
                                    onClick={() => toggleSceneCollapse(scene.id)}
                                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {isCollapsed ? (
                                            <ChevronRight size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                                        ) : (
                                            <ChevronDown size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            {editingSceneId === scene.id ? (
                                                <input
                                                    type="text"
                                                    value={editingSceneName}
                                                    onChange={(e) => setEditingSceneName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        e.stopPropagation();
                                                        if (e.key === 'Enter') {
                                                            handleSaveSceneName(scene.id);
                                                        } else if (e.key === 'Escape') {
                                                            handleCancelEditScene();
                                                        }
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full text-sm font-bold glass-input rounded px-2 py-1 min-w-0"
                                                    autoFocus
                                                />
                                            ) : (
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="text-sm font-bold text-light-text dark:text-white truncate" title={scene.name}>
                                                        {scene.name}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-cine-text-muted">
                                                        <span>{sceneShots.length} 个镜头</span>
                                                        {scene.location && (
                                                            <span className="flex items-center gap-0.5 text-light-accent dark:text-cine-accent truncate">
                                                                <MapPin size={10} />
                                                                <span className="truncate">{scene.location}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>

                                <div className="flex items-center gap-1">
                                    {editingSceneId === scene.id ? (
                                        <>
                                            {/* Save Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSaveSceneName(scene.id);
                                                }}
                                                className="p-1.5 hover:bg-green-500/10 rounded transition-colors flex-shrink-0"
                                                title="保存"
                                            >
                                                <span className="text-green-500 text-xs font-bold">✓</span>
                                            </button>
                                            {/* Cancel Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCancelEditScene();
                                                }}
                                                className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                                                title="取消"
                                            >
                                                <span className="text-red-500 text-xs font-bold">✕</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {/* Rename Scene Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStartEditScene(scene.id, scene.name);
                                                }}
                                                className="p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 rounded transition-colors flex-shrink-0"
                                                title="重命名场景"
                                            >
                                                <Edit2 size={14} className="text-light-text-muted dark:text-cine-text-muted" />
                                            </button>

                                            {/* Edit Location/Details Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditSceneDetails(scene.id);
                                                }}
                                                className="p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 rounded transition-colors flex-shrink-0"
                                                title="编辑场景地点与详情"
                                            >
                                                <MapPin size={14} className="text-light-text-muted dark:text-cine-text-muted" />
                                            </button>

                                            {/* Delete Scene Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteScene(scene.id, scene.name);
                                                }}
                                                className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                                                title="删除场景"
                                            >
                                                <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted hover:text-red-500" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Shot List */}
                            {!isCollapsed && (
                                <div className="px-3 pb-3 space-y-2">
                                    {sceneShots.length === 0 ? (
                                        // 空状态：没有分镜时显示添加按钮
                                        <div className="text-center py-6">
                                            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mb-3">
                                                该场景还没有分镜
                                            </p>
                                            <button
                                                onClick={() => handleAddShotClick(scene.id, 0)}
                                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent border border-light-accent/30 dark:border-cine-accent/30 rounded-lg hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 transition-colors"
                                            >
                                                <Plus size={14} />
                                                <span>添加第一个分镜</span>
                                            </button>
                                        </div>
                                    ) : (
                                        // 有分镜时正常显示列表
                                        sceneShots
                                            .slice()
                                            .sort((a, b) => (a.order || 0) - (b.order || 0))
                                            .map((shot, idx) => (
                                                <div key={shot.id} className="relative group overflow-visible">
                                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAddShotClick(scene.id, idx);
                                                            }}
                                                            className="w-6 h-6 rounded-full bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent text-xs flex items-center justify-center shadow-sm z-20"
                                                            title="在此处插入镜头"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                    <ShotListItem
                                                        shot={shot}
                                                        isSelected={selectedShotId === shot.id}
                                                        onSelect={() => handleShotClick(shot.id)}
                                                        onEdit={() => openShotEditor(shot)}
                                                        onDelete={() => handleDeleteShot(shot.id, shot.order, scene.name)}
                                                        label={formatShotLabel(scene.order, shot.order, shot.globalOrder)}
                                                        onImageClick={() => handleShotImageClick(shot)}
                                                    />
                                                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAddShotClick(scene.id, idx + 1);
                                                            }}
                                                            className="w-6 h-6 rounded-full bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent text-xs flex items-center justify-center shadow-sm z-20"
                                                            title="在此处插入镜头"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {
                    scenes.length === 0 && (
                        <div className="text-center py-12 text-light-text-muted dark:text-cine-text-muted">
                            <Film size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm">还没有分镜</p>
                            <p className="text-xs mt-1">使用 AI 自动分镜后，这里会出现镜头</p>
                        </div>
                    )
                }
            </div >
        </div >
    );
};
