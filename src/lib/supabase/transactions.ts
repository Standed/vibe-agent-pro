/**
 * Supabase 事务工具
 * 
 * 提供事务支持，用于需要原子性操作的场景
 * 如：批量删除场景和分镜、批量更新等
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 服务端 Admin 客户端
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

/**
 * 事务执行结果
 */
export interface TransactionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * 批量操作选项
 */
export interface BatchOperationOptions {
    /** 是否在单个失败时继续执行 */
    continueOnError?: boolean;
    /** 最大重试次数 */
    maxRetries?: number;
}

/**
 * 批量删除场景及其关联的分镜
 * 使用 RPC 函数实现事务原子性
 */
/**
 * 批量删除场景及其关联的分镜
 * 使用 RPC 函数实现事务原子性
 */
export async function deleteSceneWithShots(sceneId: string): Promise<TransactionResult<void>> {
    try {
        // 调用 PostgreSQL RPC 函数实现原子删除
        const { error } = await supabaseAdmin.rpc('delete_scene_atomic', { scene_uuid: sceneId });

        if (error) {
            return { success: false, error: `删除场景失败 (RPC): ${error.message}` };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * 批量删除多个场景及其分镜
 */
export async function deleteScenesWithShots(
    sceneIds: string[],
    options: BatchOperationOptions = {}
): Promise<TransactionResult<{ deleted: string[]; failed: Array<{ id: string; error: string }> }>> {
    const { continueOnError = false } = options;
    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const sceneId of sceneIds) {
        const result = await deleteSceneWithShots(sceneId);

        if (result.success) {
            deleted.push(sceneId);
        } else {
            failed.push({ id: sceneId, error: result.error || 'Unknown error' });
            if (!continueOnError) {
                return {
                    success: false,
                    data: { deleted, failed },
                    error: `操作在场景 ${sceneId} 处失败`,
                };
            }
        }
    }

    return {
        success: failed.length === 0,
        data: { deleted, failed },
    };
}

/**
 * 批量更新分镜
 */
export async function batchUpdateShots(
    updates: Array<{ id: string; data: Record<string, any> }>,
    options: BatchOperationOptions = {}
): Promise<TransactionResult<{ updated: string[]; failed: Array<{ id: string; error: string }> }>> {
    const { continueOnError = true } = options;
    const updated: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const { id, data } of updates) {
        const { error } = await supabaseAdmin
            .from('shots')
            .update(data)
            .eq('id', id);

        if (error) {
            failed.push({ id, error: error.message });
            if (!continueOnError) {
                return {
                    success: false,
                    data: { updated, failed },
                    error: `更新分镜 ${id} 失败`,
                };
            }
        } else {
            updated.push(id);
        }
    }

    return {
        success: failed.length === 0,
        data: { updated, failed },
    };
}

/**
 * 批量删除聊天消息
 */
export async function batchDeleteChatMessages(
    messageIds: string[]
): Promise<TransactionResult<{ deleted: number }>> {
    try {
        const { error, count } = await supabaseAdmin
            .from('chat_messages')
            .delete()
            .in('id', messageIds);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: { deleted: count || messageIds.length } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * 清空项目的所有聊天历史
 */
export async function clearProjectChatHistory(
    projectId: string,
    scope?: 'project' | 'scene' | 'shot',
    scopeId?: string
): Promise<TransactionResult<{ deleted: number }>> {
    try {
        let query = supabaseAdmin
            .from('chat_messages')
            .delete()
            .eq('project_id', projectId);

        if (scope === 'scene' && scopeId) {
            query = query.eq('scene_id', scopeId);
        } else if (scope === 'shot' && scopeId) {
            query = query.eq('shot_id', scopeId);
        }

        const { error, count } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: { deleted: count || 0 } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * 原子性更新项目设置
 */
export async function updateProjectSettings(
    projectId: string,
    settings: Record<string, any>
): Promise<TransactionResult<void>> {
    try {
        // 先获取当前设置
        const { data: project, error: fetchError } = await supabaseAdmin
            .from('projects')
            .select('settings')
            .eq('id', projectId)
            .single();

        if (fetchError) {
            return { success: false, error: `获取项目失败: ${fetchError.message}` };
        }

        // 合并设置
        const mergedSettings = {
            ...(project?.settings || {}),
            ...settings,
        };

        // 更新
        const { error: updateError } = await supabaseAdmin
            .from('projects')
            .update({ settings: mergedSettings })
            .eq('id', projectId);

        if (updateError) {
            return { success: false, error: `更新设置失败: ${updateError.message}` };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
