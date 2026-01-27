import { NextResponse, NextRequest } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import sharp from 'sharp';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist, checkRateLimit } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { isR2Configured, processAndUploadGrid } from '@/lib/r2-server-upload';

export const maxDuration = 120;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_IMAGE_API_KEY ||
  process.env.NEXT_GEMINI_IMAGE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY;

const isValidGridSize = (n: any) => Number.isInteger(n) && (n === 2 || n === 3);

/**
 * Fetch image from URL and compress to max 2048px JPEG
 * This prevents 5MB+ payload errors from high-resolution Gemini images
 */
const fetchImageToBase64 = async (url: string): Promise<{ data: string, mimeType: string } | null> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per image
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Compress with sharp: resize to max 2048px, JPEG quality 90
    const compressedBuffer = await sharp(inputBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    const base64 = compressedBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    console.log(`[Gemini Grid] 📦 Image compressed: ${(inputBuffer.length / 1024).toFixed(0)}KB → ${(compressedBuffer.length / 1024).toFixed(0)}KB`);

    return { data: base64, mimeType };
  } catch (error) {
    console.error('Failed to fetch/compress image:', url, error);
    return null;
  }
};

const processReferenceImages = async (refs: any[]) => {
  if (!Array.isArray(refs)) return [];
  const processed = await Promise.all(refs.map(async (img) => {
    if (!img) return null;
    // Data URL provided directly
    if (typeof img.data === 'string' && img.data.length > 0) {
      return {
        inlineData: {
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        },
      };
    }
    // URL provided
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

  // 1.1 白名单检查
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) return whitelistCheck.error;

  // 1.2 频率限制检查 (图片: 60次/分钟)
  const rateLimitCheck = await checkRateLimit(user.id, 'image', 60);
  if ('error' in rateLimitCheck) return rateLimitCheck.error;

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

    // Process reference images (handle URLs server-side)
    const safeRefsPart = await processReferenceImages(referenceImages);

    const parts = [
      ...safeRefsPart,
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
        temperature: 1.0,
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: '4K',
        },
      },
    };


    const finalRequestBody = JSON.stringify(requestBody);

    // 🛡️ 载荷大小检查：Gemini 限制通常在 20MB 左右 (Base64 后)，我们放宽限制到 20MB
    if (finalRequestBody.length > 20 * 1024 * 1024) {
      console.error(`[Gemini Grid] ❌ Payload too large: ${(finalRequestBody.length / 1024 / 1024).toFixed(2)}MB`);
      return NextResponse.json(
        { error: `请求载荷过大 (${(finalRequestBody.length / 1024 / 1024).toFixed(2)}MB)，请减少参考图数量或缩短提示词。` },
        { status: 413 }
      );
    }

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: finalRequestBody,
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
    const refImageCount = safeRefsPart.length;
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

    // 5. 尝试服务端直传 R2（跳过客户端上传，极大减少延迟）
    if (isR2Configured()) {
      const uploadResult = await processAndUploadGrid(uri, user.id, gridRows, gridCols);

      if (uploadResult.success && uploadResult.fullImageUrl) {
        console.log(`[Gemini Grid] ✅ R2 服务端直传成功 (${uploadResult.uploadTime}s): 1 fullImage + ${uploadResult.sliceUrls.length} slices`);
        return NextResponse.json({
          fullImage: uploadResult.fullImageUrl,
          slices: uploadResult.sliceUrls as string[],
          requestId,
          uploadedToR2: true,
          timings: {
            geminiGeneration: elapsedTime,
            r2Upload: uploadResult.uploadTime
          }
        });
      }

      // 部分成功：只有 fullImage 上传成功
      if (uploadResult.fullImageUrl) {
        console.log(`[Gemini Grid] ⚠️ 部分成功：fullImage 已上传 R2 (${uploadResult.uploadTime}s)`);
        return NextResponse.json({
          fullImage: uploadResult.fullImageUrl,
          requestId,
          uploadedToR2: 'partial',
          timings: {
            geminiGeneration: elapsedTime,
            r2Upload: uploadResult.uploadTime
          }
        });
      }
    }

    // 5.2 完全回退到 Base64
    console.warn(`[Gemini Grid] ⚠️ R2 未配置或上传失败，回退 Base64`);
    return NextResponse.json({
      fullImage: `data:image/png;base64,${uri}`,
      requestId,
      uploadedToR2: false
    });
  } catch (error: any) {
    console.error('[Gemini Grid fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini grid request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
