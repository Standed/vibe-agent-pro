'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getUserProfile, readSessionCookie, setSessionCookie } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: () => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  isAuthenticated: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取用户 profile
  const fetchProfile = async (userId: string) => {
    const { data } = await getUserProfile(userId);
    if (data) {
      setProfile(data);
    }
  };

  // 刷新 profile
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  // 初始化：检查当前会话（10秒内完成验证）
  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        // 检查是否有认证 cookie
        if (typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();

          // 如果没有 cookie，立即结束 loading（未登录状态）
          if (!cookieTokens?.access_token || !cookieTokens?.refresh_token) {
            console.log('[AuthProvider] ℹ️ 未找到认证 cookie，用户需要登录');
            if (isMounted) {
              setLoading(false);
            }
            return;
          }

          // 🔄 验证会话（10秒超时，确保 user 设置后才结束 loading）
          console.log('[AuthProvider] 🔄 验证会话...');

          try {
            // 添加 10 秒超时（国内网络 Supabase API 可能较慢）
            const setSessionPromise = supabase.auth.setSession({
              access_token: cookieTokens.access_token,
              refresh_token: cookieTokens.refresh_token,
            });
            const timeoutPromise = new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error('验证超时')), 10000)
            );

            const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]);

            if (!error && data?.session) {
              // ✅ 验证成功：先设置 user，再结束 loading
              if (isMounted) {
                setSession(data.session);
                setUser(data.session.user);
                console.log('[AuthProvider] ✅ 会话验证成功:', data.session.user.email);

                // 异步加载 profile（不阻塞 loading）
                fetchProfile(data.session.user.id).catch(err =>
                  console.warn('[AuthProvider] ⚠️ Profile 加载失败:', err)
                );

                // 确保 user 已设置后再结束 loading
                setLoading(false);
              }
            } else {
              // ❌ 验证失败：清空状态，结束 loading
              console.warn('[AuthProvider] ⚠️ 会话验证失败:', error?.message || '未知错误');
              if (isMounted) {
                setSession(null);
                setUser(null);
                setProfile(null);
                setLoading(false);
              }
            }
          } catch (verifyErr) {
            // ⚠️ 验证异常（超时或错误）：清空状态，结束 loading
            console.warn('[AuthProvider] ⚠️ 会话验证异常:', verifyErr);
            if (isMounted) {
              setSession(null);
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
          }
        }
      } catch (err) {
        console.warn('[AuthProvider] ⚠️ 初始化过程中发生错误:', err);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initSession();

    // 监听认证状态变化
    const subscriptionWrapper = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthProvider] 🔐 认证状态变化:', event);

      try {
        if (!isMounted) return;

        // TOKEN_REFRESHED 事件：token刷新成功，不需要重新设置loading
        // 只需要更新session，用户体验无感知
        if (event === 'TOKEN_REFRESHED') {
          console.log('[AuthProvider] ✅ Token已刷新，更新session');
          setSession(session);
          setUser(session?.user ?? null);
          // 使用 setSessionCookie 更新 cookie（带过期时间）
          setSessionCookie(session);
          // Token刷新不需要重新加载profile
          return;
        }

        // SIGNED_IN / SIGNED_OUT 等其他事件：需要完整更新状态
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchProfile(session.user.id);
          // 更新 session cookie（带过期时间）
          setSessionCookie(session);
        } else {
          setProfile(null);
          // 清除 session cookie
          setSessionCookie(null);
        }
      } catch (err) {
        console.warn('[AuthProvider] 处理 auth 事件失败:', err);
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        // TOKEN_REFRESHED事件不改变loading状态
        if (isMounted && event !== 'TOKEN_REFRESHED') {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscriptionWrapper.data.subscription.unsubscribe();
    };
  }, []);

  // 登出
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // 检查是否已认证（非游客）
  const isAuthenticated = () => {
    return user !== null && session !== null;
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signOut: handleSignOut,
    refreshProfile,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook to require authentication
export function useRequireAuth() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      // 重定向到登录页
      window.location.href = '/auth/login';
    }
  }, [user, loading]);

  return { user, loading };
}

// Hook to require admin
export function useRequireAdmin() {
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && profile?.role !== 'admin') {
      // 重定向到首页
      window.location.href = '/';
    }
  }, [profile, loading]);

  return { profile, loading };
}
