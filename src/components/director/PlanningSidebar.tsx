'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText,
    Film,
    Users,
    MapPin,
    Plus,
    Edit3,
    Trash2,
    ChevronLeft,
    Home,
    Settings,
    ArrowRight,
    Sparkles,
    X,
    Loader2,
    Layout,
    Clock
} from 'lucide-react';
import { Project, Character, Location, Shot, Scene, ShotSize, CameraMovement } from '@/types/project';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';
import { StoryboardTab } from '@/components/layout/sidebar/StoryboardTab';
import { useProjectStore } from '@/store/useProjectStore';
import { ShotEditor } from '@/components/layout/sidebar/ShotEditor';

interface PlanningSidebarProps {
    project: Project;
    activeTab: 'script' | 'storyboard' | 'characters' | 'locations';
    setActiveTab: (tab: 'script' | 'storyboard' | 'characters' | 'locations') => void;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    showHomeButton?: boolean;
    onClose?: () => void;
    updateScript: (script: string) => void;
    onAddCharacter: () => void;
    onEditCharacter: (char: Character) => void;
    onDeleteCharacter: (id: string, name: string) => void;
    onAddLocation: () => void;
    onEditLocation: (loc: Location) => void;
    onDeleteLocation: (id: string, name: string) => void;
    isProcessing?: boolean;
    mentionState: any;
    insertMention: (name: string) => void;
    handleScriptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    activeView?: 'planning' | 'canvas' | 'timeline' | 'drafts';
}

