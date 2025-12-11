'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { signIn } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 获取重定向参数
  const redirectTo = searchParams.get('redirect') || '/';

  useEffect(() => {
    // 监听认证状态变化，登录成功后自动跳转
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔐 [LoginPage] Auth 状态变化:', event);

      if (event === 'SIGNED_IN' && session) {
        console.log('✅ [LoginPage] 检测到登录成功，准备跳转到:', redirectTo);
        toast.success('登录成功，正在跳转...');

        // 短暂延迟确保 cookie 设置完成
        setTimeout(() => {
          console.log('🔄 [LoginPage] 执行跳转');
          window.location.href = redirectTo;
        }, 500);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [redirectTo]);

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

      if (result.error) {
        console.error('🔐 [Login] 登录失败:', result.error);
        if (result.error.message?.includes('email_not_confirmed')) {
          toast.error('邮箱未验证，请先完成邮箱验证');
          await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/login`,
            },
          });
          toast.info('已重新发送验证邮件，请检查邮箱');
        } else if (result.error.message?.includes('Failed to fetch')) {
          toast.error('网络较慢或被拦截，正在重试，请稍等或检查网络/VPN');
        } else {
          toast.error(result.error.message || '登录失败');
        }
        setLoading(false);
      }
      // 登录成功的跳转由 onAuthStateChange 处理，不在这里处理
    } catch (error: any) {
      // 如果是超时错误，检查是否已经登录成功
      if (error.message === '登录请求超时') {
        console.log('⚠️ [Login] 登录请求超时，检查认证状态...');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('✅ [Login] 虽然超时，但登录已成功');
          // 跳转由 onAuthStateChange 处理
          return;
        }
      }

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
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link
                href="/auth/forgot-password"
                className="text-purple-400 hover:text-purple-300"
              >
                忘记密码？
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
