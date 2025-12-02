'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders, ChevronRight, ChevronLeft } from 'lucide-react';
import AgentPanel from './AgentPanel';
import ProPanel from './ProPanel';
import ShotDetailPanel from '../shot/ShotDetailPanel';

export default function RightPanel() {
  const { controlMode, setControlMode, rightSidebarCollapsed, toggleRightSidebar, selectedShotId, selectShot } = useProjectStore();

  // 当有选中的 Shot 时，显示分镜详情面板
  const showShotDetail = !rightSidebarCollapsed && selectedShotId;

  return (
    <div className={`bg-light-panel dark:bg-cine-dark border-l border-light-border dark:border-cine-border flex flex-col transition-all duration-300 ${rightSidebarCollapsed ? 'w-12' : 'w-96'}`}>
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
      ) : showShotDetail ? (
        /* Shot Detail Panel */
        <ShotDetailPanel
          shotId={selectedShotId}
          onClose={() => selectShot('')}
        />
      ) : (
        /* Normal Agent/Pro Mode */
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
