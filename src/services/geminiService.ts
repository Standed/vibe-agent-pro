'use client';

import { AspectRatio, ImageSize } from '@/types/project';
import { authenticatedFetch } from '@/lib/api-client';

const parseTimeout = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// 默认 240s（通过代理时数据传输较慢），可通过环境变量覆盖
const GEMINI_TIMEOUT_MS = parseTimeout(
  process.env.GEMINI_IMG_TIMEOUT_MS || process.env.NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS,
  240000
);

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2秒

/**
 * 带重试机制的 POST 请求
 */
const postJson = async <T>(
  url: string,
  body: any,
  timeoutMs: number = GEMINI_TIMEOUT_MS,
  retries: number = MAX_RETRIES
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[postJson] 重试 ${attempt}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }

      console.log('[postJson] 开始发送请求到:', url, `(尝试 ${attempt + 1}/${retries + 1})`);
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      try {
        console.log('[postJson] 准备调用 authenticatedFetch...');

        // 检查载荷大小，Vercel 限制为 4.5MB，我们预留空间，限制在 4MB 以内
        const bodyStr = JSON.stringify(body);
        if (bodyStr.length > 4 * 1024 * 1024) {
          throw new Error(`请求载荷过大 (${(bodyStr.length / 1024 / 1024).toFixed(2)}MB)，请减少参考图数量或缩短提示词。`);
        }

        const resp = await authenticatedFetch(url, {
          method: 'POST',
          body: bodyStr,
          signal: controller.signal
        });
        console.log('[postJson] authenticatedFetch 返回，状态码:', resp.status);
        clearTimeout(id);

        if (!resp.ok) {
          const text = await resp.text();

          // 友好的错误提示
          if (resp.status === 401) {
            throw new Error('请先登录后再使用 AI 生成功能');
          }
          if (resp.status === 403) {
            try {
              const errorData = JSON.parse(text);
              if (errorData.error?.includes('积分')) {
                throw new Error(errorData.error);
              }
            } catch (e) {
              // JSON 解析失败，使用默认错误
            }
          }

          // 对于 5xx 错误，可以重试；4xx 错误不重试
          if (resp.status >= 500 && attempt < retries) {
            lastError = new Error(`服务器错误 (${resp.status}): ${text}`);
            continue;
          }

          throw new Error(text || resp.statusText);
        }

        return resp.json();
      } catch (error) {
        clearTimeout(id);

        // 特殊处理未登录错误 - 不重试
        if ((error as any)?.message?.includes('未登录')) {
          throw new Error('请先登录后再使用 AI 生成功能');
        }

        // 积分不足错误 - 不重试
        if ((error as any)?.message?.includes('积分')) {
          throw error;
        }

        // 超时错误 - 可以重试
        if ((error as any)?.name === 'AbortError') {
          if (attempt < retries) {
            lastError = new Error(`请求超时（${timeoutMs / 1000}秒）`);
            continue;
          }
          throw new Error(`请求超时（${timeoutMs / 1000}秒）`);
        }

        // 网络错误 - 可以重试
        if ((error as any)?.message?.includes('fetch failed') || (error as any)?.message?.includes('network')) {
          if (attempt < retries) {
            lastError = error as Error;
            continue;
          }
        }

        throw error;
      }
    } catch (error) {
      // 对于不应该重试的错误，直接抛出
      if ((error as any)?.message?.includes('未登录') || (error as any)?.message?.includes('积分')) {
        throw error;
      }

      // 最后一次重试仍然失败
      if (attempt === retries) {
        throw error;
      }

      lastError = error as Error;
    }
  }

  throw lastError || new Error('请求失败');
};

