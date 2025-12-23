'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
    X,
    Plus,
    Trash2,
    Download,
    Upload,
    Save,
    FileText,
    LayoutGrid,
    ChevronDown,
    AlertCircle,
    Search,
    CheckCircle2
} from 'lucide-react';
import type { Shot, Scene, Project, ShotSize, CameraMovement } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { translateShotSize, translateCameraMovement, getShotSizeFromValue, getCameraMovementFromValue } from '@/utils/translations';
import { SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS } from '@/types/project';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { FileWarning, Info } from 'lucide-react';

interface ShotTableEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ShotTableEditor({ isOpen, onClose }: ShotTableEditorProps) {
    const { project, batchUpdateScenesAndShots } = useProjectStore();

    // Local state for editing to prevent excessive re-renders of the whole app
    const [localScenes, setLocalScenes] = useState<Scene[]>([]);
    const [localShots, setLocalShots] = useState<Shot[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [importErrors, setImportErrors] = useState<{ row: number; msg: string; type: 'error' | 'warning' }[]>([]);

    // Shot Options from constants
    const shotSizeOptions = SHOT_SIZE_OPTIONS;
    const cameraMovementOptions = CAMERA_MOVEMENT_OPTIONS;

    // Handle mounting for portal
    React.useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Initialize local state when opened
    React.useEffect(() => {
        if (isOpen && project) {
            const scenes = JSON.parse(JSON.stringify(project.scenes)) as Scene[];
            const shots = JSON.parse(JSON.stringify(project.shots)) as Shot[];

            // Sort scenes by order
            scenes.sort((a, b) => a.order - b.order);

            // Map sceneId to order for faster sorting
            const sceneOrderMap = new Map(scenes.map(s => [s.id, s.order]));

            // Sort shots by scene order, then by shot order
            shots.sort((a, b) => {
                const sceneAOrder = sceneOrderMap.get(a.sceneId) || 0;
                const sceneBOrder = sceneOrderMap.get(b.sceneId) || 0;
                if (sceneAOrder !== sceneBOrder) return sceneAOrder - sceneBOrder;
                return a.order - b.order;
            });

            setLocalScenes(scenes);
            setLocalShots(shots);
        }
    }, [isOpen, project]);

    const filteredShots = useMemo(() => {
        if (!searchTerm) return localShots;
        const term = searchTerm.toLowerCase();
        return localShots.filter(shot =>
            shot.description.toLowerCase().includes(term) ||
            shot.dialogue?.toLowerCase().includes(term) ||
            shot.narration?.toLowerCase().includes(term)
        );
    }, [localShots, searchTerm]);

    const handleUpdateShot = (shotId: string, updates: Partial<Shot>) => {
        setLocalShots(prev => prev.map(shot =>
            shot.id === shotId ? { ...shot, ...updates } : shot
        ));
    };

    const handleDeleteShot = (shotId: string) => {
        setLocalShots(prev => prev.filter(shot => shot.id !== shotId));
    };

    const handleAddShot = (sceneId?: string, insertIndex?: number) => {
        const targetSceneId = sceneId || localShots[localShots.length - 1]?.sceneId || localScenes[0]?.id || crypto.randomUUID();

        // Ensure scene exists
        if (localScenes.length === 0 || !localScenes.find(s => s.id === targetSceneId)) {
            const newScene: Scene = {
                id: targetSceneId,
                name: '新场景',
                location: '',
                description: '',
                order: localScenes.length + 1,
                shotIds: [],
                position: { x: 0, y: 0 },
                status: 'draft'
            };
            setLocalScenes(prev => [...prev, newScene]);
        }

        const newShot: Shot = {
            id: crypto.randomUUID(),
            sceneId: targetSceneId,
            order: 0, // Will be recalculated on save or after insert
            shotSize: 'Medium Shot',
            cameraMovement: 'Static',
            duration: 3,
            description: '',
            status: 'draft',
            gridImages: [],
            generationHistory: []
        };

        setLocalShots(prev => {
            const next = [...prev];
            if (typeof insertIndex === 'number') {
                next.splice(insertIndex, 0, newShot);
            } else {
                next.push(newShot);
            }
            return next;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Update shot orders based on final array positions within each scene
            const finalShots = localShots.map((shot, index) => {
                // Grouping is implicit in the flat list's sequence now
                // But we still need to set 'order' relative to the scene for compatibility
                const sceneShots = localShots.filter(s => s.sceneId === shot.sceneId);
                const orderInScene = sceneShots.indexOf(shot) + 1;
                return { ...shot, order: orderInScene, globalOrder: index + 1 };
            });

            // Update scene shotIds based on finalShots
            const updatedScenes = localScenes.map(scene => ({
                ...scene,
                shotIds: finalShots
                    .filter(shot => shot.sceneId === scene.id)
                    .map(shot => shot.id)
            }));

            await batchUpdateScenesAndShots(updatedScenes, finalShots);
            setIsSaving(false);
            onClose();
        } catch (err) {
            console.error('Save failed:', err);
            setIsSaving(false);
        }
    };

    const downloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
        const headers = ['场景名称', '镜头序号', '镜头描述', '对白', '旁白', '景别', '镜头运动', '时长(秒)'];
        const exampleData = [
            ['场景 1 - 开场室外海边', '1', '主角从远方走来，背景是落日', '这个世界很美', '在那片遥远的大地...', '全景', '左摇', '5'],
            ['场景 1 - 开场室外海边', '2', '主角特写，神情忧郁', '但我却感到孤独', '', '特写', '固定镜头', '3']
        ];

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "分镜脚本模板");
            XLSX.writeFile(workbook, "分镜脚本模板.xlsx");
        } else {
            const csvContent = "\uFEFF" + [headers, ...exampleData].map(e => e.join(",")).join("\n");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "分镜脚本模板.csv");
            link.click();
        }
    };

    const validateAndProcessData = (data: any[]) => {
        const errors: { row: number; msg: string; type: 'error' | 'warning' }[] = [];
        const newShots: Shot[] = [];
        const sceneMap = new Map<string, string>(); // name -> id

        data.forEach((row: any, idx) => {
            const rowNum = idx + 2; // +1 for header, +1 for 0-index
            const [sceneName, _, description, dialogue, narration, shotSizeVal, cameraMoveVal, durationVal] = row;

            if (!sceneName) {
                errors.push({ row: rowNum, msg: '场景名称不能为空', type: 'error' });
                return;
            }

            const shotSize = getShotSizeFromValue(shotSizeVal) || 'Medium Shot';
            if (!getShotSizeFromValue(shotSizeVal) && shotSizeVal) {
                errors.push({ row: rowNum, msg: `未知景别 "${shotSizeVal}"，已默认设为中景`, type: 'warning' });
            }

            const cameraMovement = getCameraMovementFromValue(cameraMoveVal) || 'Static';
            if (!getCameraMovementFromValue(cameraMoveVal) && cameraMoveVal) {
                errors.push({ row: rowNum, msg: `未知运镜 "${cameraMoveVal}"，已默认设为固定镜头`, type: 'warning' });
            }

            const duration = parseFloat(durationVal);
            if (isNaN(duration) || duration <= 0) {
                errors.push({ row: rowNum, msg: `时长格式错误 "${durationVal}"，已设为默认 3s`, type: 'warning' });
            }

            let sceneId = sceneMap.get(sceneName);
            if (!sceneId) {
                // Try to find existing scene name in current local state
                const existing = localScenes.find(s => s.name === sceneName);
                if (existing) {
                    sceneId = existing.id;
                } else {
                    sceneId = crypto.randomUUID();
                    setLocalScenes(prev => [...prev, {
                        id: sceneId!,
                        name: sceneName,
                        location: '',
                        description: '',
                        order: localScenes.length + prev.length + 1,
                        shotIds: [],
                        position: { x: 0, y: 0 },
                        status: 'draft'
                    }]);
                }
                sceneMap.set(sceneName, sceneId);
            }

            newShots.push({
                id: crypto.randomUUID(),
                sceneId,
                order: 0,
                description: description || '',
                dialogue: dialogue || '',
                narration: narration || '',
                shotSize,
                cameraMovement,
                duration: isNaN(duration) ? 3 : duration,
                status: 'draft',
                gridImages: [],
                generationHistory: []
            });
        });

        setImportErrors(errors);
        if (newShots.length > 0) {
            setLocalShots(prev => [...prev, ...newShots]);
        }
    };

    const handleExport = () => {
        if (!localShots.length) return;

        const headers = ['场景名称', '镜头序号', '镜头描述', '对白', '旁白', '景别', '镜头运动', '时长(秒)'];

        // Map local shots to current scene names
        const sceneNameMap = new Map(localScenes.map(s => [s.id, s.name]));

        const data = localShots.map((shot, idx) => [
            sceneNameMap.get(shot.sceneId) || '未定义场景',
            (idx + 1).toString(),
            shot.description,
            shot.dialogue || '',
            shot.narration || '',
            translateShotSize(shot.shotSize),
            translateCameraMovement(shot.cameraMovement),
            shot.duration.toString()
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "导出分镜脚本");
        XLSX.writeFile(workbook, `分镜导出_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        const extension = file.name.split('.').pop()?.toLowerCase();

        reader.onload = (event) => {
            const data = event.target?.result;
            if (extension === 'xlsx' || extension === 'xls') {
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
                validateAndProcessData(jsonData.slice(1)); // Skip header
            } else if (extension === 'csv') {
                Papa.parse(data as string, {
                    complete: (results) => {
                        validateAndProcessData(results.data.slice(1)); // Skip header
                    },
                    header: false
                });
            }
        };

        if (extension === 'xlsx' || extension === 'xls') {
            reader.readAsBinaryString(file);
        } else {
            reader.readAsText(file);
        }
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl p-0 pointer-events-auto">
            <div className="bg-white dark:bg-[#0c0c0e] border-none shadow-[0_0_100px_rgba(0,0,0,0.5)] w-full h-full flex flex-col overflow-hidden animate-in fade-in duration-300">

                {/* Header Container */}
                <div className="flex flex-col border-b border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-dark/50 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-8 py-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-light-accent dark:bg-cine-accent rounded-2xl text-white dark:text-black shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20">
                                <LayoutGrid size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-light-text dark:text-white flex items-center gap-2">
                                    分镜脚本多维表格
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent border border-light-accent/20 dark:border-cine-accent/20">
                                        BASE MODE
                                    </span>
                                </h2>
                                <p className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
                                    在表格中管理您的镜头脚本，支持批量导入与修改。
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-light-border dark:border-cine-border hover:bg-light-bg dark:hover:bg-cine-panel text-light-text dark:text-cine-text-muted hover:text-light-accent dark:hover:text-white transition-all"
                            >
                                <Download size={16} />
                                <span>导出当前脚本</span>
                            </button>

                            <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-light-border dark:border-cine-border hover:bg-light-bg dark:hover:bg-cine-panel text-light-text dark:text-cine-text-muted hover:text-light-accent dark:hover:text-white transition-all cursor-pointer">
                                <Upload size={16} />
                                <span>导入 Excel/CSV</span>
                                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
                            </label>

                            <button
                                onClick={() => downloadTemplate('xlsx')}
                                className="p-2.5 rounded-xl border border-light-border dark:border-cine-border hover:bg-light-bg dark:hover:bg-cine-panel text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-white transition-all"
                                title="下载空白模板"
                            >
                                <FileText size={20} />
                            </button>

                            <div className="w-px h-8 bg-light-border dark:bg-cine-border mx-2" />

                            <button
                                onClick={onClose}
                                className="p-2.5 rounded-xl border border-light-border dark:border-cine-border hover:bg-red-50 dark:hover:bg-red-500/10 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="px-8 pb-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-muted dark:text-cine-text-muted group-focus-within:text-light-accent dark:group-focus-within:text-cine-accent transition-colors" size={16} />
                                <input
                                    type="text"
                                    placeholder="搜索描述、对白或旁白..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent w-80 transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-xs text-light-text-muted dark:text-cine-text-muted flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-green-500" />
                                <span>已自动保存本地草稿</span>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-light-accent dark:bg-cine-accent text-white dark:text-black rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-light-accent/20 dark:shadow-cine-accent/20"
                            >
                                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                                <span>{isSaving ? '正在保存...' : '同步至项目'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Validation Panel */}
                    {importErrors.length > 0 && (
                        <div className="mx-8 mt-2 mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                                    <FileWarning size={18} />
                                    <span>导入校验报告 ({importErrors.length} 条记录待关注)</span>
                                </div>
                                <button
                                    onClick={() => setImportErrors([])}
                                    className="text-xs text-amber-500/60 hover:text-amber-500"
                                >
                                    忽略并关闭
                                </button>
                            </div>
                            <div className="max-h-24 overflow-y-auto space-y-1 custom-scrollbar">
                                {importErrors.map((err, i) => (
                                    <div key={i} className={`text-xs flex gap-3 ${err.type === 'error' ? 'text-red-400' : 'text-amber-500/80'}`}>
                                        <span className="font-mono opacity-50">第 {err.row} 行</span>
                                        <span>{err.msg}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Table Container */}
                <div className="flex-1 overflow-auto bg-light-bg/30 dark:bg-cine-black/30">
                    <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-light-bg dark:bg-[#141416] border-b border-light-border dark:border-cine-border">
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider w-12 text-center">#</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider min-w-[120px]">场景</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider min-w-[300px]">镜头描述 (Visual Prompt)</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider min-w-[200px]">对白 / 旁白</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider min-w-[150px]">景别</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider min-w-[150px]">运动</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider w-24">时长</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider w-12">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-light-border dark:divide-cine-border">
                            {/* Add at beginning button row */}
                            <tr className="border-none">
                                <td colSpan={8} className="p-0">
                                    <div className="flex justify-center -my-2 opacity-0 hover:opacity-100 transition-opacity relative z-30">
                                        <button
                                            onClick={() => handleAddShot(undefined, 0)}
                                            className="bg-light-accent dark:bg-cine-accent text-white dark:text-black rounded-full p-1 shadow-lg hover:scale-110 transition-transform"
                                            title="在最开始插入镜头"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>

                            {filteredShots.map((shot) => {
                                const realIdx = localShots.indexOf(shot);
                                return (
                                    <React.Fragment key={shot.id}>
                                        <tr className="group hover:bg-light-accent/5 dark:hover:bg-cine-accent/5 transition-colors">
                                            <td className="px-4 py-3 text-center text-xs text-light-text-muted dark:text-cine-text-muted font-mono">
                                                {realIdx + 1}
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={shot.sceneId}
                                                    onChange={(e) => handleUpdateShot(shot.id, { sceneId: e.target.value })}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-light-text dark:text-white cursor-pointer"
                                                >
                                                    {localScenes.map(scene => (
                                                        <option key={scene.id} value={scene.id}>{scene.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <textarea
                                                    value={shot.description}
                                                    onChange={(e) => handleUpdateShot(shot.id, { description: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-light-text dark:text-white p-0 resize-none placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted"
                                                    placeholder="描述画面内容..."
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-light-accent dark:text-cine-accent uppercase opacity-50">对话:</span>
                                                        <input
                                                            type="text"
                                                            value={shot.dialogue || ''}
                                                            onChange={(e) => handleUpdateShot(shot.id, { dialogue: e.target.value })}
                                                            className="flex-1 bg-transparent border-none focus:ring-0 text-xs text-light-text dark:text-white p-0"
                                                            placeholder="角色台词..."
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase opacity-50">旁白:</span>
                                                        <input
                                                            type="text"
                                                            value={shot.narration || ''}
                                                            onChange={(e) => handleUpdateShot(shot.id, { narration: e.target.value })}
                                                            className="flex-1 bg-transparent border-none focus:ring-0 text-xs text-light-text-muted dark:text-cine-text-muted p-0"
                                                            placeholder="系统配音..."
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={shot.shotSize}
                                                    onChange={(e) => handleUpdateShot(shot.id, { shotSize: e.target.value as ShotSize })}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-xs text-light-text dark:text-white cursor-pointer"
                                                >
                                                    {shotSizeOptions.map(opt => (
                                                        <option key={opt} value={opt}>{translateShotSize(opt)}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={shot.cameraMovement}
                                                    onChange={(e) => handleUpdateShot(shot.id, { cameraMovement: e.target.value as CameraMovement })}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-xs text-light-text dark:text-white cursor-pointer"
                                                >
                                                    {cameraMovementOptions.map(opt => (
                                                        <option key={opt} value={opt}>{translateCameraMovement(opt)}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={shot.duration}
                                                        onChange={(e) => handleUpdateShot(shot.id, { duration: parseFloat(e.target.value) || 0 })}
                                                        className="w-12 bg-transparent border-none focus:ring-0 text-xs text-light-text dark:text-white p-0 text-right"
                                                    />
                                                    <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted">s</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleDeleteShot(shot.id)}
                                                    className="p-1.5 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Insert button row */}
                                        <tr className="border-none">
                                            <td colSpan={8} className="p-0">
                                                <div className="flex justify-center -my-2 opacity-0 hover:opacity-100 transition-opacity relative z-30">
                                                    <button
                                                        onClick={() => handleAddShot(shot.sceneId, realIdx + 1)}
                                                        className="bg-light-accent dark:bg-cine-accent text-white dark:text-black rounded-full p-1 shadow-lg hover:scale-110 transition-transform"
                                                        title="在此处插入镜头"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer Info */}
                <div className="px-8 py-4 bg-light-bg/50 dark:bg-cine-dark/50 border-t border-light-border dark:border-cine-border flex items-center justify-between text-xs text-light-text-muted dark:text-cine-text-muted">
                    <div className="flex items-center gap-6">
                        <span>共 {localShots.length} 个镜头</span>
                        <span>共 {localScenes.length} 个场景</span>
                        <span>总预览时长: {localShots.reduce((acc, s) => acc + (s.duration || 0), 0).toFixed(1)}s</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <AlertCircle size={12} />
                        <span>同步后将覆盖原项目分镜结构，但已生成的图片视频链接将尽量保留。</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
