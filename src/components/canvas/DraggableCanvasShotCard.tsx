import { memo, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Play, Download, Edit2, Upload, RefreshCw, Sparkles, Image as ImageIcon } from 'lucide-react';
import { Shot, AspectRatio } from '@/types/project';
import { SHOT_TO_CHAT, IMAGE_TO_SHOT } from '@/components/chat/dragTypes';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import { toast } from 'sonner';

interface DraggableCanvasShotCardProps {
    shot: Shot;
    sceneId: string;
    shotLabel: string;
    isShotSelected: boolean;
    onSelect: (shotId: string) => void;
    onPreview: (imageUrl: string) => void;
    onDownload: (imageUrl: string, order: number, e: React.MouseEvent) => void;
    onEdit: (shot: Shot, e: React.MouseEvent) => void;
    onUpload: (shotId: string) => void;
    onGenerate: (shotId: string, e: React.MouseEvent) => void;
    shotSizeLabel: string;
    cameraMovementLabel: string;
    aspectRatio?: string;
}

const DraggableCanvasShotCard = memo(function DraggableCanvasShotCard({
    shot,
    sceneId,
    shotLabel,
    isShotSelected,
    onSelect,
    onPreview,
    onDownload,
    onEdit,
    onUpload,
    onGenerate,
    shotSizeLabel,
    cameraMovementLabel,
    aspectRatio = AspectRatio.WIDE,
}: DraggableCanvasShotCardProps) {
    const { updateShot } = useProjectStore();
    const cardRef = useRef<HTMLDivElement>(null);

    // 计算布局模式
    const ratioStr = aspectRatio.replace(':', '/');
    const isTall = aspectRatio === AspectRatio.MOBILE || aspectRatio === AspectRatio.PORTRAIT || aspectRatio === '9:16' || aspectRatio === '3:4';

    // 动态样式类
    const buttonBaseClass = "rounded-full bg-white/10 dark:bg-white/10 hover:bg-white/20 dark:hover:bg-white/20 text-white dark:text-white backdrop-blur-md transition-all pointer-events-auto border border-white/20 shadow-sm flex items-center justify-center";
    const buttonClass = `${buttonBaseClass} ${isTall ? 'p-1 w-6 h-6' : 'p-1.5 w-7 h-7'}`; // Tall模式下更小
    const iconSize = isTall ? 10 : 12;

    // --- Drag: Canvas Shot -> Pro Mode ---
    const [{ isDragging }, drag] = useDrag(() => ({
        type: SHOT_TO_CHAT,
        item: { imageUrl: shot.referenceImage || shot.gridImages?.[0] },
        canDrag: () => !!(shot.referenceImage || shot.gridImages?.[0]),
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [shot.referenceImage, shot.gridImages]);

    // --- Drop: Pro Mode -> Canvas Shot ---
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: IMAGE_TO_SHOT,
        drop: async (item: { imageUrl: string }) => {
            if (!item.imageUrl) return;

            // 1. Optimistic update - set referenceImage
            const historyItem = {
                id: `drop_${Date.now()}`,
                type: 'image' as const,
                timestamp: new Date(),
                result: item.imageUrl,
                prompt: '从 Pro 模式拖入',
                parameters: {
                    model: 'drag_drop',
                    source: 'pro_mode',
                },
                status: 'success' as const,
            };

            const newHistory = [...(shot.generationHistory || []), historyItem];
            updateShot(shot.id, {
                referenceImage: item.imageUrl,
                status: 'done',
                generationHistory: newHistory,
            });

            // 2. Persist to backend
            try {
                await dataService.saveShot(sceneId, {
                    ...shot,
                    referenceImage: item.imageUrl,
                    status: 'done',
                    generationHistory: newHistory,
                });
                toast.success(`已应用到 ${shotLabel}`);
            } catch (error) {
                console.error('Failed to save shot:', error);
                toast.error('保存失败');
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [shot, shotLabel, updateShot]);

    // Combine refs
    const combinedRef = (node: HTMLDivElement | null) => {
        cardRef.current = node;
        drag(node);
        drop(node);
    };

    const imageUrl = shot.referenceImage || shot.gridImages?.[0];

    return (
        <div
            ref={combinedRef as any}
            role="button"
            tabIndex={0}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(shot.id);
            }}
            className={`group bg-white/40 dark:bg-black/40 rounded-2xl overflow-hidden hover:border-light-accent/50 dark:hover:border-cine-accent/50 transition-all duration-300 ${isShotSelected
                ? 'border-2 border-light-accent dark:border-cine-accent shadow-lg shadow-light-accent/20 dark:shadow-cine-accent/20 scale-[1.02]'
                : 'border border-white/20 dark:border-white/5 hover:shadow-lg'
                } ${isDragging ? 'opacity-50 cursor-grabbing' : ''} ${isOver ? 'ring-2 ring-light-accent dark:ring-cine-accent' : ''}`}
        >
            {/* Shot Thumbnail Container with Dynamic Aspect Ratio */}
            <div
                className="bg-light-bg dark:bg-cine-black flex items-center justify-center relative w-full"
                style={{ aspectRatio: ratioStr }}
            >
                {shot.referenceImage ? (
                    <>
                        <img
                            src={shot.referenceImage}
                            alt={shotLabel}
                            className="w-full h-full object-cover cursor-pointer"
                            draggable={false}
                            onClick={(e) => { e.stopPropagation(); onPreview(shot.referenceImage!); }}
                        />
                        <div className={`absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end pointer-events-none ${isTall ? 'gap-1' : 'gap-2'}`}>
                            <button onClick={(e) => onDownload(shot.referenceImage!, shot.order, e)} className={buttonClass} title="下载"><Download size={iconSize} /></button>
                            <button onClick={(e) => onEdit(shot, e)} className={buttonClass} title="编辑"><Edit2 size={iconSize} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onUpload(shot.id); }} className={buttonClass} title="上传图片"><Upload size={iconSize} /></button>
                            <button onClick={(e) => onGenerate(shot.id, e)} className={buttonClass} title="重新生成"><RefreshCw size={iconSize} /></button>
                        </div>
                    </>
                ) : shot.gridImages && shot.gridImages.length > 0 ? (
                    <>
                        <img
                            src={shot.gridImages[0]}
                            alt={shotLabel}
                            className="w-full h-full object-cover cursor-pointer"
                            draggable={false}
                            onClick={(e) => { e.stopPropagation(); onPreview(shot.gridImages![0]); }}
                        />
                        <div className={`absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end pointer-events-none ${isTall ? 'gap-1' : 'gap-2'}`}>
                            <button onClick={(e) => onDownload(shot.gridImages![0], shot.order, e)} className={buttonClass} title="下载"><Download size={iconSize} /></button>
                            <button onClick={(e) => onEdit(shot, e)} className={buttonClass} title="编辑"><Edit2 size={iconSize} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onUpload(shot.id); }} className={buttonClass} title="上传图片"><Upload size={iconSize} /></button>
                            <button onClick={(e) => onGenerate(shot.id, e)} className={buttonClass} title="重新生成"><RefreshCw size={iconSize} /></button>
                        </div>
                    </>
                ) : (
                    <>
                        <ImageIcon size={24} className="text-light-text-muted dark:text-cine-text-muted" />
                        <div className={`absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end pointer-events-none ${isTall ? 'gap-1' : 'gap-2'}`}>
                            <button onClick={(e) => { e.stopPropagation(); onUpload(shot.id); }} className={buttonClass} title="上传图片"><Upload size={iconSize} /></button>
                            <button onClick={(e) => onGenerate(shot.id, e)} className="px-3 py-1.5 rounded-full bg-black text-white hover:bg-zinc-800 transition-colors shadow-lg flex items-center gap-1.5 text-xs font-bold pointer-events-auto border border-white/10"><Sparkles size={12} /> {isTall ? '生成' : '生成图片'}</button>
                        </div>
                    </>
                )}
                {/* Status Indicator */}
                <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${shot.status === 'done' ? 'bg-green-500' : shot.status === 'processing' ? 'bg-yellow-500' : shot.status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                {shot.videoClip && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Play size={32} className="text-white" fill="white" />
                    </div>
                )}
                {/* Drop Indicator */}
                {isOver && canDrop && (
                    <div className="absolute inset-0 bg-light-accent/20 dark:bg-cine-accent/20 flex items-center justify-center pointer-events-none">
                        <span className="text-light-accent dark:text-cine-accent text-sm font-medium">松开以应用</span>
                    </div>
                )}
            </div>
            {/* Shot Info - Optimized for Tall Cards */}
            <div className="p-2">
                {isTall ? (
                    // Tall Layout: Two rows, compact
                    <>
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-mono font-medium text-light-text-primary dark:text-cine-text-primary truncate mr-1 text-[10px]">{shotLabel}</span>
                            <span className="text-light-text-muted dark:text-cine-text-muted shrink-0 text-[10px] bg-black/10 dark:bg-white/10 px-1 rounded">{shot.duration}s</span>
                        </div>
                        <div className="text-[10px] text-light-text-muted dark:text-cine-text-muted truncate leading-tight">
                            {shotSizeLabel} · {cameraMovementLabel}
                        </div>
                    </>
                ) : (
                    // Regular Layout
                    <>
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-light-text-muted dark:text-cine-text-muted text-[10px]">{shotLabel}</span>
                            <span className="text-light-text-muted dark:text-cine-text-muted text-[10px]">{shot.duration}s</span>
                        </div>
                        <div className="text-[10px] text-light-text-muted dark:text-cine-text-muted mt-1 truncate">{shotSizeLabel} · {cameraMovementLabel}</div>
                    </>
                )}
            </div>
        </div>
    );
});

export default DraggableCanvasShotCard;
