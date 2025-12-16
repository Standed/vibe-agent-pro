import { readSessionCookie, isTokenExpired } from './supabase/auth';

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
  console.log('[authenticatedFetch] 开始处理请求:', url);

  // 直接从 cookie 读取 session（避免 supabase.auth.getSession() 挂起）
  console.log('[authenticatedFetch] 从 cookie 读取 session...');
  const sessionTokens = readSessionCookie();

  console.log('[authenticatedFetch] Cookie session:', sessionTokens ? '存在' : '不存在');

  if (!sessionTokens?.access_token) {
    console.error('[authenticatedFetch] ❌ Session 不存在，抛出错误');
    throw new Error('未登录，请先登录');
  }

  // 检查 token 是否过期
  if (isTokenExpired(sessionTokens.access_token)) {
    console.error('[authenticatedFetch] ❌ Token 已过期');
    throw new Error('登录已过期，请重新登录');
  }

  console.log('[authenticatedFetch] ✅ Session 有效，准备发送请求...');

  // 合并 headers，添加 Authorization
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${sessionTokens.access_token}`);

  // ✅ 修复：仅在未指定 Content-Type 且非 FormData 时，才设置为 application/json
  // 如果是 FormData，浏览器会自动设置 Content-Type: multipart/form-data; boundary=...
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // 发送请求
  console.log('[authenticatedFetch] 🚀 发送 fetch 请求到:', url);
  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log('[authenticatedFetch] ✅ 请求完成，状态码:', response.status);
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
