'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getUserProfile, readSessionCookie, setSessionCookie, parseJWT, isTokenExpired } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/database.types';
import { ADMIN_EMAILS, INITIAL_CREDITS } from '@/config/users';

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
  signOut: async () => { },
  refreshProfile: async () => { },
  isAuthenticated: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取用户 profile
  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      const { data, error } = await getUserProfile(userId);

      let finalProfile: any = data;

      // 如果数据库中没有 profile，但我们有用户信息，可以先构造一个临时 profile
      if (!data || error) {
        console.warn('[AuthProvider] 无法获取用户 Profile，使用临时 Profile (Fail Open)');
        const userRole = userEmail ? (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail.toLowerCase()) ? 'admin' : 'user') : 'user';
        finalProfile = {
          id: userId,
          email: userEmail || '',
          role: userRole,
          credits: INITIAL_CREDITS[userRole as keyof typeof INITIAL_CREDITS],
          is_whitelisted: false, // ✅ 默认为 false，需管理员激活
          is_active: true,
          full_name: 'User',
          avatar_url: null
        };
      } else {
        // 数据库有数据，但确保积分字段不为 null
        finalProfile = {
          ...data,
          credits: (data.credits !== null && data.credits !== undefined)
            ? data.credits
            : INITIAL_CREDITS[data.role as keyof typeof INITIAL_CREDITS] || 0
        };
      }

      // 兜底逻辑：如果邮箱在硬编码的管理员列表中，前端先行提权
      if (userEmail && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail.toLowerCase())) {
        finalProfile.role = 'admin';
        finalProfile.is_whitelisted = true;
      }

      // 如果没有头像，生成默认头像
      if (!finalProfile.avatar_url && userEmail) {
        const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userEmail)}&backgroundColor=000000,ffffff&textColor=ffffff,000000`;
        finalProfile.avatar_url = defaultAvatar;

        // 异步更新数据库（仅当数据库已有记录时）
        // 异步更新数据库（仅当数据库已有记录时）
        if (data) {
          // 不使用 .catch() 以避免 TypeError，如果 update 返回 Promise 则忽略错误
          const updatePromise = (supabase as any).from('profiles').update({ avatar_url: defaultAvatar }).eq('id', userId);
          if (updatePromise && typeof updatePromise.then === 'function') {
            updatePromise.then(null, () => { });
          }
        }
      }

      setProfile(finalProfile);
    } catch (err) {
      console.error('[AuthProvider] fetchProfile 异常:', err);
      // 发生异常也至少设置一个基础状态，防止页面卡死，并默认给予白名单权限（Fail Open）
      const userRole = userEmail ? (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail.toLowerCase()) ? 'admin' : 'user') : 'user';
      setProfile({
        id: userId,
        email: userEmail || '',
        role: userRole,
        credits: INITIAL_CREDITS[userRole as keyof typeof INITIAL_CREDITS],
        is_whitelisted: false,
        is_active: true
      } as any);
    }
  };

  // 刷新 profile
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  // 初始化：乐观认证策略（先信任 cookie，后台验证）
  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        // 检查是否有认证 cookie
        if (typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();

          // 如果没有 cookie，立即结束 loading（未登录状态）
          if (!cookieTokens?.access_token || !cookieTokens?.refresh_token) {
            if (isMounted) {
              setLoading(false);
            }
            return;
          }

          if (!isTokenExpired(cookieTokens.access_token)) {
            // Token 未过期，直接从 JWT 提取用户信息
            const payload = parseJWT(cookieTokens.access_token);

            if (payload && payload.sub) {
              // 从 JWT 构造 User 对象
              const user: User = {
                id: payload.sub,
                email: payload.email || '',
                app_metadata: payload.app_metadata || {},
                user_metadata: payload.user_metadata || {},
                aud: payload.aud || 'authenticated',
                created_at: new Date().toISOString(),
              } as User;

              if (isMounted) {
                setUser(user);
                setLoading(false); // 立即结束 loading

                // 异步加载 profile（不阻塞）
                fetchProfile(user.id, user.email).catch(err =>
                  console.warn('[AuthProvider] ⚠️ Profile 加载失败:', err)
                );
              }

              // 🔄 后台验证 session
              supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              }).then(({ data, error }) => {
                if (!isMounted) return;

                if (!error && data?.session) {
                  setSession(data.session);
                  // 如果 token 被 refresh，更新 user
                  if (data.session.user.id !== user.id) {
                    setUser(data.session.user);
                    fetchProfile(data.session.user.id, data.session.user.email);
                  }
                } else {
                  console.warn('[AuthProvider] ⚠️ 后台验证失败，但保留当前状态:', error?.message);
                }
              }).catch(err => {
                console.warn('[AuthProvider] ⚠️ 后台验证异常:', err);
              });

              return; // 已处理完毕
            }
          }

          // Token 过期或解析失败，尝试完整验证
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: cookieTokens.access_token,
              refresh_token: cookieTokens.refresh_token,
            });

            if (!error && data?.session) {
              if (isMounted) {
                setSession(data.session);
                setUser(data.session.user);
                setLoading(false);

                fetchProfile(data.session.user.id, data.session.user.email).catch(err =>
                  console.warn('[AuthProvider] ⚠️ Profile 加载失败:', err)
                );
              }
            } else {
              console.warn('[AuthProvider] ⚠️ 完整验证失败，清除 cookie');
              if (isMounted) {
                setSession(null);
                setUser(null);
                setProfile(null);
                setLoading(false);
                setSessionCookie(null); // 清除无效 cookie
              }
            }
          } catch (verifyErr: any) {
            console.warn('[AuthProvider] ⚠️ 完整验证异常:', verifyErr?.message || verifyErr);
            if (isMounted) {
              setSession(null);
              setUser(null);
              setProfile(null);
              setLoading(false);
              setSessionCookie(null); // 清除无效 cookie
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
      try {
        if (!isMounted) return;

        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
          setSessionCookie(session);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // ✅ 必须先设置 cookie，否则 fetchProfile 内部调用 API 代理时会因缺少 cookie 而被重定向到登录页
          setSessionCookie(session);
          await fetchProfile(session.user.id, session.user.email);
        } else {
          setProfile(null);
          setSessionCookie(null);
        }
      } catch (err) {
        console.warn('[AuthProvider] 处理 auth 事件失败:', err);
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
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
    try {
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
      await Promise.race([signOutPromise, timeoutPromise]).catch(err => {
        console.warn('[AuthProvider] Supabase signOut 失败或超时:', err);
      });

      setUser(null);
      setSession(null);
      setProfile(null);
      setSessionCookie(null);

      if (typeof window !== 'undefined') {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (supabaseUrl) {
          const projectRef = supabaseUrl.split('.')[0].split('//')[1];
          window.localStorage.removeItem(`sb-${projectRef}-auth-token`);
        }

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('[AuthProvider] 登出过程中发生异常:', error);
      setUser(null);
      setSession(null);
      setProfile(null);
      setSessionCookie(null);
    }
  };

  // 检查是否已认证（非游客）
  const isAuthenticated = () => {
    if (user) return true;
    const cookieTokens = readSessionCookie();
    if (!cookieTokens?.access_token) return false;
    return !isTokenExpired(cookieTokens.access_token);
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
      window.location.href = '/auth/login';
    }
  }, [user, loading]);

  return { user, loading };
}

// Hook to require admin
export function useRequireAdmin() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        window.location.href = '/auth/login';
        return;
      }

      if (profile) {
        const isAdminEmail = user.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        if (profile.role !== 'admin' && !isAdminEmail) {
          window.location.href = '/';
        }
      }
    }
  }, [user, profile, loading]);

  const isAdminEmail = user?.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());

  const effectiveProfile = React.useMemo(() => {
    if (profile) return profile;
    if (isAdminEmail) {
      return {
        id: user?.id,
        email: user?.email,
        role: 'admin',
        is_whitelisted: true
      } as any;
    }
    return null;
  }, [profile, isAdminEmail, user?.id, user?.email]);

  const isAuthLoading = loading || (user && !profile && !isAdminEmail);

  return { profile: effectiveProfile, loading: isAuthLoading };
}

// Hook to require whitelist
export function useRequireWhitelist() {
  const { user, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        window.location.href = '/auth/login';
        return;
      }

      // 只有当 profile 存在且明确为非白名单时才登出
      // 如果 profile 为 null (可能是加载失败)，不要登出，以免误杀
      if (profile) {
        const isAdminEmail = user.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        const isWhitelisted = (profile as any).is_whitelisted || profile.role === 'admin' || isAdminEmail;

        if (!isWhitelisted) {
          console.warn('[AuthProvider] ⛔ 白名单检查失败。Profile:', profile);
          const message = encodeURIComponent('您的账号尚未开通白名单权限，请联系管理员。');
          signOut().then(() => {
            window.location.href = `/auth/login?error=${message}`;
          });
        }
      }
    }
  }, [user, profile, loading, signOut]);

  return { user, profile, loading, signOut };
}
