import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-pro-preview';
const GEMINI_API_KEY =
    process.env.GEMINI_TEXT_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_GEMINI_TEXT_API_KEY ||
    process.env.NEXT_GEMINI_API_KEY;

export async function POST(request: NextRequest) {
    // 1. 验证用户身份
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) {
        return authResult.error;
    }
    const { user } = authResult;

    // 白名单检查
    const whitelistCheck = checkWhitelist(user);
    if ('error' in whitelistCheck) return whitelistCheck.error;

    // 2. 计算所需积分
    const requiredCredits = calculateCredits('GEMINI_TEXT', user.role);
    const operationDesc = getOperationDescription('GEMINI_TEXT');

    // 3. 检查积分
    const creditsCheck = checkCredits(user, requiredCredits);
    if ('error' in creditsCheck) {
        return creditsCheck.error;
    }

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
    }

    const requestId = `planning-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
        const body = await request.json();
        const { message, context } = body || {};

        if (!message) {
            return NextResponse.json({ error: 'missing message' }, { status: 400 });
        }

        const systemInstruction = `你是一位专业的 AI 导演助手，帮助用户完善剧本创意、设计角色和场景。

当前项目信息：
- 剧本：${context?.script || '(未填写)'}
- 角色：${context?.characters?.map((c: any) => c.name).join('、') || '(未添加)'}
- 场景：${context?.locations?.map((l: any) => l.name).join('、') || '(未添加)'}

你的任务：
1. 帮助用户完善剧本，使内容更有故事性和画面感
2. 根据剧本建议合适的角色设计
3. 根据剧本建议合适的场景设计
4. 用简洁、专业的语言回复
5. 适时给出具体的建议和例子

请用中文回复。`;

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemInstruction}\n\n用户问题：${message}` }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000,
            },
        };

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        if (!resp.ok) {
            const text = await resp.text();
            return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
        }

        const data = await resp.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我暂时无法回复。';

        // 4. 消耗积分
        const consumeResult = await consumeCredits(
            user.id,
            requiredCredits,
            'planning-chat',
            `${operationDesc} - 策划对话`
        );

        if (!consumeResult.success) {
            console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
            // 继续返回结果，不阻断用户体验
        }

        return NextResponse.json({ response: responseText, requestId });
    } catch (error: any) {
        console.error(`[${requestId}] ❌ Planning API failed:`, error);
        return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
    }
}
