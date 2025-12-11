'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/dataService';
import { getCurrentUser } from '@/lib/supabase/auth';

export default function SyncDataPage() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // 检查登录状态
  const checkAuth = async () => {
    const user = await getCurrentUser();
    if (user) {
      setUserEmail(user.email || null);
    } else {
      setUserEmail(null);
    }
  };

  // 执行同步
  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const user = await getCurrentUser();
      if (!user) {
        setResult({
          success: false,
          message: '用户未登录，请先登录',
        });
        setSyncing(false);
        return;
      }

      console.log('[Sync Page] 🚀 开始同步...');
      const syncResult = await dataService.syncLocalToCloud();

      console.log('[Sync Page] 📊 同步结果:', syncResult);
      setResult({
        success: syncResult.success,
        message: `同步完成！成功: ${syncResult.syncedCount} 个，跳过: ${syncResult.skippedCount} 个，失败: ${syncResult.errors.length} 个`,
        details: syncResult,
      });

      // 如果同步成功，3秒后跳转到首页
      if (syncResult.success && syncResult.syncedCount > 0) {
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 3000);
      }
    } catch (error: any) {
      console.error('[Sync Page] ❌ 同步失败:', error);
      setResult({
        success: false,
        message: '同步失败: ' + error.message,
      });
    } finally {
      setSyncing(false);
    }
  };

  // 页面加载时检查登录状态
  useState(() => {
    checkAuth();
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-zinc-900 rounded-lg p-8 border border-zinc-800">
        <h1 className="text-3xl font-bold text-white mb-2">数据同步</h1>
        <p className="text-zinc-400 mb-8">
          将本地 IndexedDB 中的项目同步到云端 Supabase
        </p>

        {userEmail && (
          <div className="mb-6 p-4 bg-zinc-800 rounded-lg">
            <p className="text-sm text-zinc-400">当前用户</p>
            <p className="text-white font-medium">{userEmail}</p>
          </div>
        )}

        {!userEmail && !syncing && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
            <p className="text-yellow-400">⚠️ 未检测到登录状态，请先登录</p>
            <button
              onClick={() => router.push('/auth/login')}
              className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              前往登录
            </button>
          </div>
        )}

        {userEmail && !syncing && !result && (
          <button
            onClick={handleSync}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all text-lg"
          >
            开始同步
          </button>
        )}

        {syncing && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <p className="text-white text-lg">正在同步中...</p>
            <p className="text-zinc-400 text-sm mt-2">请勿关闭此页面</p>
          </div>
        )}

        {result && (
          <div className={`p-6 rounded-lg border ${
            result.success
              ? 'bg-green-900/20 border-green-700'
              : 'bg-red-900/20 border-red-700'
          }`}>
            <h2 className={`text-xl font-bold mb-3 ${
              result.success ? 'text-green-400' : 'text-red-400'
            }`}>
              {result.success ? '✅ 同步成功' : '❌ 同步失败'}
            </h2>
            <p className="text-white mb-4">{result.message}</p>

            {result.details && (
              <div className="mt-4 p-4 bg-zinc-800 rounded-lg text-sm">
                <p className="text-zinc-300">详细信息：</p>
                <ul className="mt-2 space-y-1 text-zinc-400">
                  <li>✅ 成功同步: {result.details.syncedCount} 个项目</li>
                  <li>⏭️ 跳过（已存在）: {result.details.skippedCount} 个项目</li>
                  <li>❌ 失败: {result.details.errors.length} 个项目</li>
                </ul>

                {result.details.errors && result.details.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="text-red-400 font-medium">错误详情：</p>
                    <ul className="mt-2 space-y-2">
                      {result.details.errors.map((err: any, idx: number) => (
                        <li key={idx} className="text-xs text-red-300">
                          项目 {err.projectId}: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              {result.success && result.details.syncedCount > 0 && (
                <p className="text-sm text-zinc-400">
                  3秒后自动跳转到首页...
                </p>
              )}
              <button
                onClick={() => router.push('/')}
                className="px-6 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors"
              >
                返回首页
              </button>
              {!result.success && (
                <button
                  onClick={handleSync}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 p-4 bg-zinc-800 rounded-lg">
          <h3 className="text-white font-medium mb-2">同步说明</h3>
          <ul className="text-sm text-zinc-400 space-y-1">
            <li>• 此功能会将浏览器 IndexedDB 中的项目上传到云端</li>
            <li>• 已存在于云端的项目会自动跳过，不会重复上传</li>
            <li>• 同步完成后，刷新页面即可看到所有项目</li>
            <li>• 同步过程中请保持网络连接稳定</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
