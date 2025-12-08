/**
 * AI Agent Service - Function calling with Gemini 3 Pro
 * Uses Gemini for better tool calling capabilities
 */

import { AGENT_TOOLS, ToolCall, formatToolsForPrompt } from './agentTools';

const GEMINI_MODEL = 'gemini-3-pro-preview'; // Using Gemini 3 Pro text model for better reasoning

// Allow configurable timeouts:短步骤用短超时，AI 生成/推理用长超时
const parseTimeout = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// 默认短超时（工具查询等轻量请求）
const DEFAULT_TIMEOUT_MS = parseTimeout(
  process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS || process.env.AGENT_TIMEOUT_MS,
  30000
);
// AI 对话/生成允许更长时间，避免大 prompt 被过早中断
const AI_TIMEOUT_MS = parseTimeout(
  process.env.NEXT_PUBLIC_AGENT_AI_TIMEOUT_MS || process.env.AGENT_AI_TIMEOUT_MS,
  90000
);

const MAX_GEMINI_RETRIES = 1; // 简单重试 1 次，避免频繁触发限流
const MAX_STRING_LENGTH_FOR_GEMINI = 400; // 避免把 base64 或长文本全部塞给 Gemini，但保留必要上下文

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs/1000}秒）`);
    }
    throw error;
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const truncateString = (str: string, limit = MAX_STRING_LENGTH_FOR_GEMINI) => {
  if (typeof str !== 'string') return str;
  if (str.startsWith('data:image')) return '[image data omitted]';
  if (str.length <= limit) return str;
  return `${str.slice(0, limit)}... [truncated ${str.length - limit} chars]`;
};

/**
 * 从 Gemini 错误文本中提取限流信息
 */
function parseRateLimitInfo(errorText: string): { retryMs?: number; message?: string } {
  let retryMs: number | undefined;
  let message: string | undefined;

  try {
    const obj = JSON.parse(errorText);
    message = obj?.error?.message;

    const retryInfo = obj?.error?.details?.find(
      (d: any) => typeof d?.['@type'] === 'string' && d['@type'].includes('RetryInfo')
    );
    const retryDelay = retryInfo?.retryDelay as string | undefined; // e.g. "52s"
    if (retryDelay) {
      const match = retryDelay.match(/(\d+)/);
      if (match) {
        retryMs = Number(match[1]) * 1000;
      }
    }

    if (!retryMs && typeof message === 'string') {
      const match = message.match(/retry in\s+([\d.]+)s/i);
      if (match) {
        retryMs = Math.ceil(Number(match[1]) * 1000);
      }
    }
  } catch (e) {
    // 不是 JSON，尝试直接用正则
    const match = errorText.match(/retry in\s+([\d.]+)s/i);
    if (match) {
      retryMs = Math.ceil(Number(match[1]) * 1000);
    }
  }

  return { retryMs, message };
}

/**
 * 调用 Gemini 生成接口，带限流重试
 */
async function callGeminiWithBackoff(body: any, timeoutMs: number) {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_GEMINI_RETRIES) {
    attempt++;

    const response = await fetchWithTimeout(
      '/api/gemini-generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      timeoutMs
    );

    if (response.status !== 429) {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }

    // 429 限流，尝试等待后重试
    const errorText = await response.text();
    const { retryMs, message } = parseRateLimitInfo(errorText);
    lastError = new Error(message || 'Gemini 限流，请稍后重试');

    if (attempt > MAX_GEMINI_RETRIES) {
      throw lastError;
    }

    const waitMs = retryMs && Number.isFinite(retryMs) ? Math.min(retryMs, timeoutMs) : 8000;
    console.warn(`Gemini 429，${waitMs}ms 后重试 (attempt ${attempt}/${MAX_GEMINI_RETRIES + 1})`);
    await sleep(waitMs);
  }

  throw lastError || new Error('Gemini 请求失败');
}

type ToolResultForLLM = { tool: string; success?: boolean; error?: string; result: any };

const sanitizeShots = (shots: any[] = []) => shots.map(shot => ({
  id: shot.id,
  order: shot.order,
  description: truncateString(shot.description || ''),
  shotSize: shot.shotSize,
  cameraMovement: shot.cameraMovement,
  duration: shot.duration,
  status: shot.status,
  hasImage: !!shot.referenceImage,
  hasVideo: !!shot.videoClip,
}));

const sanitizeToolResult = (tool: string, result: any): any => {
  if (!result) return result;

  switch (tool) {
    case 'getProjectContext':
      return {
        projectName: result.projectName,
        projectDescription: truncateString(result.projectDescription || ''),
        sceneCount: result.sceneCount,
        shotCount: result.shotCount,
        aspectRatio: result.aspectRatio,
        scenes: (result.scenes || []).map((scene: any) => ({
          id: scene.id,
          name: scene.name,
          description: truncateString(scene.description || ''),
          order: scene.order,
          shotCount: scene.shotCount,
          shots: sanitizeShots(scene.shots),
        })),
      };
    case 'getSceneDetails':
      return {
        id: result.id,
        name: result.name,
        description: truncateString(result.description || ''),
        location: result.location,
        order: result.order,
        status: result.status,
        shotCount: result.shotCount,
        shots: sanitizeShots(result.shots),
      };
    case 'searchScenes':
      return {
        query: result.query,
        matchCount: result.matchCount,
        scenes: (result.scenes || []).map((scene: any) => ({
          id: scene.id,
          name: scene.name,
          description: truncateString(scene.description || ''),
          order: scene.order,
          shotCount: scene.shotCount,
        })),
      };
    case 'getShotDetails':
      return {
        id: result.id,
        order: result.order,
        sceneName: result.sceneName,
        description: truncateString(result.description || ''),
        shotSize: result.shotSize,
        cameraMovement: result.cameraMovement,
        duration: result.duration,
        status: result.status,
        hasImage: !!result.hasImage,
        hasVideo: !!result.hasVideo,
        generationHistory: result.generationHistory,
      };
    case 'generateShotImage':
      return {
        shotId: result.shotId,
        model: result.model,
        prompt: truncateString(result.prompt || ''),
        // imageUrl 刻意省略，避免大 payload
      };
    case 'batchGenerateSceneImages':
      return {
        sceneId: result.sceneId,
        mode: result.mode,
        gridSize: result.gridSize,
        totalSlices: result.totalSlices,
        assignedShots: result.assignedShots,
        totalShots: result.totalShots,
        successCount: result.successCount,
        failedCount: result.failedCount,
        results: Array.isArray(result.results)
          ? result.results.map((r: any) => ({
              tool: r.tool,
              shotId: r.result?.shotId,
              success: r.success ?? (r.error ? false : true),
              error: r.error ? truncateString(r.error) : undefined,
            }))
          : undefined,
      };
    case 'batchGenerateProjectImages':
      return {
        totalShots: result.totalShots,
        successCount: result.successCount,
        failedCount: result.failedCount,
      };
    default: {
      // 通用兜底：去掉 url/base64 字段，保留简要信息
      if (typeof result !== 'object') return result;
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(result)) {
        if (/(image|url|base64|reference)/i.test(key)) continue;
        sanitized[key] = typeof value === 'string' ? truncateString(value) : value;
      }
      return sanitized;
    }
  }
};

const sanitizeToolResults = (toolResults: Array<{ tool: string; result: any; error?: string; success?: boolean }>): ToolResultForLLM[] => {
  return toolResults.map(tr => ({
    tool: tr.tool,
    success: tr.success ?? (tr.error ? false : true),
    error: tr.error ? truncateString(tr.error) : undefined,
    result: sanitizeToolResult(tr.tool, tr.result),
  }));
};

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string; // Tool name for tool role
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
  | 'tool_use'
  | 'none';

export interface AgentAction {
  type: AgentActionType;
  parameters?: Record<string, any>;
  thought?: string; // AI's reasoning
  message: string; // Message to display to user
  toolCalls?: ToolCall[]; // Tool calls to execute
  requiresToolExecution?: boolean; // Whether tools need to be executed
}

/**
 * Generate AI agent system prompt with tool calling support
 */
function generateSystemPrompt(context: AgentContext): string {
  const toolsDescription = formatToolsForPrompt(AGENT_TOOLS);

  return `你是 Vibe Agent，一个专业的 AI 影视创作助手。你的任务是帮助用户快速创作影视内容，通过对话理解用户意图并使用工具操作项目。

