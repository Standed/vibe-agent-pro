import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';

export const maxDuration = 60;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. 验证用户身份 (图片获取不消耗积分,仅验证身份)
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const requestId = `fetch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.log(`[${requestId}] 🔐 Fetch image request from ${user.role} user: ${user.email}`);

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
    // 直接返回流，而不是 buffer/base64
    // 注意：NextResponse 构造函数接受 BodyInit，包括 ReadableStream
    return new NextResponse(resp.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error: any) {
    console.error(`[${requestId}] ❌ Fetch image failed:`, error);
    return NextResponse.json({ error: error?.message || 'fetch failed' }, { status: 500 });
  }
}
