import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { isR2Configured, uploadBase64ToR2, generatePresignedUrl } from '@/lib/r2-server-upload';
import { assetLogService } from '@/lib/assetLogService';

export const maxDuration = 180;  // Gemini 图片生成可能需要更长时间

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_GEMINI_RETRIES = Number(process.env.GEMINI_IMAGE_MAX_RETRIES || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.GEMINI_IMAGE_RETRY_DELAY_MS || 1200);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryGeminiError = (error: any): boolean => {
  const status = Number(error?.status);
  const body = String(error?.body || error?.message || '').toLowerCase();
  if (status === 429 || status >= 500) return true;
  if (body.includes('resource_exhausted') || body.includes('high demand') || body.includes('"unavailable"')) {
    return true;
  }
  return false;
};

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
          console.log(`[Gemini Image] Downloading (fallback): ${img.url}`);
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
          console.error(`[Gemini Image] Download failed: ${img.url}`, e);
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
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
    if (!apiKey) {
      return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
    }

    // ======== 核心请求逻辑 (支持 URL 优先 + 降级重试) ========
    const makeGeminiRequest = async (mode: 'url' | 'download') => {
      const safeRefsPart = await processReferenceImages(referenceImages, mode);
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
          responseModalities: ['TEXT', 'IMAGE'],
          // @ts-ignore
          imageConfig: {
            aspectRatio,
            imageSize: validImageSize,
          },
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
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
        signal: controller.signal,
      };

      // Proxy 配置
      if (process.env.HTTP_PROXY) {
        try {
          const proxyAgent = new ProxyAgent({ uri: process.env.HTTP_PROXY, connectTimeout: 60000 });
          fetchOptions.dispatcher = proxyAgent;
        } catch (e) { console.error('[Gemini Image] ProxyAgent failed:', e); }
      } else {
        try {
          const agent = new Agent({ connectTimeout: 60000, headersTimeout: 130000, bodyTimeout: 130000 });
          fetchOptions.dispatcher = agent;
        } catch (e) { console.error('[Gemini Image] Agent failed:', e); }
      }

      const startTime = Date.now();
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, fetchOptions);
      clearTimeout(timeout);

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

      if (!resp.ok) {
        const text = await resp.text();
        // 抛出带有原始错误信息的异常，供外层判断是否需要重试
        const err = new Error(text || resp.statusText);
        (err as any).status = resp.status;
        (err as any).body = text;
        throw err;
      }

      const data = await resp.json();
      const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!uri) throw new Error('no image returned');

      return { uri, elapsedTime };
    };

    const executeWithRetry = async (mode: 'url' | 'download') => {
      let lastError: any = null;
      for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt++) {
        try {
          return await makeGeminiRequest(mode);
        } catch (error: any) {
          lastError = error;
          const retryable = shouldRetryGeminiError(error);
          if (attempt < MAX_GEMINI_RETRIES && retryable) {
            const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
            console.warn(
              `[Gemini Image] attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1} failed (status=${error?.status || 'unknown'}), retry in ${delay}ms`
            );
            await sleep(delay);
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    };

    // ======== 执行请求 (URL 优先，失败则降级) ========
    let result: { uri: string; elapsedTime: string };
    try {
      // 首次尝试：使用快速的 URL 模式
      result = await executeWithRetry('url');
      console.log(`[Gemini Image] ✅ URL 模式成功 (${result.elapsedTime}s)`);
    } catch (urlError: any) {
      // 检查是否是 Gemini 无法抓取 URL 的错误
      const isCannotFetch = urlError.status === 400 && urlError.body?.includes('Cannot fetch');
      if (isCannotFetch && referenceImages.length > 0) {
        console.warn(`[Gemini Image] ⚠️ URL 模式失败 (Cannot fetch)，切换到下载模式重试...`);
        // 自动降级：使用下载模式重试
        result = await executeWithRetry('download');
        console.log(`[Gemini Image] ✅ 下载模式成功 (${result.elapsedTime}s)`);
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
    const status = Number(error?.status);
    const httpStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
    return NextResponse.json({ error: message, requestId }, { status: httpStatus });
  }
}