export default function PlanningSidebar({
    project,
    activeTab,
    setActiveTab,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    showHomeButton = true,
    onClose,
    updateScript,
    onAddCharacter,
    onEditCharacter,
    onDeleteCharacter,
    onAddLocation,
    onEditLocation,
    onDeleteLocation,
    isProcessing,
    mentionState,
    insertMention,
    handleScriptChange,
    textareaRef,
    activeView = 'planning',
}: PlanningSidebarProps) {
    const {
        addScene,
        addShot,
        deleteShot,
        deleteScene,
        updateScene,
        reorderShots,
        selectShot,
        updateShot,
        setControlMode,
        toggleRightSidebar,
        isSaving
    } = useProjectStore();

    const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
    const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
    const [editingSceneName, setEditingSceneName] = useState<string>('');
    const [editingShot, setEditingShot] = useState<Shot | null>(null);
    const [shotForm, setShotForm] = useState<{
        description: string;
        narration: string;
        dialogue: string;
        shotSize: ShotSize | '';
        cameraMovement: CameraMovement | '';
        duration: number;
    }>({
        description: '',
        narration: '',
        dialogue: '',
        shotSize: '',
        cameraMovement: '',
        duration: 3,
    });

    const tabs = [
        { id: 'script', label: '剧本', icon: FileText },
        { id: 'storyboard', label: '分镜', icon: Film },
        { id: 'characters', label: '角色', icon: Users },
        { id: 'locations', label: '场景', icon: MapPin },
    ] as const;

    const toggleSceneCollapse = (sceneId: string) => {
        setCollapsedScenes((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(sceneId)) newSet.delete(sceneId);
            else newSet.add(sceneId);
            return newSet;
        });
    };

    const openShotEditor = (shot: Shot) => {
        setEditingShot(shot);
        setShotForm({
            description: shot.description || '',
            narration: shot.narration || '',
            dialogue: shot.dialogue || '',
            shotSize: shot.shotSize || '',
            cameraMovement: shot.cameraMovement || '',
            duration: shot.duration || 3,
        });
    };

    const saveShotEdit = () => {
        if (!editingShot) return;
        updateShot(editingShot.id, {
            ...shotForm,
            shotSize: shotForm.shotSize as ShotSize,
            cameraMovement: shotForm.cameraMovement as CameraMovement,
        });
        setEditingShot(null);
        toast.success('分镜已更新');
    };

    return (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 flex items-center gap-4 pointer-events-none">
            {/* Floating Icon Bar */}
            <div className="flex flex-col items-center p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-full border border-black/5 dark:border-white/10 shadow-2xl pointer-events-auto">
                {showHomeButton && (
                    <Link href="/" className="mb-2 group">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg border border-black/5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 overflow-hidden">
                            <img
                                src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                                alt="Logo"
                                className="w-7 h-7 object-contain"
                            />
                        </div>
                    </Link>
                )}

                <div className="w-8 h-px bg-black/5 dark:bg-white/10 my-2" />

                {/* Tab Switcher */}
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            if (activeTab === tab.id && !isSidebarCollapsed) {
                                setIsSidebarCollapsed(true);
                            } else {
                                setActiveTab(tab.id);
                                setIsSidebarCollapsed(false);
                            }
                        }}
                        className={cn(
                            "p-3 rounded-full transition-all duration-300 mb-1 group relative",
                            activeTab === tab.id && !isSidebarCollapsed
                                ? "bg-light-accent dark:bg-cine-accent text-white dark:text-black shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20"
                                : "text-zinc-400 dark:text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-zinc-200"
                        )}
                        title={tab.label}
                    >
                        <tab.icon size={20} strokeWidth={activeTab === tab.id && !isSidebarCollapsed ? 2.5 : 2} />
                        {/* Tooltip */}
                        <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[60]">
                            {tab.label}
                        </div>
                    </button>
                ))}

                <div className="w-8 h-px bg-black/5 dark:bg-white/10 my-2" />

                <button className="p-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 mt-auto">
                    <Settings size={20} />
                </button>
            </div>

            {/* Content Panel */}
            <AnimatePresence>
                {!isSidebarCollapsed && (
                    <motion.div
                        initial={{ opacity: 0, x: -20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -20, scale: 0.95 }}
                        className="w-[400px] h-[80vh] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-[32px] border border-black/5 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col pointer-events-auto self-center"
                    >
                        {/* Panel Header */}
                        <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-zinc-900 dark:text-white tracking-tight uppercase">
                                    {tabs.find(t => t.id === activeTab)?.label}
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    {isSaving && (
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10">
                                            <Loader2 size={10} className="animate-spin text-light-accent dark:text-cine-accent" />
                                            <span className="text-[8px] font-bold text-light-accent dark:text-cine-accent uppercase">Saving</span>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-zinc-500 font-medium">
                                        {activeTab === 'script' && `${project.script?.length || 0} 字剧本`}
                                        {activeTab === 'storyboard' && `${project.shots?.length || 0} 个镜头`}
                                        {activeTab === 'characters' && `${project.characters.length} 个角色`}
                                        {activeTab === 'locations' && `${project.locations.length} 个场景`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsSidebarCollapsed(true)}
                                className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            >
                                <X size={18} className="text-zinc-400" />
                            </button>
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <AnimatePresence mode="wait">
                                {activeTab === 'script' && (
                                    <motion.div
                                        key="script"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-6 space-y-4"
                                    >
                                        <div className="relative group">
                                            <textarea
                                                ref={textareaRef}
                                                value={project.script || ''}
                                                onChange={handleScriptChange}
                                                disabled={isProcessing}
                                                placeholder="描述你的创意，或者让 AI 帮你完善... (@ 引用资源)"
                                                className="w-full h-[55vh] p-4 text-sm leading-relaxed bg-zinc-50 dark:bg-black/40 text-zinc-900 dark:text-zinc-100 border border-black/5 dark:border-white/5 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 transition-all custom-scrollbar disabled:opacity-50"
                                            />

                                            {/* Mention Menu */}
                                            {mentionState.isOpen && (
                                                <div
                                                    className="fixed z-[100] w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                                                    style={{
                                                        top: mentionState.position.top,
                                                        left: mentionState.position.left
                                                    }}
                                                >
                                                    <div className="p-2 border-b border-black/5 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">引用资源</span>
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                        {[...project.characters, ...project.locations]
                                                            .filter(item => item.name.toLowerCase().includes(mentionState.query.toLowerCase()))
                                                            .map((item, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => insertMention(item.name)}
                                                                    className="w-full px-4 py-2 text-left text-xs hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 hover:text-light-accent dark:hover:text-cine-accent transition-colors flex items-center gap-2"
                                                                >
                                                                    {'role' in item ? <Users size={12} /> : <MapPin size={12} />}
                                                                    <span className="font-bold">{item.name}</span>
                                                                </button>
                                                            ))
                                                        }
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'storyboard' && (
                                    <motion.div
                                        key="storyboard"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                    >
                                        <StoryboardTab
                                            shots={project.shots}
                                            scenes={project.scenes}
                                            collapsedScenes={collapsedScenes}
                                            toggleSceneCollapse={toggleSceneCollapse}
                                            handleAddScene={() => {
                                                const order = project.scenes.length + 1;
                                                addScene({
                                                    id: crypto.randomUUID(),
                                                    name: `场景 ${order}`,
                                                    location: '',
                                                    description: '',
                                                    shotIds: [],
                                                    position: { x: order * 200, y: 100 },
                                                    order,
                                                    status: 'draft',
                                                    created: new Date(),
                                                    modified: new Date(),
                                                });
                                            }}
                                            setShowScriptEditor={() => { }}
                                            editingSceneId={editingSceneId}
                                            editingSceneName={editingSceneName}
                                            setEditingSceneName={setEditingSceneName}
                                            handleSaveSceneName={(id) => {
                                                updateScene(id, { name: editingSceneName });
                                                setEditingSceneId(null);
                                            }}
                                            handleCancelEditScene={() => setEditingSceneId(null)}
                                            handleStartEditScene={(id, name) => {
                                                setEditingSceneId(id);
                                                setEditingSceneName(name);
                                            }}
                                            handleEditSceneDetails={(id) => {
                                                const scene = project.scenes.find(s => s.id === id);
                                                if (scene) {
                                                    setEditingSceneId(id);
                                                    setEditingSceneName(scene.name);
                                                }
                                            }}
                                            handleDeleteScene={(id) => deleteScene(id)}
                                            handleAddShotClick={(sceneId, index) => {
                                                const newShot = {
                                                    id: crypto.randomUUID(),
                                                    sceneId,
                                                    description: '',
                                                    order: (index ?? 0) + 1,
                                                    status: 'draft' as const,
                                                };
                                                addShot(newShot);
                                            }}
                                            selectedShotId={null}
                                            handleShotClick={(id) => selectShot(id)}
                                            openShotEditor={openShotEditor}
                                            handleDeleteShot={(id) => deleteShot(id)}
                                            handleShotImageClick={(shot) => {
                                                selectShot(shot.id);
                                                setControlMode('pro');
                                                toggleRightSidebar();
                                            }}
                                        />
                                    </motion.div>
                                )}

                                {activeTab === 'characters' && (
                                    <motion.div
                                        key="characters"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-6 space-y-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">角色资产</h3>
                                            <button
                                                onClick={onAddCharacter}
                                                className="p-2 rounded-xl bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent hover:bg-light-accent dark:hover:bg-cine-accent hover:text-white transition-all"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <div className="grid gap-3">
                                            {project.characters.map((char) => (
                                                <div
                                                    key={char.id}
                                                    className="group p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 hover:border-light-accent/30 dark:hover:border-cine-accent/30 transition-all"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                                                                {char.name}
                                                            </div>
                                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                                                                {char.description || '暂无描述'}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => onEditCharacter(char)}
                                                                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-light-accent dark:hover:text-cine-accent"
                                                            >
                                                                <Edit3 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => onDeleteCharacter(char.id, char.name)}
                                                                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-red-500"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {char.referenceImages && char.referenceImages.length > 0 && (
                                                        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                                                            {char.referenceImages.map((img, idx) => (
                                                                <div key={idx} className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-white/5 overflow-hidden shrink-0 border border-black/5 dark:border-white/5">
                                                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'locations' && (
                                    <motion.div
                                        key="locations"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-6 space-y-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">场景资产</h3>
                                            <button
                                                onClick={onAddLocation}
                                                className="p-2 rounded-xl bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent hover:bg-light-accent dark:hover:bg-cine-accent hover:text-white transition-all"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <div className="grid gap-3">
                                            {project.locations.map((loc) => (
                                                <div
                                                    key={loc.id}
                                                    className="group p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 hover:border-light-accent/30 dark:hover:border-cine-accent/30 transition-all"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                                                                {loc.name}
                                                            </div>
                                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                                                                {loc.description || '暂无描述'}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => onEditLocation(loc)}
                                                                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-light-accent dark:hover:text-cine-accent"
                                                            >
                                                                <Edit3 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => onDeleteLocation(loc.id, loc.name)}
                                                                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-red-500"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {loc.referenceImages && loc.referenceImages.length > 0 && (
                                                        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                                                            {loc.referenceImages.map((img, idx) => (
                                                                <div key={idx} className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-white/5 overflow-hidden shrink-0 border border-black/5 dark:border-white/5">
                                                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Panel Footer */}
                        <div className="p-6 border-t border-black/5 dark:border-white/5 bg-zinc-50/50 dark:bg-black/40">
                            {onClose ? (
                                <button
                                    onClick={onClose}
                                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors py-2"
                                >
                                    <span>返回画布</span>
                                    <ArrowRight size={12} />
                                </button>
                            ) : (
                                <Link
                                    href={`/project/${project.id}`}
                                    className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors py-2"
                                >
                                    <span>跳过策划，直接进入画布</span>
                                    <ArrowRight size={12} />
                                </Link>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Shot Editor Modal */}
            <ShotEditor
                editingShot={editingShot}
                setEditingShot={setEditingShot}
                shotForm={shotForm}
                setShotForm={setShotForm}
                saveShotEdit={saveShotEdit}
                shotHistoryImages={[]}
                selectedHistoryImage={null}
                setSelectedHistoryImage={() => { }}
                liveEditingShot={editingShot}
                updateShot={updateShot}
                setShotImagePreview={() => { }}
            />
        </div>
    );
}
