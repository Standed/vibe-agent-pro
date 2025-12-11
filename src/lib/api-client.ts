import { supabase } from './supabase/client';

/**
 * 发送认证的 API 请求
 * 自动添加 Authorization header
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // 获取当前用户的 session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('未登录，请先登录');
  }

  // 合并 headers，添加 Authorization
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('Content-Type', 'application/json');

  // 发送请求
  return fetch(url, {
    ...options,
    headers,
  });
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
