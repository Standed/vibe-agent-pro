'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders, ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';
import AgentPanel from '../agent/AgentPanel';
import ChatPanel from '@/components/chat/ChatPanel';

import { ShotDetailsPanel } from '../chat/ShotDetailsPanel';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { AspectRatio } from '@/types/project';

export default function RightPanel() {
  const {
    controlMode,
    setControlMode,
    rightSidebarCollapsed,
    toggleRightSidebar,
    project,
    selectedShotId,
    updateShot,
    setGridResult,
    setGenerationRequest
  } = useProjectStore();

  const [panelWidth, setPanelWidth] = useState(600);
  const [resizing, setResizing] = useState(false);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const selectedShot = project?.shots.find(s => s.id === selectedShotId);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing || !resizeState.current) return;
      const delta = - (e.clientX - resizeState.current.startX);
      const next = Math.min(Math.max(resizeState.current.startWidth + delta, 400), 1000);
      setPanelWidth(next);
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const startResize = (e: React.MouseEvent) => {
    setResizing(true);
    resizeState.current = { startX: e.clientX, startWidth: panelWidth };
  };

  const handleRegenerate = (item: any) => {
    if (!selectedShot) return;
    setGenerationRequest({
      prompt: item.prompt || selectedShot.description || '',
      model: 'gemini-grid',
    });
    toast.info('已发送生成请求到对话框');
  };

  const handleApplyHistory = (item: any) => {
    if (!selectedShot) return;
    updateShot(selectedShot.id, {
      referenceImage: item.result,
      status: 'done',
      fullGridUrl: item.parameters?.fullGridUrl,
      gridImages: item.parameters?.slices
    });
    toast.success('已应用历史记录');
  };

  return (
    <div
      className={`glass-panel border-l flex flex-col transition-all duration-300 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.2)] z-20 relative ${rightSidebarCollapsed ? 'w-12' : ''}`}
      style={rightSidebarCollapsed ? {} : { width: panelWidth }}
    >
      {/* Collapse/Expand Button (Floating on edge) */}
      <button
        onClick={toggleRightSidebar}
        className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-8 h-8 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all shadow-xl border border-black/5 dark:border-white/10 flex items-center justify-center group"
        title={rightSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        {rightSidebarCollapsed ? (
          <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
        ) : (
          <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
      {rightSidebarCollapsed ? (
        /* Collapsed State */
        <div className="flex flex-col items-center py-4 gap-3 w-full">
          {/* Quick mode indicators */}
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={() => { toggleRightSidebar(); setControlMode('agent'); }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${controlMode === 'agent' ? 'bg-light-accent/20 dark:bg-cine-accent/20 text-light-accent dark:text-cine-accent' : 'bg-light-accent/5 dark:bg-cine-accent/5 text-light-text-muted dark:text-cine-text-muted hover:bg-light-accent/10 dark:hover:bg-cine-accent/10'}`}
              title="Agent 模式"
            >
              <Bot size={18} />
            </button>
            <button
              onClick={() => { toggleRightSidebar(); setControlMode('pro'); }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${controlMode === 'pro' ? 'bg-light-accent/20 dark:bg-cine-accent/20 text-light-accent dark:text-cine-accent' : 'bg-light-accent/5 dark:bg-cine-accent/5 text-light-text-muted dark:text-cine-text-muted hover:bg-light-accent/10 dark:hover:bg-cine-accent/10'}`}
              title="Pro 模式"
            >
              <Sliders size={18} />
            </button>
          </div>
          <div className="mt-4 text-[10px] font-medium text-gray-400 tracking-widest select-none opacity-50" style={{ writingMode: 'vertical-rl' }}>
            {controlMode === 'agent' ? 'AGENT' : 'PRO'}
          </div>
        </div>
      ) : (
        /* Agent/Pro Mode */
        <>
          {/* Mode Toggle */}
          {/* Mode Toggle & Header */}
          <div className="p-4 pb-2 relative flex-shrink-0 flex items-center gap-2">
            {/* Remove Old Header Button */}
            <div className="flex-1 flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
              <button
                onClick={() => setControlMode('agent')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${controlMode === 'agent'
                  ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
              >
                <Bot size={16} />
                <span>Agent</span>
              </button>
              <button
                onClick={() => setControlMode('pro')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${controlMode === 'pro'
                  ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
              >
                <Sliders size={16} />
                <span>Pro</span>
              </button>
            </div>
            {!rightSidebarCollapsed && (
              <div
                className={`absolute -left-1 top-0 h-full w-1 cursor-col-resize ${resizing ? 'bg-light-accent/50 dark:bg-cine-accent/50' : 'bg-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                onMouseDown={startResize}
                title="拖拽调整宽度"
              />
            )}
          </div>

          {/* Panel Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {controlMode === 'agent' ? (
              <AgentPanel />
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  <ChatPanel key={selectedShotId || 'project'} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Preview Modal */}
      {previewImage && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
          <div className="relative w-full h-full flex items-center justify-center">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
            <button className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors" onClick={() => setPreviewImage(null)}>
              <X size={24} />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

