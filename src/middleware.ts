import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
  // Supabase 的 storage key 格式通常是 sb-<project-ref>-auth-token
  const allCookies = req.cookies.getAll();

  // 调试：打印所有 cookies
  if (allCookies.length > 0) {
    console.log('[Middleware] Cookies found:', allCookies.map(c => c.name).join(', '));
  }

  // 检查是否有认证相关的 cookie
  // 我们使用 supabase-session 作为认证 cookie（定义在 src/lib/supabase/auth.ts）
  const hasAuthCookie = allCookies.some(cookie => {
    return cookie.name === 'supabase-session';
  });

  console.log('[Middleware] Has auth cookie:', hasAuthCookie, 'Path:', path);

  // 如果不是公开路径且没有登录，且不是 API 路径（API 路径应返回 401 而非重定向到 HTML 登录页）
  if (!isPublicPath && !hasAuthCookie && !path.startsWith('/api/')) {
    const redirectUrl = new URL('/auth/login', req.url);
    // 保存原始 URL，登录后可以跳转回来
    redirectUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(redirectUrl);
  }

  // 注释掉：不再阻止已有cookie的用户访问登录页
  // 因为cookie可能已过期，AuthProvider会处理实际的登录状态
  // if (hasAuthCookie && (path === '/auth/login' || path === '/auth/register')) {
  //   return NextResponse.redirect(new URL('/', req.url));
  // }

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
