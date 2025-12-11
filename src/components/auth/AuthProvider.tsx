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

  // 初始化：检查当前会话（防止浏览器禁用存储导致页面卡死）
  useEffect(() => {
    let isMounted = true;
    let sessionInitialized = false;

    const tryGetSession = async (retries = 3, delayMs = 8000): Promise<Session | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) return data.session;
        } catch (err) {
          console.warn('[AuthProvider] getSession 失败，重试中...', err);
        }
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      return null;
    };

    const tryGetUser = async (retries = 3, delayMs = 8000): Promise<User | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          const { data } = await supabase.auth.getUser();
          if (data?.user) return data.user;
        } catch (err) {
          console.warn('[AuthProvider] getUser 失败，重试中...', err);
        }
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      return null;
    };

    const initSession = async () => {
      try {
        // 0. 优先尝试从 cookie 恢复（绕过 storage 限制）
        if (!sessionInitialized && typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();
          if (cookieTokens?.access_token && cookieTokens?.refresh_token) {
            try {
              console.log('[AuthProvider] 🔄 通过 cookie 尝试 setSession...');
              const { data, error } = await supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              });
              if (!error && data.session) {
                setSession(data.session);
                setUser(data.session.user);
                await fetchProfile(data.session.user.id);
                sessionInitialized = true;
                console.log('[AuthProvider] ✅ 通过 cookie 恢复会话成功（跳过 storage）');
                return;
              } else {
                console.warn('[AuthProvider] ⚠️ cookie 恢复失败，继续尝试 getSession:', error);
              }
            } catch (cookieErr) {
              console.warn('[AuthProvider] ⚠️ cookie 恢复异常，继续尝试 getSession:', cookieErr);
            }
          }
        }

        // 1. 尝试多次 getSession（不做短超时，避免海外网络失败）
        const session = await tryGetSession(5, 7000);
        if (session) {
          if (!isMounted) return;
          setSession(session);
          setUser(session.user);
          await fetchProfile(session.user.id);
          sessionInitialized = true;
          console.log('[AuthProvider] ✅ 从 getSession 初始化成功');
          return;
        }

        // 2. 尝试多次 getUser
        if (!sessionInitialized) {
          const user = await tryGetUser(5, 7000);
          if (user) {
            if (!isMounted) return;
            setUser(user);
            await fetchProfile(user.id);
            sessionInitialized = true;
            console.log('[AuthProvider] ✅ 通过 getUser 获取到用户');
          }
        }

        // 3. 兜底：cookie 再尝试一次
        if (!sessionInitialized && typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();
          if (cookieTokens?.access_token && cookieTokens?.refresh_token) {
            try {
              console.log('[AuthProvider] 🔄 再次通过 cookie 尝试 setSession...');
              const { data, error } = await supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              });
              if (!error && data.session) {
                setSession(data.session);
                setUser(data.session.user);
                await fetchProfile(data.session.user.id);
                sessionInitialized = true;
                console.log('[AuthProvider] ✅ 通过 cookie 恢复会话成功（兜底）');
              } else {
                console.warn('[AuthProvider] ⚠️ 兜底 cookie 恢复失败:', error);
              }
            } catch (cookieErr) {
              console.warn('[AuthProvider] ⚠️ 兜底 cookie 恢复异常:', cookieErr);
            }
          }
        }
      } catch (err) {
        console.warn('[AuthProvider] ⚠️ 初始化过程中发生错误:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          console.log('[AuthProvider] ✅ 认证初始化完成（可能通过事件更新）');
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
