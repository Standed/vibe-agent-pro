'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, User, Bot, Trash2, Sparkles, Image as ImageIcon, Grid3x3, Grid2x2, Video, CircleStop, ChevronDown, ChevronUp, Maximize2, CheckCircle2 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChatMessage } from '@/types/project';
import { useAgent } from '@/hooks/agent/useAgent';
import ThinkingProcess, { ThinkingStep } from './ThinkingProcess';
import { dataService } from '@/lib/dataService';
import { useAuth } from '@/components/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';

export default function AgentPanel() {
  const { project } = useProjectStore();
  const { user, profile } = useAuth();
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
        const filteredMessages = messages.filter(msg => msg.metadata?.channel !== 'planning');
        setChatHistory(filteredMessages);
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
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (textareaRef.current && manualHeight === null) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input, manualHeight]);

  // Resize logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;
      const deltaY = resizeRef.current.startY - e.clientY;
      const newHeight = Math.min(Math.max(resizeRef.current.startHeight + deltaY, 44), 600);
      setManualHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent text selection
    setIsResizing(true);
    // Use current height or default
    const currentHeight = textareaRef.current?.offsetHeight || 44;
    resizeRef.current = { startY: e.clientY, startHeight: manualHeight ?? currentHeight };
  };

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
      const filteredMessages = messages.filter(msg => msg.metadata?.channel !== 'planning');
      setChatHistory(filteredMessages);
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

  const activeConfirmation = pendingConfirmation;

  return (
    <div className="flex flex-col h-full glass-panel relative">
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
                      <div className={`text-sm ${msg.role === 'user' ? 'whitespace-pre-wrap' : 'prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-code:bg-zinc-200 dark:prose-code:bg-zinc-700 prose-code:px-1 prose-code:rounded prose-pre:bg-zinc-200 dark:prose-pre:bg-zinc-700 prose-pre:p-2 prose-pre:rounded-lg'}`}>
                        {msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className={`text-xs mt-1 ${msg.role === 'user'
                        ? 'text-gray-500 dark:text-gray-400'
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
                    <div className="flex-shrink-0 w-8 h-8">
                      <Avatar
                        src={profile?.avatar_url}
                        name={profile?.full_name}
                        email={user?.email}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Thinking Process (only show during processing to avoid duplicate completed summary block) */}
            {isProcessing && (
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

      {/* Input */}
      <div className="p-4 m-4 mt-0 glass-card relative group">
        {/* Drag Handle */}
        <div
          className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={handleMouseDown}
        >
          <div className="w-16 h-1 rounded-full bg-black/10 dark:bg-white/10 group-hover:bg-light-accent dark:group-hover:bg-cine-accent transition-colors" />
        </div>

        {/* Persistent Quick Command Bar */}
        {!isProcessing && (
          <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
            <button
              onClick={() => setInput('使用 Gemini 直出模式为整个项目生成图片')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/10 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all backdrop-blur-sm shadow-sm"
            >
              <Sparkles size={12} className="text-zinc-500 dark:text-zinc-400" />
              Gemini 直出
            </button>
            <button
              onClick={() => setInput('使用 Gemini Grid (2x2) 为整个项目生成多视图')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/10 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all backdrop-blur-sm shadow-sm"
            >
              <Grid2x2 size={12} className="text-zinc-500 dark:text-zinc-400" />
              Gemini Grid 2x2
            </button>
            <button
              onClick={() => setInput('使用即梦(Jimeng)为整个项目生成图片')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/10 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all backdrop-blur-sm shadow-sm"
            >
              <ImageIcon size={12} className="text-zinc-500 dark:text-zinc-400" />
              即梦生成
            </button>
            <button
              onClick={() => setInput('使用 Sora2 为整个项目生成视频')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/10 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all backdrop-blur-sm shadow-sm"
            >
              <Video size={12} className="text-zinc-500 dark:text-zinc-400" />
              Sora 视频
            </button>
          </div>
        )}

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
            style={{
              minHeight: '44px',
              maxHeight: manualHeight ? 'none' : '200px',
              height: manualHeight ?? undefined
            }}
          />

          {/* Expand Button */}
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-all"
            title="展开编辑"
            disabled={isProcessing}
          >
            <Maximize2 size={16} />
          </button>

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

      {/* Expanded Editor Overlay */}
      {isExpanded && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-white dark:bg-[#0a0a0a] flex flex-col animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
            <span className="font-bold text-base text-zinc-900 dark:text-gray-100">AI Agent 指令详情</span>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <CheckCircle2 size={20} className="text-zinc-500" />
            </button>
          </div>
          <div className="flex-1 p-6 relative overflow-hidden max-w-5xl mx-auto w-full">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-full bg-transparent border-none focus:ring-0 text-base leading-relaxed resize-none custom-scrollbar focus:outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium"
              placeholder="输入消息..."
              autoFocus
            />
            <div className="absolute bottom-8 right-6 flex gap-3">
              <button
                onClick={() => setIsExpanded(false)}
                className="px-5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-sm font-medium transition-colors"
              >
                完成
              </button>
              <button
                onClick={() => { setIsExpanded(false); handleSendMessage(); }}
                className="px-6 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 transition-all text-sm font-bold shadow-lg flex items-center gap-2"
              >
                <Send size={16} />
                发送
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Overlay - Update to use activeConfirmation */}
      {
        activeConfirmation && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <div className="w-full max-w-sm glass-card p-6 shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Sparkles className="text-blue-500" size={20} />
                </div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">积分消耗确认</h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                {activeConfirmation.message || 'Agent 请求执行耗费积分的操作'}
                <br />
                预计将消耗 <span className="font-bold text-blue-500 dark:text-blue-400">{activeConfirmation.credits}</span> 积分。
              </p>

              <div className="flex gap-3">
                <button
                  onClick={activeConfirmation.onCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={activeConfirmation.onConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
                >
                  确认继续
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
