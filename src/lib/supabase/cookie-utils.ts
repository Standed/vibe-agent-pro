
/**
 * Supabase Cookie & JWT Utilities (Server-Safe)
 * This file contains logic to read/set session cookies and parse JWTs.
 * It is designed to be called from both client and server contexts.
 */

const SESSION_COOKIE_NAME = 'supabase-session';

/**
 * 解析 JWT token 获取 payload
 */
export const parseJWT = (token: string): any | null => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = parts[1];
        // 使用 Buffer if available (server), else atob (client)
        const decoded = typeof Buffer !== 'undefined'
            ? Buffer.from(payload, 'base64').toString('utf8')
            : atob(payload.replace(/-/g, '+').replace(/_/g, '/'));

        return JSON.parse(decoded);
    } catch (err) {
        console.warn('[CookieUtils] 解析 JWT 失败:', err);
        return null;
    }
};

/**
 * 检查 JWT token 是否过期
 */
export const isTokenExpired = (token: string): boolean => {
    const payload = parseJWT(token);
    if (!payload || !payload.exp) return true;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
};

/**
 * 设置会话 Cookie (仅在客户端生效)
 */
export const setSessionCookie = (sessionAccessToken?: string | null, refresh_token?: string | null) => {
    if (typeof document === 'undefined') return;

    if (sessionAccessToken && refresh_token) {
        const payload = JSON.stringify({
            access_token: sessionAccessToken,
            refresh_token: refresh_token,
        });
        // 设置 7 天过期时间
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(payload)}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    } else {
        document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
};

/**
 * 读取会话 Cookie
 * 可以在客户端 (document.cookie) 或服务器 (通过外部传入 cookie 字符串) 调用
 */
export const readSessionCookie = (cookieString?: string): { access_token: string; refresh_token: string } | null => {
    const finalCookieString = cookieString ?? (typeof document !== 'undefined' ? document.cookie : '');
    if (!finalCookieString) return null;

    // 兼容不同的分号分隔符格式
    const cookies = finalCookieString.split(';').map(c => c.trim());
    const match = cookies.find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!match) return null;

    try {
        const value = decodeURIComponent(match.split('=')[1]);
        const parsed = JSON.parse(value);
        if (parsed.access_token && parsed.refresh_token) {
            return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
        }
    } catch (err) {
        console.warn('[CookieUtils] 解析会话 cookie 失败:', err);
    }
    return null;
};
