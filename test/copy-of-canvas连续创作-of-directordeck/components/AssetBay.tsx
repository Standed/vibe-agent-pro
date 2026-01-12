import React, { useRef, useState } from 'react';
import { X, Film, Image as ImageIcon, Plus, UploadCloud, LayoutTemplate, Database } from 'lucide-react';
import { Asset } from '../types';

interface AssetBayProps {
  assets: Asset[];
  onAddAsset: (files: FileList) => void;
  onRemoveAsset: (id: string) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedAssetId?: string;
  onOpenCollageTool?: () => void;
}

export const AssetBay: React.FC<AssetBayProps> = ({ 
    assets, 
    onAddAsset, 
    onRemoveAsset, 
    onSelectAsset, 
    selectedAssetId,
    onOpenCollageTool 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddAsset(e.dataTransfer.files);
    }
  };

  return (
    <div 
        className={`flex flex-col space-y-4 transition-all duration-500 rounded-sm relative ${isDragging ? 'bg-zinc-900/50 ring-1 ring-cine-accent shadow-[0_0_20px_rgba(201,255,86,0.1)]' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      <div className="flex items-center justify-between px-1">
         <span className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-mono font-bold flex items-center gap-2">
            <Database size={10} className="opacity-50" />
            01. 素材库 (ASSETS)
         </span>
         <div className="flex items-center gap-3">
            <button 
                onClick={onOpenCollageTool}
                className="text-zinc-600 hover:text-cine-accent transition-all flex items-center gap-1.5 bg-zinc-900/30 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 px-2 py-1 rounded-[1px] group"
                title="拼贴工具：创建多图参考"
            >
                <LayoutTemplate size={10} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-mono font-bold tracking-widest">COLLAGE</span>
            </button>
            <span className="text-zinc-700 text-[9px] font-mono border-l border-zinc-800/80 pl-3 py-0.5">{assets.length} REF</span>
         </div>
      </div>

      {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md border-2 border-dashed border-cine-accent/30 rounded-md pointer-events-none animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center gap-3 text-cine-accent">
                  <div className="p-4 bg-cine-accent/10 rounded-full animate-bounce">
                    <UploadCloud size={32} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] font-bold">RELEASE TO UPLOAD</span>
              </div>
          </div>
      )}

      {/* Grid Container */}
      <div className="grid grid-cols-3 gap-2.5 pr-1 content-start">
        {/* Add Button Tile */}
        <div 
          className="aspect-square border border-dashed border-zinc-800 bg-zinc-900/20 rounded-sm hover:border-cine-accent/50 hover:bg-cine-accent/5 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center group relative overflow-hidden"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/*,video/*"
            onChange={(e) => {
                if(e.target.files) onAddAsset(e.target.files);
                e.target.value = '';
            }}
          />
          <Plus className="w-5 h-5 text-zinc-700 group-hover:text-cine-accent transition-all group-hover:scale-125 duration-300" />
          <div className="absolute inset-0 bg-gradient-to-br from-cine-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>

        {/* Asset List */}
        {assets.map((asset) => (
          <div 
            key={asset.id} 
            onClick={() => onSelectAsset(asset)}
            className={`relative group aspect-square bg-zinc-950 border rounded-sm overflow-hidden cursor-pointer transition-all duration-500 ${
                selectedAssetId === asset.id 
                ? 'border-cine-accent ring-1 ring-cine-accent/40 shadow-[0_0_15px_-3px_rgba(201,255,86,0.4)] z-10' 
                : 'border-zinc-800/80 hover:border-zinc-600'
            }`}
          >
            {asset.type === 'video' ? (
                <video src={asset.previewUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-500" />
            ) : (
                <img src={asset.previewUrl} alt="asset" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105" />
            )}
            
            {/* Type Indicator */}
            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black via-black/40 to-transparent">
                <div className="flex items-center gap-1.5 text-[8px] text-zinc-500 font-mono font-bold tracking-tighter">
                    {asset.type === 'video' ? <Film size={8} className="text-zinc-600"/> : <ImageIcon size={8} className="text-zinc-600"/>}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity uppercase">{asset.type}</span>
                </div>
            </div>

            {/* Remove Button */}
            <button 
                onClick={(e) => { e.stopPropagation(); onRemoveAsset(asset.id); }} 
                className="absolute top-1 right-1 p-1 text-zinc-500 hover:text-red-400 hover:bg-black/60 rounded-full transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm border border-zinc-800/50"
            >
                <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};