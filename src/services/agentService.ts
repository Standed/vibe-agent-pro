/**
 * AI Agent Service - Function calling with Gemini 3 Pro
 * Uses Gemini for better tool calling capabilities
 */

import { AGENT_TOOLS, ToolCall, formatToolsForPrompt, ToolDefinition } from './agentToolDefinitions';
import { calculateCredits } from '@/config/credits';

const GEMINI_MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-3-flash-preview'; // Agent推理模型

// Allow configurable timeouts:短步骤用短超时，AI 生成/推理用长超时
const parseTimeout = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// 默认短超时（工具查询等轻量请求）
const DEFAULT_TIMEOUT_MS = parseTimeout(
  process.env.AGENT_TIMEOUT_MS || process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS,
  30000
);
// AI 对话/生成允许更长时间，避免大 prompt 被过早中断
const AI_TIMEOUT_MS = parseTimeout(
  process.env.AGENT_AI_TIMEOUT_MS || process.env.NEXT_PUBLIC_AGENT_AI_TIMEOUT_MS,
  90000
);

const MAX_GEMINI_RETRIES = 1; // 简单重试 1 次，避免频繁触发限流
const MAX_OUTPUT_TOKENS = parseTimeout(
  process.env.AGENT_MAX_OUTPUT_TOKENS || process.env.NEXT_PUBLIC_AGENT_MAX_OUTPUT_TOKENS,
  10000
);
const MAX_STRING_LENGTH_FOR_GEMINI = 400; // 避免把 base64 或长文本全部塞给 Gemini，但保留必要上下文

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If external signal is provided, listen to it
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

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
      throw new Error(`请求超时（${timeoutMs / 1000}秒）`);
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

    let response: Response | null = null;
    try {
      response = await fetchWithTimeout(
        '/api/gemini-generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        timeoutMs,
        body.signal // Pass signal to fetchWithTimeout
      );
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt > MAX_GEMINI_RETRIES) {
        throw lastError;
      }
      const waitMs = Math.min(5000, timeoutMs);
      console.warn(`Gemini fetch failed (${lastError.message}), ${waitMs}ms 后重试 (attempt ${attempt}/${MAX_GEMINI_RETRIES + 1})`);
      await sleep(waitMs);
      continue;
    }

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
        locations: (result.locations || []).map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          description: truncateString(loc.description || ''),
        })),
        characters: (result.characters || []).map((char: any) => ({
          id: char.id,
          name: char.name,
          description: truncateString(char.description || ''),
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
  estimatedCredits?: number; // Estimated credits to consume
}

/**
 * 预估工具调用所需的积分
 */
export function estimateCredits(toolCalls: ToolCall[], userRole: 'user' | 'admin' | 'vip' = 'user'): number {
  let total = 0;
  for (const tc of toolCalls) {
    switch (tc.name) {
      case 'generateShotImage': {
        const mode = tc.arguments.mode;
        if (mode === 'grid') {
          const gridSize = tc.arguments.gridSize || '2x2';
          const [rows, cols] = gridSize.split('x').map(Number);
          total += calculateCredits(`GEMINI_GRID_${rows}X${cols}` as any, userRole);
        } else if (mode === 'gemini') {
          total += calculateCredits('GEMINI_IMAGE', userRole);
        } else if (mode === 'seedream') {
          total += calculateCredits('SEEDREAM_GENERATE', userRole);
        }
        break;
      }
      case 'batchGenerateSceneImages':
      case 'batchGenerateProjectImages': {
        // 批量操作通常消耗较多，这里做一个保守预估
        // 实际上 batch 内部会根据镜头数动态消耗，这里先给一个基础预估
        total += calculateCredits('BATCH_OPERATION', userRole);
        break;
      }
      case 'generateCharacterThreeView':
        total += calculateCredits('GEMINI_IMAGE', userRole);
        break;
    }
  }
  return total;
}

/**
 * Generate AI agent system instruction (complete detailed version)
 * Uses Gemini's system_instruction parameter - content doesn't count toward quota
 */
function generateSystemInstruction(tools: ToolDefinition[] = AGENT_TOOLS): string {
  const toolDefinitions = formatToolsForPrompt(tools);

  return `# Video Agent - AI 影视创作助手

你是 Video Agent，一个专业的 AI 影视创作助手。你的任务是理解用户的创作意图，通过调用工具来操作项目数据（场景、镜头、图片生成等）。

## 核心规则

1. **优先调用工具获取数据**
   - 不要猜测场景ID、镜头ID等信息
   - 需要操作特定场景时，先用 searchScenes 查询获得准确的 sceneId
   - 需要了解项目全貌时，先用 getProjectContext 获取完整上下文
   - **创建场景前必查**：在调用 createScene 前，必须先检查是否已存在同名或相似场景。如果存在，请使用 updateScene 或 addShots，严禁重复创建。

2. **回复规范（关键）**
   - \`message\` 字段必须是**自然语言**（中文），用于告诉用户你正在做什么或已经做了什么。
   - **严禁**在 \`message\` 中输出原始 JSON、工具参数对象或数组。
   - **严禁**直接通过 \`message\` 返回工具的执行结果（如分镜列表），你应该总结这些结果（如"已为您添加了3个分镜"）。

3. **分步执行复杂任务**
   - 不要一次性调用所有工具
   - 先执行查询类工具（如 searchScenes、getProjectContext）
   - 再根据查询结果执行操作类工具（如 createScene、addShots）
   - 每轮只调用必要的工具，避免过度并发

3. **场景创建后必须添加分镜**
   - 使用 createScene 创建场景后，必须立即调用 addShots 为该场景添加至少 3 个分镜
   - 每个分镜应包含：shotSize（景别）、cameraMovement（镜头运动）、description（画面描述）
   - 可选字段：narration（旁白）、dialogue（对话）、duration（时长）

4. **场景命名规范（专业剧本格式）**
   - 场景名称格式：场景 X: 地点 - 时间 (戏剧性描述)
   - 示例："场景 1: 深山老林 - 夜晚 (追逐与遭遇战)"
   - 示例："场景 2: 战场废墟 - 黎明 (重见光明)"
   - 地点应具体明确（如"战场废墟"而非"战场"）
   - 时间通常为：黎明、清晨、白天、傍晚、夜晚、深夜等
   - 戏剧性描述简洁有力，体现场景核心冲突或情感

5. **多场景创建的正确流程**
   - 用户要求创建多个场景时，应该：
     a. 先创建第一个场景（createScene）
     b. 为第一个场景添加分镜（addShots）
     c. 再创建第二个场景（createScene）
     d. 为第二个场景添加分镜（addShots）
   - 不要跳过任何步骤

5. **携带视听语言细节**
   - 使用 addShots 时，优先使用 shots 参数传递每个分镜的详细信息
   - 包含专业的视听语言：景别（Close-Up, Medium Shot, Wide Shot 等）
   - 包含镜头运动：Static, Pan, Tilt, Dolly, Track, Crane 等
   - description 应该详细描述画面内容、动作、情绪

6. **图片生成模式选择**
   - seedream: 火山引擎单图生成，适合单个分镜的高质量生成
   - gemini: Gemini 直出，速度快，适合快速预览
   - grid: Gemini Grid 多视图，适合批量生成

7. **Sora 视频生成规则（Agent 模式）**
   - **判断关键词**：当用户消息包含"sora"、"视频"、"重新用sora生成"、"重新生成视频"时，必须使用视频生成工具，不要使用图片生成工具
   - **工具选择优先级**：
     - 用户提到"视频"或"sora" → 使用 generateShotsVideo / generateSceneVideo / batchGenerateProjectVideosSora
     - 用户只提到"图片"或"参考图" → 使用 generateShotImage / batchGenerateSceneImages
     - 用户只说"重新生成"（无明确类型）→ 优先视频生成（因为视频是最终交付物）
   - 使用 batchGenerateProjectVideosSora 为整个项目批量生成视频
   - 使用 generateSceneVideo 为单个场景生成视频
   - 用户指定分镜序号时，使用 generateShotsVideo
     - 全局序号（如"31-36分镜"）：传 globalShotIndexes（基于 globalOrder）
     - 场景内序号：传 sceneId + shotIndexes
     - 已有分镜ID：传 shotIds
   - **智能分镜合并**：Sora 会自动将连续的分镜合并为较长的视频片段（5-15s）
     - 连续分镜的剧情/动作/情绪连贯时，自动合并生成
     - 场景切换、时间跳跃时，分开生成独立视频
   - **时长规则**：优先使用 15s 视频，避免生成过多短视频增加成本，单个分镜时长尽量不要超过 5s
   - **角色一致性**：系统自动处理角色注册和一致性，无需用户干预
   - 除非用户明确指定"图片"或"参考图"，否则默认生成视频

\`\`\`

## 示例对话

### 示例 1：简单查询

用户: "帮我看看项目里有多少个场景"
助手:
\`\`\`json
{
  "thought": "用户想了解项目概况，使用 getProjectContext 工具",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "getProjectContext",
      "arguments": {}
    }
  ],
  "message": "正在获取项目信息..."
}
\`\`\`

### 示例 2：创建场景和分镜
用户: "创建一个新场景叫'战斗高潮'，加3个分镜"
助手:
\`\`\`json
{
  "thought": "需要先创建场景，然后添加分镜。但我需要先创建场景获得 sceneId",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "createScene",
      "arguments": {
        "name": "战斗高潮",
        "description": "战斗达到高潮，英雄与敌人展开激烈对决"
      }
    }
  ],
  "message": "正在创建场景'战斗高潮'..."
}
\`\`\`

（工具返回：{"sceneId": "scene_123", "name": "战斗高潮", "order": 1}）

助手（第二轮）:
\`\`\`json
{
  "thought": "场景已创建，现在为其添加3个分镜，携带视听语言细节（结合项目最新真实上下文）",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "addShots",
      "arguments": {
        "sceneId": "scene_123",
        "count": 3,
        "shots": [
          {
            "shotSize": "Close-Up",
            "cameraMovement": "Static",
            "description": "英雄面部特写，汗水滑落，眼神坚定",
            "duration": 3
          },
          {
            "shotSize": "Wide Shot",
            "cameraMovement": "Dolly In",
            "description": "全景推进，双方对峙，气氛紧张",
            "duration": 5
          },
          {
            "shotSize": "Medium Shot",
            "cameraMovement": "Pan Right",
            "description": "中景横摇，武器碰撞，火花四溅",
            "duration": 4
          }
        ]
      }
    }
  ],
  "message": "正在为'战斗高潮'场景添加3个分镜..."
}
\`\`\`

### 示例 3：复杂多步操作（用户实际测试案例）
用户: "给场景 1 再加三个分镜吧，进一步描写战斗的高潮，然后再加个场景 2，衬托战斗结束后的重见光明，大家的喜悦"

助手:
\`\`\`json
{
  "thought": "这是一个复杂的多步骤任务：1) 为场景1添加3个分镜 2) 创建场景2 3) 为场景2添加分镜。先查询场景1的ID",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "searchScenes",
      "arguments": {
        "query": "1"
      }
    }
  ],
  "message": "正在查询场景1的信息..."
}
\`\`\`

（工具返回：{"scenes": [{"id": "scene_abc", "name": "场景 1", "order": 1}]}）

助手（第二轮）:
\`\`\`json
{
  "thought": "场景1的ID是 scene_abc，现在为其添加3个战斗高潮的分镜",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "addShots",
      "arguments": {
        "sceneId": "scene_abc",
        "count": 3,
        "shots": [
          {
            "shotSize": "Close-Up",
            "cameraMovement": "Handheld",
            "description": "英雄怒吼，手持摇晃，极度紧张的战斗节奏",
            "duration": 2
          },
          {
            "shotSize": "Wide Shot",
            "cameraMovement": "Crane Up",
            "description": "摇臂上升，俯瞰整个战场，战斗达到最激烈时刻",
            "duration": 6
          },
          {
            "shotSize": "Medium Shot",
            "cameraMovement": "Slow Motion",
            "description": "慢镜头，最后一击命中，敌人倒下",
            "duration": 5
          }
        ]
      }
    }
  ],
  "message": "正在为场景1添加战斗高潮的3个分镜..."
}
\`\`\`

（工具返回成功）

助手（第三轮）:
\`\`\`json
{
  "thought": "场景1的分镜已添加，现在创建场景2，使用专业剧本格式命名",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "createScene",
      "arguments": {
        "name": "场景 2: 战场废墟 - 黎明 (重见光明)",
        "description": "战斗结束后，阳光洒满战场废墟，众人劫后余生的喜悦"
      }
    }
  ],
  "message": "正在创建场景2..."
}
\`\`\`

（工具返回：{"sceneId": "scene_def", "name": "场景 2: 战场废墟 - 黎明 (重见光明)", "order": 2}）

助手（第四轮）:
\`\`\`json
{
  "thought": "场景2已创建，现在为其添加分镜，表现战后的喜悦氛围",
  "type": "tool_use",
  "toolCalls": [
    {
      "name": "addShots",
      "arguments": {
        "sceneId": "scene_def",
        "count": 3,
        "shots": [
          {
            "shotSize": "Wide Shot",
            "cameraMovement": "Crane Down",
            "description": "摇臂下降，阳光洒满战场，尘埃散去",
            "duration": 4
          },
          {
            "shotSize": "Medium Shot",
            "cameraMovement": "Pan Left",
            "description": "横摇展现众人欢呼，拥抱庆祝",
            "duration": 5
          },
          {
            "shotSize": "Close-Up",
            "cameraMovement": "Static",
            "description": "主角特写，疲惫但欣慰的微笑",
            "duration": 3
          }
        ]
      }
    }
  ],
  "message": "正在为场景2添加庆祝喜悦的分镜..."
}
\`\`\`

## 重要提示

- 始终遵循"查询→操作→验证"的工作流
- 创建场景后必须添加分镜，不要遗漏
- 多场景创建时，逐个完成（创建→添加分镜→创建下一个→添加分镜）
- 返回的 JSON 必须格式正确，可以被解析
- message 字段应该简洁，专注于用户体验`;
}

/**
 * Generate project context prompt (concise)
 */
function generateContextPrompt(context: AgentContext): string {
  return `项目：${context.projectName || '未命名'}（${context.sceneCount || 0}场景，${context.shotCount || 0}镜头）`;
}

/**
 * Send message to AI Agent
 */
export async function sendMessage(
  messages: AgentMessage[],
  context: AgentContext,
  onStream?: (chunk: string) => void,
  signal?: AbortSignal,
  tools: ToolDefinition[] = AGENT_TOOLS
): Promise<AgentAction> {
  const systemInstruction = generateSystemInstruction(tools);

  const fullUserMessage = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  // Convert chat history to Gemini format
  const contents = [
    {
      role: 'user',
      parts: [{ text: fullUserMessage }]
    }
  ];

  // Convert tools to Gemini function declaration format
  const geminiTools = [{
    function_declarations: tools.map(tool => ({
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
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: geminiTools,
          generationConfig: {
            temperature: 0.3, // Agent推理需要精确性，使用较低的temperature
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          }
        },
        signal // Pass signal to payload
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
      const toolCalls = [{
        name: functionCall.name,
        arguments: functionCall.args || {}
      }];
      return {
        type: 'tool_use',
        toolCalls,
        message: `正在调用工具: ${functionCall.name}`,
        requiresToolExecution: true,
        estimatedCredits: estimateCredits(toolCalls)
      };
    }

    // Gemini returned text response
    const text = candidate.content?.parts?.map((p: any) => p.text).join('\n') || '';

    // Try to parse as JSON action
    try {
      // 1. Try to extract from markdown code blocks first (most reliable)
      const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      let jsonString = jsonBlockMatch ? jsonBlockMatch[1] : null;

      // 2. If no code block, try to find the first valid JSON object
      if (!jsonString) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }
      }

      if (jsonString) {
        const action = JSON.parse(jsonString) as AgentAction;
        // If type is tool_use, ensure requiresToolExecution is set
        if (action.type === 'tool_use' && action.toolCalls && action.toolCalls.length > 0) {
          action.requiresToolExecution = true;
          action.estimatedCredits = estimateCredits(action.toolCalls);
        }
        return action;
      }
    } catch (e) {
      console.warn('Failed to parse JSON from Agent response:', e);
      // Not JSON, treat as plain text
    }

    return {
      type: 'none',
      message: text || '好的，我理解了。',
      thought: 'Plain text response'
    };

  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
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
  context: AgentContext = {},
  pendingScenes: string[] = [], // 跨轮次跟踪未添加分镜的场景
  signal?: AbortSignal,
  tools: ToolDefinition[] = AGENT_TOOLS
): Promise<AgentAction> {
  const systemInstruction = generateSystemInstruction(tools);
  const contextPrompt = generateContextPrompt(context);

  const lastUserMessage = [...chatHistory].reverse().find(msg => msg.role === 'user');
  const safeResults = sanitizeToolResults(toolResults);

  // 检查本轮是否有新建场景但尚未添加分镜
  const createdScenes = safeResults
    .filter(tr => tr.tool === 'createScene' && tr.result?.sceneId)
    .map(tr => tr.result.sceneId);
  const scenesWithShots = new Set(
    safeResults
      .filter(tr => tr.tool === 'addShots' && tr.result?.sceneId)
      .map(tr => tr.result.sceneId)
  );

  // 合并跨轮次的待处理场景和本轮新建场景
  const allPendingScenes = [
    ...pendingScenes.filter(id => !scenesWithShots.has(id)), // 之前轮次待处理的
    ...createdScenes.filter(id => !scenesWithShots.has(id))  // 本轮新建但未添加分镜的
  ];

  // Format tool results for Gemini (concise)
  const toolResultsText = safeResults.map(tr =>
    `${tr.tool}: ${JSON.stringify(tr.result)}`
  ).join('\n');

  // Build concise continuation prompt
  let continuationText = contextPrompt + '\n\n';
  if (lastUserMessage) {
    continuationText += `用户: ${lastUserMessage.content}\n\n`;
  }
  continuationText += `工具结果:\n${toolResultsText}`;

  // 如果有待处理的场景,明确提示 AI 添加分镜
  if (allPendingScenes.length > 0) {
    continuationText += `\n\n⚠️ 重要提醒：场景 ${allPendingScenes.join(', ')} 已创建但尚未添加分镜，请立即调用 addShots 为每个场景添加至少3个镜头。`;
  }

  const contents = [
    {
      role: 'user',
      parts: [{ text: continuationText }]
    }
  ];

  // Include tools so Gemini can make additional function calls
  const geminiTools = [{
    function_declarations: tools.map(tool => ({
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
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: geminiTools,
          generationConfig: {
            temperature: 0.3, // Agent推理需要精确性，使用较低的temperature
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          }
        },
        signal // Pass signal to payload
      },
      AI_TIMEOUT_MS
    );
    const candidate = data?.candidates?.[0];

    if (!candidate) {
      throw new Error('No candidate in Gemini response');
    }

    // Check if Gemini made another function call
    const functionCall = candidate.content?.parts?.[0]?.functionCall;

    if (functionCall) {
      // Gemini wants to call another tool
      const toolCalls = [{
        name: functionCall.name,
        arguments: functionCall.args || {}
      }];
      return {
        type: 'tool_use',
        toolCalls,
        message: `正在调用工具: ${functionCall.name}`,
        requiresToolExecution: true,
        estimatedCredits: estimateCredits(toolCalls)
      };
    }

    // Gemini returned text response
    const text = candidate?.content?.parts?.[0]?.text || '';

    // Try to parse as JSON action
    try {
      // 1. Try to extract from markdown code blocks first (most reliable)
      const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      let jsonString = jsonBlockMatch ? jsonBlockMatch[1] : null;

      // 2. If no code block, try to find the first valid JSON object
      if (!jsonString) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }
      }

      if (jsonString) {
        const action = JSON.parse(jsonString) as AgentAction;
        // If type is tool_use, ensure requiresToolExecution is set
        if (action.type === 'tool_use' && action.toolCalls && action.toolCalls.length > 0) {
          action.requiresToolExecution = true;
          action.estimatedCredits = estimateCredits(action.toolCalls);
        }
        return action;
      }
    } catch (e) {
      console.warn('Failed to parse JSON from Agent continuation:', e);
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