// Helper to slice a grid image into individual images
const sliceImageGrid = (
  base64Data: string,
  rows: number,
  cols: number
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const pieceWidth = Math.floor(w / cols);
      const pieceHeight = Math.floor(h / rows);

      const pieces: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('无法获取画布上下文'));
        return;
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Calculate actual slice dimensions (last row/col includes remaining pixels)
          const isLastCol = c === cols - 1;
          const isLastRow = r === rows - 1;
          const sliceW = isLastCol ? w - c * pieceWidth : pieceWidth;
          const sliceH = isLastRow ? h - r * pieceHeight : pieceHeight;

          // Resize canvas for each slice to handle edge cases
          canvas.width = sliceW;
          canvas.height = sliceH;

          // Source x, y, w, h -> Dest x, y, w, h
          ctx.drawImage(
            img,
            c * pieceWidth,
            r * pieceHeight,
            sliceW,
            sliceH,
            0,
            0,
            sliceW,
            sliceH
          );
          pieces.push(canvas.toDataURL('image/png'));
        }
      }
      resolve(pieces);
    };
    img.onerror = () => reject(new Error('无法加载图片进行切片'));
    img.src = base64Data;
  });
};

export interface ReferenceImageData {
  mimeType: string;
  data: string;
}

/**
 * Generate a multi-view grid using Gemini
 * Returns both the full grid image and individual sliced panels
 */
