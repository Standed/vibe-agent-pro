import React from 'react';
import { Plus, Edit2, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Project, Character, Location } from '@/types/project';

interface AssetsTabProps {
    project: Project | null;
    charactersCollapsed: boolean;
    setCharactersCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setShowAddCharacterDialog: (show: boolean) => void;
    setEditingCharacter: (char: Character) => void;
    deleteCharacter: (id: string) => void;
    locationsCollapsed: boolean;
    setLocationsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setShowAddLocationDialog: (show: boolean) => void;
    setEditingLocation: (loc: Location) => void;
    deleteLocation: (id: string) => void;
}

export const AssetsTab: React.FC<AssetsTabProps> = ({
    project,
    charactersCollapsed,
    setCharactersCollapsed,
    setShowAddCharacterDialog,
    setEditingCharacter,
    deleteCharacter,
    locationsCollapsed,
    setLocationsCollapsed,
    setShowAddLocationDialog,
    setEditingLocation,
    deleteLocation,
}) => {
    return (
        <div className="p-4 space-y-6">
            {/* Characters */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={() => setCharactersCollapsed((prev) => !prev)}
                        className="flex items-center gap-2 text-sm font-bold text-light-text dark:text-white"
                    >
                        {charactersCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <span>角色 ({project?.characters.length || 0})</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowAddCharacterDialog(true)}
                            className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                        >
                            <Plus size={14} />
                            <span>添加</span>
                        </button>
                    </div>
                </div>
                {!charactersCollapsed && (
                    <div className="space-y-2">
                        {project?.characters.map((character) => (
                            <div
                                key={character.id}
                                className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-medium text-sm text-light-text dark:text-white">
                                            {character.name}
                                        </div>
                                        <div className="text-[11px] text-light-text-muted dark:text-cine-text-muted mt-0.5 line-clamp-2">
                                            {character.description || '角色描述'}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setEditingCharacter(character)}
                                            className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                                            title="编辑角色"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm(`确定删除角色「${character.name}」？`)) {
                                                    deleteCharacter(character.id);
                                                    toast.success('角色已删除');
                                                }
                                            }}
                                            className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                                            title="删除角色"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                {/* Reference Images */}
                                {character.referenceImages && character.referenceImages.length > 0 && (
                                    <div className="flex gap-1 mt-2 overflow-x-auto">
                                        {character.referenceImages.map((imageUrl, idx) => (
                                            <div
                                                key={idx}
                                                className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                                            >
                                                <img
                                                    src={imageUrl}
                                                    alt={`${character.name} 参考图 ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!project?.characters || project.characters.length === 0) && (
                            <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                                暂无角色
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Locations */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={() => setLocationsCollapsed((prev) => !prev)}
                        className="flex items-center gap-2 text-sm font-bold text-light-text dark:text-white"
                    >
                        {locationsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <span>场景地点 ({project?.locations.length || 0})</span>
                    </button>
                    <button
                        onClick={() => setShowAddLocationDialog(true)}
                        className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                    >
                        <Plus size={14} />
                        <span>添加</span>
                    </button>
                </div>
                {!locationsCollapsed && (
                    <div className="space-y-2">
                        {project?.locations.map((location) => (
                            <div
                                key={location.id}
                                className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-medium text-sm text-light-text dark:text-white">
                                            {location.name}
                                        </div>
                                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                                            {location.type === 'interior' ? '室内' : '室外'}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setEditingLocation(location)}
                                            className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                                            title="编辑场景"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm(`确定删除场景地点「${location.name}」？`)) {
                                                    deleteLocation(location.id);
                                                    toast.success('场景地点已删除');
                                                }
                                            }}
                                            className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                                            title="删除场景"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                {/* Reference Images */}
                                {location.referenceImages && location.referenceImages.length > 0 && (
                                    <div className="flex gap-1 mt-2 overflow-x-auto">
                                        {location.referenceImages.map((imageUrl, idx) => (
                                            <div
                                                key={idx}
                                                className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                                            >
                                                <img
                                                    src={imageUrl}
                                                    alt={`${location.name} 参考图 ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!project?.locations || project.locations.length === 0) && (
                            <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                                暂无场景地点
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Audio (Coming Soon) */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-light-text-muted dark:text-cine-text-muted opacity-50">
                        音频（后期功能）
                    </h3>
                </div>
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4 opacity-50">
                    音频功能即将上线
                </div>
            </div>
        </div>
    );
};
