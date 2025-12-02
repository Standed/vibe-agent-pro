'use client';

import React, { useState } from 'react';
import { Settings, X, Sun, Moon, Monitor, Languages } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n, supportedLocales } from '@/components/providers/I18nProvider';

export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const themes = [
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ];

  return (
    <>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-cine-panel dark:bg-cine-panel hover:bg-cine-border dark:hover:bg-cine-border transition-colors border border-cine-border dark:border-cine-border"
        title={t('common.settings')}
      >
        <Settings className="w-5 h-5 text-zinc-400" />
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-cine-border">
              <h2 className="text-xl font-semibold text-light-text dark:text-white">
                {t('settings.title')}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-light-panel dark:hover:bg-cine-dark transition-colors"
              >
                <X className="w-5 h-5 text-light-text-muted dark:text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
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
                          flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                          ${
                            isActive
                              ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent'
                              : 'bg-light-panel dark:bg-cine-dark border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
                          }
                        `}
                      >
                        <Icon
                          className={`w-5 h-5 ${
                            isActive
                              ? 'text-light-accent dark:text-cine-accent'
                              : 'text-light-text-muted dark:text-zinc-400'
                          }`}
                        />
                        <span
                          className={`text-xs font-medium ${
                            isActive
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
                          flex items-center justify-center gap-2 p-3 rounded-lg border transition-all
                          ${
                            isActive
                              ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent'
                              : 'bg-light-panel dark:bg-cine-dark border-light-border dark:border-cine-border hover:border-light-accent/50 dark:hover:border-cine-accent/50'
                          }
                        `}
                      >
                        <span
                          className={`text-sm font-medium ${
                            isActive
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
