'use client';

import { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Bot, Sliders } from 'lucide-react';
import AgentPanel from './AgentPanel';
import ProPanel from './ProPanel';

export default function RightPanel() {
  const { controlMode, setControlMode } = useProjectStore();

  return (
    <div className="w-96 bg-cine-dark border-l border-cine-border flex flex-col">
      {/* Mode Toggle */}
      <div className="flex border-b border-cine-border">
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
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {controlMode === 'agent' ? <AgentPanel /> : <ProPanel />}
      </div>
    </div>
  );
}
