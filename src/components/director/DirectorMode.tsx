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
import { useAIStoryboard } from '@/hooks/generation/useAIStoryboard';
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

    // --- UI Helpers ---
    const isSidebarVisible = true; // For now fix it, or add state to toggle

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex flex-row bg-[#f9f9f9] dark:bg-[#111] text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300">

            {/* --- TOP BAR (MOBILE ONLY) --- */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 z-[60] flex items-center justify-between px-4">
                <h2 className="font-bold flex items-center gap-2">
                    <LayoutList size={18} />
                    导演模式
                </h2>
                <button onClick={onClose}><X size={24} /></button>
            </div>

            {/* --- DESKTOP EXIT --- */}
            <button
                onClick={onClose}
                className="hidden md:flex fixed top-6 right-6 z-[70] w-10 h-10 items-center justify-center seko-button hover:bg-red-500 hover:text-white dark:hover:bg-red-500 dark:hover:text-white hover:border-red-500 shadow-lg"
                title="退出导演模式"
            >
                <X size={20} strokeWidth={2.5} />
            </button>

            {/* --- LEFT: IMMERSIVE SCRIPT EDITOR (PAPER) --- */}
            <div className="flex-1 h-full overflow-hidden relative flex flex-col">
                {/* Scrollable Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center pt-20 pb-32 px-4 md:px-0 scroll-smooth">

                    {/* The "Paper" */}
                    <div
                        className="relative w-full max-w-3xl bg-white dark:bg-[#1a1a1a] shadow-sm border border-gray-200 dark:border-white/5 rounded-[4px] min-h-[90vh] transition-colors duration-300 flex flex-col group/paper"
                        onClick={() => textareaRef.current?.focus()}
                    >
                        {/* Header within paper (subtle) */}
                        <div className="px-12 py-8 flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity select-none border-b border-dashed border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-gray-400">
                                <LayoutList size={14} />
                                <span>剧本草稿 v1.0</span>
                            </div>
                            <div className="text-xs font-mono text-gray-400">
                                {scriptContent.length} 字
                            </div>
                        </div>

                        <textarea
                            ref={textareaRef}
                            className="flex-1 w-full bg-transparent resize-none focus:outline-none font-mono text-lg md:text-xl leading-loose text-gray-800 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-700 selection:bg-indigo-500/20 px-12 py-8"
                            placeholder="# 输入场景标题...&#10;&#10;动作描写（ACTION）描述画面内容...&#10;&#10;角包名称（CHARACTER）居中..."
                            value={scriptContent}
                            onChange={handleScriptChange}
                            spellCheck={false}
                        />

                        {/* Mention Popover (Floating) */}
                        {mentionState.isOpen && (
                            <div
                                className="fixed z-[80] w-72 seko-popover overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                    top: mentionState.position.top,
                                    left: mentionState.position.left,
                                    maxHeight: '320px',
                                }}
                            >
                                <div className="px-4 py-2 bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-wider backdrop-blur-sm">
                                    提及角色 (Mention)
                                </div>
                                <div className="max-h-64 overflow-y-auto p-1.5 custom-scrollbar">
                                    {filteredCharacters.length > 0 ? (
                                        filteredCharacters.map(char => (
                                            <button
                                                key={char.id}
                                                onClick={() => insertCharacter(char.name)}
                                                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/10 transition-all group"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden relative border border-black/5 dark:border-white/10 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                                    {char.referenceImages && char.referenceImages[0] ? (
                                                        <img src={char.referenceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">{char.name[0]}</div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-gray-700 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                                        {char.name}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity font-mono">选择</span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-3 py-6 text-center text-gray-400 text-xs">
                                            暂无匹配角色
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Space for comfortable typing at end */}
                    <div className="h-32 w-full" />
                </div>
            </div>

            {/* --- RIGHT: FLOATING SIDEBAR (BREAKDOWN) --- */}
            <div className="hidden md:flex flex-col w-[350px] m-6 ml-0 mt-20 mb-6 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/5 rounded-2xl relative z-40 overflow-hidden shadow-xl">
                {/* Board Header */}
                <div className="h-14 px-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white/50 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <Wand2 size={16} className="text-indigo-500" />
                        <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">AI 拆解面板</h3>
                    </div>
                    <div className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-mono border border-indigo-500/20">
                        PRO
                    </div>
                </div>

                {/* Board Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    {(!project?.characters || project.characters.length === 0) && (!project?.scenes || project.scenes.length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4 opacity-60">
                            <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                                <Wand2 size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium">智能解析</p>
                                <p className="text-xs mt-1 max-w-[200px] mx-auto opacity-70">开始编写剧本，点击分析即可自动提取场景和角色。</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* CHARACTERS */}
                            <section>
                                <h4 className="flex items-center justify-between mb-3 px-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Users size={12} /> 角色 ({project?.characters?.length || 0})
                                    </span>
                                </h4>
                                <div className="space-y-2">
                                    {(project?.characters || []).map(char => (
                                        <div
                                            key={char.id}
                                            onClick={() => setEditingCharacterId(char.id)}
                                            className="group relative p-2 rounded-xl bg-gray-50 dark:bg-white/5 border border-transparent hover:bg-white/80 dark:hover:bg-white/10 hover:border-gray-200 dark:hover:border-white/10 transition-all cursor-pointer flex items-center gap-3 overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden border border-black/5 dark:border-white/5 shrink-0 shadow-sm relative z-10">
                                                {char.referenceImages && char.referenceImages[0] ? (
                                                    <img src={char.referenceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs font-bold opacity-50">{char.name[0]}</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 relative z-10">
                                                <div className="text-xs font-bold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                    {char.name}
                                                </div>
                                                <div className="text-[10px] text-gray-400 truncate pr-4">{char.description || '无描述'}</div>
                                            </div>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/40">
                                                    <Wand2 size={10} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* SCENES */}
                            <section>
                                <h4 className="flex items-center justify-between mb-3 px-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <MapPin size={12} /> 场景列表 ({project?.scenes?.length || 0})
                                    </span>
                                </h4>
                                <div className="space-y-2">
                                    {(project?.scenes || []).map(scene => (
                                        <div
                                            key={scene.id}
                                            onClick={() => setEditingSceneId(scene.id)}
                                            className="group p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-transparent hover:bg-white/80 dark:hover:bg-white/10 hover:border-gray-200 dark:hover:border-white/10 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate flex-1">{scene.name}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-2 pl-3.5 border-l border-black/5 dark:border-white/5 group-hover:border-emerald-500/30 transition-colors">
                                                {scene.description || '该场景暂无描述。'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-white/20 dark:bg-black/20 backdrop-blur-md border-t border-black/5 dark:border-white/5">
                    <button
                        className="w-full py-3.5 seko-button-primary rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Play size={16} className="fill-current group-hover:scale-110 transition-transform" />
                        )}
                        <span>{isGenerating ? 'AI 解析生成中...' : '生成 AI 分镜'}</span>
                    </button>
                    <div className="mt-2 flex items-center justify-center gap-1.5 opacity-50">
                        <span className="w-1 h-1 rounded-full bg-gray-500" />
                        基于 <span className="text-[9px] uppercase tracking-wider font-medium font-mono text-gray-500">Gemini 3 Pro</span> 剧本分析与分镜拆解
                    </div>
                </div>
            </div>

            {/* --- DIALOGS (Existing) --- */}
            {editingCharacterId && editingCharacter && (
                <AddCharacterDialog
                    onClose={() => setEditingCharacterId(null)}
                    initialCharacter={editingCharacter}
                    onAdd={async (char, options) => {
                        await updateCharacter(char.id, char, options);
                        if (!options?.keepOpen) setEditingCharacterId(null);
                    }}
                    mode="edit"
                    projectId={project?.id}
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
