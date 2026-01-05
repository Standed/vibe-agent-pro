
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, LayoutGrid, GripHorizontal, Image as ImageIcon, Trash2, Plus } from 'lucide-react';
import { Button } from './Button';
import { AspectRatio } from '../types';

interface CollageEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (files: File[], layout: '2x2' | '3x3', aspectRatio: string) => void;
  defaultAspectRatio?: AspectRatio;
}

export const CollageEditor: React.FC<CollageEditorProps> = ({ 
  isOpen, 
  onClose, 
  onSave,
  defaultAspectRatio = AspectRatio.WIDE
}) => {
  const [layout, setLayout] = useState<'2x2' | '3x3'>('2x2');
  const [aspectRatio, setAspectRatio] = useState<string>(defaultAspectRatio);
  const [slots, setSlots] = useState<(File | null)[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize slots when layout changes
  useEffect(() => {
    const totalSlots = layout === '2x2' ? 4 : 9;
    setSlots(prev => {
        const newSlots = new Array(totalSlots).fill(null);
        // Preserve existing files up to the new limit
        for(let i=0; i<Math.min(prev.length, totalSlots); i++) {
            newSlots[i] = prev[i];
        }
        return newSlots;
    });
  }, [layout]);

  if (!isOpen) return null;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const newSlots = [...slots];
    const temp = newSlots[index];
    newSlots[index] = newSlots[draggedIndex];
    newSlots[draggedIndex] = temp;
    
    setSlots(newSlots);
    setDraggedIndex(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newFiles = Array.from(e.target.files);
          setSlots(prev => {
              const next = [...prev];
              let fileIdx = 0;
              for (let i = 0; i < next.length && fileIdx < newFiles.length; i++) {
                  if (next[i] === null) {
                      next[i] = newFiles[fileIdx];
                      fileIdx++;
                  }
              }
              return next;
          });
      }
      e.target.value = ''; // Reset
  };

  const handleRemoveSlot = (index: number) => {
      setSlots(prev => {
          const next = [...prev];
          next[index] = null;
          return next;
      });
  };

  const handleSave = () => {
      // Filter out nulls
      const filesToStitch = slots.filter(s => s !== null) as File[];
      if (filesToStitch.length === 0) return;
      onSave(filesToStitch, layout, aspectRatio);
  };

  const gridClass = layout === '2x2' ? 'grid-cols-2' : 'grid-cols-3';

  // Preview dimensions calculations
  const getPreviewStyle = () => {
      const [w, h] = aspectRatio.split(':').map(Number);
      const ratio = w / h;
      // We want to fit it in a container of max W 500, max H 400
      return { aspectRatio: `${w}/${h}` };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-cine-dark border border-zinc-700 w-full max-w-4xl rounded-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
            <h2 className="text-white font-mono uppercase tracking-widest text-sm flex items-center gap-2">
                <LayoutGrid size={16} className="text-cine-accent" />
                拼贴编辑器 (Collage Editor)
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <X size={18} />
            </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Controls */}
            <div className="w-64 border-r border-zinc-800 p-4 space-y-6 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
                
                {/* Layout Select */}
                <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">网格布局</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => setLayout('2x2')}
                            className={`p-3 border rounded-sm flex flex-col items-center gap-2 transition-all ${layout === '2x2' ? 'bg-zinc-800 border-cine-accent text-cine-accent' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                        >
                            <div className="grid grid-cols-2 gap-0.5 w-6 h-6">
                                <div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div>
                                <div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div>
                            </div>
                            <span className="text-[10px] font-mono">2x2 (4图)</span>
                        </button>
                        <button 
                            onClick={() => setLayout('3x3')}
                            className={`p-3 border rounded-sm flex flex-col items-center gap-2 transition-all ${layout === '3x3' ? 'bg-zinc-800 border-cine-accent text-cine-accent' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                        >
                            <div className="grid grid-cols-3 gap-0.5 w-6 h-6">
                                <div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div>
                                <div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div>
                                <div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div><div className="bg-current opacity-50"></div>
                            </div>
                            <span className="text-[10px] font-mono">3x3 (9图)</span>
                        </button>
                    </div>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">画布比例</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[AspectRatio.WIDE, AspectRatio.SQUARE, AspectRatio.PORTRAIT, AspectRatio.CINEMA].map(ar => (
                            <button
                                key={ar}
                                onClick={() => setAspectRatio(ar)}
                                className={`px-2 py-1.5 text-[10px] font-mono border rounded-[1px] ${aspectRatio === ar ? 'bg-zinc-700 text-white border-zinc-500' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                            >
                                {ar}
                            </button>
                        ))}
                    </div>
                </div>

                {/* File Action */}
                <div className="pt-4 border-t border-zinc-800">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-sm text-xs font-mono flex items-center justify-center gap-2 transition-colors"
                    >
                        <Plus size={14} /> 添加图片
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        accept="image/*"
                        onChange={handleFileSelect}
                    />
                    <p className="text-[9px] text-zinc-600 mt-2 text-center">
                        可拖拽排序。填满后将自动裁剪为 {aspectRatio}。
                    </p>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-black p-8 flex items-center justify-center overflow-auto relative">
                <div 
                    className="bg-zinc-900 border border-zinc-800 shadow-2xl relative transition-all duration-300"
                    style={{ 
                        width: '100%', 
                        maxWidth: '600px',
                        ...getPreviewStyle()
                    }}
                >
                    <div className={`grid ${gridClass} w-full h-full gap-[1px] bg-zinc-950`}>
                        {slots.map((file, index) => (
                            <div 
                                key={index}
                                className={`relative group border border-dashed border-zinc-800 flex items-center justify-center overflow-hidden ${draggedIndex === index ? 'opacity-50' : 'opacity-100'}`}
                                draggable={!!file}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                            >
                                {file ? (
                                    <>
                                        <img 
                                            src={URL.createObjectURL(file)} 
                                            alt={`slot-${index}`} 
                                            className="w-full h-full object-cover pointer-events-none" 
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <GripHorizontal size={16} className="text-white cursor-grab active:cursor-grabbing" />
                                            <button 
                                                onClick={() => handleRemoveSlot(index)}
                                                className="text-white hover:text-red-500 p-1"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-zinc-700">
                                        <ImageIcon size={16} />
                                        <span className="text-[9px] font-mono">{index + 1}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} size="sm">取消</Button>
            <Button 
                variant="accent" 
                onClick={handleSave} 
                disabled={slots.every(s => s === null)} 
                size="sm"
                className="px-6"
            >
                <Check size={14} className="mr-2" /> 生成拼贴素材 (Create Asset)
            </Button>
        </div>
      </div>
    </div>
  );
};
