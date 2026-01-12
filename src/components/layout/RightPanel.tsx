'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders, ChevronRight, ChevronLeft, X } from 'lucide-react';
import AgentPanel from '../agent/AgentPanel';
import ChatPanel from '@/components/chat/ChatPanel';

import { ShotDetailsPanel } from '../pro/ShotDetailsPanel';
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
      className={`glass-panel border-l flex flex-col transition-all duration-300 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.2)] z-20 ${rightSidebarCollapsed ? 'w-16' : ''}`}
      style={rightSidebarCollapsed ? {} : { width: panelWidth }}
    >
      {rightSidebarCollapsed ? (
        /* Collapsed State */
        <div className="flex flex-col items-center h-full py-6">
          <button
            onClick={toggleRightSidebar}
            className="p-3 glass-button rounded-xl group"
            title="展开侧边栏"
          >
            <ChevronLeft size={20} className="text-gray-500 dark:text-gray-400 group-hover:text-black dark:group-hover:text-white" />
          </button>
        </div>
      ) : (
        /* Agent/Pro Mode */
        <>
          {/* Mode Toggle */}
          <div className="p-6 pb-2 relative flex-shrink-0">
            <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
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
            {/* Collapse Button */}
            <button
              onClick={toggleRightSidebar}
              className="absolute left-2 top-8 p-1 glass-button rounded-lg hidden"
              title="收起侧边栏"
            >
              <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />
            </button>
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
                  <ChatPanel />
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