export const generateMultiViewGrid = async (
  prompt: string,
  gridRows: number, // 2 or 3
  gridCols: number, // 2 or 3
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImageData[] = [],
  referenceImageCaptions: string[] = []
): Promise<{ fullImage: string; slices: string[] }> => {
  // 过多参考图会触发 FUNCTION_PAYLOAD_TOO_LARGE 错误，限制数量；压缩处理在 optimizeDataUrl
  const MAX_REF_IMAGES = 10;

  // 去重：根据 data 内容去重，避免上传重复图片
  const uniqueReferenceImages = Array.from(
    new Map(referenceImages.map(img => [img.data, img])).values()
  );

  // 限制数量
  const safeReferenceImages =
    uniqueReferenceImages.length > MAX_REF_IMAGES
      ? uniqueReferenceImages.slice(0, MAX_REF_IMAGES)
      : uniqueReferenceImages;

  const totalViews = gridRows * gridCols;
  const gridType = `${gridRows}x${gridCols}`;

  // Determine panel orientation based on aspect ratio
  const isPortrait = aspectRatio === AspectRatio.MOBILE || aspectRatio === AspectRatio.PORTRAIT;
  const isLandscape = aspectRatio === AspectRatio.WIDE || aspectRatio === AspectRatio.STANDARD || aspectRatio === AspectRatio.CINEMA;
  const orientationInstruction = isPortrait
    ? 'Each panel MUST be in PORTRAIT orientation (vertical/竖屏), taller than it is wide.'
    : isLandscape
      ? 'Each panel MUST be in LANDSCAPE orientation (horizontal/横屏), wider than it is tall.'
      : 'Each panel should maintain a square or near-square aspect ratio.';

  // Build reference image instructions
  let referenceInstructions = '';
  if (referenceImageCaptions.length > 0) {
    referenceInstructions = '\n  REFERENCE IMAGE MAPPING (CRITICAL):\n' +
      referenceImageCaptions.map((caption, idx) => `  - Reference Image ${idx + 1}: ${caption}`).join('\n');
  }

  // STRICT prompt engineering for storyboard grid generation
  const gridPrompt = `MANDATORY LAYOUT: Create a precise ${gridType} GRID containing exactly ${totalViews} distinct storyboard panels.
  - The output image MUST be a single image divided into a ${gridRows} (rows) by ${gridCols} (columns) matrix.
  - There must be EXACTLY ${gridRows} horizontal rows and ${gridCols} vertical columns.
  - Each panel must be completely separated by a thin, distinct, solid black line.
  - DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
  - The grid structure must be perfectly aligned for slicing.

  PANEL ASPECT RATIO REQUIREMENT (CRITICAL):
  - ${orientationInstruction}
  - The aspect ratio for EACH individual panel should be ${aspectRatio}.
  - This means the OVERALL grid image will be ${aspectRatio === '9:16' ? 'portrait/vertical' : aspectRatio === '16:9' ? 'landscape/horizontal' : aspectRatio}.
  - Ensure each panel maintains the ${aspectRatio} aspect ratio when the grid is sliced.

  STORYBOARD CONTENT (Create ${totalViews} DIFFERENT shots based on these descriptions):

${prompt}

  CRITICAL INSTRUCTIONS:
  - Each numbered description corresponds to ONE specific panel in the grid (read left-to-right, top-to-bottom).
  - Each panel MUST match its corresponding shot description EXACTLY (shot size, camera angle, action, characters).
  - DO NOT show the same scene from different angles - each panel is a DIFFERENT shot/scene.
  - If reference images are provided, use them for character/scene consistency across different shots.
  - Maintain consistent art style and lighting mood across all panels while showing different shots.${referenceInstructions}

  Technical Requirements:
  - Cinematic lighting, 4K resolution.
  - Professional color grading and composition.
  - No text, no captions, no UI elements.
  - No watermarks.
  - No broken grid lines.
  - REMEMBER: Each panel is ${aspectRatio} ${isPortrait ? '(portrait/竖屏)' : isLandscape ? '(landscape/横屏)' : ''}.`;

  // 🔍 调试：输出最终的 Grid 提示词
  // console.log('[geminiService Grid Debug] ========== START ==========');
  // console.log('[geminiService Grid Debug] Input prompt:', prompt);
  // console.log('[geminiService Grid Debug] Original referenceImages.length:', referenceImages.length);
  // console.log('[geminiService Grid Debug] After deduplication:', uniqueReferenceImages.length);
  // console.log('[geminiService Grid Debug] Final safeReferenceImages.length:', safeReferenceImages.length);
  // console.log('[geminiService Grid Debug] Final gridPrompt:', gridPrompt);
  // console.log('[geminiService Grid Debug] ========== END ==========');
  // console.log('[geminiService Grid Debug] 🚀 准备发送 Gemini API 请求...');

  try {
    // console.log('[geminiService Grid Debug] 📡 调用 postJson...');
    const data = await postJson<{ fullImage: string }>('/api/gemini-grid', {
      prompt: gridPrompt,
      gridRows,
      gridCols,
      aspectRatio,
      referenceImages: safeReferenceImages
    });
    // console.log('[geminiService Grid Debug] ✅ API 请求成功');
    // console.log('[geminiService Grid Debug] fullImage 长度:', data.fullImage?.length || 0);

    const fullImageBase64 = data.fullImage;
    if (!fullImageBase64) throw new Error('未能生成 Grid 图片');

    // Slice the single high-res grid into separate base64 images
    // console.log('[geminiService Grid Debug] 🔪 开始切片 Grid 图片...');
    // console.log('[geminiService Grid Debug] Grid 尺寸:', gridRows, 'x', gridCols);
    const panels = await sliceImageGrid(fullImageBase64, gridRows, gridCols);
    // console.log('[geminiService Grid Debug] ✅ 切片完成，共', panels.length, '个面板');

    const returnValue = { fullImage: fullImageBase64, slices: panels };
    // console.log('[geminiService Grid Debug] 🎉 准备返回结果...');
    // console.log('[geminiService Grid Debug] returnValue.fullImage 长度:', returnValue.fullImage.length);
    // console.log('[geminiService Grid Debug] returnValue.slices 数量:', returnValue.slices.length);
    return returnValue;
  } catch (error: any) {
    console.error('[geminiService Grid Debug] ❌ 错误:', error);
    console.error('Grid generation error:', error);
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED') || error.message?.includes('leaked') || error.message?.includes('API key not valid') || error.message?.includes('blocked') || error.status === 400 || error.status === 403) {
      throw new Error('Gemini API Key 无效、已失效或服务被封禁 (400/403)。请检查 .env.local 文件中的配置。');
    }
    if (error.status === 503 || error.message?.includes('overloaded') || error.message?.includes('UNAVAILABLE')) {
      throw new Error('Gemini 服务当前过载 (503)。请稍后重试。');
    }
    throw error;
  }
};

/**
 * Pro 模式简化版 Grid 生成
 * 与 Gemini 直出逻辑类似，只添加简单的 Grid 布局提示词
 * 不包含复杂的分镜描述要求，适合用户自由创作
 */
