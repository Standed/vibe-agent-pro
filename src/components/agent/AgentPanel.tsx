'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, User, Bot, Trash2, Sparkles, Image as ImageIcon, Grid3x3 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChatMessage } from '@/types/project';
import { useAgent } from '@/hooks/useAgent';
import ThinkingProcess from './ThinkingProcess';

export default function AgentPanel() {
  const { project, addChatMessage } = useProjectStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isProcessing, thinkingSteps, summary, sendMessage, clearSession } = useAgent();

  const chatHistory = useMemo(
    () => project?.chatHistory ?? [],
    [project?.chatHistory]
  );

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, thinkingSteps]);

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userContent = input.trim();
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date(),
    };

    // Add user message to chat history
    addChatMessage(userMessage);
    setInput('');

    // Send to agent
    await sendMessage(userContent);

    // Add agent response to chat history
    if (summary) {
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: summary,
        timestamp: new Date(),
      };
      addChatMessage(assistantMessage);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-light-bg dark:bg-cine-bg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-cine-border">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-light-accent dark:text-cine-accent" />
          <h2 className="font-semibold text-light-text dark:text-white">
            AI Agent
          </h2>
        </div>

        <button
          onClick={clearSession}
          className="p-2 hover:bg-light-bg dark:hover:bg-cine-panel rounded-lg transition-colors"
          title="清除会话"
        >
          <Trash2 size={18} className="text-light-text-muted dark:text-cine-text-muted" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-light-text-muted dark:text-cine-text-muted">
            <Bot size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">AI Agent 准备就绪</p>
            <p className="text-sm max-w-md">
              我可以帮助你创建场景、添加镜头、批量生成图片等操作。
              <br />
              试试说：&quot;帮我创建3个场景&quot;
            </p>
          </div>
        ) : (
          <>
            {chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-light-accent dark:bg-cine-accent flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-light-accent dark:bg-cine-accent text-white'
                      : 'bg-light-panel dark:bg-cine-panel text-light-text dark:text-white'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                  {/* Timestamp */}
                  <div className={`text-xs mt-1 ${
                    msg.role === 'user'
                      ? 'text-white/70'
                      : 'text-light-text-muted dark:text-cine-text-muted'
                  }`}>
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                    <User size={16} className="text-gray-600 dark:text-gray-300" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking Process (only show during processing or if there are steps) */}
            {(isProcessing || thinkingSteps.length > 0) && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-light-accent dark:bg-cine-accent flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <ThinkingProcess
                    steps={thinkingSteps}
                    isProcessing={isProcessing}
                    summary={summary}
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Presets */}
      {chatHistory.length === 0 && !isProcessing && (
        <div className="px-4 py-3 border-t border-light-border dark:border-cine-border bg-light-panel/50 dark:bg-cine-panel/50">
          <p className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">
            快捷操作：
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setInput('使用 SeeDream 为当前场景所有未生成的分镜生成图片')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
            >
              <Sparkles size={14} />
              SeeDream 批量生成
            </button>
            <button
              onClick={() => setInput('使用 Gemini Grid (2x2) 为当前场景生成多视图并自动分配')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
            >
              <Grid3x3 size={14} />
              Grid 2x2 自动分配
            </button>
            <button
              onClick={() => setInput('使用 Gemini Grid (3x3) 为当前场景生成多视图并自动分配')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
            >
              <Grid3x3 size={14} />
              Grid 3x3 自动分配
            </button>
            <button
              onClick={() => setInput('为整个项目的所有未生成分镜使用 SeeDream 生成图片')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-light-bg dark:bg-cine-bg border border-light-border dark:border-cine-border hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 transition-colors"
            >
              <ImageIcon size={14} />
              全项目批量生成
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-light-border dark:border-cine-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            disabled={isProcessing}
            className="flex-1 bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-light-text dark:text-white"
            rows={2}
          />

          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isProcessing}
            className="flex-shrink-0 w-12 h-12 rounded-lg bg-light-accent dark:bg-cine-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center"
          >
            {isProcessing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        <div className="mt-2 text-xs text-light-text-muted dark:text-cine-text-muted">
          提示: Agent 会自动使用增强上下文和并行执行，大幅提升处理效率
        </div>
      </div>
    </div>
  );
}
