'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getUserProfile, readSessionCookie, setSessionCookie, parseJWT, isTokenExpired, getCurrentSession } from '@/lib/supabase/auth';
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
  const activeUserIdRef = useRef<string | null>(null);
  const profileRetryTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearProfileRetryTimeouts = useCallback(() => {
    profileRetryTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    profileRetryTimeoutsRef.current = [];
  }, []);

  const setUserState = (nextUser: User | null) => {
    activeUserIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
  };

  const clearAuthState = () => {
    setSession(null);
    setUserState(null);
    setProfile(null);
    setSessionCookie(null);
  };

  // 获取用户 profile
  // 获取用户 profile
  const fetchProfile = async (userId: string, userEmail?: string, accessToken?: string): Promise<boolean> => {
    try {
      const { data, error } = await getUserProfile(userId, accessToken);

      let finalProfile: any = data;

      // 如果数据库中没有 profile，但我们有用户信息，尝试自动创建或等待后端创建
      if (!data || error) {
        console.warn('[AuthProvider] 无法获取用户 Profile:', error);

        // ✅ 不要在请求失败时清空已有 profile，避免短暂网络错误导致头像/积分闪回
        return false; // 返回失败状态
      } else {
        // 数据库有数据，但确保积分字段不为 null
        finalProfile = {
          ...data,
          credits: (data.credits !== null && data.credits !== undefined)
            ? data.credits
            : INITIAL_CREDITS[data.role as keyof typeof INITIAL_CREDITS] || 0
        };

        // 兜底逻辑：如果邮箱在硬编码的管理员列表中，前端先行提权
        if (userEmail && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail.toLowerCase())) {
          finalProfile.role = 'admin';
          finalProfile.is_whitelisted = true;
        }

        const avatarSeedEmail = userEmail || finalProfile?.email;

        // 如果没有头像,生成默认头像 (仅前端显示,不写数据库以避免阻塞登录)
        if (!finalProfile.avatar_url && avatarSeedEmail) {
          const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(avatarSeedEmail)}&backgroundColor=000000,ffffff&textColor=ffffff,000000`;
          finalProfile.avatar_url = defaultAvatar;
          // ✅ 移除数据库更新逻辑,避免 RLS 权限问题导致登录卡死
        }

        // 只为当前用户落地结果，避免切号/登出导致串写
        if (activeUserIdRef.current === userId) {
          setProfile(finalProfile);
        }
        return true; // 返回成功状态
      }
    } catch (err) {
      console.error('[AuthProvider] fetchProfile 异常:', err);
      // ✅ 异常时保持现有 profile（不要清空）
      return false;
    }
  };

  // 刷新 profile
  const refreshProfile = async () => {
    if (user) {
      const cookieTokens = readSessionCookie();
      await fetchProfile(user.id, user.email, cookieTokens?.access_token);
    }
  };

  // 初始化：乐观认证策略（先信任 cookie，后台验证）
  useEffect(() => {
    let isMounted = true;

    // 监听认证状态变化（要在 initSession 前注册，避免错过 setSession 触发的事件）
    const subscriptionWrapper = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (!isMounted) return;

        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUserState(session?.user ?? null);
          setSessionCookie(session);
          if (session?.user?.id) {
            await fetchProfile(session.user.id, session.user.email, session.access_token);
          }
          return;
        }

        if (session?.user) {
          setSession(session);
          setUserState(session.user);
          // ✅ 必须先设置 cookie，否则 fetchProfile 内部调用 API 代理时会因缺少 cookie 而被重定向到登录页
          setSessionCookie(session);
          await fetchProfile(session.user.id, session.user.email, session.access_token);
        } else {
          const cookieTokens = readSessionCookie();
          const hasValidCookie = !!cookieTokens?.access_token && !isTokenExpired(cookieTokens.access_token);
          if (!hasValidCookie) {
            setSession(null);
            setUserState(null);
            setProfile(null);
            setSessionCookie(null);
          }
        }
      } catch (err) {
        console.warn('[AuthProvider] 处理 auth 事件失败:', err);
        if (!isMounted) return;
        setSession(null);
        setUserState(null);
        setProfile(null);
      } finally {
        if (isMounted && event !== 'TOKEN_REFRESHED') {
          setLoading(false);
        }
      }
    });

    const initSession = async () => {
      try {
        clearProfileRetryTimeouts();
        // 检查是否有认证 cookie
        if (typeof window !== 'undefined') {
          const cookieTokens = readSessionCookie();

          // 如果没有 cookie，立即结束 loading（未登录状态）
          if (!cookieTokens?.access_token || !cookieTokens?.refresh_token) {
            if (isMounted) {
              // 尝试从 Supabase 持久化 session 恢复（短超时，避免 getSession() 挂起）
              const sessionResult = await Promise.race([
                supabase.auth.getSession(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
              ]);
              const restoredSession = (sessionResult as any)?.data?.session as Session | null | undefined;

              if (restoredSession?.user) {
                setSession(restoredSession);
                setUserState(restoredSession.user);
                setSessionCookie(restoredSession);
                setLoading(false);
                fetchProfile(restoredSession.user.id, restoredSession.user.email, restoredSession.access_token).catch(err =>
                  console.warn('[AuthProvider] ⚠️ Profile 加载失败:', err)
                );
                return;
              }

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

              const isLoginPage = window.location.pathname === '/auth/login';

              if (isMounted) {
                // 关键修复：如果在登录页，禁用乐观 UI (不立即结束 loading)，强制等待后台验证
                // 避免 "客户端认为有效 -> 跳转首页 -> 中间件认为无效 -> 跳转登录页" 的死循环
                if (!isLoginPage) {
                  setUserState(user);
                  setLoading(false); // 立即结束 loading (非登录页保持高性能)

                  // 异步加载 profile（不阻塞），带重试机制
                  const initProfile = async (retryCount = 0) => {
                    const success = await fetchProfile(user.id, user.email, cookieTokens.access_token);
                    if (!success && retryCount < 3 && isMounted) {
                      const delay = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
                      console.log(`[AuthProvider] ⚠️ Profile 加载失败，${delay}ms 后重试 (${retryCount + 1}/3)...`);
                      const timeoutId = setTimeout(() => {
                        profileRetryTimeoutsRef.current = profileRetryTimeoutsRef.current.filter((id) => id !== timeoutId);
                        if (!isMounted) return;
                        void initProfile(retryCount + 1);
                      }, delay);
                      profileRetryTimeoutsRef.current.push(timeoutId);
                    }
                  };
                  initProfile();
                }
              }

              // 🔄 后台验证 session
              supabase.auth.setSession({
                access_token: cookieTokens.access_token,
                refresh_token: cookieTokens.refresh_token,
              }).then(({ data, error }) => {
                if (!isMounted) return;

                if (!error && data?.session) {
                  setSession(data.session);
                  setSessionCookie(data.session);
                  // 如果 token 被 refresh，更新 user
                  if (data.session.user.id !== user.id || isLoginPage) {
                    setUserState(data.session.user); // 登录页在这里更新 user
                    fetchProfile(data.session.user.id, data.session.user.email, data.session.access_token);
                  }

                  // ✅ 即使用户 id 未变化，也做一次兜底刷新，避免刷新页时首轮 profile 拉取失败后一直为空
                  if (!isLoginPage) {
                    fetchProfile(data.session.user.id, data.session.user.email, data.session.access_token);
                  }

                  if (isLoginPage) {
                    setLoading(false); // 登录页验证成功后，结束 loading
                  }
                } else {
                  const message = error?.message || '';
                  const status = (error as any)?.status;
                  const shouldClear = status === 400 || status === 401 || /invalid|expired|jwt|token/i.test(message);

                  if (shouldClear) {
                    console.warn('[AuthProvider] ⛔ 后台验证失败，清除本地会话:', message);
                    clearAuthState();
                  } else {
                    console.warn('[AuthProvider] ⚠️ 后台验证失败，但保留当前状态:', message);
                    // 如果在登录页且验证失败（非清除类错误），也需要结束 loading 让人重新登录
                    if (isLoginPage && !user) clearAuthState();
                  }
                  //无论如何，验证结束
                  if (isLoginPage) setLoading(false);
                }
              }).catch(err => {
                console.warn('[AuthProvider] ⚠️ 后台验证异常:', err);
                if (isLoginPage) {
                  clearAuthState();
                  setLoading(false);
                }
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
                setSessionCookie(data.session);
                setUserState(data.session.user);
                setLoading(false);

                fetchProfile(data.session.user.id, data.session.user.email, data.session.access_token).catch(err =>
                  console.warn('[AuthProvider] ⚠️ Profile 加载失败:', err)
                );
              }
            } else {
              console.warn('[AuthProvider] ⚠️ 完整验证失败，清除 cookie');
              if (isMounted) {
                clearAuthState();
                setLoading(false);
              }
            }
          } catch (verifyErr: any) {
            console.warn('[AuthProvider] ⚠️ 完整验证异常:', verifyErr?.message || verifyErr);
            if (isMounted) {
              clearAuthState();
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

    // 启动心跳检测：JWT 7 天有效期，30 分钟检查一次即可
    const heartbeatInterval = setInterval(async () => {
      if (!isMounted) return;
      const currentSession = await getCurrentSession(); // 使用官方 SDK 获取内存中的 session

      if (currentSession?.access_token && currentSession?.expires_at) {
        // 计算剩余时间 (秒)
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = currentSession.expires_at - now;

        // 如果剩余时间少于 30 分钟 (1800秒)，主动刷新
        if (timeLeft < 1800) {
          console.log(`[AuthProvider] 💓 Token 即将过期 (剩余 ${timeLeft}s)，主动刷新...`);
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.warn('[AuthProvider] 💓 主动刷新失败:', error.message);
          } else if (data.session) {
            console.log('[AuthProvider] 💓 主动刷新成功，新过期时间:', new Date((data.session.expires_at || 0) * 1000).toLocaleString());
            setSession(data.session);
            setSessionCookie(data.session);
          }
        }
      }
    }, 30 * 60 * 1000); // 30 分钟检查一次（JWT 7 天有效期，不需要频繁检测）

    return () => {
      isMounted = false;
      clearInterval(heartbeatInterval);
      clearProfileRetryTimeouts();
      subscriptionWrapper.data.subscription.unsubscribe();
    };
  }, [clearProfileRetryTimeouts]);

  // 登出
  const handleSignOut = async () => {
    try {
      clearProfileRetryTimeouts();
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
      await Promise.race([signOutPromise, timeoutPromise]).catch(err => {
        console.warn('[AuthProvider] Supabase signOut 失败或超时:', err);
      });

      setUserState(null);
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
      clearProfileRetryTimeouts();
      setUserState(null);
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