export const generateSimpleGrid = async (
  prompt: string,
  gridRows: number,
  gridCols: number,
  aspectRatio: AspectRatio,
  referenceImages: ReferenceImageData[] = []
): Promise<{ fullImage: string; slices: string[] }> => {
  // 限制参考图数量
  const MAX_REF_IMAGES = 10;
  const uniqueReferenceImages = Array.from(
    new Map(referenceImages.map(img => [img.data, img])).values()
  );
  const safeReferenceImages = uniqueReferenceImages.slice(0, MAX_REF_IMAGES);

  const totalViews = gridRows * gridCols;
  const gridType = `${gridRows}x${gridCols}`;

  // 确定每个面板的方向
  const isPortrait = aspectRatio === AspectRatio.MOBILE || aspectRatio === AspectRatio.PORTRAIT;
  const isLandscape = aspectRatio === AspectRatio.WIDE || aspectRatio === AspectRatio.STANDARD || aspectRatio === AspectRatio.CINEMA;
  const orientationHint = isPortrait ? '竖屏/portrait' : isLandscape ? '横屏/landscape' : '';

  // Pro 模式简化版提示词 - 只强调布局和比例
  const gridPrompt = `Create a ${gridType} grid image with ${totalViews} panels.

LAYOUT:
- Divide the image into ${gridRows} rows × ${gridCols} columns
- Each panel separated by thin black lines
- Each panel aspect ratio: ${aspectRatio} (${orientationHint})

CONTENT:
${prompt}

STYLE:
- Consistent art style across all panels
- Cinematic lighting, high quality
- Use reference images for character/scene consistency
- No text, watermarks, or UI elements`;

  try {
    const data = await postJson<{ fullImage: string }>('/api/gemini-grid', {
      prompt: gridPrompt,
      gridRows,
      gridCols,
      aspectRatio,
      referenceImages: safeReferenceImages
    });

    const fullImageBase64 = data.fullImage;
    if (!fullImageBase64) throw new Error('未能生成 Grid 图片');

    const panels = await sliceImageGrid(fullImageBase64, gridRows, gridCols);
    return { fullImage: fullImageBase64, slices: panels };
  } catch (error: any) {
    console.error('Simple Grid generation error:', error);
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED')) {
      throw new Error('Gemini API Key 无效或服务被封禁 (400/403)。');
    }
    if (error.status === 503 || error.message?.includes('overloaded')) {
      throw new Error('Gemini 服务当前过载 (503)。请稍后重试。');
    }
    throw error;
  }
};

/**
 * 图片编辑 (Image-to-Image with Gemini)
 * 根据原图和新提示词生成编辑后的图片
 */
export const editImageWithGemini = async (
  imageBase64: string, // 原图的 base64 数据（包含 data:image/png;base64, 前缀）
  prompt: string,
  aspectRatio: AspectRatio
): Promise<string> => {
  try {
    const data = await postJson<{ url: string }>('/api/gemini-edit', {
      imageBase64,
      prompt,
      aspectRatio
    });
    if (!data.url) {
      throw new Error('未能生成编辑后的图片');
    }
    return data.url;
  } catch (error: any) {
    console.error('Gemini 图片编辑错误:', error);
    throw error;
  }
};

/**
 * Generate a single image using Gemini (Direct output, no grid)
 * 使用 Gemini 直接生成单张图片,不使用 Grid 模式
 */
export const generateSingleImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  referenceImages: ReferenceImageData[] = []
): Promise<string> => {
  // 直接使用传入的 prompt，避免系统预设的模板干扰用户的编辑意图
  try {
    const data = await postJson<{ url: string }>('/api/gemini-image', {
      prompt,
      referenceImages,
      aspectRatio
    });
    if (!data.url) {
      throw new Error('未能生成图片');
    }
    return data.url;
  } catch (error: any) {
    console.error('Gemini single image generation error:', error);
    throw error;
  }
};

/**
 * Generate a character three-view (front, side, back) using Gemini Direct
 */
