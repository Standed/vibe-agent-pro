import { NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, referenceImages = [], aspectRatio = '1:1' } = body || {};
    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_GEMINI_API_KEY;
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
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
        // @ts-ignore
        imageConfig: {
          aspectRatio,
          imageSize: '2K',  // 单图生成使用 2K 分辨率
        },
      },
    };

    // Gemini image endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s safeguard

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    };

    // Proxy support (align with grid route)
    if (process.env.HTTP_PROXY) {
      try {
        const proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);
        fetchOptions.dispatcher = proxyAgent;
        console.log('[Gemini Image] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Image] ❌ Failed to create ProxyAgent:', e);
      }
    } else {
      console.warn('[Gemini Image] ⚠️ No HTTP_PROXY found, proceeding without proxy');
    }

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, fetchOptions);
    clearTimeout(timeout);

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
