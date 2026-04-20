'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Settings, X, Sun, Moon, Monitor, Languages, User, Camera, Loader2, LogOut, Sparkles, KeyRound, Mail } from 'lucide-react';
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
  const [savingName, setSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [jimengSessionId, setJimengSessionId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const NICKNAME_MAX_LENGTH = 30;

  const themes = [
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ];

  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const roleLabel = profile?.role === 'admin'
    ? t('settings.roleAdmin')
    : profile?.role === 'vip'
      ? t('settings.roleVip')
      : t('settings.roleUser');

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

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(profile?.full_name || '');
    setIsEditingName(false);
  }, [isOpen, profile?.full_name]);

  useEffect(() => {
    if (!isEditingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isEditingName]);

  const updateProfileFields = async (updates: Record<string, unknown>) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      throw error;
    }
  };

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
        toast.error(t('settings.avatarUnsupportedFormat'));
        return;
      }

      if (file.size > 2 * 1024 * 1024) { // 2MB
        toast.error(t('settings.avatarSizeLimit'));
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

      const compressedFile = await compressFileForUpload(file);

      const { url } = await storageService.uploadFile(compressedFile, 'avatars', user.id);

      const avatarUrlWithCacheBust = `${url}?t=${Date.now()}`;
      await updateProfileFields({ avatar_url: avatarUrlWithCacheBust });
      await refreshProfile();
      setPreviewAvatar(null);
      toast.success(t('settings.avatarUpdateSuccess'));

    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error?.message || t('settings.avatarUploadFailed'));
      if (previewAvatar?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewAvatar);
        } catch {
          // ignore revoke failures
        }
      }
      setPreviewAvatar(null); // Revert on failure
    } finally {
      setUploading(false);
      // 清空 input 防止重复选择同一文件不触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDisplayNameSave = async () => {
    if (!user) return;

    const trimmedName = displayName.trim();
    const currentName = (profile?.full_name || '').trim();

    if (!trimmedName) {
      toast.error(t('settings.nicknameRequired'));
      return;
    }

    if (trimmedName.length > NICKNAME_MAX_LENGTH) {
      toast.error(t('settings.nicknameTooLong', { max: NICKNAME_MAX_LENGTH }));
      return;
    }

    if (trimmedName === currentName) {
      setIsEditingName(false);
      return;
    }

    try {
      setSavingName(true);
      await updateProfileFields({ full_name: trimmedName });
      await refreshProfile();
      setDisplayName(trimmedName);
      setIsEditingName(false);
      toast.success(t('settings.nicknameUpdateSuccess'));
    } catch (error: any) {
      console.error('Error updating nickname:', error);
      toast.error(
        t('settings.nicknameSaveFailed', {
          message: error?.message || t('settings.avatarPermissionDenied')
        })
      );
    } finally {
      setSavingName(false);
    }
  };

  const startDisplayNameEdit = () => {
    setDisplayName(profile?.full_name || '');
    setIsEditingName(true);
  };

  const cancelDisplayNameEdit = () => {
    setDisplayName(profile?.full_name || '');
    setIsEditingName(false);
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
      <div className="premium-panel w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-xl z-10">
          <h2 className="text-xl font-semibold text-primary-text">
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
              <h3 className="text-sm font-medium text-primary-text mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                {t('settings.profile')}
              </h3>
              <div className="flex items-center gap-4 premium-card p-4">
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
                  <div className="flex items-center gap-2 min-h-[28px]">
                    {isEditingName ? (
                      <>
                        <input
                          ref={nameInputRef}
                          type="text"
                          value={displayName}
                          maxLength={NICKNAME_MAX_LENGTH}
                          onChange={(e) => setDisplayName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleDisplayNameSave();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelDisplayNameEdit();
                            }
                          }}
                          placeholder={t('settings.nicknamePlaceholder')}
                          className="flex-1 min-w-0 px-3 py-1.5 text-sm font-bold premium-input"
                        />
                        <button
                          type="button"
                          onClick={() => void handleDisplayNameSave()}
                          disabled={savingName || displayName.trim().length === 0}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg premium-button disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingName ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            t('common.save')
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelDisplayNameEdit}
                          disabled={savingName}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg premium-button disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={startDisplayNameEdit}
                        className="text-left font-bold text-primary-text truncate max-w-full hover:opacity-85 transition-opacity"
                        title={t('settings.nicknameClickToEdit')}
                      >
                        {profile?.full_name || t('settings.noNickname')}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-text truncate">
                    {user.email}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <div className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 inline-block">
                      {roleLabel}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Theme Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sun className="w-5 h-5 text-muted-text" />
              <h3 className="text-sm font-medium text-primary-text">
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
                        ? 'bg-accent/10 border-accent shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'premium-button border-transparent hover:border-accent/30'
                      }
                    `}
                  >
                    <Icon
                      className={`w-5 h-5 ${isActive
                        ? 'text-accent'
                        : 'text-muted-text'
                        }`}
                    />
                    <span
                      className={`text-xs font-medium ${isActive
                        ? 'text-accent'
                        : 'text-primary-text'
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
              <Languages className="w-5 h-5 text-muted-text" />
              <h3 className="text-sm font-medium text-primary-text">
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
                        ? 'bg-accent/10 border-accent shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'premium-button border-transparent hover:border-accent/30'
                      }
                    `}
                  >
                    <span
                      className={`text-sm font-medium ${isActive
                        ? 'text-accent'
                        : 'text-primary-text'
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
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-muted-text" />
              <h3 className="text-sm font-medium text-primary-text">
                {t('settings.jimengTitle')}
              </h3>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-text ml-1">
                  {t('settings.jimengSessionLabel')}
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
                  placeholder={t('settings.jimengSessionPlaceholder')}
                  className="w-full px-4 py-2.5 premium-input"
                />
              </div>
              <p className="text-[10px] text-muted-text leading-relaxed">
                {t('settings.jimengDescription')}
              </p>
            </div>
          </div>

          {/* Account Security */}
          {user && (
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-5 h-5 text-muted-text" />
                <h3 className="text-sm font-medium text-primary-text">
                  {t('settings.accountSecurity')}
                </h3>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const path = user.email
                      ? `/auth/forgot-password?email=${encodeURIComponent(user.email)}`
                      : '/auth/forgot-password';
                    window.location.href = path;
                  }}
                  className="w-full py-2.5 px-4 flex items-center justify-center gap-2 premium-button rounded-xl"
                >
                  <Mail className="w-4 h-4" />
                  {t('settings.goToForgotPassword')}
                </button>
              </div>
            </div>
          )}

          {/* Sign Out */}
          {user && (
            <div className="pt-4 border-t border-border/50">
              <button
                onClick={() => {
                  signOut();
                  onClose();
                }}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors font-medium"
              >
                <LogOut size={16} />
                {t('settings.signOut')}
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
        className="p-2 premium-button rounded-lg"
        title={t('common.settings')}
      >
        <Settings className="w-5 h-5 text-zinc-400" />
      </button>

      <SettingsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
