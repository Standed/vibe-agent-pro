'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders, ChevronRight, ChevronLeft } from 'lucide-react';
import AgentPanel from '../agent/AgentPanel';
import ChatPanelWithHistory from './ChatPanelWithHistory';

export default function RightPanel() {
  const { controlMode, setControlMode, rightSidebarCollapsed, toggleRightSidebar } = useProjectStore();
  const [panelWidth, setPanelWidth] = useState(384);
  const [resizing, setResizing] = useState(false);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing || !resizeState.current) return;
      const delta = - (e.clientX - resizeState.current.startX);
      const next = Math.min(Math.max(resizeState.current.startWidth + delta, 320), 560);
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
          {/* Mode Toggle */}
          <div className="p-6 pb-2 relative">
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
              className="absolute left-2 top-8 p-1 glass-button rounded-lg hidden" // Hidden in expanded mode for cleaner look, or move it
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
          <div className="flex-1 overflow-hidden">
            {controlMode === 'agent' ? <AgentPanel /> : <ChatPanelWithHistory />}
          </div>
        </>
      )}
    </div>
  );
}
