'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getUserProfile, readSessionCookie, setSessionCookie, parseJWT, isTokenExpired } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/database.types';
import { ADMIN_EMAILS } from '@/config/users';

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
        finalProfile = {
          id: userId,
          email: userEmail || '',
          role: 'user',
          credits: 0,
          is_whitelisted: false,
          is_active: true
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
        if (data) {
          (supabase as any).from('profiles').update({ avatar_url: defaultAvatar }).eq('id', userId).catch(() => { });
        }
      }

      setProfile(finalProfile);
    } catch (err) {
      console.error('[AuthProvider] fetchProfile 异常:', err);
      // 发生异常也至少设置一个基础状态，防止页面卡死
      setProfile({ id: userId, email: userEmail || '', role: 'user' } as any);
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
        // console.log('[AuthProvider] 🔐 开始初始化...');

        // 检查是否有认证 cookie
        if (typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();

          // 如果没有 cookie，立即结束 loading（未登录状态）
          if (!cookieTokens?.access_token || !cookieTokens?.refresh_token) {
            // console.log('[AuthProvider] ℹ️ 未找到认证 cookie，用户需要登录');
            if (isMounted) {
              setLoading(false);
            }
            return;
          }

          // ✅ 乐观策略：先检查 token 是否过期
          // console.log('[AuthProvider] 🔍 检查 token 是否过期...');

          if (!isTokenExpired(cookieTokens.access_token)) {
            // Token 未过期，直接从 JWT 提取用户信息
            const payload = parseJWT(cookieTokens.access_token);

            if (payload && payload.sub) {
              // console.log('[AuthProvider] ✅ Token 有效，立即设置用户状态');

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

              // 🔄 后台验证 session（不阻塞 UI，无超时限制）
              // console.log('[AuthProvider] 🔄 后台验证 session...');
              supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              }).then(({ data, error }) => {
                if (!isMounted) return;

                if (!error && data?.session) {
                  // console.log('[AuthProvider] ✅ 后台验证成功，更新 session');
                  setSession(data.session);
                  // 如果 token 被 refresh，更新 user
                  if (data.session.user.id !== user.id) {
                    setUser(data.session.user);
                    fetchProfile(data.session.user.id, data.session.user.email);
                  }
                } else {
                  console.warn('[AuthProvider] ⚠️ 后台验证失败，但保留当前状态:', error?.message);
                  // 不清空 user，允许用户继续使用（token 可能仍然有效）
                }
              }).catch(err => {
                console.warn('[AuthProvider] ⚠️ 后台验证异常:', err);
                // 不清空 user，保留当前状态
              });

              return; // 已处理完毕
            }
          }

          // Token 过期或解析失败，尝试完整验证
          // console.log('[AuthProvider] ⚠️ Token 过期或无效，尝试完整验证...');

          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: cookieTokens.access_token,
              refresh_token: cookieTokens.refresh_token,
            });

            if (!error && data?.session) {
              // console.log('[AuthProvider] ✅ 完整验证成功');
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
      // console.log('[AuthProvider] 🔐 认证状态变化:', event);

      try {
        if (!isMounted) return;

        // TOKEN_REFRESHED 事件：token刷新成功，不需要重新设置loading
        // 只需要更新session，用户体验无感知
        if (event === 'TOKEN_REFRESHED') {
          // console.log('[AuthProvider] ✅ Token已刷新，更新session');
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
          await fetchProfile(session.user.id, session.user.email);
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
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        window.location.href = '/auth/login';
        return;
      }

      // 如果 profile 已经加载出来，检查权限
      if (profile) {
        const isAdminEmail = user.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        if (profile.role !== 'admin' && !isAdminEmail) {
          window.location.href = '/';
        }
      }
    }
  }, [user, profile, loading]);

  // 🚀 使用 useMemo 稳定引用，防止无限循环
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

  // 只有当：正在加载中 OR (有用户但既没 profile 也不是管理员邮箱) 时，才显示加载中
  const isAuthLoading = loading || (user && !profile && !isAdminEmail);

  return { profile: effectiveProfile, loading: isAuthLoading };
}
