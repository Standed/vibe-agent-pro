'use server';

import { NextResponse } from 'next/server';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

export async function POST(request: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { imageBase64, prompt, aspectRatio = '16:9' } = body || {};

    if (!imageBase64 || !prompt) {
      return NextResponse.json({ error: 'missing image or prompt' }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            { text: `基于这张图片，${prompt}` },
          ],
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

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!uri) {
      return NextResponse.json({ error: 'no image returned' }, { status: 500 });
    }

    return NextResponse.json({ url: `data:image/png;base64,${uri}` });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
