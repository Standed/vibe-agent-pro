import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  // 2. 计算所需积分 (通用生成使用TEXT类型积分)
  const requiredCredits = calculateCredits('GEMINI_TEXT', user.role);
  const operationDesc = getOperationDescription('GEMINI_TEXT');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  const requestId = `generate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const { model = DEFAULT_MODEL, payload } = body || {};

    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400 });
    }

    // Log the request details for debugging
    // console.log('[Gemini Generate] Model:', model);
    // console.log('[Gemini Generate] Tools count:', payload.tools?.[0]?.function_declarations?.length || 0);
    // console.log('[Gemini Generate] Request payload:', JSON.stringify(payload, null, 2));

    const requestBody = JSON.stringify(payload);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Build proxy agent (if configured) and fall back when unavailable
    // console.log('[Gemini Generate] HTTP_PROXY:', process.env.HTTP_PROXY);
    // console.log('[Gemini Generate] HTTPS_PROXY:', process.env.HTTPS_PROXY);

    let proxyAgent: ProxyAgent | undefined;
    if (process.env.HTTP_PROXY) {
      try {
        proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);
        // console.log('[Gemini Generate] ✅ ProxyAgent created successfully');
      } catch (e) {
        console.error('[Gemini Generate] ❌ Failed to create ProxyAgent:', e);
      }
    } else {
      console.warn('[Gemini Generate] ⚠️ No HTTP_PROXY found, proceeding without proxy');
    }

    const buildOptions = (useProxy: boolean) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s safeguard
      const options: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      };
      if (useProxy && proxyAgent) {
        options.dispatcher = proxyAgent;
      }
      return { options, timeoutId };
    };

    const sendRequest = async (useProxy: boolean) => {
      const { options, timeoutId } = buildOptions(useProxy);
      try {
        return await fetch(url, options);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const strategies: { useProxy: boolean; label: string }[] = proxyAgent
      ? [
        { useProxy: true, label: 'proxy' },
        { useProxy: false, label: 'direct' },
      ]
      : [{ useProxy: false, label: 'direct' }];

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let resp: Response | null = null;
    let lastError: any = null;

    for (const { useProxy, label } of strategies) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // console.log(`[Gemini Generate] Attempt ${attempt} via ${label}...`);
          resp = await sendRequest(useProxy);
          if (resp.ok) break;
          // For 5xx / 429, retry once with small backoff
          if (attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
            console.warn(`[Gemini Generate] ${label} received ${resp.status}, retrying...`);
            await delay(800);
            continue;
          }
          break;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Gemini Generate] ⚠️ ${label} attempt ${attempt} failed:`, err?.message || err);
          if (attempt === 1) {
            await delay(500);
            continue;
          }
        }
      }
      if (resp) break;
    }

    if (!resp) {
      console.error('[Gemini Generate] ❌ Network request failed after retries:', lastError);
      const message =
        lastError?.message ||
        'failed to reach Gemini API. Please verify network/proxy configuration.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Gemini Generate] ❌ API error:', resp.status, text);
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    // console.log('[Gemini Generate] ✅ Success');

    // 4. 消耗积分
    const consumeResult = await consumeCredits(
      user.id,
      requiredCredits,
      'generate-content',
      `${operationDesc}`
    );

    if (!consumeResult.success) {
      console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
      import { NextRequest, NextResponse } from 'next/server';
      import { ProxyAgent } from 'undici';
      import { authenticateRequest, checkCredits, consumeCredits } from '@/lib/auth-middleware';
      import { calculateCredits, getOperationDescription } from '@/config/credits';

      export const runtime = 'nodejs';
      export const dynamic = 'force-dynamic';

      const DEFAULT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
      const GEMINI_API_KEY =
        process.env.GEMINI_API_KEY ||
        process.env.NEXT_GEMINI_API_KEY;

      export async function POST(request: NextRequest) {
        // 1. 验证用户身份
        const authResult = await authenticateRequest(request);
        if ('error' in authResult) {
          return authResult.error;
        }
        const { user } = authResult;

        // 2. 计算所需积分 (通用生成使用TEXT类型积分)
        const requiredCredits = calculateCredits('GEMINI_TEXT', user.role);
        const operationDesc = getOperationDescription('GEMINI_TEXT');

        // 3. 检查积分
        const creditsCheck = checkCredits(user, requiredCredits);
        if ('error' in creditsCheck) {
          return creditsCheck.error;
        }

        if (!GEMINI_API_KEY) {
          return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
        }

        const requestId = `generate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        // console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

        try {
          const body = await request.json();
          const { model = DEFAULT_MODEL, payload } = body || {};

          if (!payload) {
            return NextResponse.json({ error: 'missing payload' }, { status: 400 });
          }

          // Log the request details for debugging
          // console.log('[Gemini Generate] Model:', model);
          // console.log('[Gemini Generate] Tools count:', payload.tools?.[0]?.function_declarations?.length || 0);
          // console.log('[Gemini Generate] Request payload:', JSON.stringify(payload, null, 2));

          const requestBody = JSON.stringify(payload);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

          // Build proxy agent (if configured) and fall back when unavailable
          // console.log('[Gemini Generate] HTTP_PROXY:', process.env.HTTP_PROXY);
          // console.log('[Gemini Generate] HTTPS_PROXY:', process.env.HTTPS_PROXY);

          let proxyAgent: ProxyAgent | undefined;
          if (process.env.HTTP_PROXY) {
            try {
              proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);
              // console.log('[Gemini Generate] ✅ ProxyAgent created successfully');
            } catch (e) {
              console.error('[Gemini Generate] ❌ Failed to create ProxyAgent:', e);
            }
          } else {
            console.warn('[Gemini Generate] ⚠️ No HTTP_PROXY found, proceeding without proxy');
          }

          const buildOptions = (useProxy: boolean) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s safeguard
            const options: any = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: requestBody,
              signal: controller.signal,
            };
            if (useProxy && proxyAgent) {
              options.dispatcher = proxyAgent;
            }
            return { options, timeoutId };
          };

          const sendRequest = async (useProxy: boolean) => {
            const { options, timeoutId } = buildOptions(useProxy);
            try {
              return await fetch(url, options);
            } finally {
              clearTimeout(timeoutId);
            }
          };

          const strategies: { useProxy: boolean; label: string }[] = proxyAgent
            ? [
              { useProxy: true, label: 'proxy' },
              { useProxy: false, label: 'direct' },
            ]
            : [{ useProxy: false, label: 'direct' }];

          const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
          let resp: Response | null = null;
          let lastError: any = null;

          for (const { useProxy, label } of strategies) {
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                // console.log(`[Gemini Generate] Attempt ${attempt} via ${label}...`);
                resp = await sendRequest(useProxy);
                if (resp.ok) break;
                // For 5xx / 429, retry once with small backoff
                if (attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
                  console.warn(`[Gemini Generate] ${label} received ${resp.status}, retrying...`);
                  await delay(800);
                  continue;
                }
                break;
              } catch (err: any) {
                lastError = err;
                console.warn(`[Gemini Generate] ⚠️ ${label} attempt ${attempt} failed:`, err?.message || err);
                if (attempt === 1) {
                  await delay(500);
                  continue;
                }
              }
            }
            if (resp) break;
          }

          if (!resp) {
            console.error('[Gemini Generate] ❌ Network request failed after retries:', lastError);
            const message =
              lastError?.message ||
              'failed to reach Gemini API. Please verify network/proxy configuration.';
            return NextResponse.json({ error: message }, { status: 500 });
          }

          if (!resp.ok) {
            const text = await resp.text();
            console.error('[Gemini Generate] ❌ API error:', resp.status, text);
            return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
          }

          const data = await resp.json();
          // console.log('[Gemini Generate] ✅ Success');

          // 4. 消耗积分
          const consumeResult = await consumeCredits(
            user.id,
            requiredCredits,
            'generate-content',
            `${operationDesc}`
          );

          if (!consumeResult.success) {
            console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
            return NextResponse.json(
              { error: '积分扣除失败: ' + consumeResult.error },
              { status: 500 }
            );
          }

          // console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

          return NextResponse.json({ data, requestId });
        } catch (error: any) {
          console.error('[Gemini Generate] ❌ Fetch failed:', error);
          console.error('[Gemini Generate] Error name:', error?.name);
          console.error('[Gemini Generate] Error message:', error?.message);
          console.error('[Gemini Generate] Error stack:', error?.stack);
          return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
        }
      }
