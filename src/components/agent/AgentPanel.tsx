'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, User, Bot } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChatMessage } from '@/types/project';
import { toast } from 'sonner';

export default function AgentPanel() {
  const { project, addChatMessage } = useProjectStore();
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatHistory = project?.chatHistory || [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message
    addChatMessage(userMessage);
    setInput('');
    setIsProcessing(true);

    try {
      // TODO: 这里需要调用 AI API 来处理用户请求
      // 目前只是一个占位响应
      const assistantResponse = await processAgentCommand(userMessage.content);

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date(),
      };

      addChatMessage(assistantMessage);
    } catch (error) {
      console.error('Agent processing error:', error);
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: '抱歉，处理您的请求时出错了。请重试。',
        timestamp: new Date(),
      };
      addChatMessage(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // 简单的命令处理逻辑（后续可以接入真正的 AI）
  const processAgentCommand = async (command: string): Promise<string> => {
    const lowerCommand = command.toLowerCase();

    // 帮助命令
    if (lowerCommand.includes('帮助') || lowerCommand.includes('help')) {
      return `我是 Vibe Agent Pro 的智能助手，我可以帮助您：

**1. 创建分镜**
   - "为场景 1 添加一个中景镜头"
   - "创建一个 3 秒的特写镜头"

**2. 生成素材**
   - "为镜头 1 生成图片"
   - "生成 Grid 多视图"
   - "生成视频"

**3. 编辑内容**
   - "修改镜头 2 的描述"
   - "更新镜头时长为 5 秒"

**4. 查询信息**
   - "显示所有场景"
   - "镜头 3 的状态是什么"

**5. 导出和下载**
   - "批量下载素材"
   - "导出分镜脚本"

直接告诉我您想做什么，我会帮助您完成！`;
    }

    // 查询场景
    if (lowerCommand.includes('场景') && (lowerCommand.includes('显示') || lowerCommand.includes('查看') || lowerCommand.includes('列出'))) {
      const scenes = project?.scenes || [];
      if (scenes.length === 0) {
        return '当前项目还没有场景。您可以使用 AI 自动分镜功能来生成场景和镜头。';
      }

      return `当前项目有 ${scenes.length} 个场景：\n\n${scenes.map((scene, idx) => {
        const shotCount = project?.shots.filter(s => s.sceneId === scene.id).length || 0;
        return `${idx + 1}. ${scene.name} (${shotCount} 个镜头)`;
      }).join('\n')}`;
    }

    // 查询镜头
    if (lowerCommand.includes('镜头') && (lowerCommand.includes('显示') || lowerCommand.includes('查看') || lowerCommand.includes('列出'))) {
      const shots = project?.shots || [];
      if (shots.length === 0) {
        return '当前项目还没有镜头。您可以使用 AI 自动分镜功能来生成镜头，或手动添加镜头。';
      }

      const summary = shots.slice(0, 5).map((shot, idx) => {
        return `${idx + 1}. 镜头 #${shot.order} - ${shot.shotSize} - ${shot.duration}s ${shot.status === 'done' ? '✓' : ''}`;
      }).join('\n');

      return `当前项目有 ${shots.length} 个镜头${shots.length > 5 ? '（显示前 5 个）' : ''}：\n\n${summary}`;
    }

    // 生成图片
    if (lowerCommand.includes('生成') && (lowerCommand.includes('图片') || lowerCommand.includes('图像') || lowerCommand.includes('单图'))) {
      return '要生成单图，请：\n1. 在左侧边栏选择一个镜头\n2. 切换到右侧 Pro 模式面板\n3. 选择"单图生成"类型\n4. 输入提示词\n5. 点击"生成单图"按钮\n\n提示：Pro 模式面板在右侧，如果看不到请点击右上角展开按钮。';
    }

    // Grid 生成
    if (lowerCommand.includes('grid') || lowerCommand.includes('多视图')) {
      return '要生成 Grid 多视图，请：\n1. 在左侧边栏选择一个场景（不要选择具体镜头）\n2. 切换到右侧 Pro 模式面板\n3. 选择"Grid 多视图"类型\n4. 选择场景和 Grid 大小（2x2 或 3x3）\n5. 输入提示词描述整体风格\n6. 点击"生成 Grid"按钮\n\nGrid 会自动为场景中的多个镜头生成统一风格的图片！';
    }

    // 视频生成
    if (lowerCommand.includes('生成') && lowerCommand.includes('视频')) {
      return '要生成视频，请：\n1. 确保镜头已经有参考图片（通过单图或 Grid 生成）\n2. 在左侧边栏选择该镜头\n3. 切换到右侧 Pro 模式面板\n4. 选择"视频生成"类型\n5. 输入运镜提示词（如"镜头缓慢推进"）\n6. 点击"生成视频"按钮\n\n视频生成需要 2-3 分钟，请耐心等待。';
    }

    // 下载素材
    if (lowerCommand.includes('下载') || lowerCommand.includes('导出')) {
      return '要批量下载素材，请点击左侧边栏顶部的"批量下载素材"按钮。\n\n系统会自动打包所有已生成的图片、视频和音频文件，并下载为 ZIP 压缩包。';
    }

    // 默认响应
    return `收到您的消息："${command}"\n\n我正在学习如何更好地理解您的需求。目前您可以：\n\n- 输入"帮助"查看所有可用命令\n- 使用左侧边栏手动操作\n- 使用右侧 Pro 模式面板生成素材\n\n如果您需要具体帮助，请详细描述您想做什么，我会尽力协助！`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-light-bg dark:bg-cine-black">
      {/* Header */}
      <div className="border-b border-light-border dark:border-cine-border p-4">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-light-accent dark:text-cine-accent" />
          <h2 className="text-lg font-bold text-light-text dark:text-white">
            Agent 模式
          </h2>
        </div>
        <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
          通过对话操作您的项目
        </p>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 && (
          <div className="text-center py-12">
            <Bot size={48} className="mx-auto mb-4 text-light-text-muted dark:text-cine-text-muted opacity-30" />
            <h3 className="text-sm font-medium text-light-text dark:text-white mb-2">
              开始对话
            </h3>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted max-w-md mx-auto">
              我是您的 AI 助手，可以帮您操作项目、生成素材、查询信息等。输入"帮助"查看所有可用命令。
            </p>
          </div>
        )}

        {chatHistory.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-light-accent dark:text-cine-accent" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-light-accent dark:bg-cine-accent text-white'
                  : 'bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs opacity-60 mt-2">
                {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-light-text dark:text-white" />
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 flex items-center justify-center">
              <Bot size={16} className="text-light-accent dark:text-cine-accent" />
            </div>
            <div className="bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3">
              <Loader2 size={16} className="animate-spin text-light-accent dark:text-cine-accent" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-light-border dark:border-cine-border p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="输入消息或帮助查看可用命令"
            className="flex-1 bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted"
            rows={2}
            disabled={isProcessing}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isProcessing}
            className="bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
        <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-2">
          按 Enter 发送，Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
