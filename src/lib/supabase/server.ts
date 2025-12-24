import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// 延迟创建客户端，避免构建时错误
let supabaseAdminClient: ReturnType<typeof createClient<Database>> | null = null;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase server environment variables. Please check your .env.local file.'
    );
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient<Database>(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseAdminClient;
}

// 服务端 Supabase 实例（拥有 service_role 权限，绕过 RLS）
// ⚠️ 仅在服务端使用，不要暴露给客户端！
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    const client = getSupabaseAdmin();
    return (client as any)[prop];
  },
});

// 导出类型
export type { Database };
