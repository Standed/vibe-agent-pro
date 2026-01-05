import React, { useState } from 'react';
import { AssetBay } from './components/AssetBay';
import { DirectorDeck } from './components/DirectorDeck';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { CollageEditor } from './components/CollageEditor';
import { Asset, GeneratedImage, GenerationMode, AspectRatio, ImageSize, NodeType } from './types';
import { generateMultiViewGrid, fileToBase64, enhancePrompt, analyzeAsset, ReferenceImageData, ensureApiKey, generateCameraMovement, stitchImages } from './services/geminiService';
import { AlertCircle, X as XIcon, ShieldCheck } from 'lucide-react';
// @ts-ignore
import JSZip from 'jszip';

const App: React.FC = () => {
  // --- State ---
  const [assets, setAssets] = useState<Asset[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  
  // Selection State (Shared between Lightbox/Assets and Inspector)
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>(undefined);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(undefined);
  
  // Generation Settings
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.GRID_2x2);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE);
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.K4);
  const [prompt, setPrompt] = useState<string>('');
  
  // Processing Flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>(''); // For status text
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Collage Editor State
  const [isCollageEditorOpen, setIsCollageEditorOpen] = useState(false);

  // --- Handlers ---

  const handleModeChange = (newMode: GenerationMode) => {
    setMode(newMode);
  };

  const handleAddAsset = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const newAsset: Asset = {
        id: crypto.randomUUID(),
        file,
        previewUrl: url,
        type: file.type.startsWith('video') ? 'video' : 'image',
      };
      setAssets((prev) => [...prev, newAsset]);
      handleSelectAsset(newAsset);
    });
  };

  const handleCreateCollage = async (files: File[], layout: '2x2'|'3x3', targetAr: string) => {
      setIsCollageEditorOpen(false); 
      setGenerationStep("正在优化拼贴素材...");
      setIsGenerating(true);
      
      try {
          const stitchedBase64 = await stitchImages(files, layout, targetAr);
          const res = await fetch(stitchedBase64);
          const blob = await res.blob();
          const file = new File([blob], `collage_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const url = URL.createObjectURL(file);

          const newAsset: Asset = {
            id: crypto.randomUUID(),
            file,
            previewUrl: url,
            type: 'image',
          };
          setAssets((prev) => [newAsset, ...prev]);
          handleSelectAsset(newAsset);
      } catch (e: any) {
          setError("拼贴失败: " + e.message);
      } finally {
          setIsGenerating(false);
          setGenerationStep("");
      }
  };

  const handleRemoveAsset = (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    if (selectedAssetId === id) setSelectedAssetId(undefined);
  };

  const handleSelectAsset = (asset: Asset) => {
      setSelectedAssetId(asset.id);
      setSelectedImageId(undefined); 
      setAnalysisResult('');
  };

  const handleSelectImage = (image: GeneratedImage) => {
      setSelectedImageId(image.id);
      setSelectedAssetId(undefined); 
      setAnalysisResult('');
  };

  const handleUpdateNodePosition = (id: string, x: number, y: number) => {
      setImages(prev => prev.map(img => 
          img.id === id ? { ...img, position: { x, y } } : img
      ));
  };

  const handleAnalyzeSelection = async (instructionPrompt: string) => {
    const assetToAnalyze = assets.find(a => a.id === selectedAssetId);
    const imageToAnalyze = images.find(i => i.id === selectedImageId);
    
    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (assetToAnalyze) {
        try {
            base64Data = await fileToBase64(assetToAnalyze.file);
            mimeType = assetToAnalyze.file.type;
        } catch (e) {
            setError("无法读取素材文件。");
            return;
        }
    } else if (imageToAnalyze) {
        if (imageToAnalyze.url.startsWith('data:')) {
           base64Data = imageToAnalyze.url.split(',')[1];
        } else {
           setError("无法分析远程图片");
           return;
        }
    } else {
        return;
    }

    setIsAnalyzing(true);
    try {
        const result = await analyzeAsset(base64Data, mimeType, instructionPrompt);
        setAnalysisResult(result);
    } catch (e: any) {
        handleError(e);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true); 
    setGenerationStep("正在利用 AI 深度优化指令...");
    try {
        const enhanced = await enhancePrompt(prompt);
        setPrompt(enhanced);
    } catch (e) {
        console.error(e);
    } finally {
        setIsGenerating(false);
        setGenerationStep("");
    }
  };

  const handleGenerateCamera = async () => {
    if (!prompt.trim()) return;
    setSelectedImageId(undefined);
    setSelectedAssetId(undefined);
    setIsAnalyzing(true);
    try {
        const result = await generateCameraMovement(prompt);
        setAnalysisResult(result);
    } catch (e: any) {
        handleError(e);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const getNextChainStartX = () => {
      const rootNodes = images.filter(i => !i.parentId);
      if (rootNodes.length === 0) return 100;
      const lastRoot = rootNodes[rootNodes.length - 1];
      return (lastRoot.position?.x || 100) + 420; 
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const timestamp = Date.now();
      const rows = mode === GenerationMode.GRID_2x2 ? 2 : 3;
      const cols = mode === GenerationMode.GRID_2x2 ? 2 : 3;
      
      const imageAssets = assets.filter(a => a.type === 'image');
      const parentNode = images.find(i => i.id === selectedImageId && i.nodeType === 'render');
      
      let startX = 100;
      let startY = 100;
      let previousContextImage = undefined;
      
      if (parentNode) {
          startX = parentNode.position?.x || 0; 
          startY = (parentNode.position?.y || 0) + 480; 
          
          if (parentNode.fullGridUrl && parentNode.fullGridUrl.startsWith('data:')) {
              previousContextImage = parentNode.fullGridUrl;
          } else if (parentNode.url.startsWith('data:')) {
              previousContextImage = parentNode.url;
          }
      } else {
          startX = getNextChainStartX();
          startY = 100;
      }

      let prioritizedAssets = [...imageAssets];
      if (selectedAssetId) {
          const selected = prioritizedAssets.find(a => a.id === selectedAssetId);
          if (selected) {
              prioritizedAssets = prioritizedAssets.filter(a => a.id !== selectedAssetId);
              prioritizedAssets.unshift(selected);
          }
      } else {
          prioritizedAssets.reverse();
      }

      const assetsToUse = prioritizedAssets.slice(0, 5);
      setGenerationStep(parentNode ? "正在进行连续创作渲染..." : "正在渲染 4K 分镜母版...");
      
      const referenceData: ReferenceImageData[] = [];
      for (const asset of assetsToUse) {
          referenceData.push({
             data: await fileToBase64(asset.file),
             mimeType: asset.file.type
          });
      }

      const finalResult = await generateMultiViewGrid(
          prompt, 
          rows, 
          cols, 
          aspectRatio, 
          imageSize, 
          referenceData,
          previousContextImage 
      );
      
      setGenerationStep("计算镜头运动轨迹...");
      const cameraMove = await generateCameraMovement(prompt);

      const finalNode: GeneratedImage = {
          id: crypto.randomUUID(),
          url: finalResult.fullImage,
          fullGridUrl: finalResult.fullImage,
          prompt: prompt,
          textData: prompt, 
          assetIds: assetsToUse.map(a => a.id), 
          aspectRatio,
          timestamp: timestamp + 1,
          nodeType: 'render',
          parentId: parentNode?.id, 
          position: { x: startX, y: startY },
          cameraDescription: cameraMove,
          slices: finalResult.slices 
      };

      setImages(prev => [...prev, finalNode]);
      handleSelectImage(finalNode);

    } catch (err: any) {
      handleError(err);
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
    }
  };

  const handleError = (err: any) => {
      let message = err.message || "未知错误";
      if (message.includes("API key") || message.includes("403") || message.includes("Requested entity was not found")) {
          message = "需要高级 API Key 权限。";
          // @ts-ignore
          if (window.aistudio && window.aistudio.openSelectKey) {
             // @ts-ignore
             window.aistudio.openSelectKey();
          }
      }
      setError(message);
  };

  const handleDeleteImage = (id: string) => {
      setImages(prev => prev.filter(img => img.id !== id));
      if (selectedImageId === id) setSelectedImageId(undefined);
  };

  const handleDownloadBatch = async () => {
      if (images.length === 0) return;
      const zip = new JSZip();
      const folder = zip.folder("DirectorDeck_Pro_renders");
      
      try {
          const renderNodes = images.filter(i => i.nodeType === 'render');
          for (let i = 0; i < renderNodes.length; i++) {
              const img = renderNodes[i];
              const mainFetch = await fetch(img.url);
              const mainBlob = await mainFetch.blob();
              folder?.file(`render_${i}_main.png`, mainBlob);

              if (img.slices) {
                  const sliceFolder = folder?.folder(`render_${i}_slices`);
                  for (let s = 0; s < img.slices.length; s++) {
                      const sliceUrl = img.slices[s];
                      const sFetch = await fetch(sliceUrl);
                      const sBlob = await sFetch.blob();
                      sliceFolder?.file(`slice_${s+1}.png`, sBlob);
                  }
              }
          }
          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const a = document.createElement("a");
          a.href = url;
          a.download = `DirectorDeck_Pro_Workflow_${Date.now()}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e: any) {
          setError("打包下载失败: " + e.message);
      }
  };

  const activeImage = images.find(i => i.id === selectedImageId) || null;
  const activeAsset = assets.find(a => a.id === selectedAssetId) || null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cine-black text-zinc-400 font-sans">
      
      {/* Collage Modal */}
      <CollageEditor 
        isOpen={isCollageEditorOpen} 
        onClose={() => setIsCollageEditorOpen(false)}
        onSave={handleCreateCollage}
        defaultAspectRatio={aspectRatio}
      />

      {/* 1. Left Sidebar: Assets & Controls (340px) */}
      <aside className="w-[340px] flex flex-col border-r border-cine-border bg-cine-dark z-20 shadow-2xl flex-shrink-0">
        <div className="p-5 pb-4 border-b border-cine-border bg-cine-black/50 backdrop-blur-md">
            <h1 className="text-white text-xs font-bold tracking-[0.15em] uppercase font-mono flex items-center gap-2.5">
                <div className="relative">
                  <span className="block w-2.5 h-2.5 bg-cine-accent rounded-[1px] shadow-[0_0_12px_rgba(201,255,86,0.6)]"></span>
                  <span className="absolute inset-0 w-2.5 h-2.5 bg-cine-accent rounded-[1px] animate-ping opacity-20"></span>
                </div>
                地质大学博士说AI - 影视实验室Pro
            </h1>
        </div>

        <div className="flex-1 flex flex-col p-4 gap-7 overflow-y-auto custom-scrollbar bg-gradient-to-b from-cine-dark to-cine-black">
            {/* Auto expanding asset bay */}
            <div className="flex-shrink-0">
                <AssetBay 
                    assets={assets} 
                    onAddAsset={handleAddAsset} 
                    onRemoveAsset={handleRemoveAsset} 
                    onSelectAsset={handleSelectAsset}
                    selectedAssetId={selectedAssetId}
                    onOpenCollageTool={() => setIsCollageEditorOpen(true)}
                />
            </div>

            <div className="flex-shrink-0">
                <DirectorDeck 
                    mode={mode}
                    setMode={handleModeChange}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    imageSize={imageSize}
                    setImageSize={setImageSize}
                    prompt={prompt}
                    setPrompt={setPrompt}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    onEnhancePrompt={handleEnhancePrompt}
                    onGenerateCamera={handleGenerateCamera}
                    isContinuing={!!(selectedImageId && images.find(i => i.id === selectedImageId)?.nodeType === 'render')}
                />
            </div>
            
            <div className="mt-auto pt-6 border-t border-cine-border opacity-30 flex items-center justify-center gap-2">
                <ShieldCheck size={12} />
                <span className="text-[9px] font-mono tracking-widest uppercase">Professional Edition v2.1</span>
            </div>
        </div>
      </aside>

      {/* 2. Middle: Canvas */}
      <main className="flex-1 relative bg-cine-black flex flex-col min-w-0">
        <Canvas
            images={images} 
            onSelect={handleSelectImage} 
            selectedId={selectedImageId}
            onDelete={handleDeleteImage} 
            onUpdateNodePosition={handleUpdateNodePosition}
            onDownloadAll={handleDownloadBatch}
            assets={assets} 
        />
        
        {isGenerating && (
            <div className="absolute inset-0 bg-cine-black/90 backdrop-blur-xl z-50 flex flex-col items-center justify-center space-y-8 pointer-events-none animate-in fade-in duration-500">
                 <div className="relative scale-110">
                    <div className="w-20 h-20 border-t-2 border-r-2 border-transparent border-t-cine-accent border-r-cine-accent rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-cine-accent rounded-full shadow-[0_0_20px_#c9ff56]"></div>
                    </div>
                 </div>
                 <div className="text-center space-y-3">
                     <p className="text-white font-mono tracking-[0.3em] text-sm uppercase font-bold">
                         {generationStep || "正在处理渲染指令"}
                     </p>
                     <p className="text-cine-accent/50 font-mono text-[10px] tracking-widest animate-pulse">
                         AI MODEL: GEMINI 3 PRO VISUALIZATION
                     </p>
                 </div>
            </div>
        )}

        {error && (
            <div className="absolute bottom-8 left-8 z-50 bg-red-950/80 backdrop-blur-lg border border-red-500/30 text-red-200 p-5 rounded-md text-xs flex gap-4 items-start animate-in slide-in-from-bottom-5 max-w-lg shadow-2xl">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-400" />
                <div className="space-y-1.5 flex-1">
                    <p className="font-bold uppercase tracking-[0.1em] text-red-400 text-[10px]">系统运行异常 (System Failure)</p>
                    <span className="leading-relaxed opacity-90 font-mono">{error}</span>
                </div>
                <button onClick={() => setError(null)} className="ml-2 hover:text-white transition-colors opacity-50 hover:opacity-100">
                    <XIcon size={16} />
                </button>
            </div>
        )}
      </main>

      {/* 3. Right: Inspector (360px) */}
      <aside className="w-[360px] bg-cine-dark border-l border-cine-border z-20 shadow-2xl flex-shrink-0">
         <Inspector 
            selectedImage={activeImage}
            selectedAsset={activeAsset}
            onClose={() => {
                setSelectedImageId(undefined);
                setSelectedAssetId(undefined);
                setAnalysisResult('');
            }}
            onAnalyze={handleAnalyzeSelection}
            isAnalyzing={isAnalyzing}
            analysisResult={analysisResult}
         />
      </aside>
    </div>
  );
};

export default App;