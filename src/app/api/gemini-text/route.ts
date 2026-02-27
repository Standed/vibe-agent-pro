import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-pro-preview'; // 文本生成使用 Pro 模型
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

  const requestId = `text-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const {
      prompt,
      systemInstruction,
      referenceImages = [],
      model = GEMINI_TEXT_MODEL,
      temperature = 1.0, // 统一使用 temperature=1.0
    } = body || {};

    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const parts = [
      ...referenceImages.map((img: any) => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        },
      })),
      { text: systemInstruction ? `System Instruction: ${systemInstruction}\n\nUser: ${prompt}` : prompt },
    ];

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        temperature,
      },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 4. 消耗积分
    const consumeResult = await consumeCredits(
      user.id,
      requiredCredits,
      'generate-text',
      `${operationDesc}`
    );

    if (!consumeResult.success) {
      console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
      return NextResponse.json(
        { error: '积分扣除失败: ' + consumeResult.error },
        { status: 500 }
      );
    }

    // console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

    return NextResponse.json({ result: text, requestId });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Gemini Text failed:`, error);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
