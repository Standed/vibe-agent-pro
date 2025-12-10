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
    const { data, error } = await supabase.rpc('consume_credits', {
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

    const { data } = await supabase.rpc('get_user_credits', {
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

    const { data, error } = await supabase
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
 * 获取积分定价信息（根据操作类型）
 */
export function getCreditCost(operationType: string): number {
  const pricing: Record<string, number> = {
    'generate-grid-2x2': 5, // 2x2 Grid 生成
    'generate-grid-3x3': 10, // 3x3 Grid 生成
    'generate-grid-3x2': 8, // 3x2 Grid 生成
    'generate-grid-2x3': 8, // 2x3 Grid 生成
    'generate-video': 20, // 视频生成
    'generate-character': 5, // 角色生成
    'chat-message': 0.5, // AI 对话（每条）
    'enhance-prompt': 0.5, // 提示词优化
    'analyze-asset': 1, // 资源分析
  };

  return pricing[operationType] || 1;
}

/**
 * 根据 Grid 尺寸获取积分消耗
 */
export function getGridCost(gridRows: number, gridCols: number): number {
  return getCreditCost(`generate-grid-${gridRows}x${gridCols}`);
}
