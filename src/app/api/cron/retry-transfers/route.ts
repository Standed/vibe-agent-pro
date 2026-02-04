/**
 * Cron API: 重试失败的视频转存任务
 * 
 * 该端点由外部定时任务（如 Vercel Cron 或其他调度服务）调用
 * 扫描 asset_logs 表中失败的视频转存任务，尝试重新转存到 R2
 * 
 * 安全性：通过 CRON_SECRET 环境变量验证请求来源
 * 
 * 使用方式：
 * - Vercel Cron: 在 vercel.json 中配置 crons
 * - 外部调度服务: 携带 Authorization: Bearer <CRON_SECRET> header 调用
 */

import { NextRequest } from 'next/server';
import { assetLogService } from '@/lib/assetLogService';
import { transferVideoToR2 } from '@/lib/video-transfer';
import { apiError, apiSuccess } from '@/lib/api-response';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/retry-transfers
 * 扫描并重试失败的视频转存任务
 */
export async function GET(req: NextRequest) {
    // 验证 Cron Secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 允许 Vercel Cron 调用（自动注入 CRON_SECRET）或手动携带 header
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return apiError('Unauthorized', 401, 'INVALID_CRON_SECRET');
    }

    try {
        const startTime = Date.now();
        const results: Array<{ id: string; success: boolean; error?: string }> = [];

        // 1. 获取 'pending_upload' 的新任务 (优先处理)
        const { data: pendingTasks } = await supabase
            .from('sora_tasks')
            .select('*')
            .eq('status', 'pending_upload')
            .limit(5); // 每次处理 5 个，防止超时

        if (pendingTasks && pendingTasks.length > 0) {
            console.log(`[Cron/RetryTransfers] 发现 ${pendingTasks.length} 个待转存任务`);
            for (const task of pendingTasks) {
                try {
                    const providerUrl = task.kaponai_url; // 之前 check-sora-status 存入的
                    if (!providerUrl) {
                        results.push({ id: task.id, success: false, error: 'Missing kaponai_url' });
                        continue;
                    }

                    // 执行转存
                    const { r2Url } = await transferVideoToR2({
                        providerUrl: providerUrl,
                        task: {
                            id: task.id,
                            user_id: task.user_id,
                            project_id: task.project_id,
                            scene_id: task.scene_id,
                            shot_id: task.shot_id,
                            provider: task.provider,
                            model: task.model,
                        },
                        model: task.provider || 'vidu',
                    });

                    // 更新任务状态完成
                    await supabase
                        .from('sora_tasks')
                        .update({ r2_url: r2Url, status: 'completed', error_message: null })
                        .eq('id', task.id);

                    // 如果是角色参考视频，还需要更新角色元数据
                    if (task.type === 'character_reference' && task.character_id) {
                        await supabase.from('characters').update({
                            metadata: {
                                soraReferenceVideoUrl: r2Url
                            }
                        }).eq('id', task.character_id);
                    }

                    results.push({ id: task.id, success: true });
                    console.log(`[Cron/RetryTransfers] 任务 ${task.id} 转存成功`);
                } catch (error: any) {
                    console.error(`[Cron/RetryTransfers] 任务 ${task.id} 转存失败:`, error);
                    // 记录到 asset_logs 供下次重试，并将任务状态改回 completed (虽然没转存成功，但业务状态已完成)
                    // 或者保持 pending_upload ? 保持 pending_upload 会一直重试直到这里。
                    // 策略：记录错误，status 改为 'completed' (避免卡住流水线)，依靠 asset_logs 重试
                    await supabase.from('sora_tasks').update({ status: 'completed', error_message: error.message }).eq('id', task.id);

                    await assetLogService.logComplete({
                        userId: task.user_id,
                        operationType: 'sora_video',
                        originalUrl: task.kaponai_url,
                        status: 'FAILED',
                        metadata: {
                            taskId: task.id,
                            error: error.message,
                            context: 'retry_transfers_pending_upload'
                        }
                    });
                    results.push({ id: task.id, success: false, error: error.message });
                }
            }
        }

        // 2. 获取失败的视频转存任务（asset_logs 中重试次数 < 3 的）
        const failedTasks = await assetLogService.getFailedTasks(5, 3);

        if (failedTasks.length > 0) {
            console.log(`[Cron/RetryTransfers] 开始处理 ${failedTasks.length} 个失败重试任务`);
            for (const task of failedTasks) {
                // 仅处理视频转存任务
                if (!['sora_video', 'vidu_video'].includes(task.operation_type)) {
                    continue;
                }

                try {
                    // ... (保持原有重试逻辑)
                    // 增加重试计数
                    await assetLogService.incrementRetryCount(task.id);

                    const metadata = task.metadata || {};
                    const taskId = metadata.taskId;

                    if (!taskId || !task.original_url) {
                        results.push({ id: task.id, success: false, error: 'Missing taskId or original_url' });
                        continue;
                    }

                    // 从 sora_tasks 表获取完整任务信息
                    const { data: videoTask } = await supabase
                        .from('sora_tasks')
                        .select('*')
                        .eq('id', taskId)
                        .single();

                    if (!videoTask) {
                        results.push({ id: task.id, success: false, error: 'Video task not found' });
                        continue;
                    }

                    // 执行转存
                    const { r2Url } = await transferVideoToR2({
                        providerUrl: task.original_url,
                        task: {
                            id: videoTask.id,
                            user_id: videoTask.user_id,
                            project_id: videoTask.project_id,
                            scene_id: videoTask.scene_id,
                            shot_id: videoTask.shot_id,
                            provider: videoTask.provider,
                            model: videoTask.model,
                        },
                        model: videoTask.provider || 'vidu',
                    });

                    // 更新 sora_tasks 表
                    await supabase
                        .from('sora_tasks')
                        .update({ r2_url: r2Url, error_message: null })
                        .eq('id', taskId);

                    // 标记 asset_log 成功
                    await assetLogService.markRetrySuccess(task.id, r2Url);

                    results.push({ id: task.id, success: true });
                    console.log(`[Cron/RetryTransfers] 任务 ${task.id} 重试成功`);

                } catch (error: any) {
                    console.error(`[Cron/RetryTransfers] 任务 ${task.id} 重试失败:`, error);
                    results.push({ id: task.id, success: false, error: error.message });
                }
            }
        }

        const duration = Date.now() - startTime;
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[Cron/RetryTransfers] 处理完成: ${successCount} 成功, ${failCount} 失败, 耗时 ${duration}ms`);

        return apiSuccess({
            message: `处理完成`,
            processed: results.length,
            success: successCount,
            failed: failCount,
            duration: `${duration}ms`,
            results,
        });

    } catch (error: any) {
        console.error('[Cron/RetryTransfers] 执行失败:', error);
        return apiError(error.message || 'Cron job failed', 500);
    }
}
