import { NextResponse, NextRequest } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_IMAGE_API_KEY ||
  process.env.NEXT_GEMINI_IMAGE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY;

const isValidGridSize = (n: any) => Number.isInteger(n) && (n === 2 || n === 3);
const toSafeImages = (refs: any) =>
  Array.isArray(refs)
    ? refs
      .filter((img) => img && typeof img.data === 'string')
      .map((img) => ({
        data: img.data,
        mimeType: img.mimeType || 'image/png',
      }))
    : [];

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  // 2. 计算所需积分（考虑用户角色）
  const requiredCredits = calculateCredits('GEMINI_GRID', user.role);
  const operationDesc = getOperationDescription('GEMINI_GRID');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  const requestId = `grid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const {
      prompt,
      gridRows = 2,
      gridCols = 2,
      aspectRatio = '16:9',
      referenceImages = [],
    } = body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }
    if (!isValidGridSize(gridRows) || !isValidGridSize(gridCols)) {
      return NextResponse.json({ error: 'gridRows/gridCols must be 2 or 3' }, { status: 400 });
    }

    const safeRefs = toSafeImages(referenceImages);

    const parts = [
      ...safeRefs.map((img) => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      })),
      { text: prompt },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s safeguard

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.3,
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: '4K',
        },
      },
    };

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    };

    // 🔍 调试：检查代理配置
    // console.log('[Gemini Grid] HTTP_PROXY:', process.env.HTTP_PROXY);
    // console.log('[Gemini Grid] HTTPS_PROXY:', process.env.HTTPS_PROXY);

    if (process.env.HTTP_PROXY) {
      try {
        const proxyAgent = new ProxyAgent({
          uri: process.env.HTTP_PROXY,
          connectTimeout: 60000, // 60s connection timeout
        });
        fetchOptions.dispatcher = proxyAgent;
        // console.log('[Gemini Grid] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Grid] ❌ Failed to create ProxyAgent:', e);
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
        // console.log('[Gemini Grid] ✅ Agent created with extended timeouts');
      } catch (e) {
        console.error('[Gemini Grid] ❌ Failed to create Agent:', e);
      }
    }

    // 📊 诊断信息：记录请求详情
    const bodySize = (fetchOptions.body.length / 1024).toFixed(2);
    const refImageCount = safeRefs.length;
    const promptLength = prompt.length;
    const totalViews = gridRows * gridCols;

    const startTime = Date.now();
    // console.log('[Gemini Grid] 🚀 Request started');
    // console.log('[Gemini Grid] 📊 Diagnostics:', {
    //   timestamp: new Date().toISOString(),
    //   bodySize: `${bodySize} KB`,
    //   refImageCount,
    //   promptLength,
    //   gridSize: `${gridRows}x${gridCols}`,
    //   totalViews,
    //   aspectRatio,
    //   proxy: process.env.HTTP_PROXY ? 'enabled' : 'disabled'
    // });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      fetchOptions
    );
    clearTimeout(timeout);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    // console.log(`[Gemini Grid] ✅ Request completed in ${elapsedTime}s`);

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Gemini Grid API error]', requestId, resp.status, text);
      return NextResponse.json({ error: text || resp.statusText, requestId }, { status: resp.status });
    }

    const data = await resp.json();
    const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!uri) {
      console.error('[Gemini Grid parse error]', requestId, data);
      return NextResponse.json({ error: 'no image returned', requestId }, { status: 500 });
    }

    // 📊 记录响应数据大小
    const responseSize = (uri.length / 1024).toFixed(2);
    // console.log('[Gemini Grid] 📊 Response size:', `${responseSize} KB (base64)`);

    // 4. 消耗积分
    const consumeResult = await consumeCredits(
      user.id,
      requiredCredits,
      'generate-grid',
      `${operationDesc} (${gridRows}x${gridCols})`
    );

    if (!consumeResult.success) {
      console.error('[Gemini Grid] 💳 Failed to consume credits:', consumeResult.error);
      return NextResponse.json(
        { error: '积分扣除失败: ' + consumeResult.error },
        { status: 500 }
      );
    }

    // console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

    return NextResponse.json({ fullImage: `data:image/png;base64,${uri}`, requestId });
  } catch (error: any) {
    console.error('[Gemini Grid fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini grid request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
