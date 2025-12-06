'use server';

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, referenceImages = [], aspectRatio = '1:1' } = body || {};
    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-1.5-pro-latest';
    if (!apiKey) {
      return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
    }

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...referenceImages.map((img: any) => ({
              inlineData: {
                data: img.data,
                mimeType: img.mimeType || 'image/png',
              },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    };

    // Gemini image endpoint
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const uri = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!uri) {
      return NextResponse.json({ error: 'no image returned' }, { status: 500 });
    }

    // Return data URL
    return NextResponse.json({ url: `data:image/png;base64,${uri}` });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
