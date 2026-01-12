/**
 * Planning Agent Service - 策划页专用 AI 服务
 * 专注于分镜生成、优化和资产建议
 * 复用 StoryboardService 和现有基础设施
 */

import { StoryboardService } from './storyboardService';

const GEMINI_MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-3-flash-preview';
const AI_TIMEOUT_MS = 90000;

export interface PlanningContext {
    projectId: string;
    projectName: string;
    script?: string;
    characters?: Array<{ id: string; name: string; description?: string }>;
    locations?: Array<{ id: string; name: string; description?: string }>;
    scenes?: Array<{ id: string; name: string; description?: string; shotCount: number }>;
    shotCount?: number;
}

export interface PlanningAction {
    type: 'generate_storyboard' | 'optimize_scene' | 'add_scene' | 'update_scene' | 'delete_scene' | 'suggest_assets' | 'chat';
    message: string;
    data?: any;
    suggestedActions?: string[];
}

/**
 * 生成策划页专用的系统指令
 */
function generatePlanningSystemInstruction(context: PlanningContext): string {
    return `# AI 导演助手 - 策划阶段

你是一个专业的 AI 导演助手，帮助用户进行影视项目的前期策划工作。

## 当前项目信息
- 项目名称：${context.projectName || '未命名'}
- 剧本：${context.script ? '已填写 (' + context.script.length + ' 字)' : '未填写'}
- 角色：${context.characters?.map(c => c.name).join('、') || '未添加'}
- 场景：${context.locations?.map(l => l.name).join('、') || '未添加'}
- 分镜场景：${context.scenes?.length || 0} 个场景，${context.shotCount || 0} 个镜头

## 你的职责

1. **理解创意**：帮助用户完善灵感和创意
2. **设计分镜**：将剧本转换为专业的分镜脚本
3. **优化内容**：根据用户反馈调整场景和镜头
4. **资产建议**：推荐合适的角色和场景设计

## 回复格式

使用中文回复，保持专业但友好的语气。

当用户要求生成分镜时，返回结构化的场景和镜头信息。
当用户要求优化时，明确说明修改了什么。
当用户只是聊天时，像一个专业导演一样提供建议。

## 重要规则

1. 始终基于项目上下文回答
2. 生成的分镜应包含：场景名称、镜头描述、景别、镜头运动
3. 使用专业的影视术语
4. 每次对话后，建议用户下一步可以做什么`;
}

/**
 * 调用 Gemini 生成接口
 */
async function callGemini(systemInstruction: string, userMessage: string): Promise<string> {
    const response = await fetch('/api/gemini-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: GEMINI_MODEL,
            payload: {
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000,
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`AI 服务错误: ${response.status}`);
    }

    const { data } = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
    return text;
}

/**
 * Planning Agent 主类
 */
export class PlanningAgent {
    private storyboardService: StoryboardService;

    constructor() {
        this.storyboardService = new StoryboardService();
    }

    /**
     * 处理用户消息
     */
    async processMessage(
        message: string,
        context: PlanningContext,
        chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    ): Promise<PlanningAction> {
        const systemInstruction = generatePlanningSystemInstruction(context);

        // 构建包含历史的完整消息
        const fullMessage = chatHistory.length > 0
            ? `之前的对话：\n${chatHistory.slice(-5).map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')}\n\n当前问题：${message}`
            : message;

        try {
            const response = await callGemini(systemInstruction, fullMessage);
            return {
                type: 'chat',
                message: response,
                suggestedActions: this.extractSuggestedActions(response)
            };
        } catch (error: any) {
            return {
                type: 'chat',
                message: `抱歉，AI 服务出错了: ${error.message}`,
            };
        }
    }

    /**
     * 生成完整分镜（一次性）
     */
    async generateFullStoryboard(
        script: string,
        artStyle?: string
    ): Promise<{ scenes: any[]; characters: any[] }> {
        // 复用现有的 StoryboardService
        const shots = await this.storyboardService.generateStoryboardFromScript(script, artStyle);
        const scenes = this.storyboardService.groupShotsIntoScenes(shots);

        // 分析剧本提取角色
        const analysis = await this.storyboardService.analyzeScript(script);

        return {
            scenes,
            characters: analysis.characters || []
        };
    }

    /**
     * 优化单个场景
     */
    async optimizeScene(
        sceneId: string,
        instruction: string,
        context: PlanningContext
    ): Promise<PlanningAction> {
        const scene = context.scenes?.find(s => s.id === sceneId);
        if (!scene) {
            return {
                type: 'optimize_scene',
                message: '未找到指定场景',
            };
        }

        const prompt = `请根据以下指令优化场景：
场景：${scene.name}
描述：${scene.description || '无'}
镜头数：${scene.shotCount}

优化指令：${instruction}

请返回优化后的场景描述和镜头调整建议。`;

        const systemInstruction = generatePlanningSystemInstruction(context);
        const response = await callGemini(systemInstruction, prompt);

        return {
            type: 'optimize_scene',
            message: response,
            data: { sceneId, original: scene }
        };
    }

    /**
     * 从 AI 回复中提取建议的下一步操作
     */
    private extractSuggestedActions(response: string): string[] {
        const suggestions: string[] = [];

        if (response.includes('分镜') || response.includes('镜头')) {
            suggestions.push('生成分镜');
        }
        if (response.includes('角色') || response.includes('人物')) {
            suggestions.push('添加角色');
        }
        if (response.includes('场景') || response.includes('地点')) {
            suggestions.push('添加场景');
        }
        if (response.includes('优化') || response.includes('调整')) {
            suggestions.push('优化当前内容');
        }

        return suggestions.slice(0, 3); // 最多返回3个建议
    }
}

// 导出单例
export const planningAgent = new PlanningAgent();
