'use client';

import { AspectRatio, ImageSize } from '@/types/project';

const parseTimeout = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// 默认 180s，可通过环境变量覆盖
const GEMINI_TIMEOUT_MS = parseTimeout(
  process.env.NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS || process.env.GEMINI_IMG_TIMEOUT_MS,
  180000
);

const postJson = async <T>(url: string, body: any, timeoutMs: number = GEMINI_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || resp.statusText);
    }
    return resp.json();
  } catch (error) {
    clearTimeout(id);
    if ((error as any)?.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs / 1000}秒）`);
    }
    throw error;
  }
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
  referenceImages: ReferenceImageData[] = []
): Promise<{ fullImage: string; slices: string[] }> => {
  // 过多参考图会拖慢生成或触发超时，这里做上限截断
  const MAX_REF_IMAGES = 8;
  const safeReferenceImages =
    referenceImages.length > MAX_REF_IMAGES
      ? referenceImages.slice(0, MAX_REF_IMAGES)
      : referenceImages;

  const totalViews = gridRows * gridCols;
  const gridType = `${gridRows}x${gridCols}`;

  // STRICT prompt engineering for storyboard grid generation
  const gridPrompt = `MANDATORY LAYOUT: Create a precise ${gridType} GRID containing exactly ${totalViews} distinct storyboard panels.
  - The output image MUST be a single image divided into a ${gridRows} (rows) by ${gridCols} (columns) matrix.
  - There must be EXACTLY ${gridRows} horizontal rows and ${gridCols} vertical columns.
  - Each panel must be completely separated by a thin, distinct, solid black line.
  - DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
  - The grid structure must be perfectly aligned for slicing.

  STORYBOARD CONTENT (Create ${totalViews} DIFFERENT shots based on these descriptions):

${prompt}

  CRITICAL INSTRUCTIONS:
  - Each numbered description corresponds to ONE specific panel in the grid (read left-to-right, top-to-bottom).
  - Each panel MUST match its corresponding shot description EXACTLY (shot size, camera angle, action, characters).
  - DO NOT show the same scene from different angles - each panel is a DIFFERENT shot/scene.
  - If reference images are provided, use them for character/scene consistency across different shots.
  - Maintain consistent art style and lighting mood across all panels while showing different shots.

  Technical Requirements:
  - Cinematic lighting, 4K resolution.
  - Professional color grading and composition.
  - No text, no captions, no UI elements.
  - No watermarks.
  - No broken grid lines.`;

  // 🔍 调试：输出最终的 Grid 提示词
  console.log('[geminiService Grid Debug] ========== START ==========');
  console.log('[geminiService Grid Debug] Input prompt:', prompt);
  console.log('[geminiService Grid Debug] referenceImages.length:', referenceImages.length);
  console.log('[geminiService Grid Debug] Final gridPrompt:', gridPrompt);
  console.log('[geminiService Grid Debug] ========== END ==========');

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

    // Slice the single high-res grid into separate base64 images
    const panels = await sliceImageGrid(fullImageBase64, gridRows, gridCols);
    return { fullImage: fullImageBase64, slices: panels };
  } catch (error: any) {
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
  const enhancedPrompt = `Create a single high-quality cinematic image based on the following description:

${prompt}

Technical Requirements:
- Cinematic lighting and composition
- High fidelity, 8K resolution
- Professional color grading
- Sharp focus and detail

Style Constraints:
- No text, captions, or UI elements
- No watermarks
- Single cohesive image (NOT a collage or grid)`;

  try {
    const data = await postJson<{ url: string }>('/api/gemini-image', {
      prompt: enhancedPrompt,
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-3-pro-preview',
      prompt: baseIdea.trim()
        ? `User Idea: "${baseIdea}"`
        : 'User Idea: Cinematic shot based on references.',
      systemInstruction,
      referenceImages,
      temperature: 0.7
    });
    return data.result || baseIdea;
  } catch (error: any) {
    console.error('Auto-Director error:', error);
    return baseIdea;
  }
};

/**
 * Convert File to base64 string (without data URL prefix)
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Convert image URL (data URL or HTTP URL) to ReferenceImageData
 */
export const urlToReferenceImageData = async (imageUrl: string): Promise<ReferenceImageData> => {
  // 如果是 data URL，直接提取
  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return {
        mimeType: matches[1],
        data: matches[2],
      };
    }
    throw new Error('无效的 data URL 格式');
  }

  // 如果是 HTTP(S) URL，需要下载并转换（先尝试前端，失败则走后端代理，避免 CORS）
  const fetchAndConvert = async (url: string): Promise<ReferenceImageData> => {
    const response = await fetch(url);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/png';

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve({ mimeType, data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  try {
    return await fetchAndConvert(imageUrl);
  } catch (error) {
    console.warn('Front-end fetch failed, fallback to proxy:', imageUrl, error);
    const proxyResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(imageUrl)}`);
    if (!proxyResp.ok) {
      const text = await proxyResp.text();
      throw new Error(text || `无法获取参考图: ${imageUrl}`);
    }
    const data = await proxyResp.json();
    return {
      mimeType: data.mimeType || 'image/png',
      data: data.data,
    };
  }
};

/**
 * Convert multiple image URLs to ReferenceImageData array
 */
export const urlsToReferenceImages = async (imageUrls: string[]): Promise<ReferenceImageData[]> => {
  const results = await Promise.all(
    imageUrls.map(url => urlToReferenceImageData(url).catch(err => {
      console.warn(`跳过无效参考图: ${url}`, err);
      return null;
    }))
  );
  return results.filter((r): r is ReferenceImageData => r !== null);
};
