'use client';

import { GoogleGenAI } from '@google/genai';
import { AspectRatio, ImageSize } from '@/types/project';

// Get Gemini API client
const getClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
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
  const ai = getClient();
  const model = 'gemini-3-pro-image-preview'; // directordeck 使用的模型

  const totalViews = gridRows * gridCols;
  const gridType = `${gridRows}x${gridCols}`;

  // STRICT prompt engineering for grid generation
  const gridPrompt = `MANDATORY LAYOUT: Create a precise ${gridType} GRID containing exactly ${totalViews} distinct panels.
  - The output image MUST be a single image divided into a ${gridRows} (rows) by ${gridCols} (columns) matrix.
  - There must be EXACTLY ${gridRows} horizontal rows and ${gridCols} vertical columns.
  - Each panel must be completely separated by a thin, distinct, solid black line.
  - DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
  - The grid structure must be perfectly aligned for slicing.

  Subject Content: "${prompt}"

  Styling Instructions:
  - Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).
  - Maintain perfect consistency of the character/object across all panels.
  - Cinematic lighting, high fidelity, 8k resolution.

  Negative Constraints:
  - No text, no captions, no UI elements.
  - No watermarks.
  - No broken grid lines.`;

  const parts: any[] = [];

  // Add all reference images
  for (const ref of referenceImages) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.data,
      },
    });
  }

  parts.push({ text: gridPrompt });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: parts,
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: '4K', // Force 4K
        },
      },
    });

    let fullImageBase64 = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        fullImageBase64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!fullImageBase64) throw new Error('未能生成 Grid 图片');

    // Slice the single high-res grid into separate base64 images
    const panels = await sliceImageGrid(fullImageBase64, gridRows, gridCols);
    return { fullImage: fullImageBase64, slices: panels };
  } catch (error) {
    console.error('Grid generation error:', error);
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
  const ai = getClient();
  const model = 'gemini-3-pro-preview';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64,
            },
          },
          { text: prompt },
        ],
      },
    });

    return response.text || '无法获取分析结果。';
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
};

/**
 * Enhance a raw prompt into a detailed cinematic description
 */
export const enhancePrompt = async (rawPrompt: string): Promise<string> => {
  const ai = getClient();
  const model = 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `You are a film director's assistant. Rewrite the following scene description into a detailed, cinematic image generation prompt. Focus on lighting, camera angle, texture, and mood. Keep it under 100 words. \n\nInput: "${rawPrompt}"`,
    });
    return response.text || rawPrompt;
  } catch (error) {
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
  const ai = getClient();
  const model = 'gemini-2.5-flash';

  const systemInstruction = `You are a professional Director of Photography assistant.
Your goal is to ENHANCE the user's existing idea with technical camera keywords, NOT to rewrite or replace their idea.

Analyze the provided images (if any) and the user's text.
Return a concise, comma-separated list of technical descriptors that can be appended to the prompt to make it look cinematic.
Include: Camera Angle, Shot Size, Lens Type, Lighting Style.

Format: [Original User Idea] + ", " + [Technical Keywords]

Example Input: "A cyber samurai"
Example Output: "A cyber samurai, low angle shot, anamorphic lens, neon rim lighting, volumetric fog, high contrast, 85mm"

Do NOT write full sentences. Do NOT describe the subject again if the user already did. Just add the technical sauce.`;

  const contents: any[] = [];

  if (baseIdea.trim()) {
    contents.push({ text: `User Idea: "${baseIdea}"` });
  } else {
    contents.push({ text: `User Idea: Cinematic shot based on references.` });
  }

  // Add references for context
  referenceImages.forEach((ref) => {
    contents.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.data,
      },
    });
  });

  try {
    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
      contents: { parts: contents },
    });
    return response.text || baseIdea;
  } catch (error) {
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