export const generateCharacterThreeView = async (
  prompt: string,
  artStyle: string = 'Cinematic',
  referenceImages: ReferenceImageData[] = [],
  aspectRatio: string = '21:9'
): Promise<string> => {
  // 逻辑调整：不再对 prompt 进行复杂的二次包装，直接使用用户在 UI 界面微调后的提示词，保持与 SeeDream 一致
  try {
    const data = await postJson<{ url: string }>('/api/gemini-image', {
      prompt: `${prompt}, no text, no labels`,
      referenceImages,
      aspectRatio,
    });
    if (!data.url) {
      throw new Error('未能生成角色三视图');
    }
    return data.url;
  } catch (error: any) {
    console.error('Gemini character three-view generation error:', error);
    throw error;
  }
};

/**
 * Analyze an image or video asset using Gemini
 */
export const analyzeAsset = async (
  fileBase64: string,
  mimeType: string,
  prompt: string
): Promise<string> => {
  try {
    const data = await postJson<{ result: string }>('/api/gemini-analyze', {
      fileBase64,
      mimeType,
      prompt
    });
    return data.result || '无法获取分析结果。';
  } catch (error: any) {
    console.error('Analysis error:', error);
    throw error;
  }
};

/**
 * Enhance a raw prompt into a detailed cinematic description
 */
export const enhancePrompt = async (rawPrompt: string): Promise<string> => {
  try {
    const data = await postJson<{ result: string }>('/api/gemini-text', {
      model: 'gemini-3-flash-preview',
      prompt: `You are a film director's assistant. Rewrite the following scene description into a detailed, cinematic image generation prompt. Focus on lighting, camera angle, texture, and mood. Keep it under 100 words. \n\nInput: "${rawPrompt}"`
    });
    return data.result || rawPrompt;
  } catch (error: any) {
    console.error('Prompt enhancement error:', error);
    return rawPrompt;
  }
};

/**
 * Generate cinematic prompt with technical keywords
 */
export const generateCinematicPrompt = async (
  baseIdea: string,
  referenceImages: ReferenceImageData[] = []
): Promise<string> => {
  const systemInstruction = `You are a professional Director of Photography assistant.
Your goal is to ENHANCE the user's existing idea with technical camera keywords, NOT to rewrite or replace their idea.

Analyze the provided images (if any) and the user's text.
Return a concise, comma-separated list of technical descriptors that can be appended to the prompt to make it look cinematic.
Include: Camera Angle, Shot Size, Lens Type, Lighting Style.

Format: [Original User Idea] + ", " + [Technical Keywords]

Example Input: "A cyber samurai"
Example Output: "A cyber samurai, low angle shot, anamorphic lens, neon rim lighting, volumetric fog, high contrast, 85mm"

Do NOT write full sentences. Do NOT describe the subject again if the user already did. Just add the technical sauce.`;

  try {
    const data = await postJson<{ result: string }>('/api/gemini-text', {
      model: 'gemini-3-pro-preview', // 使用 Pro 模型
      prompt: baseIdea.trim()
        ? `User Idea: "${baseIdea}"`
        : 'User Idea: Cinematic shot based on references.',
      systemInstruction,
      referenceImages,
      temperature: 1.0 // 统一使用 temperature=1.0
    });
    return data.result || baseIdea;
  } catch (error: any) {
    console.error('Auto-Director error:', error);
    return baseIdea;
  }
};

const MAX_REF_IMAGE_DIMENSION = 2560; // 恢复为 2.5K 分辨率以支持高质量编辑
const OPTIMIZED_JPEG_QUALITY = 0.9;  // 恢复较高质量

/**
 * Downscale and compress a data URL to reduce payload size
 * 动态压缩以适应目标大小
 */
