'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, User, Bot, Terminal } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { ChatMessage } from '@/types/project';
import { toast } from 'sonner';
import { processUserCommand, AgentAction, AgentMessage } from '@/services/agentService';
import { generateMultiViewGrid } from '@/services/geminiService';
import { volcanoEngineService } from '@/services/volcanoEngineService';
import { AspectRatio, ImageSize, GenerationHistoryItem, Shot } from '@/types/project';

export default function AgentPanel() {
  const {
    project,
    addChatMessage,
    addScene,
    addShot,
    updateShot,
    addGenerationHistory,
    currentSceneId,
    selectedShotId
  } = useProjectStore();

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

    const userContent = input.trim();
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date(),
    };

    // Add user message
    addChatMessage(userMessage);
    setInput('');
    setIsProcessing(true);

    try {
      // Prepare context
      const currentScene = project?.scenes.find(s => s.id === currentSceneId);
      const currentShot = project?.shots.find(s => s.id === selectedShotId);

      const context = {
        projectName: project?.metadata.title,
        projectDescription: project?.metadata.description,
        currentScene: currentScene?.name,
        currentShot: currentShot ? `镜头 #${currentShot.order}` : undefined,
        shotCount: project?.shots.length,
        sceneCount: project?.scenes.length,
      };

      // Convert chat history for API
      const apiHistory: AgentMessage[] = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Call Agent API
      const action = await processUserCommand(userContent, apiHistory, context);

      // Execute Action
      await executeAgentAction(action);

      // Add Assistant Message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: action.message,
        timestamp: new Date(),
        thought: action.thought // Optional: display thought process
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

  const executeAgentAction = async (action: AgentAction) => {
    console.log('Executing Agent Action:', action);

    switch (action.type) {
      case 'create_scene':
        if (action.parameters?.name) {
          addScene({
            id: `scene_${Date.now()}`,
            name: action.parameters.name,
            description: action.parameters.description || '',
            location: 'Unknown', // Default location
            position: { x: 0, y: 0 }, // Default position
            shotIds: [],
            order: (project?.scenes.length || 0) + 1,
            status: 'draft',
            created: new Date(),
            modified: new Date(),
          });
          toast.success(`已创建场景: ${action.parameters.name}`);
        }
        break;

      case 'add_shot':
        if (action.parameters?.count) {
          const count = action.parameters.count;
          const targetSceneId = currentSceneId || project?.scenes[0]?.id;

          if (!targetSceneId) {
            toast.error('请先创建一个场景');
            return;
          }

          for (let i = 0; i < count; i++) {
            addShot({
              id: `shot_${Date.now()}_${i}`,
              sceneId: targetSceneId,
              order: (project?.shots.length || 0) + 1 + i,
              description: action.parameters.description || '新镜头',
              shotSize: action.parameters.shotSize || 'Medium Shot',
              cameraMovement: 'Static', // Default camera movement
              duration: action.parameters.duration || 3,
              status: 'draft',
              created: new Date(),
              modified: new Date(),
            });
          }
          toast.success(`已添加 ${count} 个镜头`);
        }
        break;

      case 'update_shot':
        if (action.parameters?.updates) {
          const target = action.parameters.target;
          if (target === 'current' && selectedShotId) {
            updateShot(selectedShotId, action.parameters.updates);
            toast.success('已更新当前镜头');
          } else if (target === 'id' && action.parameters.id) {
            updateShot(action.parameters.id, action.parameters.updates);
            toast.success('已更新指定镜头');
          }
        }
        break;

      case 'generate_grid':
        if (action.parameters) {
          const target = action.parameters.target;
          let targetShotId = selectedShotId;

          if (target === 'shot_id' && action.parameters.shot_id) {
            targetShotId = action.parameters.shot_id;
          }

          if (!targetShotId) {
            toast.error('请先选择一个镜头');
            return;
          }

          const shot = project?.shots.find(s => s.id === targetShotId);
          if (!shot) return;

          toast.info('正在生成 Grid 多视图...');
          try {
            const result = await generateMultiViewGrid(
              action.parameters.prompt || shot.description || 'Cinematic shot',
              2, 2, // Default to 2x2
              project?.settings.aspectRatio || AspectRatio.WIDE,
              ImageSize.K4,
              []
            );

            // Update shot
            updateShot(targetShotId, {
              referenceImage: result.slices[0], // Use first slice as reference
              fullGridUrl: result.fullImage,
              gridImages: result.slices,
              status: 'done'
            });

            // Add history
            addGenerationHistory(targetShotId, {
              id: `gen_${Date.now()}`,
              type: 'image',
              timestamp: new Date(),
              result: result.slices[0],
              prompt: action.parameters.prompt || shot.description,
              parameters: {
                model: 'Gemini Grid',
                gridSize: '2x2',
                fullGridUrl: result.fullImage
              },
              status: 'success'
            });

            toast.success('Grid 生成完成');
          } catch (error: any) {
            console.error('Grid generation failed:', error);
            toast.error('Grid 生成失败', {
              description: error.message || '请检查API配置'
            });
          }
        }
        break;

      case 'generate_video':
        if (action.parameters) {
          const target = action.parameters.target;
          let targetShotId = selectedShotId;

          if (target === 'shot_id' && action.parameters.shot_id) {
            targetShotId = action.parameters.shot_id;
          }

          if (!targetShotId) {
            toast.error('请先选择一个镜头');
            return;
          }

          const shot = project?.shots.find(s => s.id === targetShotId);
          if (!shot) return;

          if (!shot.referenceImage) {
            toast.error('该镜头没有参考图片，无法生成视频');
            return;
          }

          toast.info('正在生成视频，请稍候...');
          updateShot(targetShotId, { status: 'processing' });

          try {
            // Get base64 from reference image URL (assuming it's already base64 or needs fetching)
            // For simplicity, if it's a data URL, extract base64. If http, fetch it.
            let imageBase64 = '';
            if (shot.referenceImage.startsWith('data:')) {
              imageBase64 = shot.referenceImage.split(',')[1];
            } else {
              // Fetch logic here if needed, or assume data URL for now as per geminiService
              // But wait, volcanoEngineService expects base64.
              // Let's assume it's data URL for now as that's what gemini returns.
              // If it's not, we might fail.
              // TODO: Handle remote URLs
              imageBase64 = shot.referenceImage;
            }

            const videoTask = await volcanoEngineService.generateSceneVideo(
              action.parameters.prompt || shot.description || 'Cinematic movement',
              imageBase64
            );

            const videoUrl = await volcanoEngineService.waitForVideoCompletion(videoTask.id);

            updateShot(targetShotId, {
              videoClip: videoUrl,
              status: 'done'
            });

            addGenerationHistory(targetShotId, {
              id: `gen_${Date.now()}`,
              type: 'video',
              timestamp: new Date(),
              result: videoUrl,
              prompt: action.parameters.prompt || shot.description,
              parameters: {
                model: 'Volcano I2V',
                referenceImage: shot.referenceImage
              },
              status: 'success'
            });

            toast.success('视频生成完成');
          } catch (error) {
            console.error('Video generation failed:', error);
            updateShot(targetShotId, { status: 'error' });
            toast.error('视频生成失败');
          }
        }
        break;

        break;

      case 'batch_generate_grid':
        if (action.parameters) {
          const scope = action.parameters.scope;
          const targetSceneId = action.parameters.sceneId || currentSceneId;

          let targetShots: Shot[] = [];
          if (scope === 'scene' && targetSceneId) {
            targetShots = project?.shots.filter(s => s.sceneId === targetSceneId && !s.referenceImage) || [];
          } else if (scope === 'project') {
            targetShots = project?.shots.filter(s => !s.referenceImage) || [];
          }

          if (targetShots.length === 0) {
            toast.info('没有需要生成图片的镜头');
            return;
          }

          toast.info(`开始批量生成 ${targetShots.length} 个镜头的 Grid...`);

          // Process sequentially to avoid rate limits
          for (const shot of targetShots) {
            try {
              toast.loading(`正在生成镜头 #${shot.order} 的 Grid...`);
              const result = await generateMultiViewGrid(
                shot.description || 'Cinematic shot',
                2, 2,
                project?.settings.aspectRatio || AspectRatio.WIDE,
                ImageSize.K4,
                []
              );

              updateShot(shot.id, {
                referenceImage: result.slices[0],
                fullGridUrl: result.fullImage,
                gridImages: result.slices,
                status: 'done'
              });

              addGenerationHistory(shot.id, {
                id: `gen_${Date.now()}`,
                type: 'image',
                timestamp: new Date(),
                result: result.slices[0],
                prompt: shot.description || 'Batch generation',
                parameters: {
                  model: 'Gemini Grid',
                  gridSize: '2x2',
                  fullGridUrl: result.fullImage
                },
                status: 'success'
              });
            } catch (error: any) {
              console.error(`Failed to generate grid for shot ${shot.id}:`, error);
              toast.error(`镜头 #${shot.order} 生成失败`, {
                description: error.message || '请检查API配置'
              });
              // Continue with next shot
            }
          }
          toast.success('批量生成完成');
        }
        break;

      case 'batch_generate_video':
        if (action.parameters) {
          const scope = action.parameters.scope;
          const targetSceneId = action.parameters.sceneId || currentSceneId;

          let targetShots: Shot[] = [];
          if (scope === 'scene' && targetSceneId) {
            targetShots = project?.shots.filter(s => s.sceneId === targetSceneId && s.referenceImage && !s.videoClip) || [];
          } else if (scope === 'project') {
            targetShots = project?.shots.filter(s => s.referenceImage && !s.videoClip) || [];
          }

          if (targetShots.length === 0) {
            toast.info('没有需要生成视频的镜头（需先生成图片）');
            return;
          }

          toast.info(`开始批量生成 ${targetShots.length} 个镜头的视频...`);

          for (const shot of targetShots) {
            try {
              toast.loading(`正在生成镜头 #${shot.order} 的视频...`);
              updateShot(shot.id, { status: 'processing' });

              let imageBase64 = '';
              if (shot.referenceImage!.startsWith('data:')) {
                imageBase64 = shot.referenceImage!.split(',')[1];
              } else {
                imageBase64 = shot.referenceImage!;
              }

              const videoTask = await volcanoEngineService.generateSceneVideo(
                shot.description || 'Cinematic movement',
                imageBase64
              );

              const videoUrl = await volcanoEngineService.waitForVideoCompletion(videoTask.id);

              updateShot(shot.id, {
                videoClip: videoUrl,
                status: 'done'
              });

              addGenerationHistory(shot.id, {
                id: `gen_${Date.now()}`,
                type: 'video',
                timestamp: new Date(),
                result: videoUrl,
                prompt: shot.description || 'Batch generation',
                parameters: {
                  model: 'Volcano I2V',
                  referenceImage: shot.referenceImage
                },
                status: 'success'
              });
            } catch (error) {
              console.error(`Failed to generate video for shot ${shot.id}:`, error);
              updateShot(shot.id, { status: 'error' });
            }
          }
          toast.success('批量生成完成');
        }
        break;

      case 'none':
      default:
        // No operation needed
        break;
    }
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
          通过对话操作您的项目 (Powered by Volcano Engine)
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
              我是您的 AI 助手，可以帮您创建场景、添加镜头、生成素材等。
              <br />试着说："帮我创建一个赛博朋克风格的场景"
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

            <div className="flex flex-col gap-1 max-w-[80%]">
              <div
                className={`rounded-lg p-3 ${message.role === 'user'
                  ? 'bg-light-accent dark:bg-cine-accent text-white'
                  : 'bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border text-light-text dark:text-white'
                  }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>

              {/* Show thought process if available */}
              {message.thought && (
                <div className="flex items-center gap-1 text-xs text-light-text-muted dark:text-cine-text-muted px-1">
                  <Terminal size={10} />
                  <span>{message.thought}</span>
                </div>
              )}

              <p className="text-xs opacity-60 px-1">
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
            placeholder="输入指令，例如：'创建3个特写镜头'"
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
