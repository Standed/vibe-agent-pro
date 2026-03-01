import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_IMAGE_API_KEY ||
  process.env.NEXT_GEMINI_IMAGE_API_KEY ||
  process.env.GEMINI_API_KEY ||
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
  const requiredCredits = calculateCredits('GEMINI_EDIT', user.role);
  const operationDesc = getOperationDescription('GEMINI_EDIT');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  const requestId = `edit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const { imageBase64, prompt, aspectRatio = '16:9' } = body || {};

    if (!imageBase64 || !prompt) {
      return NextResponse.json({ error: 'missing image or prompt' }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            { text: `基于这张图片，${prompt}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 1.0, // 统一使用 temperature=1.0
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: '4K',
        },
      },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
    const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!uri) {
      return NextResponse.json({ error: 'no image returned' }, { status: 500 });
    }

    // 4. 消耗积分
    const consumeResult = await consumeCredits(
      user.id,
      requiredCredits,
      'edit-image',
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

    return NextResponse.json({ url: `data:image/png;base64,${uri}`, requestId });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Gemini Edit failed:`, error);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
