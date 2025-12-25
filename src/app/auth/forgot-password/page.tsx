'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { resetPassword } from '@/lib/supabase/auth';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('请输入邮箱');
      return;
    }

    setLoading(true);
    try {
      const { error } = await resetPassword(email.trim());
      if (error) {
        toast.error(error.message || '发送失败');
        return;
      }
      setSent(true);
    } catch (err: any) {
      toast.error(err.message || '发送失败');
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
          <h1 className="text-3xl font-bold text-white mb-2">找回密码</h1>
          <p className="text-zinc-400">输入邮箱，我们会发送重置链接</p>
        </div>

        {sent ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">重置邮件已发送</h2>
              <p className="text-sm text-zinc-400">
                请检查邮箱并点击邮件中的链接完成密码重置。
              </p>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '发送中...' : '发送重置链接'}
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
