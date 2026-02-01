/**
 * Vidu 任务管理服务
 * 负责任务的创建、查询、状态更新和 R2 转存
 * 
 * 设计原则：
 * - 复用现有 sora_tasks 表，通过 provider='vidu' 区分
 * - 与 Sora 实现保持架构一致性
 * - 支持未来分库分表（使用 project_id 作为分片键）
 */

import { createClient } from '@supabase/supabase-js';
import { ViduService } from '@/services/ViduService';
import { storageService } from '@/lib/storageService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 表名常量，方便未来分库分表时统一修改
const VIDEO_TASKS_TABLE = 'sora_tasks';

export interface ViduTaskRecord {
    id: string;
    user_id: string;
    project_id: string;
    scene_id?: string | null;
    shot_id?: string | null;
    provider: 'vidu';
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    type: string;  // task_type -> type (匹配 sora_tasks)
    model?: string;
    prompt?: string;
    target_duration?: number;  // duration -> target_duration
    target_size?: string;      // resolution -> target_size
    generation_params?: any;
    kaponai_url?: string | null;  // provider_url -> kaponai_url
    r2_url?: string | null;
    point_cost: number;  // credits_cost -> point_cost
    error_message?: string | null;
    created_at: string;
    updated_at: string;
}

export class ViduTaskManager {
    /**
     * 创建 Vidu 任务记录
     * 复用 sora_tasks 表，通过 provider='vidu' 区分
     */
    static async createTask(params: {
        taskId: string;
        userId: string;
        projectId: string;
        sceneId?: string;
        shotId?: string;
        mode: string;
        prompt: string;
        duration: number;
        resolution: string;
        creditsCost: number;
    }): Promise<void> {
        const { taskId, userId, projectId, sceneId, shotId, mode, prompt, duration, resolution, creditsCost } = params;

        // 使用 sora_tasks 表的字段名
        const { error } = await supabase.from(VIDEO_TASKS_TABLE).insert({
            id: taskId,
            user_id: userId,
            project_id: projectId,
            scene_id: sceneId || null,
            shot_id: shotId || null,
            provider: 'vidu',
            status: 'queued',
            progress: 0,
            type: 'direct_generation',  // Pro 模式手动生成，不自动覆盖分镜
            model: 'viduq2-pro-fast',
            prompt,
            target_duration: duration,  // 匹配 sora_tasks
            target_size: resolution,    // 匹配 sora_tasks
            generation_params: { mode },
            point_cost: creditsCost,    // 匹配 sora_tasks
        });

        if (error) {
            console.error('[ViduTaskManager] 创建任务记录失败:', error);
            throw new Error(`Failed to create task record: ${error.message}`);
        }

        console.log(`[ViduTaskManager] 任务记录已创建: ${taskId}`);
    }

    /**
     * 查询任务状态并同步更新
     */
    static async checkAndUpdateTask(taskId: string): Promise<ViduTaskRecord | null> {
        // 1. 从数据库获取任务
        const { data: task, error } = await supabase
            .from('sora_tasks')
            .select('*')
            .eq('id', taskId)
            .eq('provider', 'vidu')
            .single();

        if (error || !task) {
            console.error('[ViduTaskManager] 任务不存在:', taskId);
            return null;
        }

        // 如果已完成或失败，直接返回
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            return task as ViduTaskRecord;
        }

