'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { signIn, getUserProfile, signOut } from '@/lib/supabase/auth';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth(); // 使用 AuthProvider 的状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const hasRedirected = useRef(false); // 防止重复跳转
  const REMEMBER_EMAIL_KEY = 'vap_login_email';

  // 获取重定向参数
  const redirectTo = searchParams.get('redirect') || '/';

  // 监听 user 状态变化，处理"刷新页面时已登录"的情况
  useEffect(() => {
    // 只在页面加载时检查一次（不是登录过程中）
    if (user && !loading && !hasRedirected.current) {
      // 如果已登录但未激活，显示等待界面而不是直接阻止
      if (profile && !(profile as any).is_whitelisted && profile.role !== 'admin') {
        console.log('⛔ [LoginPage] 用户已登录但未激活，显示等待界面');
        setIsPendingApproval(true);
        return;
      }

      // 如果 profile 还没加载出来，先不跳转，等 profile 加载
      if (!profile) {
        return;
      }

      hasRedirected.current = true;
      console.log('✅ [LoginPage] 检测到已登录用户，自动跳转到:', redirectTo);
      router.replace(redirectTo);
    }
  }, [user, profile, loading, redirectTo, router]);

  // 处理 URL 中的错误信息（如白名单拦截）
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      // 使用 setTimeout 确保 toast 在页面渲染后显示
      const timer = setTimeout(() => {
        toast.error(error, {
          duration: 5000,
          id: 'auth-error' // 防止重复
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, []);

  const handleRefreshStatus = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 强制重新检查状态
      const { data: latestProfile } = await getUserProfile(user.id);

      if (latestProfile && ((latestProfile as any).is_whitelisted || latestProfile.role === 'admin')) {
        toast.success('账号已开通，正在进入系统...');
        setIsPendingApproval(false);
        hasRedirected.current = true;
        router.replace(redirectTo);
      } else {
        toast.info('账号仍未开通，请稍后刷新或联系管理员');
      }
    } catch (e) {
      console.error('刷新状态失败:', e);
      toast.error('刷新失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut();
      setIsPendingApproval(false);
      // 清理可能的残留状态
      router.refresh();
      toast.success('已退出登录');
    } catch (e) {
      console.error('登出失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('🔐 [Login] 开始登录...');

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      // 超时提示不打断流程
      const timeoutMs = 60000; // 60s
      const slowToastId = 'login-slow';
      timeoutId = setTimeout(() => {
        toast.info('登录耗时较长，仍在尝试中...', { id: slowToastId });
      }, timeoutMs);

      const result = await signIn({ email, password }) as any;
      if (timeoutId) clearTimeout(timeoutId);
      toast.dismiss(slowToastId);
      console.log('🔐 [Login] signIn 返回结果:', result);

      // 处理错误情况
      if (result.error) {
        console.error('🔐 [Login] 登录失败:', result.error);
        const errorMessage = result.error.message?.toLowerCase() || '';

        if (errorMessage.includes('email_not_confirmed')) {
          toast.error('邮箱未验证，请先完成邮箱验证');
        } else if (errorMessage.includes('failed to fetch')) {
          toast.error('网络较慢或被拦截，正在重试，请稍等或检查网络/VPN');
        } else if (errorMessage.includes('invalid login credentials')) {
          toast.error('账号或密码错误');
        } else {
          toast.error('登录失败，请检查账号或密码');
        }
        setLoading(false);
        return;
      }

      // ✅ 处理成功情况
      if (result.user && result.session) {
        console.log('🔐 [Login] ✅ 登录成功，用户:', result.user.email);

        // 立即检查白名单状态
        try {
          const { data: profile, error: profileError } = await getUserProfile(result.user.id);
          if (profile && !(profile as any).is_whitelisted && profile.role !== 'admin') {
            console.warn('⛔ [Login] 用户未激活，显示等待界面');
            setIsPendingApproval(true);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('检查白名单失败:', err);
        }

        toast.success('登录成功！');

        // 等待 AuthProvider 的 onAuthStateChange 事件完成（最多等1秒）
        // 这样可以确保 user 状态和 cookie 都已更新
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('🔐 [Login] 🔄 准备跳转到:', redirectTo);
        setLoading(false);

        // 使用 replace 而不是 push，避免用户按返回键回到登录页
        router.replace(redirectTo);
      } else {
        // 意外情况：没有 error 但也没有 user
        console.warn('🔐 [Login] ⚠️ 登录返回但没有用户信息');
        toast.error('登录异常，请重试');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('🔐 [Login] 捕获异常:', error);
      toast.error(error.message || '登录失败，请检查网络/VPN 后重试');
      setLoading(false);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      toast.dismiss('login-slow');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 阻止输入法（IME）确认时的回车触发提交
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  // 渲染等待审核界面
  if (isPendingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
        <div className="max-w-md w-full space-y-8 text-center p-8 bg-zinc-900/50 rounded-2xl border border-white/10 backdrop-blur-xl">
          <div className="space-y-4">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto text-yellow-500 border border-yellow-500/30">
              <Eye size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">账号权限确认中</h2>
            <p className="text-zinc-400">
              您的账号暂未获取白名单权限，<br />
              请联系管理员开通后点击下方按钮刷新。
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <button
              onClick={handleRefreshStatus}
              disabled={loading}
              className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                '检查中...'
              ) : (
                <>
                  <span>🔄</span> 我已开通 / 刷新状态
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full py-3 px-4 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors border border-white/5 disabled:opacity-50"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#0a0a0a] overflow-hidden relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="max-w-md w-full space-y-8 relative z-10 px-4">
        <div className="seko-panel p-8 md:p-12 shadow-2xl shadow-black/10 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-3xl bg-white/60 dark:bg-[#0a0a0a]/40">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="relative group cursor-pointer">
                <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl group-hover:bg-indigo-500/30 transition-all duration-500" />
                <Image
                  src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                  alt="Video Agent Pro"
                  width={120}
                  height={120}
                  className="h-20 w-auto relative z-10 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">Video Agent Pro</h1>
            <p className="text-zinc-500 dark:text-zinc-400">登录你的 Cinematic 账号</p>
          </div>

          {searchParams.get('error') && (
            <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500 text-sm text-center animate-in fade-in slide-in-from-top-2 duration-300">
              {searchParams.get('error')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-400 mb-1.5 ml-1">
                  邮箱
                </label>
                <div className="relative group">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:bg-white dark:focus:bg-white/10 transition-all hover:bg-white dark:hover:bg-white/10"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-400 mb-1.5 ml-1">
                  密码
                </label>
                <div className="relative group">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent focus:bg-white dark:focus:bg-white/10 transition-all hover:bg-white dark:hover:bg-white/10 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors p-1"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="peer h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white/5 text-indigo-500 focus:ring-indigo-500/20 transition-all cursor-pointer"
                  />
                </div>
                <span className="group-hover:text-zinc-800 dark:group-hover:text-zinc-300 transition-colors">记住邮箱</span>
              </label>
              <div className="text-sm">
                <Link
                  href="/auth/forgot-password"
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  忘记密码？
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-zinc-900 text-white dark:bg-white dark:text-black font-bold rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-6 shadow-lg shadow-black/5 dark:shadow-white/5 active:scale-[0.98]"
            >
              {loading ? '登录中...' : '登 录'}
            </button>

            <div className="text-center text-sm pt-4 border-t border-zinc-200 dark:border-white/5 mt-6">
              <span className="text-zinc-500">还没有账号？</span>{' '}
              <Link
                href="/auth/register"
                className="text-zinc-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors"
              >
                立即注册
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
