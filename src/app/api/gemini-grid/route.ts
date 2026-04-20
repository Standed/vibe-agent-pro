import { NextResponse, NextRequest } from 'next/server';
import { ProxyAgent, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist, checkRateLimit } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { isR2Configured, processAndUploadGrid, generatePresignedUrl } from '@/lib/r2-server-upload';
import { assetLogService } from '@/lib/assetLogService';

export const maxDuration = 120;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_GEMINI_RETRIES = Number(process.env.GEMINI_IMAGE_MAX_RETRIES || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.GEMINI_IMAGE_RETRY_DELAY_MS || 1200);

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_IMAGE_API_KEY ||
  process.env.NEXT_GEMINI_IMAGE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY;

const isValidGridSize = (n: any) => Number.isInteger(n) && (n === 2 || n === 3);
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
      const safeRefsPart = await processReferenceImages(referenceImages, mode);
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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
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
        } catch (e) { console.error('[Gemini Grid] ProxyAgent failed:', e); }
      } else {
        try {
          const agent = new Agent({ connectTimeout: 60000, headersTimeout: 130000, bodyTimeout: 130000 });
          fetchOptions.dispatcher = agent;
        } catch (e) { console.error('[Gemini Grid] Agent failed:', e); }
      }

      const startTime = Date.now();
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        fetchOptions
      );
      clearTimeout(timeout);

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

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
              `[Gemini Grid] attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1} failed (status=${error?.status || 'unknown'}), retry in ${delay}ms`
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
      console.log(`[Gemini Grid] ✅ URL 模式成功 (${result.elapsedTime}s)`);
    } catch (urlError: any) {
      // 检查是否是 Gemini 无法抓取 URL 的错误
      const isCannotFetch = urlError.status === 400 && urlError.body?.includes('Cannot fetch');
      if (isCannotFetch && referenceImages.length > 0) {
        console.warn(`[Gemini Grid] ⚠️ URL 模式失败 (Cannot fetch)，切换到下载模式重试...`);
        // 自动降级：使用下载模式重试
        result = await executeWithRetry('download');
        console.log(`[Gemini Grid] ✅ 下载模式成功 (${result.elapsedTime}s)`);
      } else {
        // 其他错误直接抛出
        throw urlError;
      }
    }

    const uri = result.uri;
    const elapsedTime = result.elapsedTime;
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
    let logId: string | null = null;
    logId = await assetLogService.logStart({
      userId: user.id,
      operationType: 'gemini',
      status: 'PENDING',
      metadata: {
        prompt,
        aspectRatio,
        gridRows,
        gridCols,
        requestId,
        uploadContext: uploadContext || null
      }
    });

    if (isR2Configured()) {
      const uploadResult = await processAndUploadGrid(uri, user.id, gridRows, gridCols, uploadContext);

      if (uploadResult.success && uploadResult.fullImageUrl) {
        if (logId) {
          await assetLogService.logUpdate(logId, { r2Url: uploadResult.fullImageUrl, status: 'SUCCESS' });
        }
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
        if (logId) {
          await assetLogService.logUpdate(logId, { r2Url: uploadResult.fullImageUrl, status: 'SUCCESS' });
        }
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
    if (logId) {
      await assetLogService.logUpdate(logId, { status: 'FAILED', error: 'R2 upload failed' });
    }
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
    const status = Number(error?.status);
    const httpStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
    return NextResponse.json({ error: message, requestId }, { status: httpStatus });
  }
}