const optimizeDataUrl = (
  dataUrl: string,
  mimeHint?: string,
  maxSizeBytes: number = 3.5 * 1024 * 1024 // 默认限制 3.5MB
): Promise<ReferenceImageData> => {
  return new Promise((resolve, reject) => {
    // 如果原始数据已经小于限制，直接返回
    if (dataUrl.length <= maxSizeBytes) {
      const [, data] = dataUrl.split(',');
      resolve({
        mimeType: mimeHint && mimeHint.startsWith('image/') ? mimeHint : 'image/jpeg',
        data: data || '',
      });
      return;
    }

    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      let quality = OPTIMIZED_JPEG_QUALITY;

      // 初始缩放：如果超过最大尺寸，先缩放到最大尺寸
      const maxDim = Math.max(width, height);
      if (maxDim > MAX_REF_IMAGE_DIMENSION) {
        const scale = MAX_REF_IMAGE_DIMENSION / maxDim;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const compress = (w: number, h: number, q: number): void => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法获取画布上下文'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const optimized = canvas.toDataURL('image/jpeg', q);

        // 如果压缩后仍然超过限制，继续递归压缩
        if (optimized.length > maxSizeBytes) {
          // 策略：优先降低质量，如果质量已经很低(0.5)，则降低尺寸
          if (q > 0.5) {
            compress(w, h, q - 0.1);
          } else {
            // 每次尺寸缩小 20%
            compress(Math.round(w * 0.8), Math.round(h * 0.8), q);
          }
        } else {
          const [, data] = optimized.split(',');
          resolve({
            mimeType: 'image/jpeg',
            data: data || '',
          });
        }
      };

      compress(width, height, quality);
    };
    img.onerror = () => reject(new Error('参考图加载失败'));
    img.src = dataUrl;
  });
};

/**
 * Convert File to base64 string (without data URL prefix), with compression
 */
export const fileToBase64 = async (file: File): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

  // 单文件上传通常用于编辑，给予较大预算 (3.5MB)
  const optimized = await optimizeDataUrl(dataUrl, file.type, 3.5 * 1024 * 1024);
  return optimized.data;
};

/**
 * Convert image URL (data URL or HTTP URL) to ReferenceImageData
 */
export const urlToReferenceImageData = async (imageUrl: string, maxSizeBytes?: number): Promise<ReferenceImageData> => {
  // 如果是 data URL，直接提取
  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const optimized = await optimizeDataUrl(imageUrl, matches[1], maxSizeBytes);
      return optimized;
    }
    throw new Error('无效的 data URL 格式');
  }

  // 如果是 HTTP(S) URL，需要下载并转换
  const fetchAndConvert = async (url: string): Promise<ReferenceImageData> => {
    const response = await fetch(url);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/png';

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return await optimizeDataUrl(dataUrl, mimeType, maxSizeBytes);
  };

  try {
    return await fetchAndConvert(imageUrl);
  } catch (error) {
    console.warn('Front-end fetch failed, fallback to proxy:', imageUrl, error);
    const proxyUrl = `/api/fetch-image?url=${encodeURIComponent(imageUrl)}`;
    try {
      const proxyResp = await fetch(proxyUrl);
      if (!proxyResp.ok) {
        const text = await proxyResp.text();
        throw new Error(text || `无法获取参考图: ${imageUrl}`);
      }
      const blob = await proxyResp.blob();
      const mimeType = blob.type || 'image/png';

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      return await optimizeDataUrl(dataUrl, mimeType, maxSizeBytes);
    } catch (proxyError) {
      console.error('Proxy fetch also failed:', proxyError);
      throw proxyError;
    }
  }
};

/**
 * Convert multiple image URLs to ReferenceImageData array
 * 每张图独立 4MB 预算，不再共享总预算，提高单图质量
 */
export const urlsToReferenceImages = async (imageUrls: string[]): Promise<ReferenceImageData[]> => {
  if (imageUrls.length === 0) return [];

  // 限制参考图数量，确保每张图有足够质量
  const MAX_IMAGES = 10;
  const limitedUrls = imageUrls.slice(0, MAX_IMAGES);

  // 每张图独立 4MB 预算（压缩后），不再按总量分配
  const PER_IMAGE_BUDGET = 4 * 1024 * 1024;

  // console.log(`[geminiService] 处理 ${limitedUrls.length} 张图片，每张预算: 4MB`);

  const results = await Promise.all(
    limitedUrls.map(url => urlToReferenceImageData(url, PER_IMAGE_BUDGET).catch(err => {
      console.warn(`跳过无效参考图: ${url}`, err);
      return null;
    }))
  );
  return results.filter((r): r is ReferenceImageData => r !== null);
};
