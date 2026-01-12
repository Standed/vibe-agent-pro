import React from 'react';
import { Button } from './Button';
import { AspectRatio, ImageSize, GenerationMode } from '../types';
import { Grid2X2, Grid3X3, Zap, Layers, Lock, GitMerge, Video, Settings2 } from 'lucide-react';

interface DirectorDeckProps {
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ar: AspectRatio) => void;
  imageSize: ImageSize;
  setImageSize: (size: ImageSize) => void;
  prompt: string;
  setPrompt: (text: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onEnhancePrompt?: () => void;
  onGenerateCamera?: () => void;
  isContinuing?: boolean;
}

export const DirectorDeck: React.FC<DirectorDeckProps> = ({
  mode,
  setMode,
  aspectRatio,
  setAspectRatio,
  imageSize,
  setImageSize,
  prompt,
  setPrompt,
  onGenerate,
  isGenerating,
  onEnhancePrompt,
  onGenerateCamera,
  isContinuing = false
}) => {
  
  const getPerPanelResolution = () => {
      if (mode === GenerationMode.GRID_2x2) {
          return "FHD 1080p+";
      } else if (mode === GenerationMode.GRID_3x3) {
          return "HD 720p+";
      }
      return "4K Master";
  };

  return (
    <div className="flex flex-col h-full space-y-7 select-none">
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-6 mt-2">
         <span className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-mono font-bold flex items-center gap-2">
            <Settings2 size={10} className="text-cine-accent opacity-50" />
            02. 导演控制台
         </span>
         {isGenerating && (
             <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-cine-accent rounded-full animate-subtle-pulse shadow-[0_0_8px_#c9ff56]"></div>
                 <span className="text-[9px] text-cine-accent font-mono tracking-widest font-bold">RENDERING</span>
             </div>
         )}
      </div>

      {/* Composition Group */}
      <div className="space-y-3.5">
        <label className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.15em] flex items-center gap-2.5">
            <span className="w-1 h-3 bg-zinc-800 rounded-full"></span>
            构图配置 (COMPOSITION)
        </label>
        
        <div className="space-y-3 p-4 bg-zinc-900/40 border border-zinc-800/40 rounded-sm backdrop-blur-md">
             {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-1.5">
                {[
                    { m: GenerationMode.GRID_2x2, icon: Grid2X2, label: "2x2 GRID" },
                    { m: GenerationMode.GRID_3x3, icon: Grid3X3, label: "3x3 GRID" }
                ].map((item) => (
                    <button
                        key={item.label}
                        onClick={() => setMode(item.m)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[1px] border transition-all duration-300 ${
                            mode === item.m 
                            ? 'bg-zinc-800/60 border-cine-accent/50 text-cine-accent shadow-[inset_0_0_15px_rgba(201,255,86,0.05)]' 
                            : 'bg-black/40 border-zinc-800/60 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                        }`}
                    >
                        <item.icon size={14} className={mode === item.m ? "animate-pulse" : ""} />
                        <span className="text-[9px] uppercase tracking-widest font-mono font-bold">{item.label}</span>
                    </button>
                ))}
            </div>

            {/* Aspect Ratio */}
             <div className="space-y-2 pt-2.5 border-t border-zinc-800/50">
                <div className="flex justify-between items-center">
                   <span className="text-[8px] text-zinc-600 font-mono uppercase tracking-widest">画面比例 (RATIO)</span>
                   <span className="text-[8px] text-cine-accent/60 font-mono">{aspectRatio}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {Object.values(AspectRatio).map((ar) => (
                        <button
                            key={ar}
                            onClick={() => setAspectRatio(ar)}
                            className={`text-[9px] h-7 border rounded-[1px] font-mono transition-all duration-300 flex items-center justify-center ${
                                aspectRatio === ar 
                                ? 'border-zinc-600 text-white bg-zinc-800 shadow-inner' 
                                : 'border-zinc-800/60 text-zinc-700 hover:border-zinc-700 hover:text-zinc-500 bg-transparent'
                            }`}
                        >
                            {ar}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* Quality Group */}
      <div className="space-y-2.5">
        <label className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.15em] flex items-center gap-2.5">
            <span className="w-1 h-3 bg-zinc-800 rounded-full"></span>
            输出引擎 (ENGINE)
        </label>
        <div className="flex p-3 bg-black/40 border border-zinc-800/60 rounded-sm items-center justify-between opacity-90 group cursor-default">
            <div className="flex items-center gap-2">
              <Lock size={9} className="text-zinc-700 group-hover:text-cine-accent transition-colors" />
              <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">GEMINI VISUAL PRO</span>
            </div>
            <span className="text-[9px] text-cine-accent font-bold font-mono tracking-widest drop-shadow-[0_0_5px_rgba(201,255,86,0.3)]">{getPerPanelResolution()}</span>
        </div>
      </div>

      {/* Prompt Area */}
      <div className="space-y-2.5 flex-1 flex flex-col min-h-[240px]">
        <div className="flex justify-between items-end">
            <label className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.15em] flex items-center gap-2.5">
                <span className="w-1 h-3 bg-cine-accent rounded-full shadow-[0_0_8px_#c9ff56]"></span>
                创作指令 (DIRECTOR PROMPT)
            </label>
            
            {isContinuing && (
                <div className="flex items-center gap-1.5 bg-cine-accent/5 text-cine-accent px-2.5 py-1 rounded-full border border-cine-accent/20 animate-in fade-in duration-500 shadow-[0_0_10px_rgba(201,255,86,0.05)]">
                    <GitMerge size={10} />
                    <span className="text-[8px] font-mono tracking-widest font-bold">CONTINUITY ON</span>
                </div>
            )}
        </div>
        
        <div className={`relative flex-1 group transition-all duration-500 overflow-hidden rounded-sm ${isContinuing ? 'ring-1 ring-cine-accent/20' : 'ring-1 ring-zinc-800/50 focus-within:ring-cine-accent/30'}`}>
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isContinuing ? "// 继续扩展该分镜的世界观..." : "// 描述一个电影级画面，包括构图、光影、氛围..."}
                className={`w-full h-full absolute inset-0 bg-black/60 backdrop-blur-sm border-none p-4 text-[13px] text-zinc-300 focus:ring-0 resize-none font-mono leading-relaxed placeholder:text-zinc-800 custom-scrollbar transition-all duration-500 focus:bg-zinc-900/20 ${
                    isContinuing ? 'text-cine-accent/90' : ''
                }`}
                spellCheck={false}
            />
            {/* Subtle Gradient Overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
        </div>
      </div>

      {/* Tools Row */}
      {onGenerateCamera && (
          <div className="flex">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={onGenerateCamera} 
                disabled={isGenerating || !prompt.trim()} 
                className="w-full text-[9px] h-9 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/20 group"
                title="基于指令预测镜头运动"
              >
                  <Video size={12} className="mr-2 text-zinc-500 group-hover:text-cine-accent transition-colors" /> 生成镜头运动轨迹 (CAM-GEN)
              </Button>
          </div>
      )}

      {/* Generate Button */}
      <Button 
        variant="accent" 
        className="w-full py-4.5 tracking-[0.25em] uppercase font-mono text-[10px] font-bold relative overflow-hidden group transition-all duration-500 h-12"
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
      >
        <span className="relative z-10 flex items-center justify-center gap-3">
            {isGenerating ? <Zap size={14} className="animate-spin" /> : (isContinuing ? <GitMerge size={14} /> : <Layers size={14} />)}
            {isGenerating ? '系统渲染中...' : (isContinuing ? '连续创作 (CONTINUE)' : '执行 4K 渲染 (EXECUTE)')}
        </span>
        {/* Animated Shine Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
        <style>{`
          @keyframes shimmer {
            100% { transform: translateX(100%); }
          }
        `}</style>
      </Button>
    </div>
  );
};