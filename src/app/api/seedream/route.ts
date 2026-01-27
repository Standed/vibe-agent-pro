import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist, checkRateLimit } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 120;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  // 1.1 白名单检查
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) return whitelistCheck.error;

  // 1.2 频率限制检查 (图片: 60次/分钟)
  const rateLimitCheck = await checkRateLimit(user.id, 'image', 60);
  if ('error' in rateLimitCheck) return rateLimitCheck.error;

  // 2. 计算所需积分
  const requiredCredits = calculateCredits('SEEDREAM_GENERATE', user.role);
  const operationDesc = getOperationDescription('SEEDREAM_GENERATE');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  const requestId = `seedream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const { prompt, imageUrls = [], size = '2560x1440', model } = body || {};

    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const apiKey =
      process.env.VOLCANO_API_KEY ||
      process.env.NEXT_VOLCANO_API_KEY ||
      process.env.NEXT_PUBLIC_VOLCANO_API_KEY; // ⚠️ 向后兼容，应移除
    const baseUrl = process.env.VOLCANO_BASE_URL || process.env.NEXT_VOLCANO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const seedreamModelId =
      model ||
      process.env.SEEDREAM_MODEL_ID ||
      process.env.NEXT_SEEDREAM_MODEL_ID ||
      process.env.NEXT_PUBLIC_SEEDREAM_MODEL_ID || // ⚠️ 向后兼容，应移除
      'doubao-seedream-4-5-251128';

    if (!apiKey || !seedreamModelId) {
      return NextResponse.json({ error: 'seedream api not configured' }, { status: 500 });
    }

    const resp = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: seedreamModelId,
        prompt,
        image: imageUrls,
        sequential_image_generation: 'disabled',
        size,
        watermark: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const url = data?.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'missing image url' }, { status: 500 });
    }

    // 🔥 下载图片并转换为 base64 data URL，避免客户端 CORS 和 URL 过期问题
    try {
      const imageResp = await fetch(url);
      if (!imageResp.ok) {
        console.warn('Failed to download image, returning original URL:', imageResp.statusText);
        return NextResponse.json({ url });
      }

      const blob = await imageResp.blob();
      const mimeType = blob.type || 'image/png';
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      console.log('✅ SeeDream 图片已转换为 base64 data URL');

      // 4. 消耗积分
      const consumeResult = await consumeCredits(
        user.id,
        requiredCredits,
        'generate-image',
        `${operationDesc}`
      );

      if (!consumeResult.success) {
        console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
        return NextResponse.json(
          { error: '积分扣除失败: ' + consumeResult.error },
          { status: 500 }
        );
      }

      console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

      return NextResponse.json({ url: dataUrl, requestId });
    } catch (downloadError: any) {
      console.warn('Failed to convert image to base64, returning original URL:', downloadError);

      // 即使下载失败也消耗积分,因为API调用已成功
      await consumeCredits(user.id, requiredCredits, 'generate-image', operationDesc);

      return NextResponse.json({ url, requestId });
    }
  } catch (error: any) {
    console.error(`[${requestId}] ❌ SeeDream failed:`, error);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
