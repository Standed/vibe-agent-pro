import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'missing url' }, { status: 400 });
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const contentType = resp.headers.get('content-type') || 'image/png';
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return NextResponse.json({ mimeType: contentType, data: base64 });
  } catch (error: any) {
    console.error('[fetch-image] error:', error);
    return NextResponse.json({ error: error?.message || 'fetch failed' }, { status: 500 });
  }
}
