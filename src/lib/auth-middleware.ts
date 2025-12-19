import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';
import { getUserRoleByEmail, getInitialCredits } from '@/config/users';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 延迟创建 Supabase 客户端，避免构建时报错
let supabaseAdmin: any | null = null;

function getSupabaseAdmin(): any {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables for auth middleware');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'user' | 'admin' | 'vip';
  credits: number;
  isWhitelisted: boolean;
}

const SESSION_COOKIE_NAME = 'supabase-session';

const readAccessTokenFromCookies = (request: NextRequest): string | null => {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return null;

  try {
    const raw = decodeURIComponent(sessionCookie.split('=')[1]);
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && typeof parsed.access_token === 'string') {
      return parsed.access_token;
    }
  } catch (err) {
    console.warn('[Auth Middleware] 解析会话 cookie 失败:', err);
  }
  return null;
};

/**
 * 从请求中验证用户身份
 * 返回用户信息或错误响应
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: AuthenticatedUser } | { error: NextResponse }> {
  try {
    // 从 Authorization header 获取 token，或从 cookie 兜底
    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : null;
    const token = tokenFromHeader || readAccessTokenFromCookies(request);

    if (!token) {
      return {
        error: NextResponse.json(
          { error: '未登录，请先登录后再使用 AI 功能' },
          { status: 401 }
        ),
      };
    }

    // 验证 token
    const admin = getSupabaseAdmin();
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return {
        error: NextResponse.json(
          { error: '认证失败，请重新登录' },
          { status: 401 }
        ),
      };
    }

    // 获取用户的 profile 信息（包括积分和角色）
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, email, role, credits, is_whitelisted')
      .eq('id', user.id)
      .single();

    // 🔧 如果 profile 不存在，自动创建一个（根据邮箱判断角色并分配对应积分）
    if (profileError || !profile) {
      console.log('[Auth Middleware] Profile 不存在，正在自动创建...', user.id);

      // 根据邮箱判断用户角色
      const userEmail = user.email || '';
      const userRole = getUserRoleByEmail(userEmail);
      const initialCredits = getInitialCredits(userRole);

      console.log(`[Auth Middleware] 用户邮箱: ${userEmail}, 角色: ${userRole}, 初始积分: ${initialCredits}`);

      const { data: newProfile, error: createError } = await (getSupabaseAdmin() as any)
        .from('profiles')
        .insert({
          id: user.id,
          email: userEmail,
          role: userRole,
          credits: initialCredits,
          is_whitelisted: userRole === 'admin', // 管理员默认开启白名单
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        })
        .select('id, email, role, credits, is_whitelisted')
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
          isWhitelisted: !!newProfile.is_whitelisted || newProfile.role === 'admin',
        },
      };
    }

    // 🔧 提权逻辑：如果邮箱在硬编码的管理员列表中，但数据库记录不是 admin，直接提权
    const userEmail = user.email || '';
    const isAdminEmail = getUserRoleByEmail(userEmail) === 'admin';
    const effectiveRole = isAdminEmail ? 'admin' : profile.role;

    return {
      user: {
        id: profile.id,
        email: profile.email,
        role: effectiveRole as 'user' | 'admin' | 'vip',
        credits: profile.credits,
        isWhitelisted: !!profile.is_whitelisted || effectiveRole === 'admin',
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
 * 检查用户是否在白名单中
 */
export function checkWhitelist(
  user: AuthenticatedUser
): { success: true } | { error: NextResponse } {
  if (!user.isWhitelisted) {
    return {
      error: NextResponse.json(
        { error: '您的账号尚未获得内测权限，请联系管理员开通白名单' },
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
): Promise<{ success: boolean; error?: string; creditsAfter?: number }> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('consume_credits', {
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

    // 读取最新余额，便于前端更新
    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.warn('[consumeCredits] 获取最新积分失败，仅返回成功状态:', profileError);
      return { success: true };
    }

    return { success: true, creditsAfter: (profile as any)?.credits };
  } catch (error: any) {
    console.error('Exception in consumeCredits:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 频率限制检查 (Rate Limiting)
 * 使用数据库字段实现简单的每分钟计数
 */
export async function checkRateLimit(
  userId: string,
  type: 'chat' | 'image',
  limit: number
): Promise<{ success: true } | { error: NextResponse }> {
  try {
    const now = new Date();
    const { data: profile, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('last_chat_at, chat_count_in_min, last_image_at, image_count_in_min')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return { success: true }; // 容错：如果查不到，放行
    }

    const lastAtField = type === 'chat' ? 'last_chat_at' : 'last_image_at';
    const countField = type === 'chat' ? 'chat_count_in_min' : 'image_count_in_min';

    const lastAt = (profile as any)[lastAtField] ? new Date((profile as any)[lastAtField] as string) : null;
    let count = (profile as any)[countField] || 0;

    // 检查是否在同一分钟内
    const isSameMinute = lastAt &&
      now.getFullYear() === lastAt.getFullYear() &&
      now.getMonth() === lastAt.getMonth() &&
      now.getDate() === lastAt.getDate() &&
      now.getHours() === lastAt.getHours() &&
      now.getMinutes() === lastAt.getMinutes();

    if (isSameMinute) {
      if (count >= limit) {
        return {
          error: NextResponse.json(
            { error: `请求过于频繁，${type === 'chat' ? '聊天' : '图片生成'}每分钟限额 ${limit} 次` },
            { status: 429 }
          ),
        };
      }
      count += 1;
    } else {
      count = 1;
    }

    // 更新数据库
    await getSupabaseAdmin()
      .from('profiles')
      .update({
        [lastAtField]: now.toISOString(),
        [countField]: count
      })
      .eq('id', userId);

    return { success: true };
  } catch (err) {
    console.error('[RateLimit] 检查失败:', err);
    return { success: true }; // 异常时放行，保证可用性
  }
}