## 重要规则：
1. **优先使用工具**：当用户询问项目信息或需要查询数据时，**必须先调用工具获取真实数据**，不要猜测或使用旧信息
2. **理解上下文**：使用 getProjectContext 和 searchScenes 等工具来理解项目的真实内容
3. **精准操作**：当用户要求操作特定场景时（如"场景2"），先用 searchScenes 找到它，再执行操作
4. **简洁回复**：避免冗长的文本回复，重点是执行工具和给出结果

## 当前项目基础信息：
- 项目名称：${context.projectName || '未命名项目'}
- 项目描述：${context.projectDescription || '无'}
- 场景数量：${context.sceneCount || 0}
- 镜头数量：${context.shotCount || 0}
- 当前场景：${context.currentScene || '无'}

## 可用工具（Tools）：
${toolsDescription}

## 输出格式：
你必须严格以 JSON 格式回复，不要包含任何 Markdown 标记。有两种输出模式：

### 模式 1：调用工具（优先使用）
当需要查询项目信息或执行批量操作时：
{
  "thought": "思考过程",
  "type": "tool_use",
  "toolCalls": [
    { "name": "工具名", "arguments": { "参数名": "参数值" } }
  ],
  "message": "简短说明正在执行的操作"
}

### 模式 2：直接操作
当需要创建场景、添加镜头或批量生成时：
{
  "thought": "思考过程",
  "type": "create_scene" | "add_shot" | "batch_generate_grid" | "none",
  "parameters": {
    // For batch_generate_grid:
    "scope": "scene",
    "sceneId": "从工具获取的场景ID",
    "mode": "grid" | "seedream"
  },
  "message": "简短的用户反馈"
}

