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
      className={`bg-light-panel dark:bg-cine-dark border-l border-light-border dark:border-cine-border flex flex-col transition-all duration-300 ${rightSidebarCollapsed ? 'w-12' : ''}`}
      style={rightSidebarCollapsed ? {} : { width: panelWidth }}
    >
      {rightSidebarCollapsed ? (
        /* Collapsed State */
        <div className="flex flex-col items-center h-full">
          <button
            onClick={toggleRightSidebar}
            className="p-3 hover:bg-light-bg dark:hover:bg-cine-panel transition-colors mt-4"
            title="展开侧边栏"
          >
            <ChevronLeft size={20} className="text-light-text-muted dark:text-cine-text-muted" />
          </button>
        </div>
      ) : (
        /* Agent/Pro Mode */
        <>
          {/* Mode Toggle */}
          <div className="flex border-b border-light-border dark:border-cine-border relative">
            <button
              onClick={() => setControlMode('agent')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-colors ${
                controlMode === 'agent'
                  ? 'bg-light-panel dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
                  : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white hover:bg-light-bg/50 dark:hover:bg-cine-panel/50'
              }`}
            >
              <Bot size={18} />
              <span className="text-sm font-medium">Agent 模式</span>
            </button>
            <button
              onClick={() => setControlMode('pro')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-colors ${
                controlMode === 'pro'
                  ? 'bg-light-panel dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
                  : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white hover:bg-light-bg/50 dark:hover:bg-cine-panel/50'
              }`}
            >
              <Sliders size={18} />
              <span className="text-sm font-medium">Pro 模式</span>
            </button>
            {/* Collapse Button */}
            <button
              onClick={toggleRightSidebar}
              className="absolute left-2 top-3 p-1 hover:bg-light-bg dark:hover:bg-cine-panel rounded transition-colors"
              title="收起侧边栏"
            >
              <ChevronRight size={16} className="text-light-text-muted dark:text-cine-text-muted" />
            </button>
            {!rightSidebarCollapsed && (
              <div
                className={`absolute -left-1 top-0 h-full w-1 cursor-col-resize ${resizing ? 'bg-light-accent/30 dark:bg-cine-accent/30' : 'bg-transparent hover:bg-light-border dark:hover:bg-cine-border'}`}
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
