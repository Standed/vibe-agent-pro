'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, User, Bot, Trash2, Sparkles, Image as ImageIcon, Grid3x3, CircleStop, ChevronDown, ChevronUp } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChatMessage } from '@/types/project';
import { useAgent } from '@/hooks/useAgent';
import ThinkingProcess, { ThinkingStep } from './ThinkingProcess';
import { dataService } from '@/lib/dataService';
import { useAuth } from '@/components/auth/AuthProvider';

export default function AgentPanel() {
  const { project } = useProjectStore();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const { isProcessing, thinkingSteps, summary, sendMessage, clearSession, stop, pendingConfirmation } = useAgent();

  // 从云端加载聊天历史
  useEffect(() => {
    const loadHistory = async () => {
      if (!project || !user) {
        setChatHistory([]);
        setLoadingHistory(false);
        return;
      }

      try {
        const messages = await dataService.getChatMessages({
          projectId: project.id,
          scope: 'project',
        });
        setChatHistory(messages);
      } catch (error) {
        console.error('加载聊天历史失败:', error);
        setChatHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [project?.id, user]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, thinkingSteps]);

  // Auto-resize input
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userContent = input.trim();
    setInput('');

    // ⭐ 立即添加用户消息到本地状态（乐观更新）
    const userMessageId = crypto?.randomUUID() || `msg-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      userId: user?.id || '',
      projectId: project?.id || '',
      scope: 'project',
      role: 'user',
      content: userContent,
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setChatHistory((prev) => [...prev, userMessage]);

    // Send to agent
    await sendMessage(userContent);

    // 重新加载聊天历史（包含AI回复）
    if (project && user) {
      const messages = await dataService.getChatMessages({
        projectId: project.id,
        scope: 'project',
      });
      setChatHistory(messages);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearSession = async () => {
    await clearSession();
    setChatHistory([]);
  };

  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full glass-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-light-accent dark:text-cine-accent" />
          <h2 className="font-semibold text-light-text dark:text-white">
            AI Agent
          </h2>
        </div>

        <button
          onClick={handleClearSession}
          className="p-2 glass-button rounded-lg"
          title="清除会话"
        >
          <Trash2 size={18} className="text-gray-500 dark:text-gray-400" />
        </button>
        {isProcessing && (
          <button
            onClick={stop}
            className="ml-2 px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1"
            title="停止当前 AI 处理"
          >
            <CircleStop size={16} />
            <span className="text-sm">停止</span>
          </button>
        )}
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
            {chatHistory.map((msg) => {
              const hasThinkingSteps = msg.role === 'assistant' && msg.metadata?.thinkingSteps && Array.isArray(msg.metadata.thinkingSteps);
              const isExpanded = expandedMessages.has(msg.id);
              const historicalSteps: ThinkingStep[] | undefined = hasThinkingSteps && msg.metadata?.thinkingSteps
                ? (msg.metadata.thinkingSteps as any[]).map((step: any) => ({
                  id: step.id,
                  type: step.type,
                  content: step.content,
                  status: step.status,
                  duration: step.duration,
                  details: step.details,
                  timestamp: new Date(step.timestamp),
                }))
                : undefined;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white/10 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                      <Bot size={16} className="text-white" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 max-w-[80%]">
                    <div
                      className={`rounded-2xl p-4 shadow-sm ${msg.role === 'user'
                        ? 'bg-black/5 dark:bg-white/10 text-light-text dark:text-white shadow-sm border border-black/5 dark:border-white/5 rounded-tr-sm'
                        : 'glass-card text-gray-800 dark:text-gray-100 rounded-tl-sm'
                        }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                      {/* Timestamp */}
                      <div className={`text-xs mt-1 ${msg.role === 'user'
                        ? 'text-white/70'
                        : 'text-light-text-muted dark:text-cine-text-muted'
                        }`}>
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {/* 历史思考步骤（可展开） */}
                    {hasThinkingSteps && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleMessageExpansion(msg.id)}
                          className="flex items-center gap-1 text-xs text-light-accent dark:text-cine-accent hover:underline"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={14} />
                              隐藏思考过程
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              查看思考过程
                            </>
                          )}
                        </button>
                        {isExpanded && historicalSteps && (
                          <div className="mt-2">
                            <ThinkingProcess
                              steps={historicalSteps}
                              isProcessing={false}
                              summary=""
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <User size={16} className="text-gray-600 dark:text-gray-300" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Thinking Process (only show during processing or if there are steps) */}
            {(isProcessing || thinkingSteps.length > 0) && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white/10 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
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
        <div className="px-6 py-4 border-t border-black/5 dark:border-white/5 bg-white/30 dark:bg-black/20 backdrop-blur-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">
            快捷操作：
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setInput('使用 SeeDream 为当前场景所有未生成的分镜生成图片')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200"
            >
              <Sparkles size={14} className="text-light-accent dark:text-cine-accent" />
              SeeDream 批量生成
            </button>
            <button
              onClick={() => setInput('使用 Gemini Grid (2x2) 为当前场景生成多视图并自动分配')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200"
            >
              <Grid3x3 size={14} className="text-blue-500" />
              Grid 2x2 自动分配
            </button>
            <button
              onClick={() => setInput('使用 Gemini Grid (3x3) 为当前场景生成多视图并自动分配')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200"
            >
              <Grid3x3 size={14} className="text-blue-500" />
              Grid 3x3 自动分配
            </button>
            <button
              onClick={() => setInput('为整个项目的所有未生成分镜使用 SeeDream 生成图片')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl glass-button text-gray-700 dark:text-gray-200"
            >
              <ImageIcon size={14} className="text-green-500" />
              全项目批量生成
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 m-4 mt-0 glass-card">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            disabled={isProcessing}
            className="flex-1 bg-transparent border-none px-2 py-3 text-sm focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 overflow-y-auto"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />

          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isProcessing}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-black dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-md"
          >
            {isProcessing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 px-2">
          提示: Agent 会自动使用增强上下文和并行执行，大幅提升处理效率
        </div>
      </div>

      {/* Confirmation Overlay */}
      {pendingConfirmation && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-sm glass-card p-6 shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Sparkles className="text-blue-500" size={20} />
              </div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">积分消耗确认</h3>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {pendingConfirmation.message}
              <br />
              预计将消耗 <span className="font-bold text-blue-500 dark:text-blue-400">{pendingConfirmation.credits}</span> 积分。
            </p>

            <div className="flex gap-3">
              <button
                onClick={pendingConfirmation.onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={pendingConfirmation.onConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
              >
                确认继续
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
