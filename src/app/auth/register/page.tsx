'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { signUp } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      setLoading(false);
      return;
    }

    try {
      const { error } = await signUp({ email, password, fullName, phone });

      if (error) {
        toast.error(error.message || '注册失败');
      } else {
        // 注册成功，显示内测提示弹窗
        setShowBetaModal(true);
      }
    } catch (error: any) {
      toast.error(error.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  // 移除阶段性限制，允许所有人注册
  useEffect(() => {
    // 可以在这里添加其他初始化逻辑
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4 relative">
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
          <p className="text-zinc-400">创建你的账号</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-zinc-300 mb-1">
                昵称
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                placeholder="张三"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-zinc-300 mb-1">
                手机号
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
                placeholder="13800138000"
                pattern="^1[3-9]\d{9}$"
                title="请输入有效的中国大陆手机号"
              />
            </div>

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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent pr-10"
                  placeholder="至少 6 个字符"
                  minLength={6}
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-1">
                确认密码
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent pr-10"
                  placeholder="请再次输入密码"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? '注册中...' : '注册'}
          </button>

          <div className="text-center text-sm">
            <span className="text-zinc-400">已有账号？</span>{' '}
            <Link
              href="/auth/login"
              className="text-white/70 hover:text-white font-medium"
            >
              立即登录
            </Link>
          </div>
        </form>
      </div>

      {/* Beta Registration Modal */}
      {showBetaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl transform transition-all animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>

              <h2 className="text-2xl font-bold text-white">注册申请已提交</h2>

              <div className="space-y-2 text-zinc-400 text-sm leading-relaxed">
                <p>感谢您注册 Video Agent Pro。</p>
                <p>目前系统处于<span className="text-yellow-500 font-medium">内测阶段</span>，为了保证服务质量，我们需要人工审核您的账号。</p>
                <p>请耐心等待管理员激活，激活后您将收到通知（或直接尝试登录）。</p>
              </div>

              <div className="w-full pt-4">
                <button
                  onClick={() => router.push('/auth/login')}
                  className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  返回登录页
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
