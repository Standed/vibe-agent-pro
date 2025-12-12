/**
 * AgentPanel 组件迁移示例
 *
 * 从旧的 Project.chatHistory 迁移到新的 chat_messages 表
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import { ChatMessage } from '@/types/project';

export function AgentPanelNew() {
  const { project } = useProjectStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // 加载项目级对话
  useEffect(() => {
    if (!project) return;

    const loadMessages = async () => {
      try {
        setLoading(true);
        const msgs = await dataService.getChatMessages({
          projectId: project.id,
          scope: 'project',
        });
        setMessages(msgs);
      } catch (error) {
        console.error('加载对话失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [project?.id]);

  // 发送消息
  const handleSend = async (content: string) => {
    if (!project || !content.trim()) return;

    try {
      setSending(true);

      // 获取当前用户
      const user = await getCurrentUser(); // 从 Supabase Auth 获取
      if (!user) {
        throw new Error('用户未登录');
      }

      // 1. 保存用户消息
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        userId: user.id,
        projectId: project.id,
        scope: 'project',
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dataService.saveChatMessage(userMsg);
      setMessages(prev => [...prev, userMsg]);

      // 2. 调用 AI 生成回复
      const aiResponse = await callAIService(content, project);

      // 3. 保存 AI 回复
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        userId: user.id,
        projectId: project.id,
        scope: 'project',
        role: 'assistant',
        content: aiResponse.content,
        thought: aiResponse.thought,
        metadata: {
          model: 'doubao-pro',
          toolResults: aiResponse.toolResults,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dataService.saveChatMessage(aiMsg);
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  // 清除对话历史
  const handleClear = async () => {
    if (!project) return;
    if (!confirm('确定要清除所有对话吗？')) return;

    try {
      await dataService.clearChatHistory({
        projectId: project.id,
      });
      setMessages([]);
    } catch (error) {
      console.error('清除对话失败:', error);
      alert('清除失败，请重试');
    }
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* 输入框 */}
      <div className="p-4 border-t">
        <ChatInput
          onSend={handleSend}
          disabled={sending}
          placeholder="输入消息..."
        />
        <button
          onClick={handleClear}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700"
        >
          清除历史
        </button>
      </div>
    </div>
  );
}

// 辅助函数
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function callAIService(content: string, project: any) {
  const response = await fetch('/api/agent-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: content,
      projectId: project.id,
    }),
  });

  if (!response.ok) {
    throw new Error('AI 服务调用失败');
  }

  return response.json();
}

// ChatBubble 组件
function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${
        message.role === 'user'
          ? 'bg-purple-600 text-white'
          : 'bg-gray-200 text-gray-900'
      }`}>
        {/* 内容 */}
        <div className="whitespace-pre-wrap">{message.content}</div>

        {/* AI 思考过程（可折叠） */}
        {message.thought && (
          <details className="mt-2 text-sm opacity-70">
            <summary className="cursor-pointer">思考过程</summary>
            <div className="mt-1">{message.thought}</div>
          </details>
        )}

        {/* 时间戳 */}
        <div className="mt-1 text-xs opacity-50">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

// ChatInput 组件
function ChatInput({
  onSend,
  disabled,
  placeholder
}: {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;

    onSend(input);
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {disabled ? '发送中...' : '发送'}
      </button>
    </form>
  );
}
