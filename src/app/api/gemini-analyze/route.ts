
import { NextResponse } from 'next/server';

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_GEMINI_API_KEY;

export async function POST(request: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { fileBase64, mimeType, prompt } = body || {};

    if (!fileBase64 || !mimeType || !prompt) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return NextResponse.json({ result: text });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
