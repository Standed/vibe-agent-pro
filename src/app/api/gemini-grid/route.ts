import { NextResponse, NextRequest } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist, checkRateLimit } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { isR2Configured, processAndUploadGrid, generatePresignedUrl } from '@/lib/r2-server-upload';
import { assetLogService } from '@/lib/assetLogService';

export const maxDuration = 300; // Extend to 5 minutes for Pro plan

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
 * 获取 MIME 类型从 URL
 */
const getMimeTypeFromUrl = (url: string): string => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    default: return 'image/jpeg';
  }
};

/**
 * 处理参考图片 - 支持双模式
 * mode = 'url': 使用预签名 URL (fileData.fileUri) - 速度最快
 * mode = 'download': 服务端下载转 Base64 (inlineData) - 最稳定
 */
const processReferenceImages = async (refs: any[], mode: 'url' | 'download' = 'url') => {
  if (!Array.isArray(refs)) return [];

  const processedPromises = refs.map(async (img) => {
    if (!img) return null;

    // 1. Google File API URI (原生支持)
    if (typeof img.url === 'string' && img.url.startsWith('https://generativelanguage.googleapis.com')) {
      return {
        fileData: {
          fileUri: img.url,
          mimeType: img.mimeType || getMimeTypeFromUrl(img.url),
        },
      };
    }

    // 2. 外部 URL 处理（根据 mode 选择策略）
    if (typeof img.url === 'string' && img.url.length > 0 && img.url.startsWith('http')) {
      const mimeType = img.mimeType || getMimeTypeFromUrl(img.url);

      if (mode === 'url') {
        // 快速路径：尝试预签名 URL
        let finalUrl = img.url;
        if (isR2Configured()) {
          const signed = await generatePresignedUrl(img.url);
          if (signed) finalUrl = signed;
        }
        return {
          fileData: {
            fileUri: finalUrl,
            mimeType
          }
        };
      } else {
        // 降级路径：服务端下载转 Base64
        try {
          console.log(`[Gemini Grid] Downloading (fallback): ${img.url}`);
          const resp = await fetch(img.url);
          if (!resp.ok) throw new Error(`Failed to fetch ${img.url}: ${resp.status}`);
          const arrayBuffer = await resp.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          return {
            inlineData: {
              data: base64,
              mimeType: resp.headers.get('content-type') || mimeType
            }
          };
        } catch (e) {
          console.error(`[Gemini Grid] Download failed: ${img.url}`, e);
          return null;
        }
      }
    }

    // 3. Data URL / Base64 回退
    if (typeof img.data === 'string' && img.data.length > 0) {
      return {
        inlineData: {
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        },
      };
    }

    return null;
  });

  const processed = await Promise.all(processedPromises);
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
      uploadContext,
    } = body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }
    if (!isValidGridSize(gridRows) || !isValidGridSize(gridCols)) {
      return NextResponse.json({ error: 'gridRows/gridCols must be 2 or 3' }, { status: 400 });
    }

    // ======== 核心请求逻辑 (支持 URL 优先 + 降级重试) ========
    const makeGeminiRequest = async (mode: 'url' | 'download') => {
      const stepStart = Date.now();
      console.log(`[Gemini Grid] 🚀 Step 1: Processing references (mode=${mode})...`);

      const safeRefsPart = await processReferenceImages(referenceImages, mode);
      console.log(`[Gemini Grid] ✅ References processed in ${((Date.now() - stepStart) / 1000).toFixed(2)}s`);

      const parts = [
        ...safeRefsPart,
        { text: prompt },
      ];

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

      // 针对 URL 模式极其严格的超时（45s），因为如果 Gemini 抓不到 URL，通常会挂起很久。
      // 我们希望尽快失败，以便切换到下载模式。
      // 下载模式给予更长时间（180s）。
      const apiTimeoutMs = mode === 'url' ? 45000 : 180000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), apiTimeoutMs);

      const finalRequestBody = JSON.stringify(requestBody);

      // 载荷大小检查
      if (finalRequestBody.length > 20 * 1024 * 1024) {
        clearTimeout(timeout);
        throw new Error(`请求载荷过大 (${(finalRequestBody.length / 1024 / 1024).toFixed(2)}MB)`);
      }

      const fetchOptions: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: finalRequestBody,
        signal: controller.signal // Bind signal
      };

      // Proxy 配置
      if (process.env.HTTP_PROXY) {
        try {
          const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY, connectTimeout: 30000 });
          fetchOptions.dispatcher = proxyAgent;
        } catch (e) { console.error('[Gemini Grid] ProxyAgent failed:', e); }
      } else {
        try {
          // 本地开发环境增加超时宽容度
          const agent = new Agent({
            connectTimeout: 30000,
            headersTimeout: apiTimeoutMs,
            bodyTimeout: apiTimeoutMs
          });
          fetchOptions.dispatcher = agent;
        } catch (e) { console.error('[Gemini Grid] Agent failed:', e); }
      }

      console.log(`[Gemini Grid] 🚀 Step 2: Sending API request (timeout=${apiTimeoutMs}ms)...`);
      const apiStartTime = Date.now();

      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          fetchOptions
        );
        clearTimeout(timeout);

        const elapsedTime = ((Date.now() - apiStartTime) / 1000).toFixed(2);
        console.log(`[Gemini Grid] 📡 API Response received in ${elapsedTime}s, status: ${resp.status}`);

        if (!resp.ok) {
          const text = await resp.text();
          console.error('[Gemini Grid API error]', requestId, resp.status, text);
          const err = new Error(text || resp.statusText);
          (err as any).status = resp.status;
          (err as any).body = text;
          throw err;
        }

        const data = await resp.json();
        const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!uri) {
          console.error('[Gemini Grid parse error]', requestId, data);
          throw new Error('no image returned');
        }

        return { uri, elapsedTime };
      } catch (err: any) {
        clearTimeout(timeout);
        // 区分超时错误
        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${apiTimeoutMs}ms (mode=${mode})`);
        }
        throw err;
      }
    };

    // ======== 执行请求 (URL 优先 + 降级重试) ========
    let result: { uri: string; elapsedTime: string };
    try {
      // 首次尝试：使用快速的 URL 模式
      console.log(`[Gemini Grid] 🟢 Attempt 1: URL Mode`);
      result = await makeGeminiRequest('url');
      console.log(`[Gemini Grid] ✅ URL 模式成功 (${result.elapsedTime}s)`);
    } catch (urlError: any) {
      console.warn(`[Gemini Grid] ⚠️ Attempt 1 failed:`, urlError.message);

      // 只有特定错误才重试：400 Cannot fetch (Gemini无法抓取) 或 超时 (Gemini挂起)
      const isCannotFetch = urlError.status === 400 && urlError.body?.includes('Cannot fetch');
      const isTimeout = urlError.message?.includes('timed out');

      if ((isCannotFetch || isTimeout) && referenceImages.length > 0) {
        console.warn(`[Gemini Grid] 🔄 Switching to DOWNLOAD mode (Fallback)...`);
        // 自动降级：使用下载模式重试
        result = await makeGeminiRequest('download');
        console.log(`[Gemini Grid] ✅ 下载模式成功 (${result.elapsedTime}s)`);
      } else {
        // 其他错误直接抛出
        throw urlError;
      }
    }

    const uri = result.uri;
    const elapsedTime = result.elapsedTime;

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

    // 5. [PERFORMANCE FIX] Skip Server-side R2 Upload
    // 为了防止 Vercel 超时，我们跳过服务端的 processAndUploadGrid (下载+切片+上传)。
    // 直接返回 Base64/URL 给客户端，由客户端进行切片处理（client-side slicing）。

    console.log(`[Gemini Grid] ⚡ Skipping server-side R2 upload to prevent timeout. Returning raw data.`);

    /* 
    // 原有的服务端切片逻辑 (暂时屏蔽)
    let logId: string | null = null;
    logId = await assetLogService.logStart({ ... });

    if (isR2Configured()) {
        const uploadResult = await processAndUploadGrid(uri, user.id, gridRows, gridCols, uploadContext);
        if (uploadResult.success) { ... }
    }
    */

    // 直接返回，前端 services/geminiService.ts 会自动处理切片
    return NextResponse.json({
      fullImage: `data:image/png;base64,${uri}`,
      requestId,
      uploadedToR2: false, // Explicitly tell client we didn't upload to R2
      timings: {
        geminiGeneration: elapsedTime,
        r2Upload: '0.00'
      }
    });

  } catch (error: any) {
    console.error('[Gemini Grid fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini grid request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
