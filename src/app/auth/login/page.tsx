'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { signIn } from '@/lib/supabase/auth';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth(); // 使用 AuthProvider 的状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const hasRedirected = useRef(false); // 防止重复跳转

  // 获取重定向参数
  const redirectTo = searchParams.get('redirect') || '/';

  // 监听 user 状态变化，处理"刷新页面时已登录"的情况
  useEffect(() => {
    // 只在页面加载时检查一次（不是登录过程中）
    if (user && !loading && !hasRedirected.current) {
      hasRedirected.current = true;
      console.log('✅ [LoginPage] 检测到已登录用户，自动跳转到:', redirectTo);
      router.replace(redirectTo);
    }
  }, [user, loading, redirectTo, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('🔐 [Login] 开始登录...');

    try {
      // 使用 Promise.race 添加超时（海外网络再放宽）
      const signInPromise = signIn({ email, password });
      const timeoutMs = 60000; // 60s
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('登录请求超时')), timeoutMs)
      );

      const result = await Promise.race([signInPromise, timeoutPromise]) as any;
      console.log('🔐 [Login] signIn 返回结果:', result);

      // 处理错误情况
      if (result.error) {
        console.error('🔐 [Login] 登录失败:', result.error);
        if (result.error.message?.includes('email_not_confirmed')) {
          toast.error('邮箱未验证，请先完成邮箱验证');
        } else if (result.error.message?.includes('Failed to fetch')) {
          toast.error('网络较慢或被拦截，正在重试，请稍等或检查网络/VPN');
        } else {
          toast.error(result.error.message || '登录失败');
        }
        setLoading(false);
        return;
      }

      // ✅ 处理成功情况
      if (result.user && result.session) {
        console.log('🔐 [Login] ✅ 登录成功，用户:', result.user.email);
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
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
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

          <div className="text-center text-sm text-zinc-400">
            注册暂未对外开放，如需开通请联系管理员。
          </div>
        </form>
      </div>
    </div>
  );
}
