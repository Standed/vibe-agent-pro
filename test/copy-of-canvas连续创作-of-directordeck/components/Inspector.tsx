import React, { useState, useEffect } from 'react';
import { GeneratedImage, Asset } from '../types';
import { Download, Copy, Maximize2, Wand2, X, MessageSquare, Info, Video, Fingerprint, Eye } from 'lucide-react';
import { Button } from './Button';

interface InspectorProps {
  selectedImage: GeneratedImage | null;
  selectedAsset: Asset | null;
  onClose: () => void;
  onAnalyze: (prompt: string) => void;
  isAnalyzing: boolean;
  analysisResult?: string;
}

export const Inspector: React.FC<InspectorProps> = ({ 
  selectedImage, 
  selectedAsset, 
  onClose,
  onAnalyze,
  isAnalyzing,
  analysisResult
}) => {
  const [activeTab, setActiveTab] = useState<'view' | 'analyze'>('view');
  const [analysisPrompt, setAnalysisPrompt] = useState("深度分析该画面的视觉语言、构图平衡以及灯光设计。");
  const [showFullGrid, setShowFullGrid] = useState(false);

  useEffect(() => {
    setShowFullGrid(false);
    if (selectedImage || selectedAsset) {
        setActiveTab('view');
    }
  }, [selectedImage?.id, selectedAsset?.id]);

  useEffect(() => {
      if (!selectedImage && !selectedAsset && analysisResult) {
          setActiveTab('analyze');
      }
  }, [analysisResult, selectedImage, selectedAsset]);

  const activeItem = selectedImage || selectedAsset;
  const displayUrl = selectedImage 
    ? (showFullGrid && selectedImage.fullGridUrl ? selectedImage.fullGridUrl : selectedImage.url)
    : selectedAsset?.previewUrl;

  const hasContent = activeItem || analysisResult;

  if (!hasContent) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-4 p-10 text-center bg-cine-dark">
        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center opacity-40">
           <Eye size={20} />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-600">空闲状态 (IDLE)</p>
          <p className="text-[10px] text-zinc-800 leading-relaxed font-mono">请在左侧或画布中选择一个<br/>渲染任务以查看其详细属性。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cine-dark border-l border-cine-border animate-in slide-in-from-right-4 duration-300 w-full relative overflow-hidden">
      {/* Background Subtle Gradient */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cine-accent/5 blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-cine-border bg-cine-black/40 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-mono font-bold">
                03. 监视器 (INSPECTOR)
            </span>
            {selectedImage?.fullGridUrl && (
                <span className="bg-cine-accent/10 text-cine-accent text-[8px] px-2 py-0.5 rounded-[1px] border border-cine-accent/30 font-bold uppercase tracking-widest animate-pulse">Master</span>
            )}
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-white transition-all hover:rotate-90 duration-300">
            <X size={16} />
        </button>
      </div>

      {/* Main Preview Area */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group shadow-2xl z-10">
         {displayUrl ? (
             <img src={displayUrl} alt="Inspector View" className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-700" />
         ) : (
             <div className="flex flex-col items-center gap-3 text-zinc-800">
                 <Video size={40} className="opacity-20" />
                 <span className="text-[9px] font-mono uppercase tracking-[0.4em] font-bold">No Signal</span>
             </div>
         )}
         
         {/* Grid Toggle Overlay */}
         {selectedImage?.fullGridUrl && (
             <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                 <button 
                    onClick={() => setShowFullGrid(!showFullGrid)}
                    className="bg-black/70 backdrop-blur-md text-white text-[9px] px-3 py-1.5 rounded-[2px] border border-zinc-800 hover:border-cine-accent flex items-center gap-2 transition-all uppercase tracking-widest font-mono font-bold"
                 >
                    <Maximize2 size={10} />
                    {showFullGrid ? "VIEW PANEL" : "VIEW MASTER"}
                 </button>
             </div>
         )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-cine-border relative z-10">
          <button 
            onClick={() => setActiveTab('view')}
            disabled={!activeItem}
            className={`flex-1 py-3.5 text-[10px] font-mono uppercase tracking-[0.2em] font-bold transition-all disabled:opacity-30 ${activeTab === 'view' ? 'text-cine-accent bg-cine-accent/5' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            PROPERTIES
          </button>
          <button 
            onClick={() => setActiveTab('analyze')}
            className={`flex-1 py-3.5 text-[10px] font-mono uppercase tracking-[0.2em] font-bold transition-all ${activeTab === 'analyze' ? 'text-cine-accent bg-cine-accent/5' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            AI ANALYSIS
          </button>
          {/* Active indicator bar */}
          <div className={`absolute bottom-0 h-0.5 bg-cine-accent transition-all duration-300 ${activeTab === 'view' ? 'left-0 w-1/2' : 'left-1/2 w-1/2'}`}></div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-7 custom-scrollbar relative z-10">
        
        {activeTab === 'view' && activeItem && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Metadata */}
                <div className="space-y-4">
                    <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                        <Fingerprint size={12} className="text-zinc-700" />
                        元数据 (METADATA)
                    </h3>
                    <div className="grid grid-cols-2 gap-y-5 gap-x-4 text-[10px] font-mono">
                        <div className="flex flex-col gap-1">
                            <span className="uppercase text-zinc-700 text-[8px] tracking-widest">TYPE</span>
                            <span className="text-zinc-400 font-bold">{selectedImage ? 'RENDER NODE' : 'SOURCE ASSET'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="uppercase text-zinc-700 text-[8px] tracking-widest">ASPECT</span>
                            <span className="text-zinc-400 font-bold">
                                {selectedImage ? selectedImage.aspectRatio : 'ORIGINAL'}
                            </span>
                        </div>
                        <div className="flex flex-col col-span-2 gap-1 border-t border-zinc-800/50 pt-3">
                            <span className="uppercase text-zinc-700 text-[8px] tracking-widest">ENTITY ID</span>
                            <span className="text-zinc-500 truncate font-mono select-all hover:text-cine-accent transition-colors cursor-help">{activeItem.id}</span>
                        </div>
                    </div>
                </div>

                {/* Prompt Section */}
                {selectedImage && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                             <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">DIRECTOR PROMPT</h3>
                             <button 
                                onClick={() => navigator.clipboard.writeText(selectedImage.prompt)}
                                className="text-zinc-600 hover:text-cine-accent transition-all hover:scale-110"
                                title="COPY TO CLIPBOARD"
                             >
                                 <Copy size={12} />
                             </button>
                        </div>
                        <div className="p-4 bg-black/40 border border-zinc-800/60 rounded-sm relative group">
                            <p className="text-zinc-400 text-xs leading-relaxed font-mono">{selectedImage.prompt}</p>
                            <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-cine-accent/5 to-transparent"></div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-2">
                     <a 
                        href={displayUrl} 
                        download={`DirectorDeckPro-${activeItem.id}.png`}
                        className="block"
                     >
                         <Button variant="primary" size="md" className="w-full gap-3 py-6 h-12 shadow-xl">
                             <Download size={14} className="animate-bounce" /> DOWNLOAD HIGH-RES
                         </Button>
                     </a>
                </div>
            </div>
        )}

        {activeTab === 'analyze' && (
             <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500 h-full flex flex-col">
                {activeItem && (
                    <div className="space-y-3 flex-shrink-0">
                        <label className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">ANALYTICS COMMAND</label>
                        <textarea 
                            value={analysisPrompt}
                            onChange={(e) => setAnalysisPrompt(e.target.value)}
                            className="w-full bg-black/40 border border-zinc-800/80 rounded-sm p-4 text-[11px] text-zinc-400 focus:border-cine-accent focus:ring-0 resize-none font-mono min-h-[100px] leading-relaxed transition-all"
                            placeholder="INPUT AI INSTRUCTIONS..."
                        />
                        <Button 
                            variant="accent" 
                            size="md" 
                            className="w-full gap-2.5 h-11"
                            onClick={() => onAnalyze(analysisPrompt)}
                            disabled={isAnalyzing}
                        >
                             {isAnalyzing ? <Wand2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                             {isAnalyzing ? 'PROMPT ANALYZING...' : 'RUN VISUAL ANALYTICS'}
                        </Button>
                    </div>
                )}

                <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-2 border-t border-zinc-800/50">
                    <label className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">ANALYSIS REPORT</label>
                    <div className="flex-1 bg-black/50 border border-zinc-900/80 rounded-sm p-5 overflow-y-auto custom-scrollbar shadow-inner relative">
                        {analysisResult ? (
                            <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap font-mono tracking-tight">{analysisResult}</p>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-800 gap-4 opacity-30">
                                <Sparkles size={24} />
                                <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-center">Awaiting AI<br/>Feedback System</span>
                            </div>
                        )}
                        {/* Matrix Grid Decoration */}
                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.02] bg-[radial-gradient(#fff_1px,transparent_1px)] bg-[size:10px_10px]"></div>
                    </div>
                </div>
             </div>
        )}

      </div>
    </div>
  );
};

const Sparkles = ({ size, className }: { size: number, className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
);