'use client';

import { supabase } from './client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import {
  parseJWT as parseJWTUtil,
  isTokenExpired as isTokenExpiredUtil,
  setSessionCookie as setSessionCookieUtil,
  readSessionCookie as readSessionCookieUtil
} from './cookie-utils';

export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

// Re-export from cookie-utils for backward compatibility
export const parseJWT = parseJWTUtil;
export const isTokenExpired = isTokenExpiredUtil;
export const readSessionCookie = readSessionCookieUtil;
export const setSessionCookie = (session?: Session | null) =>
  setSessionCookieUtil(session?.access_token, session?.refresh_token);


/**
 * 用户注册
 */
export async function signUp(data: SignUpData): Promise<AuthResponse> {
  const { data: authData, error } = await (supabase as any).auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName || '',
        phone: data.phone || '',
      },
    },
  });

  return {
    user: authData.user,
    session: authData.session,
    error,
  };
}

/**
 * 用户登录
 */
export async function signIn(data: SignInData): Promise<AuthResponse> {
  // console.log('[Auth] 🔐 开始登录流程...');

  const { data: authData, error } = await (supabase as any).auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  // console.log('[Auth] ✅ signInWithPassword 完成, error:', error, 'user:', authData?.user?.email);

  // ✅ 立即保存 session cookie（不等待 onAuthStateChange 事件）
  if (authData.session && !error) {
    // console.log('[Auth] 💾 立即保存 session cookie...');
    setSessionCookie(authData.session);
    // console.log('[Auth] ✅ Session cookie 已保存');
  }

  // ✅ 后台异步更新 last_login_at（不阻塞登录流程）
  if (authData.user) {
    // 使用 API 代理更新，避免触发 RLS 递归问题
    fetch('/api/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table: 'profiles',
        operation: 'update',
        userId: authData.user.id,
        data: { last_login_at: new Date().toISOString() },
        filters: { eq: { id: authData.user.id } }
      })
    }).catch(err => console.warn('[Auth] ⚠️ 后台更新 last_login_at 异常:', err));
  }

  // console.log('[Auth] ✅ signIn 函数完成，准备返回结果');

  return {
    user: authData.user,
    session: authData.session,
    error,
  };
}

/**
 * 用户登出
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await (supabase as any).auth.signOut();

  // 清除会话 cookie
  setSessionCookie(null);
  // console.log('[Auth] 已清除会话 cookie');

  return { error };
}

/**
 * 获取当前用户
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    console.warn('[Auth] 获取当前用户失败，可能是存储被禁用，返回 null:', err);
    return null;
  }
}

/**
 * 获取当前会话
 */
export async function getCurrentSession(): Promise<Session | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  } catch (err) {
    console.warn('[Auth] 获取 session 失败，可能是存储被禁用，返回 null:', err);
    return null;
  }
}

/**
 * 监听认证状态变化
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * 重置密码（发送邮件）
 */
export async function resetPassword(
  email: string
): Promise<{ error: AuthError | null }> {
  const { error } = await (supabase as any).auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  return { error };
}

/**
 * 更新密码
 */
export async function updatePassword(
  newPassword: string
): Promise<{ error: AuthError | null }> {
  const { error } = await (supabase as any).auth.updateUser({
    password: newPassword,
  });
  return { error };
}

/**
 * 更新用户信息
 */
export async function updateProfile(data: {
  fullName?: string;
  avatarUrl?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: new Error('User not authenticated') };
  }

  const updates: any = {};
  if (data.fullName !== undefined) updates.full_name = data.fullName;
  if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;

  const { error } = await (supabase as any)
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  return { error };
}

/**
 * 获取用户完整信息（包括积分等）
 */
export async function getUserProfile(userId?: string) {
  const uid = userId || (await getCurrentUser())?.id;
  if (!uid) {
    return { data: null, error: new Error('User not found') };
  }

  // 1. 尝试直接从 Supabase 获取 (最快)
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();

  if (!error && data) {
    return { data, error: null };
  }

  // 2. 如果直接获取失败 (通常是 RLS 权限问题)，尝试通过 API 代理获取 (使用 Service Role)
  console.log('[Auth] 直接获取 Profile 失败或为空，尝试使用 API 代理...');

  try {
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // ✅ 确保发送 cookie
      body: JSON.stringify({
        table: 'profiles',
        operation: 'select',
        userId: uid,
        filters: {
          eq: { id: uid }
        },
        single: true
      })
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log('[Auth] ✅ 通过 API 代理成功获取 Profile:', result.data.email);
          return { data: result.data, error: null };
        } else {
          console.warn('[Auth] API 代理返回数据为空或失败:', result);
        }
      } else {
        const text = await response.text();
        console.warn('[Auth] API 代理返回非 JSON 响应:', text.substring(0, 100));
      }
    } else {
      console.warn('[Auth] API 代理请求失败:', response.status, response.statusText);
      const text = await response.text();
      console.warn('[Auth] 错误详情:', text.substring(0, 200));
    }
  } catch (proxyErr) {
    console.error('[Auth] API 代理请求异常:', proxyErr);
  }

  // 如果都失败了，返回原始错误
  return { data, error };
}

/**
 * 检查用户是否为管理员
 */
export async function isAdmin(): Promise<boolean> {
  const { data } = await getUserProfile();
  return data?.role === 'admin';
}
