import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import sharp from 'sharp';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { isR2Configured, uploadBase64ToR2 } from '@/lib/r2-server-upload';
import { assetLogService } from '@/lib/assetLogService';

export const maxDuration = 120;  // 与 AbortController 保持一致

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fetch image from URL and compress to max 2048px JPEG
 * This prevents 5MB+ payload errors from high-resolution images
 */
const fetchImageToBase64 = async (url: string): Promise<{ data: string, mimeType: string } | null> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per image

    // Add no-store to prevent caching of failed responses
    // Add User-Agent to avoid blocking by some CDNs/WAFs
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'VibeAgent-Pro/1.0 (Bot)',
        'Accept': 'image/*'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Gemini Image] ❌ Failed to fetch image: ${response.status} ${response.statusText}`, url);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error('[Gemini Image] ❌ Fetched empty image buffer', url);
      return null;
    }

    const inputBuffer = Buffer.from(arrayBuffer);

    // Compress with sharp: resize to max 2048px, JPEG quality 90
    const compressedBuffer = await sharp(inputBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    const base64 = compressedBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    console.log(`[Gemini Image] 📦 Image processed: ${(inputBuffer.length / 1024).toFixed(0)}KB → ${(compressedBuffer.length / 1024).toFixed(0)}KB`);

    return { data: base64, mimeType };
  } catch (error: any) {
    console.error('Failed to fetch/compress image:', url, error.message);
    return null;
  }
};

const processReferenceImages = async (refs: any[]) => {
  if (!Array.isArray(refs)) return [];
  const processed = await Promise.all(refs.map(async (img) => {
    if (!img) return null;
    if (typeof img.data === 'string' && img.data.length > 0) {
      return {
        inlineData: {
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        },
      };
    }
    if (typeof img.url === 'string' && img.url.length > 0) {
      const fetched = await fetchImageToBase64(img.url);
      if (fetched) {
        return {
          inlineData: {
            data: fetched.data,
            mimeType: fetched.mimeType,
          },
        };
      }
    }
    return null;
  }));
  return processed.filter((p) => p !== null);
};

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

  try {
    const body = await request.json();
    const { prompt, referenceImages = [], aspectRatio = '1:1', imageSize = '2K', uploadContext } = body || {};
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

    // Process reference images (server-side fetch)
    const safeRefsPart = await processReferenceImages(referenceImages);

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts: [
            ...safeRefsPart,
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 1.0,
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: validImageSize,
        },
      },
    };

    // Gemini image endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s safeguard

    const finalRequestBody = JSON.stringify(requestBody);

    // 🛡️ 载荷大小检查：Gemini 限制通常在 20MB 左右 (Base64 后)，我们放宽限制到 20MB
    if (finalRequestBody.length > 20 * 1024 * 1024) {
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

    // 5. 尝试服务端上传到 R2（跳过客户端上传，减少延迟）
    let logId: string | null = null;
    logId = await assetLogService.logStart({
      userId: user.id,
      operationType: 'gemini',
      status: 'PENDING',
      metadata: {
        prompt,
        aspectRatio,
        imageSize: validImageSize,
        requestId,
        uploadContext: uploadContext || null
      }
    });

    if (isR2Configured()) {
      const r2UploadStart = Date.now();
      const r2Url = await uploadBase64ToR2(uri, user.id, 'generated', 'direct', uploadContext);
      const r2UploadTime = ((Date.now() - r2UploadStart) / 1000).toFixed(2);

      if (r2Url) {
        if (logId) {
          await assetLogService.logUpdate(logId, { r2Url, status: 'SUCCESS' });
        }
        console.log(`[Gemini Image] ✅ R2 服务端直传成功 (${r2UploadTime}s)`);
        return NextResponse.json({
          url: r2Url,
          requestId,
          uploadedToR2: true,
          timings: {
            geminiGeneration: elapsedTime,
            r2Upload: r2UploadTime
          }
        });
      }
    }

    // 回退：返回 Base64 Data URL
    if (logId) {
      await assetLogService.logUpdate(logId, { status: 'FAILED', error: 'R2 upload failed' });
    }
    console.warn('[Gemini Image] ⚠️ R2 未配置或上传失败，回退 Base64');
    return NextResponse.json({ url: `data:image/png;base64,${uri}`, requestId, uploadedToR2: false });
  } catch (error: any) {
    console.error('[Gemini Image fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini image request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