        // 2. 调用 Vidu API 查询最新状态
        try {
            const viduService = new ViduService();
            const statusData = await viduService.getTaskStatus(taskId);

            const updates: any = {
                updated_at: new Date().toISOString(),
            };

            // 状态映射（Vidu API 返回大写，数据库使用小写）
            switch (statusData.state) {
                case 'created':
                case 'queueing':
                    updates.status = 'queued';
                    updates.progress = 0;
                    break;
                case 'processing':
                    updates.status = 'processing';
                    updates.progress = 50;
                    break;
                case 'success':
                    updates.status = 'completed';
                    updates.progress = 100;
                    // 保存提供商 URL（匹配 sora_tasks 字段名）
                    if (statusData.creations && statusData.creations.length > 0) {
                        updates.kaponai_url = statusData.creations[0].url;
                    }
                    break;
                case 'failed':
                    updates.status = 'failed';
                    updates.error_message = 'Vidu generation failed';
                    break;
                default:
                    console.warn('[ViduTaskManager] 未知状态:', statusData.state);
            }

            // 3. 更新数据库
            const { data: updatedTask, error: updateError } = await supabase
                .from('sora_tasks')
                .update(updates)
                .eq('id', taskId)
                .select()
                .single();

            if (updateError) {
                console.error('[ViduTaskManager] 更新任务失败:', updateError);
                return task as ViduTaskRecord;
            }

            console.log(`[ViduTaskManager] 任务状态已更新: ${taskId} -> ${updates.status}`);

            // 4. 如果任务完成，触发 R2 转存
            if (updates.status === 'completed' && updates.kaponai_url && !task.r2_url) {
                this.transferToR2(taskId, updates.kaponai_url, task.project_id, task.shot_id).catch(err => {
                    console.error('[ViduTaskManager] R2 转存失败（后台异步）:', err);
                });
            }

            return updatedTask as ViduTaskRecord;
        } catch (error: any) {
            console.error('[ViduTaskManager] 查询状态失败:', error);
            // 更新错误状态
            await supabase
                .from('sora_tasks')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', taskId);

            return null;
        }
    }

    /**
     * 将视频从 Vidu 临时 URL 转存到 R2
     */
    static async transferToR2(
        taskId: string,
        viduUrl: string,
        projectId: string,
        shotId?: string | null
    ): Promise<string> {
        console.log(`[ViduTaskManager] 开始 R2 转存: ${taskId}`);

        try {
            // 1. 下载视频
            const response = await fetch(viduUrl);
            if (!response.ok) {
                throw new Error(`Failed to download video: ${response.statusText}`);
            }

            const videoBuffer = await response.arrayBuffer();

            // 2. 上传到 R2
            const r2Context = {
                projectId,
                scope: (shotId ? 'shots' : 'project') as 'shots' | 'project',
                entityId: shotId || projectId,
                assetType: 'video' as const,
                model: 'vidu' as const,
            };

            // 转换为 base64
            const base64 = `data:video/mp4;base64,${Buffer.from(videoBuffer).toString('base64')}`;
            const fileName = `vidu_${taskId}_${Date.now()}.mp4`;
            const r2Url = await storageService.uploadBase64ToR2(
                base64,
                r2Context,
                fileName
            );

            console.log(`[ViduTaskManager] R2 转存成功: ${r2Url}`);

            // 3. 更新数据库
            await supabase
                .from('sora_tasks')
                .update({ r2_url: r2Url })
                .eq('id', taskId);

            // 4. 更新分镜表（如果有 shotId）
            if (shotId) {
                await supabase
                    .from('shots')
                    .update({ video_clip: r2Url })
                    .eq('id', shotId);

                console.log(`[ViduTaskManager] 分镜视频已更新: ${shotId}`);
            }

            return r2Url;
        } catch (error: any) {
            console.error('[ViduTaskManager] R2 转存失败:', error);
            // 记录错误但不抛出，以便任务继续可用
            await supabase
                .from('sora_tasks')
                .update({
                    error_message: `R2 transfer failed: ${error.message}`,
                })
                .eq('id', taskId);

            throw error;
        }
    }

    /**
     * 取消任务
     */
    static async cancelTask(taskId: string, userId: string): Promise<boolean> {
        // 1. 验证任务归属
        const { data: task, error } = await supabase
            .from('sora_tasks')
            .select('id, user_id, status')
            .eq('id', taskId)
            .eq('provider', 'vidu')
            .single();

        if (error || !task) {
            throw new Error('Task not found');
        }

        if (task.user_id !== userId) {
            throw new Error('Unauthorized: Task does not belong to user');
        }

        if (task.status === 'completed' || task.status === 'failed') {
            throw new Error('Cannot cancel completed or failed task');
        }

        // 2. 调用 Vidu API 取消任务
        try {
            const viduService = new ViduService();
            await viduService.cancelTask(taskId);

            // 3. 更新数据库状态
            await supabase
                .from('sora_tasks')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', taskId);

            console.log(`[ViduTaskManager] 任务已取消: ${taskId}`);
            return true;
        } catch (error: any) {
            console.error('[ViduTaskManager] 取消任务失败:', error);
            throw error;
        }
    }

    /**
     * 获取项目的所有 Vidu 任务
     */
    static async getProjectTasks(projectId: string, userId: string): Promise<ViduTaskRecord[]> {
        const { data, error } = await supabase
            .from('sora_tasks')
            .select('*')
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .eq('provider', 'vidu')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[ViduTaskManager] 查询任务失败:', error);
            return [];
        }

        return (data || []) as ViduTaskRecord[];
    }

    /**
     * 批量查询和更新处理中的任务
     */
    static async checkPendingTasks(userId: string): Promise<void> {
        const { data: pendingTasks } = await supabase
            .from('sora_tasks')
            .select('id')
            .eq('user_id', userId)
            .eq('provider', 'vidu')
            .in('status', ['queued', 'processing']);

        if (!pendingTasks || pendingTasks.length === 0) {
            return;
        }

        console.log(`[ViduTaskManager] 检查 ${pendingTasks.length} 个待处理任务`);

        // 并发检查所有任务
        await Promise.allSettled(
            pendingTasks.map(task => this.checkAndUpdateTask(task.id))
        );
    }
}
