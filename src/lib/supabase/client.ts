'use client';

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  );
}

// 统一使用内存存储，避免任何 localStorage/IndexedDB 限制
const memoryStore: Record<string, string> = {};
const memoryStorage: Storage = {
  getItem(key: string) {
    return key in memoryStore ? memoryStore[key] : null;
  },
  setItem(key: string, value: string) {
    memoryStore[key] = value;
  },
  removeItem(key: string) {
    delete memoryStore[key];
  },
  clear() {
    Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
  },
  key(index: number) {
    return Object.keys(memoryStore)[index] ?? null;
  },
  get length() {
    return Object.keys(memoryStore).length;
  },
} as Storage;

const getSafeStorage = () => memoryStorage;

// 客户端 Supabase 实例（用于浏览器端）
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: getSafeStorage(),
    // 我们会在登录时手动设置 cookie 供 middleware 使用
    // Token刷新阈值：提前5分钟（300秒）刷新token
    // 如果token还有5分钟就过期，Supabase会主动刷新
    flowType: 'pkce', // 使用更安全的PKCE流程
  },
  global: {
    headers: {
      'X-Client-Info': 'video-agent-pro',
    },
  },
});

// 初始化认证状态：如果有 session，验证有效性后再设置 cookie
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      // 验证 session 是否真的有效
      const { data: { user }, error } = await supabase.auth.getUser();

      if (user && !error) {
        // Session 有效，设置 cookie
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        document.cookie = `supabase-auth-token=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
        console.log('[Supabase Client] ✅ 检测到有效 session，已设置认证 cookie');
      } else {
        // Session 无效，清除
        console.log('[Supabase Client] ⚠️ 检测到无效 session，清除中...', error);
        await supabase.auth.signOut();
        document.cookie = 'supabase-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    }
  });

  // 监听认证状态变化
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase Client] Auth state changed:', event);
    if (session) {
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      document.cookie = `supabase-auth-token=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    } else {
      document.cookie = 'supabase-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  });
}

// 导出类型
export type { Database };
