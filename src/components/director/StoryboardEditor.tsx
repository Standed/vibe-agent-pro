'use client';

import { useState } from 'react';
import { Project, Shot } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { Edit3, Check, X, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoryboardEditorProps {
    project: Project;
    isProcessing?: boolean;
}

export default function StoryboardEditor({ project, isProcessing }: StoryboardEditorProps) {
    const { updateShot } = useProjectStore();
    const [editingShotId, setEditingShotId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleStartEdit = (shot: Shot) => {
        if (isProcessing) return;
        setEditingShotId(shot.id);
        setEditValue(shot.description || '');
    };

    const handleSave = (shotId: string) => {
        updateShot(shotId, { description: editValue });
        setEditingShotId(null);
    };

    const handleCancel = () => {
        setEditingShotId(null);
    };

    if (!project.scenes || project.scenes.length === 0) {
        return (
            <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 bg-zinc-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Film size={20} className="text-zinc-300 dark:text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-400">暂无分镜内容，请先生成</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {project.scenes.map((scene, sceneIdx) => (
                <div key={scene.id} className="space-y-3">
                    <div className="flex items-center gap-2 px-2">
                        <div className="w-1 h-4 bg-light-accent dark:bg-cine-accent rounded-full" />
                        <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                            Scene {sceneIdx + 1}: {scene.name}
                        </h4>
                    </div>
                    <div className="grid gap-2">
                        {project.shots
                            ?.filter(shot => shot.sceneId === scene.id)
                            .sort((a, b) => a.order - b.order)
                            .map((shot, shotIdx) => (
                                <div
                                    key={shot.id}
                                    className={cn(
                                        "p-3 bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 transition-all group",
                                        editingShotId === shot.id ? "ring-2 ring-light-accent/20 dark:ring-cine-accent/20 border-light-accent/30 dark:border-cine-accent/30" : "hover:border-light-accent/30 dark:hover:border-cine-accent/30"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">
                                            {shotIdx + 1}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] font-bold text-light-accent dark:text-cine-accent uppercase tracking-tighter">
                                                    {shot.shotSize} • {shot.cameraMovement}
                                                </div>
                                                {!editingShotId && !isProcessing && (
                                                    <button
                                                        onClick={() => handleStartEdit(shot)}
                                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 transition-all"
                                                    >
                                                        <Edit3 size={12} />
                                                    </button>
                                                )}
                                            </div>

                                            {editingShotId === shot.id ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        autoFocus
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        className="w-full p-2 text-xs bg-zinc-50 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-lg focus:outline-none resize-none min-h-[60px] custom-scrollbar"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={handleCancel}
                                                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleSave(shot.id)}
                                                            className="p-1.5 rounded-lg bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent hover:bg-light-accent dark:hover:bg-cine-accent hover:text-white transition-all"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                                    {shot.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            ))}
        </div>
    );
}
