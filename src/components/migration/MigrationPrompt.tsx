'use client';

import { useState, useEffect } from 'react';
import { X, Cloud, HardDrive, ArrowRight, CheckCircle } from 'lucide-react';
import { migrationService } from '@/lib/migrationService';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

interface MigrationPromptProps {
  onComplete?: () => void;
}

export function MigrationPrompt({ onComplete }: MigrationPromptProps) {
  const { user } = useAuth();
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });
  const [migrationComplete, setMigrationComplete] = useState(false);

  // 检查是否有本地项目需要迁移
  useEffect(() => {
    const checkLocalProjects = async () => {
      if (!user) return;

      try {
        const count = await migrationService.countLocalProjects();
        setLocalProjectCount(count);

        // 如果有本地项目，显示迁移提示
        if (count > 0) {
          // 检查用户是否已经选择过"以后再说"
          const dismissed = localStorage.getItem('migration-dismissed');
          if (!dismissed) {
            setShowPrompt(true);
          }
        }
      } catch (error) {
        console.error('Failed to check local projects:', error);
      }
    };

    checkLocalProjects();
  }, [user]);

  const handleMigrate = async () => {
    setIsMigrating(true);

    try {
      await migrationService.migrateToCloud((current, total) => {
        setMigrationProgress({ current, total });
      });

      setMigrationComplete(true);
      toast.success('数据迁移成功！', {
        description: `已将 ${localProjectCount} 个项目迁移到云端`,
      });

      // 2秒后关闭提示
      setTimeout(() => {
        setShowPrompt(false);
        onComplete?.();
      }, 2000);
    } catch (error: any) {
      console.error('Migration failed:', error);
      toast.error('数据迁移失败', {
        description: error.message || '请稍后重试',
      });
      setIsMigrating(false);
    }
  };

  const handleDismiss = () => {
    // 记住用户选择"以后再说"
    localStorage.setItem('migration-dismissed', 'true');
    setShowPrompt(false);
  };

  const handleDeleteLocal = async () => {
    if (confirm('确定要删除所有本地数据吗？此操作不可恢复。')) {
      try {
        await migrationService.clearLocalData();
        toast.success('本地数据已清除');
        setShowPrompt(false);
        onComplete?.();
      } catch (error: any) {
        toast.error('删除失败', {
          description: error.message,
        });
      }
    }
  };

  if (!showPrompt || localProjectCount === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-light-border dark:border-cine-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-light-accent/10 dark:bg-cine-accent/10 rounded-lg">
                <Cloud className="w-6 h-6 text-light-accent dark:text-cine-accent" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-light-text dark:text-white">
                  发现本地项目
                </h3>
                <p className="text-sm text-light-text-muted dark:text-cine-text-muted">
                  将数据迁移到云端，随时随地访问
                </p>
              </div>
            </div>
            {!isMigrating && (
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-light-bg dark:hover:bg-cine-black rounded transition-colors"
              >
                <X size={20} className="text-light-text-muted dark:text-cine-text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!isMigrating && !migrationComplete && (
            <>
              <div className="flex items-center justify-between p-4 bg-light-bg dark:bg-cine-black rounded-lg">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5 text-light-text-muted dark:text-cine-text-muted" />
                  <div>
                    <div className="font-medium text-light-text dark:text-white">
                      本地项目
                    </div>
                    <div className="text-sm text-light-text-muted dark:text-cine-text-muted">
                      {localProjectCount} 个项目
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-light-text-muted dark:text-cine-text-muted" />
                <div className="flex items-center gap-3">
                  <Cloud className="w-5 h-5 text-light-accent dark:text-cine-accent" />
                  <div>
                    <div className="font-medium text-light-text dark:text-white">
                      云端同步
                    </div>
                    <div className="text-sm text-light-text-muted dark:text-cine-text-muted">
                      跨设备访问
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-light-text-muted dark:text-cine-text-muted">
                <p>迁移后，你可以：</p>
                <ul className="space-y-1 ml-4">
                  <li>✅ 在任何设备上访问项目</li>
                  <li>✅ 自动云端备份，数据更安全</li>
                  <li>✅ 与团队协作（即将推出）</li>
                </ul>
              </div>
            </>
          )}

          {isMigrating && !migrationComplete && (
            <div className="space-y-3">
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-light-accent/10 dark:bg-cine-accent/10 rounded-full mb-4">
                    <Cloud className="w-8 h-8 text-light-accent dark:text-cine-accent animate-pulse" />
                  </div>
                  <div className="font-medium text-light-text dark:text-white mb-2">
                    正在迁移数据...
                  </div>
                  <div className="text-sm text-light-text-muted dark:text-cine-text-muted">
                    项目 {migrationProgress.current} / {migrationProgress.total}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-light-bg dark:bg-cine-black rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-light-accent dark:bg-cine-accent transition-all duration-300"
                  style={{
                    width: `${(migrationProgress.current / migrationProgress.total) * 100}%`,
                  }}
                />
              </div>

              <p className="text-xs text-center text-light-text-muted dark:text-cine-text-muted">
                请勿关闭此窗口
              </p>
            </div>
          )}

          {migrationComplete && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/10 rounded-full mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <div className="font-medium text-light-text dark:text-white mb-2">
                  迁移完成！
                </div>
                <div className="text-sm text-light-text-muted dark:text-cine-text-muted">
                  所有项目已安全迁移到云端
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isMigrating && !migrationComplete && (
          <div className="p-6 border-t border-light-border dark:border-cine-border space-y-2">
            <button
              onClick={handleMigrate}
              className="w-full px-4 py-3 bg-light-accent dark:bg-cine-accent text-white dark:text-cine-black font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              立即迁移到云端
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 px-4 py-2 bg-light-bg dark:bg-cine-black text-light-text dark:text-white rounded-lg hover:opacity-80 transition-opacity text-sm"
              >
                以后再说
              </button>
              <button
                onClick={handleDeleteLocal}
                className="flex-1 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
              >
                删除本地数据
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
