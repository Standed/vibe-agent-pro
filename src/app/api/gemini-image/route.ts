import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 120;  // 与 AbortController 保持一致

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const requiredCredits = calculateCredits('GEMINI_IMAGE', user.role);
  const operationDesc = getOperationDescription('GEMINI_IMAGE');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  const requestId = `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const { prompt, referenceImages = [], aspectRatio = '1:1', imageSize = '2K' } = body || {};
    // 验证 imageSize 参数，只允许 2K 或 4K
    const validImageSize = ['2K', '4K'].includes(imageSize) ? imageSize : '2K';
    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const apiKey =
      process.env.GEMINI_IMAGE_API_KEY ||
      process.env.NEXT_GEMINI_IMAGE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_GEMINI_API_KEY;
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
    if (!apiKey) {
      return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
    }

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts: [
            // 参考图在前，与 Grid 保持一致，提高视觉参考权重
            ...referenceImages.map((img: any) => ({
              inlineData: {
                data: img.data,
                mimeType: img.mimeType || 'image/png',
              },
            })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 1.0, // 统一使用 temperature=1.0
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: validImageSize,  // 用户选择的分辨率 (2K/4K)
        },
      },
    };

    // Gemini image endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s safeguard

    const finalRequestBody = JSON.stringify(requestBody);

    // 🛡️ 载荷大小检查：Vercel 限制为 4.5MB，我们限制在 4MB 以内以确保安全
    if (finalRequestBody.length > 4 * 1024 * 1024) {
      console.error(`[Gemini Image] ❌ Payload too large: ${(finalRequestBody.length / 1024 / 1024).toFixed(2)}MB`);
      return NextResponse.json(
        { error: `请求载荷过大 (${(finalRequestBody.length / 1024 / 1024).toFixed(2)}MB)，请减少参考图数量或缩短提示词。` },
        { status: 413 }
      );
    }

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: finalRequestBody,
      signal: controller.signal,
    };

    // Proxy support (align with grid route)
    if (process.env.HTTP_PROXY) {
      try {
        const proxyAgent = new ProxyAgent({
          uri: process.env.HTTP_PROXY,
          connectTimeout: 60000, // 60s connection timeout
        });
        fetchOptions.dispatcher = proxyAgent;
        // console.log('[Gemini Image] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Image] ❌ Failed to create ProxyAgent:', e);
      }
    } else {
      // Create Agent with extended connection timeout for direct connection
      try {
        const agent = new Agent({
          connectTimeout: 60000, // 60s connection timeout
          headersTimeout: 130000, // 130s headers timeout (longer than AbortController)
          bodyTimeout: 130000, // 130s body timeout
        });
        fetchOptions.dispatcher = agent;
        // console.log('[Gemini Image] ✅ Agent created with extended timeouts');
      } catch (e) {
        console.error('[Gemini Image] ❌ Failed to create Agent:', e);
      }
    }

    // 📊 诊断信息：记录请求详情
    const bodySize = (fetchOptions.body.length / 1024).toFixed(2);
    const refImageCount = referenceImages.length;
    const promptLength = prompt.length;

    const startTime = Date.now();
    // console.log('[Gemini Image] 🚀 Request started');
    // console.log('[Gemini Image] 📊 Diagnostics:', {
    //   timestamp: new Date().toISOString(),
    //   bodySize: `${bodySize} KB`,
    //   refImageCount,
    //   promptLength,
    //   aspectRatio,
    //   proxy: process.env.HTTP_PROXY ? 'enabled' : 'disabled'
    // });

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, fetchOptions);
    clearTimeout(timeout);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    // console.log(`[Gemini Image] ✅ Request completed in ${elapsedTime}s`);

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!uri) {
      return NextResponse.json({ error: 'no image returned' }, { status: 500 });
    }

    // 📊 记录响应数据大小
    const responseSize = (uri.length / 1024).toFixed(2);
    // console.log('[Gemini Image] 📊 Response size:', `${responseSize} KB (base64)`);

    // 4. 消耗积分
    const consumeResult = await consumeCredits(
      user.id,
      requiredCredits,
      'generate-image',
      `${operationDesc}`
    );

    if (!consumeResult.success) {
      console.error('[Gemini Image] 💳 Failed to consume credits:', consumeResult.error);
      return NextResponse.json(
        { error: '积分扣除失败: ' + consumeResult.error },
        { status: 500 }
      );
    }

    // console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

    // Return data URL
    return NextResponse.json({ url: `data:image/png;base64,${uri}`, requestId });
  } catch (error: any) {
    console.error('[Gemini Image fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini image request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
