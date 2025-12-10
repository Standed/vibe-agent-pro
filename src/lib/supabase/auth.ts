'use client';

import { supabase } from './client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
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

/**
 * 用户注册
 */
export async function signUp(data: SignUpData): Promise<AuthResponse> {
  const { data: authData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName || '',
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
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  // 更新最后登录时间
  if (authData.user) {
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authData.user.id);
  }

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
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * 获取当前用户
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * 获取当前会话
 */
export async function getCurrentSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
  const { error } = await supabase.auth.updateUser({
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

  const { error } = await supabase
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

  const { data, error } = await supabase
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
