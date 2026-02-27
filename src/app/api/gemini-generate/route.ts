import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch, Agent } from 'undici';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-pro-preview'; // 默认使用 Pro 模型
const GEMINI_API_KEY =
  process.env.GEMINI_AGENT_API_KEY ||
  process.env.GEMINI_TEXT_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.NEXT_GEMINI_AGENT_API_KEY ||
  process.env.NEXT_GEMINI_TEXT_API_KEY ||
  process.env.NEXT_GEMINI_API_KEY ||
  process.env.NEXT_PUBLIC_GEMINI_API_KEY; // ⚠️ 向后兼容，应移除

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) return authResult.error;
  const { user } = authResult;

  // 白名单检查
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) return whitelistCheck.error;

  const requiredCredits = calculateCredits('GEMINI_TEXT', user.role);
  const operationDesc = getOperationDescription('GEMINI_TEXT');

  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) return creditsCheck.error;

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'gemini api key not configured' }, { status: 500 });
  }

  const requestId = `generate-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const body = await request.json();
    const { model = DEFAULT_MODEL, payload } = body || {};
    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400 });
    }

    const requestBody = JSON.stringify(payload);

    // 🛡️ 载荷大小检查：Vercel 限制为 4.5MB，我们限制在 4MB 以内以确保安全
    if (requestBody.length > 4 * 1024 * 1024) {
      console.error(`[Gemini Generate] ❌ Payload too large: ${(requestBody.length / 1024 / 1024).toFixed(2)}MB`);
      return NextResponse.json(
        { error: `请求载荷过大 (${(requestBody.length / 1024 / 1024).toFixed(2)}MB)，请尝试减少上下文或图片。` },
        { status: 413 }
      );
    }
    const BASE_URL = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
    const url = `${BASE_URL}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    let dispatcher: any;
    let proxySource = 'none';

    if (process.env.HTTP_PROXY) {
      try {
        dispatcher = new ProxyAgent(process.env.HTTP_PROXY);
        proxySource = `env (${process.env.HTTP_PROXY})`;
        console.log(`[Gemini Generate] 🔌 Using Proxy: ${process.env.HTTP_PROXY}`);
      } catch (e) {
        console.error('[Gemini Generate] ❌ Failed to create ProxyAgent:', e);
      }
    }

    // 如果没有配置代理，使用强制 IPv4 的 Agent，防止 VPN TUN 模式下 IPv6 泄露导致 400 错误
    if (!dispatcher) {
      dispatcher = new Agent({
        connect: {
          family: 4
        }
      });
      proxySource = 'direct (IPv4 forced)';
      console.log('[Gemini Generate] 🌐 Direct connection (IPv4 forced)');
    }

    console.log(`[Gemini Generate] 🚀 Requesting: ${url.replace(GEMINI_API_KEY, '***')}`);

    const buildOptions = () => {
      // 监听客户端断开连接信号
      const controller = new AbortController();
      const signal = request.signal; // 获取客户端请求的 signal

      // 如果客户端断开，我们也中止请求
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const timeoutId = setTimeout(() => controller.abort(), 120_000);
      const options: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
        dispatcher: dispatcher // 使用配置好的 dispatcher (Proxy 或 IPv4 Agent)
      };
      return { options, timeoutId };
    };

    const sendRequest = async () => {
      const { options, timeoutId } = buildOptions();
      try {
        // @ts-ignore
        return await undiciFetch(url, options);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let resp: Response | null = null;
    let lastError: any = null;

    // 重试逻辑
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // @ts-ignore
        resp = await sendRequest();
        if (resp && resp.ok) break;

        // 打印非 200 的响应详情
        if (resp && !resp.ok) {
          const errText = await resp.clone().text();
          console.warn(`[Gemini Generate] ⚠️ Attempt ${attempt} failed with status ${resp.status}: ${errText.slice(0, 200)}`);

          // 如果是 400 User location not supported，重试通常无效，除非是偶发
          if (resp.status === 400 && errText.includes('User location')) {
            throw new Error(`Gemini Region Error: ${errText}`);
          }
        }

        if (resp && attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
          console.warn(`[Gemini Generate] Attempt ${attempt} received ${resp.status}, retrying...`);
          await delay(800);
          continue;
        }
        break;
      } catch (err: any) {
        lastError = err;
        if (err.name === 'AbortError' && request.signal.aborted) {
          throw err;
        }
        console.warn(`[Gemini Generate] ⚠️ Attempt ${attempt} failed:`, err?.message || err);
        if (attempt === 1) {
          await delay(500);
          continue;
        }
      }
    }

    if (!resp) {
      const message = lastError?.message || 'failed to reach Gemini API';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!resp.ok) {
      const text = await resp.text();
      // 针对 400 错误提供更友好的提示
      if (resp.status === 400 && text.includes('User location')) {
        return NextResponse.json({
          error: text,
          hint: 'Current IP region is not supported by Google Gemini. Please check your VPN/Proxy settings (ensure IPv4 is proxied) or configure GEMINI_API_BASE_URL.'
        }, { status: 400 });
      }
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();

    // 4. 消耗积分 (宽容模式：即使失败也返回数据)
    try {
      const consumeResult = await consumeCredits(
        user.id,
        requiredCredits,
        'generate-content',
        `${operationDesc}`
      );

      if (!consumeResult.success) {
        console.error(`[${requestId}] ⚠️ Credits consume failed but content generated:`, consumeResult.error);
        // 这里可以添加报警逻辑，例如发送邮件给管理员
      }
    } catch (consumeError) {
      console.error(`[${requestId}] ⚠️ Credits consume exception:`, consumeError);
    }

    return NextResponse.json({ data, requestId });
  } catch (error: any) {
    if (error.name === 'AbortError' || request.signal.aborted) {
      console.log(`[${requestId}] ⏹️ Request aborted by client`);
      return NextResponse.json({ error: 'Request aborted' }, { status: 499 }); // 499 Client Closed Request
    }
    console.error('[Gemini Generate] ❌ Fetch failed:', error);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
