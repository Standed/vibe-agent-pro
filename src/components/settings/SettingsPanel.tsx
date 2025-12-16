'use client';

import React, { useState, useRef } from 'react';
import { Settings, X, Sun, Moon, Monitor, Languages, User, Camera, Loader2, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n, supportedLocales } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { storageService } from '@/lib/storageService';
import { toast } from 'sonner';

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themes = [
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ];

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

      setUploading(true);

      // 1. 使用 storageService 上传头像
      const { url } = await storageService.uploadFile(file, 'avatars', user.id);

      // 2. 添加时间戳防止本地缓存
      const avatarUrlWithCacheBust = `${url}?t=${Date.now()}`;

      // 3. 更新 User Metadata (绕过 RLS 问题)
      const { error: updateError } = await (supabase as any).auth.updateUser({
        data: { avatar_url: avatarUrlWithCacheBust }
      });

      if (updateError) {
        throw updateError;
      }

      // 尝试同步更新 profiles 表 (如果不成功也不阻塞)
      (supabase as any)
        .from('profiles')
        .update({ avatar_url: avatarUrlWithCacheBust })
        .eq('id', user.id)
        .then(({ error }: any) => {
          if (error) console.warn('[SettingsPanel] Profiles 表同步更新失败 (非致命):', error);
        });

      // 4. 刷新本地状态
      await refreshProfile();
      toast.success('头像更新成功');

    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || '头像上传失败');
    } finally {
      setUploading(false);
      // 清空 input 防止重复选择同一文件不触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
                <div className="relative group">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-light-accent dark:bg-cine-accent flex items-center justify-center ring-2 ring-white dark:ring-black shadow-lg">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-white dark:text-black">
                        {profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                      </span>
                    )}

                    {/* Loading Overlay */}
                    {uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Edit Button Overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 p-1.5 bg-light-accent dark:bg-cine-accent text-white dark:text-black rounded-full shadow-md hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                    title="更换头像"
                  >
                    <Camera size={12} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>

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
