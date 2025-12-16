import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';
import { getUserRoleByEmail, getInitialCredits } from '@/config/users';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables for auth middleware');
}

// 服务端 Supabase 客户端（使用 service role key）
const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'user' | 'admin' | 'vip';
  credits: number;
}

/**
 * 从请求中验证用户身份
 * 返回用户信息或错误响应
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: AuthenticatedUser } | { error: NextResponse }> {
  try {
    // 从 Authorization header 获取 token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        error: NextResponse.json(
          { error: '未登录，请先登录后再使用 AI 功能' },
          { status: 401 }
        ),
      };
    }

    const token = authHeader.replace('Bearer ', '');

    // 验证 token
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return {
        error: NextResponse.json(
          { error: '认证失败，请重新登录' },
          { status: 401 }
        ),
      };
    }

    // 获取用户的 profile 信息（包括积分和角色）
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, credits')
      .eq('id', user.id)
      .single<{ id: string; email: string; role: 'user' | 'admin' | 'vip'; credits: number }>();

    // 🔧 如果 profile 不存在，自动创建一个（根据邮箱判断角色并分配对应积分）
    if (profileError || !profile) {
      console.log('[Auth Middleware] Profile 不存在，正在自动创建...', user.id);

      // 根据邮箱判断用户角色
      const userEmail = user.email || '';
      const userRole = getUserRoleByEmail(userEmail);
      const initialCredits = getInitialCredits(userRole);

      console.log(`[Auth Middleware] 用户邮箱: ${userEmail}, 角色: ${userRole}, 初始积分: ${initialCredits}`);

      const { data: newProfile, error: createError } = await (supabaseAdmin as any)
        .from('profiles')
        .insert({
          id: user.id,
          email: userEmail,
          role: userRole,
          credits: initialCredits,
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        })
        .select('id, email, role, credits')
        .single();

      if (createError || !newProfile) {
        console.error('[Auth Middleware] 创建 Profile 失败:', createError);
        return {
          error: NextResponse.json(
            { error: '用户信息初始化失败，请联系管理员' },
            { status: 500 }
          ),
        };
      }

      console.log('[Auth Middleware] ✅ Profile 创建成功:', newProfile);

      return {
        user: {
          id: newProfile.id,
          email: newProfile.email,
          role: newProfile.role as 'user' | 'admin' | 'vip',
          credits: newProfile.credits,
        },
      };
    }

    return {
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        credits: profile.credits,
      },
    };
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    return {
      error: NextResponse.json(
        { error: '服务器错误' },
        { status: 500 }
      ),
    };
  }
}

/**
 * 检查用户积分是否足够
 */
export function checkCredits(
  user: AuthenticatedUser,
  requiredCredits: number
): { success: true } | { error: NextResponse } {
  if (user.credits < requiredCredits) {
    return {
      error: NextResponse.json(
        {
          error: `积分不足，需要 ${requiredCredits} 积分，当前仅有 ${user.credits} 积分`,
          currentCredits: user.credits,
          requiredCredits,
        },
        { status: 403 }
      ),
    };
  }

  return { success: true };
}

/**
 * 消耗用户积分
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  operationType: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc('consume_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: operationType,
      p_description: description || null,
    });

    if (error) {
      console.error('Failed to consume credits:', error);
      return { success: false, error: error.message };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || '积分消耗失败' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception in consumeCredits:', error);
    return { success: false, error: error.message };
  }
}
