import { NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY ||
  process.env.NEXT_PUBLIC_GEMINI_API_KEY;

const isValidGridSize = (n: any) => Number.isInteger(n) && (n === 2 || n === 3);
const toSafeImages = (refs: any) =>
  Array.isArray(refs)
    ? refs
      .filter((img) => img && typeof img.data === 'string')
      .map((img) => ({
        data: img.data,
        mimeType: img.mimeType || 'image/png',
      }))
    : [];

export async function POST(request: Request) {
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

    const safeRefs = toSafeImages(referenceImages);

    const parts = [
      ...safeRefs.map((img) => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      })),
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
        temperature: 0.3,
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: '4K',
        },
      },
    };

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    };

    // 🔍 调试：检查代理配置
    console.log('[Gemini Grid] HTTP_PROXY:', process.env.HTTP_PROXY);
    console.log('[Gemini Grid] HTTPS_PROXY:', process.env.HTTPS_PROXY);

    if (process.env.HTTP_PROXY) {
      try {
        const proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);
        fetchOptions.dispatcher = proxyAgent;
        console.log('[Gemini Grid] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Grid] ❌ Failed to create ProxyAgent:', e);
      }
    } else {
      console.warn('[Gemini Grid] ⚠️ No HTTP_PROXY found, proceeding without proxy');
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      fetchOptions
    );
    clearTimeout(timeout);

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

    return NextResponse.json({ fullImage: `data:image/png;base64,${uri}`, requestId });
  } catch (error: any) {
    console.error('[Gemini Grid fetch failed]', requestId, error);
    const message =
      error?.name === 'AbortError' ? 'Gemini grid request timeout' : error?.message || 'unknown error';
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
