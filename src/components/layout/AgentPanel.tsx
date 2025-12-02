'use client';

import { Send, Sparkles, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { sendAgentMessage, processUserCommand, generateQuickActions, type AgentMessage } from '@/services/agentService';
import { generateMultiViewGrid } from '@/services/geminiService';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { AspectRatio, ImageSize, ChatMessage } from '@/types/project';

export default function AgentPanel() {
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { project, selectedShotId, updateShot, addChatMessage } = useProjectStore();
  const shots = project?.shots || [];
  const scenes = project?.scenes || [];

  // Get chat history from project, or initialize with welcome message
  const chatHistory = project?.chatHistory || [];

  // Initialize chat history with welcome message if empty
  useEffect(() => {
    if (project && (!project.chatHistory || project.chatHistory.length === 0)) {
      addChatMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: '你好！我是 西羊石 AI 视频 Agent，你的 AI 影视创作助手。你只管描述创意，我来帮你操作参数和生成内容。',
        timestamp: new Date(),
      });
    }
  }, [project?.id]); // Only run when project changes

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory.length, streamingMessage]);

  // Generate context for AI
  const getAgentContext = () => {
    const selectedShot = shots.find((s) => s.id === selectedShotId);
    const selectedScene = selectedShot
      ? scenes.find((sc) => sc.id === selectedShot.sceneId)
      : null;

    return {
      projectName: project?.name || '未命名项目',
      currentScene: selectedScene?.name,
      currentShot: selectedShot?.id,
      shotCount: shots.length,
      sceneCount: scenes.length,
    };
  };

  const handleSend = async () => {
    if (!message.trim() || isProcessing) return;

    const userMessage = message;
    setMessage('');

    // Add user message
    addChatMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });
    setIsProcessing(true);
    setStreamingMessage('');

    try {
      const context = getAgentContext();

      // Check if this is a command that requires action
      const action = await processUserCommand(userMessage, context);

      if (action.type !== 'none' && action.message) {
        // Add action acknowledgment
        addChatMessage({
          id: `msg_${Date.now()}_ack`,
          role: 'assistant',
          content: action.message,
          timestamp: new Date(),
        });

        // Execute the actual action
        try {
          if (action.type === 'generate_grid') {
            // 生成 Grid
            if (!selectedShotId) {
              throw new Error('请先选择一个镜头');
            }

            const gridSize = action.parameters?.gridSize === '3x3' ? '3x3' : '2x2';
            const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];

            // 使用镜头描述或用户指令作为提示词
            const selectedShot = shots.find((s) => s.id === selectedShotId);
            const prompt = selectedShot?.description || userMessage;

            const result = await generateMultiViewGrid(
              prompt,
              rows,
              cols,
              AspectRatio.WIDE,
              ImageSize.K4,
              []
            );

            updateShot(selectedShotId, {
              gridImages: result.slices,
              fullGridUrl: result.fullImage,
              referenceImage: result.slices[0],
              status: 'done',
            });

            addChatMessage({
              id: `msg_${Date.now()}_grid_success`,
              role: 'assistant',
              content: `Grid 生成成功！已生成 ${result.slices.length} 个视图。`,
              timestamp: new Date(),
            });
          } else if (action.type === 'generate_video') {
            // 生成视频
            if (!selectedShotId) {
              throw new Error('请先选择一个镜头');
            }

            const selectedShot = shots.find((s) => s.id === selectedShotId);
            const hasImage = selectedShot?.referenceImage || (selectedShot?.gridImages && selectedShot.gridImages.length > 0);

            if (!hasImage) {
              throw new Error('请先生成 Grid 图片');
            }

            const volcanoService = new VolcanoEngineService();
            const imageUrl = selectedShot!.gridImages?.[0] || selectedShot!.referenceImage || '';
            const videoPrompt = selectedShot?.description || userMessage;

            const videoTask = await volcanoService.generateSceneVideo(videoPrompt, imageUrl);

            updateShot(selectedShotId, { status: 'processing' });

            const videoUrl = await volcanoService.waitForVideoCompletion(videoTask.taskId);

            updateShot(selectedShotId, {
              videoClip: videoUrl,
              status: 'done',
            });

            addChatMessage({
              id: `msg_${Date.now()}_video_success`,
              role: 'assistant',
              content: `视频生成成功！已保存到镜头中。`,
              timestamp: new Date(),
            });
          } else if (action.type === 'batch_generate_scene') {
            // 批量生成场景下的所有镜头
            const selectedShot = shots.find((s) => s.id === selectedShotId);
            if (!selectedShot) {
              throw new Error('请先选择一个镜头');
            }

            const currentScene = scenes.find((sc) => sc.id === selectedShot.sceneId);
            if (!currentScene) {
              throw new Error('未找到对应的场景');
            }

            const sceneShotIds = currentScene.shotIds;
            const sceneShots = shots.filter((s) => sceneShotIds.includes(s.id));

            addChatMessage({
              id: `msg_${Date.now()}_batch_start`,
              role: 'assistant',
              content: `开始为场景"${currentScene.name}"批量生成 ${sceneShots.length} 个镜头的 Grid 图片...`,
              timestamp: new Date(),
            });

            let successCount = 0;
            let failCount = 0;

            for (const shot of sceneShots) {
              try {
                const prompt = shot.description || `场景：${currentScene.description}`;
                const result = await generateMultiViewGrid(
                  prompt,
                  2,
                  2,
                  AspectRatio.WIDE,
                  ImageSize.K4,
                  []
                );

                updateShot(shot.id, {
                  gridImages: result.slices,
                  fullGridUrl: result.fullImage,
                  referenceImage: result.slices[0],
                  status: 'done',
                });

                successCount++;
              } catch (error) {
                console.error(`Failed to generate grid for shot ${shot.id}:`, error);
                failCount++;
              }
            }

            addChatMessage({
              id: `msg_${Date.now()}_batch_complete`,
              role: 'assistant',
              content: `批量生成完成！成功: ${successCount} 个，失败: ${failCount} 个。`,
              timestamp: new Date(),
            });
          } else if (action.type === 'batch_generate_videos') {
            // 批量生成所有有图片的镜头的视频
            const shotsWithImages = shots.filter(
              (shot) =>
                shot.referenceImage || (shot.gridImages && shot.gridImages.length > 0)
            );

            if (shotsWithImages.length === 0) {
              throw new Error('没有可用于生成视频的图片，请先生成 Grid 图片');
            }

            addChatMessage({
              id: `msg_${Date.now()}_batch_video_start`,
              role: 'assistant',
              content: `开始批量生成 ${shotsWithImages.length} 个镜头的视频...这可能需要较长时间，请耐心等待。`,
              timestamp: new Date(),
            });

            const volcanoService = new VolcanoEngineService();
            let successCount = 0;
            let failCount = 0;

            for (const shot of shotsWithImages) {
              try {
                const imageUrl = shot.gridImages?.[0] || shot.referenceImage || '';
                const videoPrompt = shot.description || '镜头运动，平稳流畅';

                updateShot(shot.id, { status: 'processing' });

                const videoTask = await volcanoService.generateSceneVideo(
                  videoPrompt,
                  imageUrl
                );
                const videoUrl = await volcanoService.waitForVideoCompletion(
                  videoTask.taskId
                );

                updateShot(shot.id, {
                  videoClip: videoUrl,
                  status: 'done',
                });

                successCount++;
              } catch (error) {
                console.error(`Failed to generate video for shot ${shot.id}:`, error);
                updateShot(shot.id, { status: 'error' });
                failCount++;
              }
            }

            addChatMessage({
              id: `msg_${Date.now()}_batch_video_complete`,
              role: 'assistant',
              content: `批量视频生成完成！成功: ${successCount} 个，失败: ${failCount} 个。`,
              timestamp: new Date(),
            });
          }
        } catch (execError) {
          console.error('Action execution error:', execError);
          const execErrorMessage = execError instanceof Error ? execError.message : '操作执行失败';
          addChatMessage({
            id: `msg_${Date.now()}_exec_error`,
            role: 'assistant',
            content: `操作失败：${execErrorMessage}`,
            timestamp: new Date(),
          });
        }
      }

      // Convert chat history to agent message format
      const agentMessages: AgentMessage[] = chatHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      // Get AI response with streaming
      let fullResponse = '';
      await sendAgentMessage(
        agentMessages,
        context,
        (chunk) => {
          fullResponse += chunk;
          setStreamingMessage(fullResponse);
        }
      );

      // Add complete response to chat history
      addChatMessage({
        id: `msg_${Date.now()}_ai_response`,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
      });
      setStreamingMessage('');
    } catch (error) {
      console.error('Agent processing error:', error);
      const errorMessage =
        error instanceof Error
          ? `处理请求时出错：${error.message}`
          : '抱歉，处理你的请求时出现了问题。请检查 API 配置或稍后重试。';

      addChatMessage({
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
      });
      setStreamingMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-light-border dark:border-cine-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Sparkles size={16} className="text-light-text dark:text-white" />
          </div>
          <div>
            <div className="text-sm font-bold">Agent 模式</div>
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted">AI 帮你操作参数</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((msg, idx) => (
          <div
            key={msg.id || idx}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs text-light-text dark:text-white font-bold flex-shrink-0">
                AI
              </div>
            )}
            <div
              className={`rounded-lg p-3 text-sm max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-light-accent dark:bg-cine-accent text-light-text dark:text-white'
                  : 'bg-light-bg dark:bg-cine-panel text-light-text-muted dark:text-cine-text-muted'
              }`}
            >
              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-cine-border flex items-center justify-center text-xs text-light-text dark:text-white font-bold flex-shrink-0">
                U
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {streamingMessage && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs text-light-text dark:text-white font-bold flex-shrink-0">
              AI
            </div>
            <div className="bg-light-bg dark:bg-cine-panel rounded-lg p-3 text-sm max-w-[80%]">
              <p className="leading-relaxed whitespace-pre-wrap text-light-text-muted dark:text-cine-text-muted">
                {streamingMessage}
                <span className="inline-block w-1 h-4 bg-light-accent dark:bg-cine-accent ml-1 animate-pulse"></span>
              </p>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !streamingMessage && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs text-light-text dark:text-white font-bold flex-shrink-0">
              AI
            </div>
            <div className="bg-light-bg dark:bg-cine-panel rounded-lg p-3 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-light-accent dark:text-cine-accent" />
              <span className="text-sm text-light-text-muted dark:text-cine-text-muted">正在思考...</span>
            </div>
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 border-t border-light-border dark:border-cine-border">
        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">快捷指令</div>
        <div className="flex flex-wrap gap-2">
          {generateQuickActions(getAgentContext()).map((action) => (
            <button
              key={action}
              onClick={() => setMessage(action)}
              className="text-xs bg-light-bg dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border rounded px-2 py-1 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-light-border dark:border-cine-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入指令或问题... (Enter 发送)"
            disabled={isProcessing}
            className="flex-1 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:border-cine-accent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isProcessing || !message.trim()}
            className="bg-light-accent dark:bg-cine-accent text-light-text dark:text-white p-2 rounded-lg hover:bg-light-accent-hover dark:bg-cine-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
