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
  const hasRedirected = useRef(false); // 防止重复跳转
  const REMEMBER_EMAIL_KEY = 'vap_login_email';

  // 获取重定向参数
  const redirectTo = searchParams.get('redirect') || '/';

  // 监听 user 状态变化，处理"刷新页面时已登录"的情况
  useEffect(() => {
    // 只在页面加载时检查一次（不是登录过程中）
    if (user && !loading && !hasRedirected.current) {
      // 如果已登录但未激活，不跳转
      if (profile && !(profile as any).is_whitelisted && profile.role !== 'admin') {
        console.log('⛔ [LoginPage] 用户已登录但未激活，阻止跳转');
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
            console.warn('⛔ [Login] 用户未激活，阻止跳转');
            toast.error('您的账号尚未开通白名单权限，请联系管理员激活', { duration: 5000 });
            await signOut(); // 登出，防止下次刷新自动登录
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
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <Image
              src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
              alt="Video Agent Pro"
              width={120}
              height={120}
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Video Agent Pro</h1>
          <p className="text-zinc-400">登录你的账号</p>
        </div>

        {searchParams.get('error') && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-500 text-sm text-center animate-in fade-in slide-in-from-top-2 duration-300">
            {searchParams.get('error')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
                邮箱
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-white focus:ring-white/20"
              />
              记住邮箱
            </label>
            <div className="text-sm">
              <Link
                href="/auth/forgot-password"
                className="text-white/70 hover:text-white"
              >
                忘记密码？
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="text-center text-sm">
            <span className="text-zinc-400">还没有账号？</span>{' '}
            <Link
              href="/auth/register"
              className="text-white/70 hover:text-white font-medium"
            >
              立即注册
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
