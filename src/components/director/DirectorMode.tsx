'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Wand2,
    Users,
    MapPin,
    LayoutList,
    Loader2,
    Play,
    X,
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { useAIStoryboard } from '@/hooks/useAIStoryboard';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';

interface DirectorModeProps {
    isOpen: boolean;
    onClose: () => void;
}

// Helper to get caret coordinates
const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
    const div = document.createElement('div');
    const style = getComputedStyle(element);

    Array.from(style).forEach((prop) => {
        div.style.setProperty(prop, style.getPropertyValue(prop));
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.overflow = 'hidden';

    div.textContent = element.value.substring(0, position);

    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    document.body.appendChild(div);

    const coordinates = {
        top: span.offsetTop + parseInt(style.borderTopWidth),
        left: span.offsetLeft + parseInt(style.borderLeftWidth),
        height: parseInt(style.lineHeight)
    };

    document.body.removeChild(div);
    return coordinates;
};

export default function DirectorMode({ isOpen, onClose }: DirectorModeProps) {
    const {
        project,
        updateScript,
        updateCharacter,
        addLocation,
        updateLocation
    } = useProjectStore();
    const [scriptContent, setScriptContent] = useState(project?.script || '');
    const [mounted, setMounted] = useState(false);

    // Edit State
    const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
    const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

    // Core AI Storyboard Logic
    const { isGenerating, handleAIStoryboard } = useAIStoryboard();

    // Auto-save script buffer
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Mention State
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mentionState, setMentionState] = useState<{
        isOpen: boolean;
        query: string;
        position: { top: number; left: number };
        index: number; // caret index of @
    }>({ isOpen: false, query: '', position: { top: 0, left: 0 }, index: -1 });

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        setScriptContent(project?.script || '');
    }, [project?.script]);

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newVal = e.target.value;
        setScriptContent(newVal);

        // Debounced save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (project) {
                updateScript(newVal);
            }
        }, 2000);

        // Mention Logic Check
        const selectionStart = e.target.selectionStart;
        const lastChar = newVal[selectionStart - 1]; // Character just typed (or current)

        // Simple heuristic: if we just typed '@', open menu
        if (lastChar === '@') {
            const coords = getCaretCoordinates(e.target, selectionStart);
            const rect = e.target.getBoundingClientRect();
            setMentionState({
                isOpen: true,
                query: '',
                position: {
                    top: rect.top + coords.top + 24, // + line height
                    left: rect.left + coords.left
                },
                index: selectionStart
            });
        }
        else if (mentionState.isOpen) {
            // Check if we should close or update query
            // Find distance from @
            const dist = selectionStart - mentionState.index;
            if (dist < 0 || dist > 20 || /\s/.test(newVal.slice(mentionState.index, selectionStart))) {
                // Closed if space typed or cursor moved back before @ or query too long
                setMentionState(prev => ({ ...prev, isOpen: false }));
            } else {
                setMentionState(prev => ({
                    ...prev,
                    query: newVal.slice(mentionState.index, selectionStart)
                }));
            }
        }
    };

    const insertCharacter = (charName: string) => {
        if (!textareaRef.current) return;

        const before = scriptContent.substring(0, mentionState.index); // Up to @
        // const query = mentionState.query; 
        // We replace '@query' with 'Name '
        // mentionState.index is after '@'. Wait, initial logic:
        // If I typed '@', index is 1 (if start). 
        // Logic above: index = selectionStart (which is AFTER @).

        // Correct Logic:
        // text: "Hello @" -> input '@' -> index is length.
        // We want to replace everything from (index - 1) to (index + queryLength)

        const startPos = mentionState.index - 1; // Position of '@'
        const endPos = mentionState.index + mentionState.query.length;

        const after = scriptContent.substring(endPos);

        const newText = scriptContent.substring(0, startPos) + charName + ' ' + after;

        setScriptContent(newText);
        updateScript(newText);
        setMentionState(prev => ({ ...prev, isOpen: false }));

        // Restore focus and cursor
        setTimeout(() => {
            textareaRef.current?.focus();
            const newCursorPos = startPos + charName.length + 1;
            textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const handleGenerate = async () => {
        if (!scriptContent.trim()) {
            toast.error('请先输入剧本内容');
            return;
        }
        // Save immediately before generation
        if (project) {
            updateScript(scriptContent);
        }
        await handleAIStoryboard();
    };

    // --- Data Prep for Dialogs ---
    const editingCharacter = project?.characters.find(c => c.id === editingCharacterId);

    // Logic for Scene Editing:
    // We try to find a matching Location Asset by name. If found, we edit THAT.
    // If not, we create a pseudo-location from the scene to prepopulate the 'Add Location' dialog.
    const editingScene = project?.scenes.find(s => s.id === editingSceneId);
    const linkedLocation = editingScene
        ? project?.locations.find(l =>
            l.name.toLowerCase() === (editingScene.location || editingScene.name).toLowerCase()
        )
        : undefined;

    const initialLocationData = linkedLocation || (editingScene ? {
        id: '', // Will be ignored by AddLocationDialog fallback ID generation if empty/undefined check passes, or we rely on 'add' mode
        name: editingScene.location || editingScene.name,
        description: editingScene.description,
        type: 'interior',
        referenceImages: []
    } : undefined);

    const filteredCharacters = (project?.characters || []).filter(c =>
        c.name.toLowerCase().includes(mentionState.query.toLowerCase())
    );

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#0c0c0e] dark:bg-[#0c0c0e] bg-white text-gray-900 dark:text-gray-100 overflow-hidden font-sans transition-colors duration-200">
            {/* --- TOP BAR (MOBILE) --- */}
            <div className="md:hidden flex items-center justify-between p-4 bg-gray-50 dark:bg-[#18181b] border-b border-gray-200 dark:border-[#27272a]">
                <h2 className="font-bold flex items-center gap-2">
                    <LayoutList size={18} className="text-gray-900 dark:text-white" />
                    导演模式 (Director Mode)
                </h2>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                    <X size={24} />
                </button>
            </div>

            {/* --- EXIT BUTTON (DESKTOP) --- */}
            <button
                onClick={onClose}
                className="hidden md:flex absolute top-5 right-6 z-[60] bg-black/10 hover:bg-black/20 dark:bg-black/40 dark:hover:bg-black/60 text-gray-600 hover:text-gray-900 dark:text-white/50 dark:hover:text-white p-2 rounded-full transition-all backdrop-blur-md border border-black/5 hover:border-black/10 dark:border-white/5 dark:hover:border-white/10"
                title="退出导演模式"
            >
                <X size={20} />
            </button>

            {/* --- LEFT COL: SCRIPT EDITOR --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative group">
                {/* TOOLBAR */}
                <div className="h-16 px-6 border-b border-gray-200 dark:border-[#27272a] bg-gray-50 dark:bg-[#0c0c0e] flex items-center justify-between shrink-0 z-20 transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-800 dark:text-white/90">
                            <LayoutList size={20} className="text-indigo-600 dark:text-indigo-500" />
                            <h3 className="font-semibold text-lg tracking-tight">剧本编辑器 (Script Editor)</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 mr-12">
                        <button
                            onClick={() => {
                                useProjectStore.getState().setControlMode('agent');
                                if (useProjectStore.getState().rightSidebarCollapsed) {
                                    useProjectStore.getState().toggleRightSidebar();
                                }
                                onClose();
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-sm font-bold transition-all"
                        >
                            <Wand2 size={16} />
                            <span>AI 助手</span>
                        </button>
                    </div>
                </div>

                {/* EDITOR AREA */}
                <div className="flex-1 relative bg-white dark:bg-[#0c0c0e] transition-colors">
                    <textarea
                        ref={textareaRef}
                        className="w-full h-full p-8 md:p-12 bg-transparent resize-none focus:outline-none font-mono text-base md:text-lg leading-loose text-gray-800 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-700 selection:bg-indigo-500/30"
                        placeholder="# 第一集：开端&#10;&#10;场景：赛博网吧 - 夜晚&#10;&#10;霓虹灯光在湿润的路面上反射。杰克（30岁，粗犷）坐在终端前，手指全息键盘上飞舞..."
                        value={scriptContent}
                        onChange={handleScriptChange}
                        spellCheck={false}
                    />
                    {/* Floating Word Count */}
                    <div className="absolute bottom-4 right-6 text-xs text-gray-400 dark:text-gray-600 font-mono pointer-events-none select-none">
                        {scriptContent.length} 字
                    </div>

                    {/* Mention Dropdown */}
                    {mentionState.isOpen && (
                        <div
                            className="absolute z-50 w-64 bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#3f3f46] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                            style={{
                                top: mentionState.position.top,
                                left: mentionState.position.left,
                                maxHeight: '300px',
                            }}
                        >
                            <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-[#141417] border-b border-gray-200 dark:border-[#27272a]">
                                提及角色
                            </div>
                            <div className="max-h-60 overflow-y-auto p-1">
                                {filteredCharacters.length > 0 ? (
                                    filteredCharacters.map(char => (
                                        <button
                                            key={char.id}
                                            onClick={() => insertCharacter(char.name)}
                                            className="w-full text-left px-3 py-2 rounded flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-[#27272a] transition-colors group"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-[#27272a] overflow-hidden relative border border-black/5 dark:border-white/5 shrink-0">
                                                {char.referenceImages && char.referenceImages[0] ? (
                                                    <img src={char.referenceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-[10px] font-bold">{char.name[0]}</div>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white">{char.name}</div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-3 py-4 text-center text-gray-500 text-xs">
                                        无匹配角色
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- RIGHT COL: BREAKDOWN BOARD --- */}
            <div className="w-full md:w-[420px] bg-gray-50 dark:bg-[#111111] border-l border-gray-200 dark:border-[#27272a] flex flex-col shadow-2xl relative z-30 transition-colors">
                {/* BOARD HEADER */}
                <div className="h-16 px-6 border-b border-gray-200 dark:border-[#27272a] flex items-center justify-between shrink-0 bg-gray-100 dark:bg-[#141417]">
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">AI 智能分镜</h3>
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">自动提取角色与场景</p>
                    </div>
                    {/* Visual decoration */}
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/40 animate-pulse"></div>
                    </div>
                </div>

                {/* BOARD CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    {(!project?.characters || project.characters.length === 0) && (!project?.scenes || project.scenes.length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                            <Wand2 size={48} className="text-indigo-200 dark:text-indigo-500/20" />
                            <div>
                                <p className="text-sm text-gray-400">暂无资产数据</p>
                                <p className="text-xs mt-1">输入剧本并点击生成，AI 将自动分析提取</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* CHARACTERS */}
                            <section>
                                <h4 className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Users size={14} /> 角色列表 (Cast)
                                    </span>
                                    <span className="bg-gray-200 dark:bg-[#27272a] text-gray-600 dark:text-gray-300 text-[10px] font-mono px-2 py-0.5 rounded">
                                        {project?.characters?.length || 0}
                                    </span>
                                </h4>

                                <div className="space-y-3">
                                    {(project?.characters || []).map(char => (
                                        <div
                                            key={char.id}
                                            onClick={() => setEditingCharacterId(char.id)}
                                            className="group p-3 rounded-lg bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3 shadow-sm dark:shadow-none cursor-pointer"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-[#27272a] overflow-hidden relative border border-black/5 dark:border-white/5">
                                                {char.referenceImages && char.referenceImages[0] ? (
                                                    <img src={char.referenceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs font-bold">{char.name[0]}</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                    {char.name}
                                                </div>
                                                <div className="text-[10px] text-gray-500 truncate">{char.description || '无描述'}</div>
                                            </div>
                                            <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded ml-auto opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">编辑</span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* SCENES */}
                            <section>
                                <h4 className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> 场景列表 (Locations)
                                    </span>
                                    <span className="bg-gray-200 dark:bg-[#27272a] text-gray-600 dark:text-gray-300 text-[10px] font-mono px-2 py-0.5 rounded">
                                        {project?.scenes?.length || 0}
                                    </span>
                                </h4>

                                <div className="space-y-3">
                                    {(project?.scenes || []).map(scene => (
                                        <div
                                            key={scene.id}
                                            onClick={() => setEditingSceneId(scene.id)}
                                            className="p-4 rounded-lg bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all group shadow-sm dark:shadow-none cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
                                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{scene.name}</span>
                                                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded ml-auto opacity-0 group-hover:opacity-100 transition-opacity">编辑</span>
                                            </div>
                                            <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-200 dark:border-[#27272a] pl-3 py-0.5 group-hover:border-indigo-300 dark:group-hover:border-indigo-700 transition-colors">
                                                {scene.description || '无场景描述'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* BOARD FOOTER (ACTION) */}
                <div className="p-6 bg-gray-100 dark:bg-[#141417] border-t border-gray-200 dark:border-[#27272a]">
                    <div className="flex justify-between items-center mb-4 text-[10px] font-mono uppercase tracking-wider text-gray-500">
                        <span> 预计消耗: <span className="text-gray-700 dark:text-gray-300">2 积分</span></span>
                        <span> 模型: <span className="text-gray-700 dark:text-gray-300">Gemini 3 Pro</span></span>
                    </div>

                    <button
                        className="w-full py-4 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 active:scale-[0.98] text-white dark:text-black font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg dark:shadow-[0_0_20px_rgba(255,255,255,0.1)] group disabled:opacity-70 disabled:cursor-not-allowed"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <Loader2 size={16} className="animate-spin text-white dark:text-black" />
                        ) : (
                            <Play size={16} className="fill-white dark:fill-black group-hover:scale-110 transition-transform" />
                        )}
                        <span>{isGenerating ? 'AI 解析生成中...' : '生成 AI 分镜 (Generate Storyboard)'}</span>
                    </button>

                    <div className="mt-3 text-[10px] text-center text-gray-500 dark:text-gray-600">
                        基于 <span className="text-gray-700 dark:text-gray-400 font-semibold">Gemini 3 Pro</span> 剧本分析与分镜拆解
                    </div>
                </div>
            </div>

            {/* --- DIALOGS --- */}
            {editingCharacterId && editingCharacter && (
                <AddCharacterDialog
                    onClose={() => setEditingCharacterId(null)}
                    initialCharacter={editingCharacter}
                    onAdd={(char, options) => {
                        updateCharacter(char.id, char);
                        if (!options?.keepOpen) setEditingCharacterId(null);
                    }}
                    mode="edit"
                />
            )}

            {editingSceneId && initialLocationData && (
                <AddLocationDialog
                    onClose={() => setEditingSceneId(null)}
                    initialLocation={initialLocationData as any}
                    onAdd={(loc) => {
                        if (linkedLocation) {
                            updateLocation(linkedLocation.id, loc);
                        } else {
                            addLocation(loc);
                        }
                        setEditingSceneId(null);
                    }}
                    mode={linkedLocation ? "edit" : "add"}
                />
            )}
        </div>,
        document.body
    );
}
