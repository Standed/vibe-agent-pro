/**
 * AI Agent Service - Real AI conversation using Volcano Engine Doubao model
 * Replaces mock responses with actual AI interactions
 */

const VOLCANO_API_KEY = process.env.NEXT_PUBLIC_VOLCANO_API_KEY || '';
const VOLCANO_BASE_URL = process.env.NEXT_PUBLIC_VOLCANO_BASE_URL || '';
const DOUBAO_MODEL_ID = process.env.NEXT_PUBLIC_DOUBAO_MODEL_ID || '';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentContext {
  projectName?: string;
  currentScene?: string;
  currentShot?: string;
  shotCount?: number;
  sceneCount?: number;
}

/**
 * Generate AI agent system prompt based on context
 */
function generateSystemPrompt(context: AgentContext): string {
  return `你是 Vibe Agent，一个专业的 AI 影视创作助手。你的任务是帮助用户快速创作影视内容，通过对话理解用户意图并自动操作相关参数。

## 你的能力：
1. **Grid 多视图生成**：为镜头生成 2x2 或 3x3 多角度画面（正反打、不同景别）
2. **视频生成**：使用 SeeDance 将图片转换为 4-6 秒视频
3. **批量生成**：为整个场景或项目批量生成 Grid 图片和视频
4. **分镜脚本优化**：分析和改进分镜描述、时长、运镜等参数
5. **风格调整**：修改画面色调、光影、风格（如赛博朋克、电影级、动画风格）
6. **音频配乐**：推荐和添加背景音乐、生成旁白音频

## 当前项目信息：
- 项目名称：${context.projectName || '未命名项目'}
- 场景数量：${context.sceneCount || 0}
- 镜头数量：${context.shotCount || 0}
- 当前场景：${context.currentScene || '无'}
- 当前镜头：${context.currentShot || '无'}

## 回复风格：
- 简洁、专业、友好
- 直接回答用户问题，不要过多寒暄
- 当需要执行操作时，明确说明将要做什么
- 如果用户意图不明确，询问细节
- 使用电影制作术语（如景别、运镜、色调等）

记住：你是实际执行操作的 AI 助手，不是只会聊天的机器人。`;
}

/**
 * Send message to Volcano Engine Doubao model and get response
 */
export async function sendAgentMessage(
  messages: AgentMessage[],
  context: AgentContext = {},
  onStream?: (chunk: string) => void
): Promise<string> {
  if (!VOLCANO_API_KEY || !VOLCANO_BASE_URL || !DOUBAO_MODEL_ID) {
    throw new Error('Volcano Engine API 配置不完整，请检查环境变量');
  }

  // Add system prompt
  const systemPrompt = generateSystemPrompt(context);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const response = await fetch(`${VOLCANO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOLCANO_API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL_ID,
        messages: fullMessages,
        stream: !!onStream,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Volcano Engine API error: ${response.status} - ${errorText}`);
    }

    // Handle streaming response
    if (onStream) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                onStream(content);
              }
            } catch (e) {
              console.warn('Failed to parse streaming chunk:', e);
            }
          }
        }
      }

      return fullResponse;
    }

    // Handle non-streaming response
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '抱歉，我无法生成回复。';
  } catch (error) {
    console.error('Agent service error:', error);
    throw error;
  }
}

/**
 * Process user command and execute actions
 * This function identifies user intent and triggers appropriate actions
 */
export interface AgentAction {
  type: 'generate_grid' | 'generate_video' | 'batch_generate_scene' | 'batch_generate_videos' | 'adjust_style' | 'add_audio' | 'optimize_shot' | 'none';
  parameters?: Record<string, any>;
  message: string;
}

export async function processUserCommand(
  userMessage: string,
  context: AgentContext = {}
): Promise<AgentAction> {
  const lowerMsg = userMessage.toLowerCase();

  // Detect batch operations first
  if ((lowerMsg.includes('批量') || lowerMsg.includes('全部') || lowerMsg.includes('所有')) && lowerMsg.includes('视频')) {
    return {
      type: 'batch_generate_videos',
      parameters: {},
      message: '正在为所有有图片的镜头批量生成视频，这可能需要较长时间...',
    };
  }

  if ((lowerMsg.includes('批量') || lowerMsg.includes('场景')) && (lowerMsg.includes('grid') || lowerMsg.includes('图片') || lowerMsg.includes('生成'))) {
    return {
      type: 'batch_generate_scene',
      parameters: {},
      message: '正在为当前场景的所有镜头批量生成 Grid 图片...',
    };
  }

  // Detect single operations
  if (lowerMsg.includes('grid') || lowerMsg.includes('多视图') || lowerMsg.includes('正反打')) {
    const gridSize = lowerMsg.includes('3x3') || lowerMsg.includes('九宫格') ? '3x3' : '2x2';
    return {
      type: 'generate_grid',
      parameters: { gridSize },
      message: `正在为当前镜头生成 ${gridSize} Grid 多视图...`,
    };
  }

  if (lowerMsg.includes('视频') && (lowerMsg.includes('生成') || lowerMsg.includes('转'))) {
    return {
      type: 'generate_video',
      parameters: {},
      message: '正在使用 SeeDance 模型生成视频，预计需要 2-3 分钟...',
    };
  }

  if (lowerMsg.includes('色调') || lowerMsg.includes('风格') || lowerMsg.includes('调整')) {
    return {
      type: 'adjust_style',
      parameters: { adjustment: userMessage },
      message: '正在分析风格调整需求...',
    };
  }

  if (lowerMsg.includes('音乐') || lowerMsg.includes('配乐') || lowerMsg.includes('音频')) {
    return {
      type: 'add_audio',
      parameters: {},
      message: '音频功能开发中，暂时无法使用。',
    };
  }

  if (lowerMsg.includes('优化') || lowerMsg.includes('改进') || lowerMsg.includes('修改')) {
    return {
      type: 'optimize_shot',
      parameters: { userRequest: userMessage },
      message: '正在分析优化建议...',
    };
  }

  // No specific action, just conversational response
  return {
    type: 'none',
    parameters: {},
    message: '',
  };
}

/**
 * Generate context-aware quick actions based on current project state
 */
export function generateQuickActions(context: AgentContext): string[] {
  const actions: string[] = [];

  if (context.currentShot) {
    actions.push('生成这个镜头的 Grid');
    actions.push('生成视频');
  }

  if (context.currentScene) {
    actions.push('批量生成场景的所有 Grid');
  }

  if (context.shotCount && context.shotCount > 0) {
    actions.push('批量生成所有视频');
    actions.push('优化分镜描述');
  }

  if (actions.length === 0) {
    actions.push('创建新场景');
    actions.push('导入剧本');
  }

  return actions;
}
