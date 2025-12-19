'use client';

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 延迟创建客户端，避免构建时错误
let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file.'
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: {
        headers: {
          'X-Client-Info': 'video-agent-pro',
        },
      },
    });
  }

  return supabaseClient;
}

// 客户端 Supabase 实例（用于浏览器端）
// 注意：认证状态由 AuthProvider 统一管理，这里只创建 client
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    const client = getSupabaseClient();
    return (client as any)[prop];
  },
});

// 导出类型
export type { Database };
