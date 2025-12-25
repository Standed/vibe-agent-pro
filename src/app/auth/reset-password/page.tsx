'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { updatePassword, signOut } from '@/lib/supabase/auth';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const initSessionFromUrl = async () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const params = new URLSearchParams(hash.replace('#', ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setSessionError('链接已失效，请重新发起重置密码');
            return;
          }
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          setSessionReady(true);
          return;
        } catch {
          setSessionError('链接已失效，请重新发起重置密码');
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        setSessionReady(true);
        return;
      }

      setSessionError('链接已失效，请重新发起重置密码');
    };

    void initSessionFromUrl();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error('请输入新密码');
      return;
    }
    if (password.length < 6) {
      toast.error('密码至少 6 位');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        toast.error(error.message || '重置失败');
        return;
      }
      setDone(true);
      await signOut();
      setTimeout(() => router.replace('/auth/login'), 1200);
    } catch (err: any) {
      toast.error(err.message || '重置失败');
    } finally {
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
          <h1 className="text-3xl font-bold text-white mb-2">重置密码</h1>
          <p className="text-zinc-400">设置一个新的登录密码</p>
        </div>

        {sessionError ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">链接已失效</h2>
              <p className="text-sm text-zinc-400">{sessionError}</p>
              <Link
                href="/auth/forgot-password"
                className="mt-4 inline-flex items-center justify-center w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                重新发送重置链接
              </Link>
            </div>
          </div>
        ) : done ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">密码已更新</h2>
              <p className="text-sm text-zinc-400">即将跳转到登录页，请使用新密码登录。</p>
              <Link
                href="/auth/login"
                className="mt-4 inline-flex items-center justify-center w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                返回登录
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
                  新密码
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                  placeholder="至少 6 个字符"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-1">
                  确认新密码
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                  placeholder="再次输入新密码"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !sessionReady}
              className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '重置中...' : '确认重置'}
            </button>

            <div className="text-center text-sm">
              <span className="text-zinc-400">想起密码了？</span>{' '}
              <Link
                href="/auth/login"
                className="text-white/70 hover:text-white font-medium"
              >
                返回登录
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
