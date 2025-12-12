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
// 注意：认证状态由 AuthProvider 统一管理，这里只创建 client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: getSafeStorage(),
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': 'video-agent-pro',
    },
  },
});

// 导出类型
export type { Database };
