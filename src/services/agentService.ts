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
  projectDescription?: string;
}

export type AgentActionType =
  | 'create_scene'
  | 'add_shot'
  | 'update_shot'
  | 'generate_grid'
  | 'generate_video'
  | 'batch_generate_grid'
  | 'batch_generate_video'
  | 'query_project'
  | 'none';

export interface AgentAction {
  type: AgentActionType;
  parameters?: Record<string, any>;
  thought?: string; // AI's reasoning
  message: string; // Message to display to user
}

/**
 * Generate AI agent system prompt based on context
 */
function generateSystemPrompt(context: AgentContext): string {
  return `你是 Vibe Agent，一个专业的 AI 影视创作助手。你的任务是帮助用户快速创作影视内容，通过对话理解用户意图并自动操作相关参数。

## 你的能力：
1. **理解意图**：准确识别用户想要做什么（创建场景、添加镜头、生成素材等）
2. **参数提取**：从自然语言中提取关键参数（如时长、景别、描述）
3. **批量操作**：识别批量处理的需求
4. **专业建议**：提供专业的影视制作建议

## 当前项目信息：
- 项目名称：${context.projectName || '未命名项目'}
- 项目描述：${context.projectDescription || '无'}
- 场景数量：${context.sceneCount || 0}
- 镜头数量：${context.shotCount || 0}
- 当前场景：${context.currentScene || '无'}
- 当前镜头：${context.currentShot || '无'}

## 输出格式：
你必须严格以 JSON 格式回复，不要包含任何 Markdown 标记。格式如下：
{
  "thought": "分析用户意图的思考过程",
  "type": "操作类型",
  "parameters": { "参数名": "参数值" },
  "message": "回复给用户的自然语言消息"
}

## 可用的操作类型 (type)：
- "create_scene": 创建新场景
  - parameters: { "name": "场景名称", "description": "场景描述" }
- "add_shot": 添加镜头
  - parameters: { "count": 数量, "description": "画面描述", "duration": 时长(秒), "shotSize": "景别" }
- "update_shot": 修改当前或指定镜头
  - parameters: { "target": "current"|"all"|"id", "updates": { "duration": 5, "description": "..." } }
- "generate_grid": 生成 Grid 多视图
  - parameters: { "target": "current"|"shot_id", "prompt": "提示词" }
- "generate_video": 生成视频
  - parameters: { "target": "current"|"shot_id", "prompt": "运镜提示词" }
- "batch_generate_grid": 批量生成 Grid
  - parameters: { "scope": "scene"|"project", "sceneId": "可选" }
- "batch_generate_video": 批量生成视频
  - parameters: { "scope": "scene"|"project", "sceneId": "可选" }
- "query_project": 查询项目信息
  - parameters: { "query": "查询内容" }
- "none": 仅对话，无操作
  - parameters: {}

## 示例：
用户："帮我建个新场景，叫赛博朋克街道"
回复：
{
  "thought": "用户想创建新场景",
  "type": "create_scene",
  "parameters": { "name": "赛博朋克街道", "description": "赛博朋克风格的街道" },
  "message": "好的，正在为您创建'赛博朋克街道'场景。"
}

用户："给这个场景加 3 个特写镜头"
回复：
{
  "thought": "用户想添加镜头，数量3，景别特写",
  "type": "add_shot",
  "parameters": { "count": 3, "shotSize": "Close-up", "description": "特写镜头" },
  "message": "没问题，正在添加 3 个特写镜头。"
}
`;
}

/**
 * Process user command using Volcano Engine
 */
export async function processUserCommand(
  userMessage: string,
  chatHistory: AgentMessage[],
  context: AgentContext = {}
): Promise<AgentAction> {
  if (!VOLCANO_API_KEY || !VOLCANO_BASE_URL || !DOUBAO_MODEL_ID) {
    console.warn('Volcano Engine API keys missing, falling back to mock');
    return mockProcessCommand(userMessage);
  }

  const systemPrompt = generateSystemPrompt(context);

  // Construct messages array
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-5), // Keep last 5 messages for context
    { role: 'user', content: userMessage }
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
        messages: messages,
        temperature: 0.3, // Lower temperature for more deterministic JSON
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON response
    try {
      // Clean up markdown code blocks if present
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
      const action = JSON.parse(jsonStr) as AgentAction;
      return action;
    } catch (e) {
      console.error('Failed to parse Agent response:', content);
      return {
        type: 'none',
        message: content || '抱歉，我没有理解您的指令。',
        thought: 'Failed to parse JSON'
      };
    }

  } catch (error) {
    console.error('Agent API error:', error);
    return {
      type: 'none',
      message: '抱歉，AI 服务暂时不可用。',
      thought: 'API Error'
    };
  }
}

/**
 * Fallback mock processor for when API is not configured
 */
function mockProcessCommand(userMessage: string): AgentAction {
  const lowerMsg = userMessage.toLowerCase();

  if (lowerMsg.includes('场景')) {
    return {
      type: 'create_scene',
      parameters: { name: '新场景' },
      message: 'API 未配置。模拟操作：创建新场景。',
      thought: 'Mock fallback'
    };
  }

  return {
    type: 'none',
    message: '请配置 Volcano Engine API 以使用完整功能。目前仅支持基础模拟回复。',
    thought: 'Mock fallback'
  };
}

