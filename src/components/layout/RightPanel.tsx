'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders, ChevronRight, ChevronLeft } from 'lucide-react';
import AgentPanel from './AgentPanel';
import ProPanel from './ProPanel';

export default function RightPanel() {
  const { controlMode, setControlMode, rightSidebarCollapsed, toggleRightSidebar } = useProjectStore();

  return (
    <div className={`bg-cine-dark border-l border-cine-border flex flex-col transition-all duration-300 ${rightSidebarCollapsed ? 'w-12' : 'w-96'}`}>
      {rightSidebarCollapsed ? (
        /* Collapsed State */
        <div className="flex flex-col items-center h-full">
          <button
            onClick={toggleRightSidebar}
            className="p-3 hover:bg-cine-panel transition-colors mt-4"
            title="展开侧边栏"
          >
            <ChevronLeft size={20} className="text-cine-text-muted" />
          </button>
        </div>
      ) : (
        /* Expanded State */
        <>
          {/* Mode Toggle */}
          <div className="flex border-b border-cine-border relative">
            <button
              onClick={() => setControlMode('agent')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-colors ${
                controlMode === 'agent'
                  ? 'bg-cine-panel text-cine-accent border-b-2 border-cine-accent'
                  : 'text-cine-text-muted hover:text-white hover:bg-cine-panel/50'
              }`}
            >
              <Bot size={18} />
              <span className="text-sm font-medium">Agent 模式</span>
            </button>
            <button
              onClick={() => setControlMode('pro')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-colors ${
                controlMode === 'pro'
                  ? 'bg-cine-panel text-cine-accent border-b-2 border-cine-accent'
                  : 'text-cine-text-muted hover:text-white hover:bg-cine-panel/50'
              }`}
            >
              <Sliders size={18} />
              <span className="text-sm font-medium">Pro 模式</span>
            </button>
            {/* Collapse Button */}
            <button
              onClick={toggleRightSidebar}
              className="absolute left-2 top-3 p-1 hover:bg-cine-panel rounded transition-colors"
              title="收起侧边栏"
            >
              <ChevronRight size={16} className="text-cine-text-muted" />
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {controlMode === 'agent' ? <AgentPanel /> : <ProPanel />}
          </div>
        </>
      )}
    </div>
  );
}
