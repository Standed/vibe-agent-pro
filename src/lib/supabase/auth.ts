'use client';

import { supabase } from './client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

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

const SESSION_COOKIE_NAME = 'supabase-session';

export const setSessionCookie = (session?: Session | null) => {
  if (typeof document === 'undefined') return;
  if (session?.access_token && session?.refresh_token) {
    const payload = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    // 设置 7 天过期时间，避免页面刷新后丢失
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(payload)}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
  } else {
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
};

export const readSessionCookie = (): { access_token: string; refresh_token: string } | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.split('=')[1]);
    const parsed = JSON.parse(value);
    if (parsed.access_token && parsed.refresh_token) {
      return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
    }
  } catch (err) {
    console.warn('[Auth] 解析会话 cookie 失败，已清理:', err);
  }
  // 清理损坏的 cookie
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  return null;
};

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
  console.log('[Auth] 🔐 开始登录流程...');

  const { data: authData, error } = await (supabase as any).auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  console.log('[Auth] ✅ signInWithPassword 完成, error:', error, 'user:', authData?.user?.email);

  // 更新最后登录时间
  if (authData.user) {
    try {
      console.log('[Auth] 📝 更新 last_login_at...');
      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', authData.user.id);

      if (updateError) {
        console.warn('[Auth] ⚠️ 更新 last_login_at 失败（不影响登录）:', updateError);
      } else {
        console.log('[Auth] ✅ last_login_at 更新成功');
      }
    } catch (err) {
      console.warn('[Auth] ⚠️ 更新 last_login_at 异常（不影响登录）:', err);
    }
  }

  console.log('[Auth] ✅ signIn 函数完成，准备返回结果');

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
  console.log('[Auth] 已清除会话 cookie');

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

  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();

  return { data, error };
}

/**
 * 检查用户是否为管理员
 */
export async function isAdmin(): Promise<boolean> {
  const { data } = await getUserProfile();
  return data?.role === 'admin';
}
