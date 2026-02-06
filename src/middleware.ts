import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { isTokenExpired } from '@/lib/supabase/cookie-utils';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const path = req.nextUrl.pathname;

  // 公开路径 - 不需要认证
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/_next',
    '/api/auth',
    '/favicon.ico',
  ];

  // 检查是否是公开路径
  const isPublicPath = publicPaths.some(publicPath =>
    path.startsWith(publicPath)
  );

  // 检查是否有 Supabase 认证 cookie
  const cookie = req.cookies.get('supabase-session');
  let hasAuthCookie = !!cookie;

  // 如果有 cookie，检查是否过期并尝试刷新
  if (cookie) {
    try {
      const cookieValue = decodeURIComponent(cookie.value);
      const session = JSON.parse(cookieValue);

      // 检查 Token 是否过期
      if (session?.access_token && isTokenExpired(session.access_token)) {
        console.log('[Middleware] Token expired, attempting refresh...');

        // 创建临时客户端用于刷新
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          }
        );

        // 尝试刷新 Session
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });

        if (data.session && !error) {
          console.log('[Middleware] Token refreshed successfully');

          const newSession = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          };

          const newCookieValue = JSON.stringify(newSession);

          // 关键修复：将刷新的 Token 同步到下游请求 Request 中
          // 避免 API 路由再次使用旧 Token 触发二次刷新导致冲突
          const requestHeaders = new Headers(req.headers);
          requestHeaders.set('Authorization', `Bearer ${newSession.access_token}`);

          // 更新请求中的 Cookie (这样 API 路由读取 cookie 也是新的)
          // 注意：我们需要重新构建 Cookie 字符串，这比较麻烦，但 Next.js 允许在 NextResponse.next 配置 request
          // 但这里直接覆盖 Authorization 头是最稳健的，因为 auth-middleware 优先读 Header

          // 使用新的 Headers 创建 Response 对象，将新状态传递给下游
          const nextRes = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });

          // 同时设置 Response Set-Cookie 通知客户端更新
          nextRes.cookies.set('supabase-session', newCookieValue, {
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
            sameSite: 'lax',
          });

          return nextRes;
        } else {
          console.warn('[Middleware] Refresh failed:', error?.message);
          hasAuthCookie = false;

          // 刷新失败，清除无效 Cookie 并重定向到登录页
          const failRes = NextResponse.next();
          failRes.cookies.delete('supabase-session');

          // 非公开路径且非 API 路径，直接重定向到登录页
          if (!isPublicPath && !path.startsWith('/api/')) {
            const redirectUrl = new URL('/auth/login', req.url);
            redirectUrl.searchParams.set('redirect', path);
            redirectUrl.searchParams.set('reason', 'session_expired');
            return NextResponse.redirect(redirectUrl);
          }

          return failRes;
        }
      }
    } catch (err) {
      console.error('[Middleware] Cookie processing error:', err);
      hasAuthCookie = false;
    }
  }

  console.log('[Middleware] Has auth cookie (valid/refreshed):', hasAuthCookie, 'Path:', path);

  // 如果不是公开路径且没有登录，且不是 API 路径
  if (!isPublicPath && !hasAuthCookie && !path.startsWith('/api/')) {
    const redirectUrl = new URL('/auth/login', req.url);
    // 保存原始 URL，登录后可以跳转回来
    redirectUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
