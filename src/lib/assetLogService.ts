import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

// 使用 Service Role Key 创建 Admin 客户端确保能写入 Log
const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export type AssetOperationType = 'seedream' | 'gemini' | 'jimeng' | 'image_upload' | 'sora_video' | 'vidu_video';

export interface AssetLogEntry {
    userId: string;
    operationType: AssetOperationType;
    originalUrl?: string; // 外部链接或 Base64 片段
    r2Url?: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    metadata?: any;
}

export const assetLogService = {
    /**
     * 记录新的资产生成请求 (Started)
     * 返回 logId 用于后续更新
     */
    async logStart(entry: AssetLogEntry) {
        try {
            const { data, error } = await supabaseAdmin
                .from('asset_logs')
                .insert({
                    user_id: entry.userId,
                    operation_type: entry.operationType,
                    original_url: entry.originalUrl,
                    r2_url: entry.r2Url,
                    status: entry.status,
                    metadata: entry.metadata || {},
                })
                .select('id')
                .single();

            if (error) {
                console.error('[AssetLog] Failed to log start:', error);
                return null;
            }
            return data.id;
        } catch (err) {
            console.error('[AssetLog] Exception in logStart:', err);
            return null;
        }
    },

    /**
     * 更新资产状态 (例如 R2 上传成功后)
     */
    async logUpdate(logId: string, updates: { r2Url?: string; status?: 'SUCCESS' | 'FAILED'; error?: string }) {
        try {
            const updateData: any = {};
            if (updates.r2Url) updateData.r2_url = updates.r2Url;
            if (updates.status) updateData.status = updates.status;

            // 如果有错误信息，合并到 metadata
            if (updates.error) {
                // 先获取当前 metadata? 不，直接用 jsonb_set 或者简单合并太复杂
                // 这里简单起见，我们假设 metadata 是存在的，我们只追加 error
                // 实际为了原子性，可能需要 RPC，但这里主要为了记录，直接 overwrite 风险不大
                // 或者查询再更新
                const { data: current } = await supabaseAdmin.from('asset_logs').select('metadata').eq('id', logId).single();
                const newMeta = { ...(current?.metadata as object || {}), error: updates.error };
                updateData.metadata = newMeta;
            }

            const { error } = await supabaseAdmin
                .from('asset_logs')
                .update(updateData)
                .eq('id', logId);

            if (error) {
                console.error('[AssetLog] Failed to log update:', error);
            }
        } catch (err) {
            console.error('[AssetLog] Exception in logUpdate:', err);
        }
    },

    /**
     * 记录一次性完整日志 (Direct Success/Fail)
     */
    async logComplete(entry: AssetLogEntry) {
        await this.logStart(entry);
    },

    /**
     * 获取需要重试的失败任务
     * @param limit 最大返回数量
     * @param maxRetries 最大重试次数
     */
    async getFailedTasks(limit = 20, maxRetries = 3): Promise<Array<{
        id: string;
        user_id: string;
        operation_type: string;
        original_url: string;
        metadata: any;
    }>> {
        try {
            const { data, error } = await supabaseAdmin
                .from('asset_logs')
                .select('id, user_id, operation_type, original_url, metadata')
                .eq('status', 'FAILED')
                .or(`metadata->retry_count.is.null,metadata->retry_count.lt.${maxRetries}`)
                .limit(limit)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[AssetLog] Failed to get failed tasks:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('[AssetLog] Exception in getFailedTasks:', err);
            return [];
        }
    },

    /**
     * 标记任务重试次数
     */
    async incrementRetryCount(logId: string): Promise<void> {
        try {
            const { data: current } = await supabaseAdmin
                .from('asset_logs')
                .select('metadata')
                .eq('id', logId)
                .single();

            const currentRetries = (current?.metadata as any)?.retry_count || 0;
            const newMeta = {
                ...(current?.metadata as object || {}),
                retry_count: currentRetries + 1,
                last_retry_at: new Date().toISOString()
            };

            await supabaseAdmin
                .from('asset_logs')
                .update({ metadata: newMeta })
                .eq('id', logId);
        } catch (err) {
            console.error('[AssetLog] Exception in incrementRetryCount:', err);
        }
    },

    /**
     * 标记任务重试成功
     */
    async markRetrySuccess(logId: string, r2Url: string): Promise<void> {
        try {
            await supabaseAdmin
                .from('asset_logs')
                .update({
                    status: 'SUCCESS',
                    r2_url: r2Url,
                })
                .eq('id', logId);
        } catch (err) {
            console.error('[AssetLog] Exception in markRetrySuccess:', err);
        }
    }
};
