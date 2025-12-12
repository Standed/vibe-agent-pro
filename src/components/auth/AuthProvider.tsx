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

    const initSession = async () => {
      try {
        // 🚨 关键修复：设置 25 秒总超时，确保 loading 最终会变成 false
        const initTimeout = setTimeout(() => {
          if (isMounted && !sessionInitialized) {
            console.warn('[AuthProvider] ⚠️ 初始化超时（25秒），强制结束 loading');
            setLoading(false);
          }
        }, 25000);

        // 0. 优先尝试从 cookie 恢复（最快且绕过 storage 限制）
        if (!sessionInitialized && typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();
          if (cookieTokens?.access_token && cookieTokens?.refresh_token) {
            try {
              console.log('[AuthProvider] 🔄 通过 cookie 恢复会话...');

              // 添加更宽松的 20 秒超时到 setSession（海外网络/代理较慢时避免误判）
              const setSessionPromise = supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('setSession 超时')), 20000)
              );

              const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]) as any;

              if (!error && data.session) {
                setSession(data.session);
                setUser(data.session.user);
                await fetchProfile(data.session.user.id);
                sessionInitialized = true;
                clearTimeout(initTimeout);
                console.log('[AuthProvider] ✅ 通过 cookie 恢复会话成功');
                return;
              } else {
                console.warn('[AuthProvider] ⚠️ cookie 恢复失败:', error?.message || '未知错误');
              }
            } catch (cookieErr) {
              console.warn('[AuthProvider] ⚠️ cookie 恢复异常（已超时或出错）:', cookieErr);
            }
          }
        }

        // 如果 cookie 恢复失败，直接放弃（不再尝试 getSession/getUser，避免挂起）
        console.log('[AuthProvider] ℹ️ 未从 cookie 恢复到会话，用户需要重新登录');
        clearTimeout(initTimeout);
      } catch (err) {
        console.warn('[AuthProvider] ⚠️ 初始化过程中发生错误:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          console.log('[AuthProvider] ✅ 认证初始化完成');
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
