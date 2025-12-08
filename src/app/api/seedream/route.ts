
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, imageUrls = [], size = '2560x1440', model } = body || {};

    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
    }

    const apiKey =
      process.env.NEXT_VOLCANO_API_KEY ||
      process.env.VOLCANO_API_KEY ||
      process.env.NEXT_PUBLIC_VOLCANO_API_KEY;
    const baseUrl = process.env.NEXT_VOLCANO_BASE_URL || process.env.VOLCANO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const seedreamModelId =
      model ||
      process.env.NEXT_SEEDREAM_MODEL_ID ||
      process.env.SEEDREAM_MODEL_ID ||
      process.env.NEXT_PUBLIC_SEEDREAM_MODEL_ID ||
      'doubao-seedream-4-5-251128';

    if (!apiKey || !seedreamModelId) {
      return NextResponse.json({ error: 'seedream api not configured' }, { status: 500 });
    }

    const resp = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: seedreamModelId,
        prompt,
        image: imageUrls,
        sequential_image_generation: 'disabled',
        size,
        watermark: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const url = data?.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'missing image url' }, { status: 500 });
    }

    // 🔥 下载图片并转换为 base64 data URL，避免客户端 CORS 和 URL 过期问题
    try {
      const imageResp = await fetch(url);
      if (!imageResp.ok) {
        console.warn('Failed to download image, returning original URL:', imageResp.statusText);
        return NextResponse.json({ url });
      }

      const blob = await imageResp.blob();
      const mimeType = blob.type || 'image/png';
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      console.log('✅ SeeDream 图片已转换为 base64 data URL');
      return NextResponse.json({ url: dataUrl });
    } catch (downloadError: any) {
      console.warn('Failed to convert image to base64, returning original URL:', downloadError);
      return NextResponse.json({ url });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
