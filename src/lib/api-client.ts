import { readSessionCookie, isTokenExpired } from './supabase/cookie-utils';

/**
 * 发送认证的 API 请求
 * 自动添加 Authorization header
 *
 * 🔧 修复：直接从 cookie 读取 session，避免 supabase.auth.getSession() 挂起
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // console.log('[authenticatedFetch] 开始处理请求:', url);

  // 直接从 cookie 读取 session（避免 supabase.auth.getSession() 挂起）
  // console.log('[authenticatedFetch] 从 cookie 读取 session...');

  let cookieString = '';
  let finalUrl = url;

  if (typeof document !== 'undefined') {
    cookieString = document.cookie;
  } else {
    // 尝试在服务器端获取 cookie 和 host (Next.js context)
    try {
      // 动态导入避免在客户端报错
      const { headers } = require('next/headers');
      const h = headers();
      cookieString = h.get('cookie') || '';

      // 🔧 修复：在服务器端执行 fetch 时补全绝对路径
      if (url.startsWith('/')) {
        const host = h.get('host');
        if (host) {
          const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
          finalUrl = `${protocol}://${host}${url}`;
          // console.log('[authenticatedFetch] 服务器端补齐路径:', finalUrl);
        } else {
          // 兜底方案：使用环境变量
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
          const prefix = baseUrl.startsWith('http') ? '' : 'https://';
          finalUrl = `${prefix}${baseUrl}${url}`;
        }
      }
      // console.log('[authenticatedFetch] 服务器端获取到 cookie 长度:', cookieString.length);
    } catch (e) {
      console.warn('[authenticatedFetch] 服务器端无法从上下文获取补全路径，保持原始:', url);
    }
  }

  const sessionTokens = readSessionCookie(cookieString);

  // console.log('[authenticatedFetch] Cookie session:', sessionTokens ? '存在' : '不存在');

  if (!sessionTokens?.access_token) {
    console.error('[authenticatedFetch] ❌ Session 不存在，抛出错误');
    throw new Error('未登录，请先登录');
  }

  // 检查 token 是否过期
  if (isTokenExpired(sessionTokens.access_token)) {
    console.error('[authenticatedFetch] ❌ Token 已过期');
    throw new Error('登录已过期，请重新登录');
  }

  // console.log('[authenticatedFetch] ✅ Session 有效，准备发送请求...');

  // 合并 headers，添加 Authorization
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${sessionTokens.access_token}`);

  // ✅ 修复：仅在未指定 Content-Type 且非 FormData 时，才设置为 application/json
  // 如果是 FormData，浏览器会自动设置 Content-Type: multipart/form-data; boundary=...
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // ✅ 修复：如果在服务器端运行，必须显式透传 Cookie，否则会被 Middleware 拦截重定向到登录页(HTML)
  if (cookieString && typeof document === 'undefined') {
    headers.set('Cookie', cookieString);
    // console.log('[authenticatedFetch] 已透传服务器端 Cookie');
  }

  // 发送请求
  // console.log('[authenticatedFetch] 🚀 发送 fetch 请求到:', finalUrl);
  const response = await fetch(finalUrl, {
    ...options,
    headers,
  });

  // console.log('[authenticatedFetch] ✅ 请求完成，状态码:', response.status);
  return response;
}

/**
 * POST 请求快捷方式
 */
export async function authenticatedPost(
  url: string,
  body: any
): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * GET 请求快捷方式
 */
export async function authenticatedGet(url: string): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'GET',
  });
}
