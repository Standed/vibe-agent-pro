'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Film,
    Users,
    MapPin,
    Plus,
    Edit3,
    Trash2,
    Settings,
    ArrowRight,
    X,
    Loader2
} from 'lucide-react';
import { Project, Character, Location, Shot, ShotSize, CameraMovement } from '@/types/project';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';
import { StoryboardTab } from '@/components/layout/sidebar/StoryboardTab';
import { useProjectStore } from '@/store/useProjectStore';
import { ShotEditor } from '@/components/layout/sidebar/ShotEditor';
import { storageService } from '@/lib/storageService';

interface PlanningSidebarProps {
    project: Project;
    activeTab: 'storyboard' | 'characters' | 'locations';
    setActiveTab: (tab: 'storyboard' | 'characters' | 'locations') => void;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    showHomeButton?: boolean;
    onClose?: () => void;
    onAddCharacter: () => void;
    onEditCharacter: (char: Character) => void;
    onDeleteCharacter: (id: string, name: string) => void;
    onAddLocation: () => void;
    onEditLocation: (loc: Location) => void;
    onDeleteLocation: (id: string, name: string) => void;
}

export default function PlanningSidebar({
    project,
    activeTab,
    setActiveTab,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    showHomeButton = true,
    onClose,
    onAddCharacter,
    onEditCharacter,
    onDeleteCharacter,
    onAddLocation,
    onEditLocation,
    onDeleteLocation,
}: PlanningSidebarProps) {
    const {
        addScene,
        addShot,
        deleteShot,
        deleteScene,
        updateScene,
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
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
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
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const tabs = [
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

    const liveEditingShot = editingShot ? project?.shots.find((s) => s.id === editingShot.id) || editingShot : null;

    useEffect(() => {
        if (liveEditingShot?.referenceImage) {
            setSelectedHistoryImage(liveEditingShot.referenceImage);
        } else {
            setSelectedHistoryImage(null);
        }
    }, [liveEditingShot?.referenceImage, editingShot?.id]);

    const shotHistoryImages = useMemo(() => {
        if (!liveEditingShot) return [];
        const urls = new Set<string>();
        if (liveEditingShot.referenceImage) urls.add(liveEditingShot.referenceImage);
        if (liveEditingShot.gridImages?.length) {
            liveEditingShot.gridImages.forEach((u) => u && urls.add(u));
        }
        if (liveEditingShot.generationHistory?.length) {
            liveEditingShot.generationHistory.forEach((h) => {
                if (h.type === 'image' && typeof h.result === 'string') {
                    urls.add(h.result);
                }
                if (h.parameters && (h.parameters as any)?.fullGridUrl) {
                    urls.add((h.parameters as any).fullGridUrl);
                }
            });
        }
        return Array.from(urls);
    }, [liveEditingShot]);

    const resolveSelectionMeta = (shot: Shot | null, url: string) => {
        if (!shot) return {};
        const historyMatch = shot.generationHistory?.find((item) => item.type === 'image' && item.result === url);
        const params = (historyMatch?.parameters || {}) as any;
        if (params?.fullGridUrl || params?.slices) {
            return {
                fullGridUrl: params.fullGridUrl as string | undefined,
                gridImages: params.slices as string[] | undefined,
            };
        }
        if (shot.gridImages?.includes(url)) {
            return {
                fullGridUrl: shot.fullGridUrl,
                gridImages: shot.gridImages,
            };
        }
        return {};
    };

    const saveShotEdit = () => {
        if (!editingShot) return;
        const updates: Partial<Shot> = {
            ...shotForm,
            shotSize: shotForm.shotSize as ShotSize,
            cameraMovement: shotForm.cameraMovement as CameraMovement,
        };
        if (selectedHistoryImage) {
            const meta = resolveSelectionMeta(liveEditingShot || null, selectedHistoryImage);
            updates.referenceImage = selectedHistoryImage;
            updates.status = 'done';
            if (meta.fullGridUrl) updates.fullGridUrl = meta.fullGridUrl;
            if (meta.gridImages) updates.gridImages = meta.gridImages;
        }
        updateShot(editingShot.id, updates);
        setEditingShot(null);
        toast.success('分镜已更新');
    };

    const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingShot) return;

        if (!file.type.startsWith('image/')) {
            toast.error('请选择图片文件');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('图片大小不能超过 10MB');
            return;
        }

        setIsUploading(true);
        try {
            const result = await storageService.uploadFile(file, `shots/${editingShot.id}`);
            const imageUrl = result.url;

            const shot = project?.shots.find(s => s.id === editingShot.id);
            if (shot) {
                const historyItem = {
                    id: `upload_${Date.now()}`,
                    type: 'image' as const,
                    timestamp: new Date(),
                    result: imageUrl,
                    prompt: '用户上传图片',
                    parameters: {
                        model: 'upload',
                        source: 'user_upload',
                    },
                    status: 'success' as const,
                };
                const newHistory = [...(shot.generationHistory || []), historyItem];
                updateShot(editingShot.id, { generationHistory: newHistory });
            }

            toast.success('图片上传成功');
            setSelectedHistoryImage(imageUrl);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('图片上传失败');
        } finally {
            setIsUploading(false);
            if (uploadInputRef.current) uploadInputRef.current.value = '';
        }
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
                                            editingSceneId={editingSceneId}
                                            editingSceneName={editingSceneName}
                                            setEditingSceneName={setEditingSceneName}
                                            handleSaveSceneName={(id) => {
                                                updateScene(id, { name: editingSceneName });
                                                setEditingSceneId(null);
                                                toast.success('场景名称已更新');
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
                                            handleDeleteScene={(id) => {
                                                deleteScene(id);
                                                toast.success('场景已删除');
                                            }}
                                            handleAddShotClick={(sceneId, index) => {
                                                const newShot: Shot = {
                                                    id: crypto.randomUUID(),
                                                    sceneId,
                                                    description: '',
                                                    order: (index ?? 0) + 1,
                                                    status: 'draft',
                                                    shotSize: 'Medium Shot',
                                                    cameraMovement: 'Static',
                                                    duration: 3,
                                                };
                                                addShot(newShot);
                                                toast.success('镜头已添加');
                                            }}
                                            selectedShotId={null}
                                            handleShotClick={(id) => selectShot(id)}
                                            openShotEditor={openShotEditor}
                                            handleDeleteShot={(id) => {
                                                deleteShot(id);
                                                toast.success('镜头已删除');
                                            }}
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
                                    <span>返回故事板</span>
                                    <ArrowRight size={12} />
                                </button>
                            ) : (
                                <Link
                                    href={`/project/${project.id}`}
                                    className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors py-2"
                                >
                                    <span>跳过策划，直接进入故事板</span>
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
                shotHistoryImages={shotHistoryImages}
                selectedHistoryImage={selectedHistoryImage}
                setSelectedHistoryImage={setSelectedHistoryImage}
                setShotImagePreview={setPreviewImage}
                onUploadClick={() => uploadInputRef.current?.click()}
                isUploading={isUploading}
            />

            {/* Image Preview Overlay */}
            {previewImage && createPortal(
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={previewImage}
                            alt="Preview"
                            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
                        />
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>,
                document.body
            )}

            <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                className="hidden"
            />
        </div>
    );
}