## 示例对话：

用户："场景 2 的分镜都生成图片"
思考：用户提到"场景2"，我需要先用 searchScenes 工具找到场景2的ID，然后再用 batchGenerateSceneImages 工具批量生成
回复：
{
  "thought": "需要先查找场景2，然后批量生成图片",
  "type": "tool_use",
  "toolCalls": [
    { "name": "searchScenes", "arguments": { "query": "场景 2" } }
  ],
  "message": "正在查找场景 2..."
}

用户："我的项目里有哪些场景？"
回复：
{
  "thought": "用户想了解项目结构，需要获取完整上下文",
  "type": "tool_use",
  "toolCalls": [
    { "name": "getProjectContext", "arguments": {} }
  ],
  "message": "正在获取项目信息..."
}

用户："创建一个新场景叫城市夜景"
回复：
{
  "thought": "创建新场景",
  "type": "create_scene",
  "parameters": { "name": "城市夜景", "description": "城市夜晚的景观" },
  "message": "正在创建场景'城市夜景'"
}
`;
}

/**
 * Process user command using Gemini 3 Pro with function calling
 */
export async function processUserCommand(
  userMessage: string,
  chatHistory: AgentMessage[],
  context: AgentContext = {}
): Promise<AgentAction> {
  const systemPrompt = generateSystemPrompt(context);

  // Convert chat history to Gemini format
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt + '\n\n' + userMessage }]
    }
  ];

  // Convert tools to Gemini function declaration format
  const tools = [{
    function_declarations: AGENT_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }];

  try {
    const { data } = await callGeminiWithBackoff(
      {
        model: GEMINI_MODEL,
        payload: {
          contents,
          tools,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
          }
        }
      },
      AI_TIMEOUT_MS // AI 对话/推理阶段允许更长时间
    );
    const candidate = data?.candidates?.[0];

    if (!candidate) {
      throw new Error('No candidate in Gemini response');
    }

    // Check if Gemini made function calls
    const functionCall = candidate.content?.parts?.[0]?.functionCall;

    if (functionCall) {
      // Gemini wants to call a tool
      return {
        type: 'tool_use',
        toolCalls: [{
          name: functionCall.name,
          arguments: functionCall.args || {}
        }],
        message: `正在调用工具: ${functionCall.name}`,
        requiresToolExecution: true
      };
    }

    // Gemini returned text response
    const text = candidate.content?.parts?.[0]?.text || '';

    // Try to parse as JSON action
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]) as AgentAction;
        // If type is tool_use, ensure requiresToolExecution is set
        if (action.type === 'tool_use' && action.toolCalls && action.toolCalls.length > 0) {
          action.requiresToolExecution = true;
        }
        return action;
      }
    } catch (e) {
      // Not JSON, treat as plain text
    }

    return {
      type: 'none',
      message: text || '好的，我理解了。',
      thought: 'Plain text response'
    };

  } catch (error: any) {
    console.error('Gemini API error:', error);
    return {
      type: 'none',
      message: `抱歉，AI 服务出错了: ${error.message}`,
      thought: 'API Error'
    };
  }
}

/**
 * Continue conversation after tool execution with Gemini
 * Pass tool results back to AI for next response
 */
export async function continueWithToolResults(
  toolResults: Array<{ tool: string; result: any }>,
  chatHistory: AgentMessage[],
  context: AgentContext = {}
): Promise<AgentAction> {
  const systemPrompt = generateSystemPrompt(context);
  const lastUserMessage = [...chatHistory].reverse().find(msg => msg.role === 'user');
  const safeResults = sanitizeToolResults(toolResults);

  // Format tool results for Gemini
  const toolResultsText = safeResults.map(tr =>
    `工具 ${tr.tool} 返回结果:\n${JSON.stringify(tr.result)}`
  ).join('\n\n');

  const contents = [
    {
      role: 'user',
      parts: [{
        text:
          systemPrompt +
          '\n\n' +
          (lastUserMessage ? `用户请求：${lastUserMessage.content}\n\n` : '') +
          '工具执行完成，请根据结果决定下一步操作：\n\n' +
          toolResultsText
      }]
    }
  ];

  // Include tools so Gemini can make additional function calls
  const tools = [{
    function_declarations: AGENT_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }];

  try {
    const { data } = await callGeminiWithBackoff(
      {
        model: GEMINI_MODEL,
        payload: {
          contents,
          tools,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
          }
        }
      },
      AI_TIMEOUT_MS // 继续对话也视为 AI 生成，给足时间
    );
    const candidate = data?.candidates?.[0];

    if (!candidate) {
      throw new Error('No candidate in Gemini response');
    }

    // Check if Gemini made another function call
    const functionCall = candidate.content?.parts?.[0]?.functionCall;

    if (functionCall) {
      // Gemini wants to call another tool
      return {
        type: 'tool_use',
        toolCalls: [{
          name: functionCall.name,
          arguments: functionCall.args || {}
        }],
        message: `正在调用工具: ${functionCall.name}`,
        requiresToolExecution: true
      };
    }

    // Gemini returned text response
    const text = candidate?.content?.parts?.[0]?.text || '';

    // Try to parse as JSON action
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]) as AgentAction;
        // If type is tool_use, ensure requiresToolExecution is set
        if (action.type === 'tool_use' && action.toolCalls && action.toolCalls.length > 0) {
          action.requiresToolExecution = true;
        }
        return action;
      }
    } catch (e) {
      // Not JSON
    }

    return {
      type: 'none',
      message: text || '已处理工具结果',
      thought: 'Processed tool results'
    };

  } catch (error: any) {
    console.error('Gemini continuation error:', error);
    return {
      type: 'none',
      message: '处理工具结果时出错',
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
