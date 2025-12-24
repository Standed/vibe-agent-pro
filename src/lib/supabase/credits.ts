'use client';

import { supabase } from './client';

export interface ConsumeCreditsParams {
  amount: number;
  operationType: string; // 'generate-grid', 'generate-video', 'chat', etc.
  description?: string;
}

export interface ConsumeCreditsResult {
  success: boolean;
  error?: string;
  currentCredits?: number;
  creditsAfter?: number;
  amountConsumed?: number;
  transactionId?: string;
}

/**
 * 消费积分（通过 RPC 函数调用，确保原子性）
 */
export async function consumeCredits(
  params: ConsumeCreditsParams
): Promise<ConsumeCreditsResult> {
  try {
    // 获取当前用户
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: '请先登录',
      };
    }

    // 调用 RPC 函数
    const { data, error } = await (supabase as any).rpc('consume_credits', {
      p_user_id: user.id,
      p_amount: params.amount,
      p_operation_type: params.operationType,
      p_description: params.description || null,
    });

    if (error) {
      console.error('Consume credits error:', error);
      return {
        success: false,
        error: error.message || '消费积分失败',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || '积分不足',
        currentCredits: data?.current_credits,
      };
    }

    return {
      success: true,
      creditsAfter: data.credits_after,
      amountConsumed: data.amount_consumed,
      transactionId: data.transaction_id,
    };
  } catch (error: any) {
    console.error('Consume credits exception:', error);
    return {
      success: false,
      error: error.message || '系统错误',
    };
  }
}

/**
 * 退款积分（用于 Sora 等异步任务失败回退）
 */
export async function refundCredits(
  amount: number,
  description: string = '任务失败回退'
): Promise<ConsumeCreditsResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data, error } = await (supabase as any).rpc('refund_credits', {
      p_user_id: user.id,
      p_amount: amount,
      p_description: description,
    });

    if (error) {
      console.error('Refund credits error:', error);
      return { success: false, error: error.message || '退款失败' };
    }

    return {
      success: true,
      creditsAfter: data.credits_after,
      amountConsumed: data.amount_refunded,
      transactionId: data.transaction_id,
    };
  } catch (error: any) {
    console.error('Refund credits exception:', error);
    return { success: false, error: error.message || '系统错误' };
  }
}

/**
 * 获取当前用户积分余额
 */
export async function getUserCredits(): Promise<number> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return 0;
    }

    const { data } = await (supabase as any).rpc('get_user_credits', {
      p_user_id: user.id,
    });

    return data || 0;
  } catch (error) {
    console.error('Get user credits error:', error);
    return 0;
  }
}

/**
 * 检查积分是否足够
 */
export async function hasEnoughCredits(required: number): Promise<boolean> {
  const current = await getUserCredits();
  return current >= required;
}

/**
 * 获取积分交易记录
 */
export async function getCreditTransactions(limit = 50) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: [], error: new Error('Not authenticated') };
    }

    const { data, error } = await (supabase as any)
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data: data || [], error };
  } catch (error) {
    return { data: [], error };
  }
}

/**
 * @deprecated 使用 @/config/credits.ts 中的统一价格配置
 * 此函数仅为向后兼容保留,请使用 getGridCreditsCost 替代
 */
export function getGridCost(gridRows: number, gridCols: number): number {
  // 重新导出统一的价格函数,避免破坏现有调用
  const { getGridCreditsCost } = require('@/config/credits');
  return getGridCreditsCost(gridRows, gridCols);
}
