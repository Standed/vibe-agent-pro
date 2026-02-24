'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Settings, X, Sun, Moon, Monitor, Languages, User, Camera, Loader2, LogOut, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n, supportedLocales } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { storageService } from '@/lib/storageService';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { compressFileForUpload } from '@/utils/imageCompression';

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [jimengSessionId, setJimengSessionId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themes = [
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ];

  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewAvatar?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewAvatar);
        } catch {
          // ignore revoke failures
        }
      }
    };
  }, [previewAvatar]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }
      if (!user) {
        return;
      }

      const file = event.target.files[0];

      const fileExt = file.name.split('.').pop();
      const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

      if (!fileExt || !allowedExts.includes(fileExt.toLowerCase())) {
        toast.error('不支持的文件格式');
        return;
      }

      if (file.size > 2 * 1024 * 1024) { // 2MB
        toast.error('图片大小不能超过 2MB');
        return;
      }

      // 0. Optimistic UI: Immediately show the new avatar
      if (previewAvatar?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewAvatar);
        } catch {
          // ignore revoke failures
        }
      }
      const objectUrl = URL.createObjectURL(file);
      setPreviewAvatar(objectUrl);
      setUploading(true);

      console.log('[Avatar Upload] 🚀 1. 开始上传文件');
      console.log('[Avatar Upload] 📁 文件信息:', { name: file.name, size: file.size, type: file.type });

      console.log('[Avatar Upload] 📁 文件信息:', { name: file.name, size: file.size, type: file.type });

      // 1. 压缩图片
      console.log('[Avatar Upload] 🔨 1.5 开始压缩图片...');
      const compressedFile = await compressFileForUpload(file);
      console.log('[Avatar Upload] 📉 压缩后大小:', compressedFile.size);

      // 2. 使用 storageService 上传头像 (使用压缩后的文件)
      const { url } = await storageService.uploadFile(compressedFile, 'avatars', user.id);
      console.log('[Avatar Upload] ✅ 2. R2 上传成功, URL:', url);

      // 2. 添加时间戳防止本地缓存
      const avatarUrlWithCacheBust = `${url}?t=${Date.now()}`;
      console.log('[Avatar Upload] 🔗 3. 添加缓存破坏参数:', avatarUrlWithCacheBust);

      // 3. 直接更新 profiles 表 (必须成功,否则闪回)
      console.log('[Avatar Upload] 📝 4. 开始更新 Profiles 表');
      const { data: profileData, error: profileError } = await (supabase as any)
        .from('profiles')
        .update({ avatar_url: avatarUrlWithCacheBust })
        .eq('id', user.id)
        .select();

      if (profileError) {
        console.error('[Avatar Upload] ❌ 5. Profiles 表更新失败:', profileError);
        console.error('[Avatar Upload] 详细错误:', JSON.stringify(profileError, null, 2));
        throw new Error(`头像保存失败: ${profileError.message || '权限不足'}`);
      }

      console.log('[Avatar Upload] ✅ 6. Profiles 表更新成功');
      console.log('[Avatar Upload] 返回数据:', profileData);

      // KEY FIX: Stop spinning here. The user already sees the optimistic image.
      setUploading(false);
      toast.success('头像更新成功');
      console.log('[Avatar Upload] 🎉 7. UI 更新完成');

      // 4. 刷新本地状态 (Background sync) - 强制刷新
      console.log('[Avatar Upload] 🔄 8. 开始刷新本地 Profile');
      await refreshProfile();
      console.log('[Avatar Upload] ✅ 9. Profile 刷新完成');

      // Nuclear Option: Force Reload to clear any browser/client cache
      console.log('[Avatar Upload] 🔃 10. 准备在 1 秒后重新加载页面...');
      setTimeout(() => {
        console.log('[Avatar Upload] 🔃 11. 正在重新加载页面...');
        window.location.reload();
      }, 1000);
      // 这里的 refreshProfile 应该从 profiles 表拉取最新数据。
      // 如果 profiles 表更新慢，可能拉到旧的。
      // 但由于 User Metadata 也更新了，useAuth 可能会优先使用 metadata。


    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || '头像上传失败');
      if (previewAvatar?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewAvatar);
        } catch {
          // ignore revoke failures
        }
      }
      setPreviewAvatar(null); // Revert on failure
      setUploading(false); // Ensure we stop spinning on error
    } finally {
      // Just in case
      if (uploading) setUploading(false);
      // 清空 input 防止重复选择同一文件不触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen) return;
    setJimengSessionId(localStorage.getItem('jimeng_session_id') || '');
  }, [isOpen]);

  const handleAvatarClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="glass-panel rounded-3xl w-full max-w-md mx-4 shadow-2xl ring-1 ring-black/5 max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-black/5 dark:border-white/5 sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-xl z-10">
          <h2 className="text-xl font-semibold text-light-text dark:text-white">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 glass-button rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Profile Section */}
          {user && (
            <div>
              <h3 className="text-sm font-medium text-light-text dark:text-white mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                个人资料
              </h3>
              <div className="flex items-center gap-4 bg-light-bg-secondary dark:bg-cine-bg-secondary p-4 rounded-2xl border border-light-border dark:border-cine-border">
                {/* Avatar Upload */}
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="relative group cursor-pointer bg-transparent p-0 border-0 disabled:cursor-not-allowed"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-white dark:ring-zinc-800 shadow-xl transition-transform duration-300 group-hover:scale-105">
                    {previewAvatar ? (
                      <img src={previewAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Avatar
                        src={profile?.avatar_url}
                        name={profile?.full_name}
                        email={user.email}
                        className="w-full h-full text-2xl"
                      />
                    )}

                    {/* Upload Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full z-10">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-light-text dark:text-white truncate">
                    {profile?.full_name || '未设置昵称'}
                  </h4>
                  <p className="text-xs text-light-text-muted dark:text-cine-text-muted truncate">
                    {user.email}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <div className="text-[10px] px-2 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent border border-light-accent/20 dark:border-cine-accent/20 inline-block">
                      {profile?.role === 'admin' ? '管理员' : profile?.role === 'vip' ? 'VIP 会员' : '普通用户'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Theme Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sun className="w-5 h-5 text-light-text-muted dark:text-zinc-400" />
              <h3 className="text-sm font-medium text-light-text dark:text-white">
                {t('settings.theme')}
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((themeOption) => {
                const Icon = themeOption.icon;
                const isActive = theme === themeOption.value;
                return (
                  <button
                    key={themeOption.value}
                    onClick={() => setTheme(themeOption.value)}
                    className={`
                      flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300
                      ${isActive
                        ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'glass-button border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'
                      }
                    `}
                  >
                    <Icon
                      className={`w-5 h-5 ${isActive
                        ? 'text-light-accent dark:text-cine-accent'
                        : 'text-light-text-muted dark:text-zinc-400'
                        }`}
                    />
                    <span
                      className={`text-xs font-medium ${isActive
                        ? 'text-light-accent dark:text-cine-accent'
                        : 'text-light-text dark:text-zinc-300'
                        }`}
                    >
                      {themeOption.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Languages className="w-5 h-5 text-light-text-muted dark:text-zinc-400" />
              <h3 className="text-sm font-medium text-light-text dark:text-white">
                {t('settings.language')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {supportedLocales.map((localeOption) => {
                const isActive = locale === localeOption.value;
                return (
                  <button
                    key={localeOption.value}
                    onClick={() => setLocale(localeOption.value)}
                    className={`
                      flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all duration-300
                      ${isActive
                        ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'glass-button border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'
                      }
                    `}
                  >
                    <span
                      className={`text-sm font-medium ${isActive
                        ? 'text-light-accent dark:text-cine-accent'
                        : 'text-light-text dark:text-zinc-300'
                        }`}
                    >
                      {localeOption.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jimeng Configuration */}
          <div className="pt-4 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="text-sm font-medium text-light-text dark:text-white">
                即梦 (Jimeng) 配置
              </h3>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-light-text-muted dark:text-cine-text-muted ml-1">
                  Session ID (从即梦官网 Cookie 中获取)
                </label>
                <input
                  type="password"
                  value={jimengSessionId}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setJimengSessionId(nextValue);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('jimeng_session_id', nextValue);
                    }
                  }}
                  placeholder="粘贴你的 sessionid"
                  className="w-full px-4 py-2.5 rounded-xl bg-light-bg-secondary dark:bg-cine-bg-secondary border border-light-border dark:border-cine-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                />
              </div>
              <p className="text-[10px] text-light-text-muted dark:text-cine-text-muted leading-relaxed">
                配置后可在生成面板选择“即梦”模型。请确保 sessionid 有效。
              </p>
            </div>
          </div>

          {/* Sign Out */}
          {user && (
            <div className="pt-4 border-t border-black/5 dark:border-white/5">
              <button
                onClick={() => {
                  signOut();
                  onClose();
                }}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors font-medium"
              >
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 glass-button rounded-lg"
        title={t('common.settings')}
      >
        <Settings className="w-5 h-5 text-zinc-400" />
      </button>

      <SettingsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
