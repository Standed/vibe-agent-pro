
import { NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY;

export async function POST(request: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { model = DEFAULT_MODEL, payload } = body || {};

    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400 });
    }

    // Log the request details for debugging
    console.log('[Gemini Generate] Model:', model);
    console.log('[Gemini Generate] Tools count:', payload.tools?.[0]?.function_declarations?.length || 0);
    console.log('[Gemini Generate] Request payload:', JSON.stringify(payload, null, 2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s safeguard

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };

    // Proxy support (align with other Gemini routes)
    console.log('[Gemini Generate] HTTP_PROXY:', process.env.HTTP_PROXY);
    console.log('[Gemini Generate] HTTPS_PROXY:', process.env.HTTPS_PROXY);

    if (process.env.HTTP_PROXY) {
      try {
        const proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);
        fetchOptions.dispatcher = proxyAgent;
        console.log('[Gemini Generate] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Generate] ❌ Failed to create ProxyAgent:', e);
      }
    } else {
      console.warn('[Gemini Generate] ⚠️ No HTTP_PROXY found, proceeding without proxy');
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      fetchOptions
    );
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Gemini Generate] ❌ API error:', resp.status, text);
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    console.log('[Gemini Generate] ✅ Success');
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('[Gemini Generate] ❌ Fetch failed:', error);
    console.error('[Gemini Generate] Error name:', error?.name);
    console.error('[Gemini Generate] Error message:', error?.message);
    console.error('[Gemini Generate] Error stack:', error?.stack);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
