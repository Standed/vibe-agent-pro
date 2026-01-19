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
          // 更新 Response Cookie (7天有效)
          const newSession = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          };

          res.cookies.set('supabase-session', encodeURIComponent(JSON.stringify(newSession)), {
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
            sameSite: 'lax',
          });
        } else {
          console.warn('[Middleware] Refresh failed:', error?.message);
          hasAuthCookie = false;
          // 刷新失败，清除无效 Cookie
          res.cookies.delete('supabase-session');
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
