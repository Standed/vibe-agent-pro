import { NextRequest, NextResponse } from 'next/server';
import { ViduTaskManager } from '@/services/ViduTaskManager';
import { authenticateRequest } from '@/lib/auth-middleware';

export const maxDuration = 30;

/**
 * GET /api/vidu/status?taskId=xxx
 * 查询 Vidu 任务状态（带归属校验）
 */
export async function GET(req: NextRequest) {
    try {
        // 认证
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        // 获取参数
        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');

        if (!taskId) {
            return NextResponse.json(
                { error: 'Missing taskId parameter' },
                { status: 400 }
            );
        }

        // 查询并更新任务状态（包含归属校验）
        const task = await ViduTaskManager.checkAndUpdateTask(taskId);

        if (!task) {
            return NextResponse.json(
                { error: 'Task not found or access denied' },
                { status: 404 }
            );
        }

        // 验证任务归属
        if (task.user_id !== user.id) {
            return NextResponse.json(
                { error: 'Unauthorized: Task does not belong to user' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            task: {
                id: task.id,
                status: task.status,
                progress: task.progress,
                providerUrl: task.kaponai_url,  // 匹配 sora_tasks 字段名
                r2Url: task.r2_url,
                error: task.error_message,
            },
        });

    } catch (error: any) {
        console.error('[Vidu Status] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to query task status' },
            { status: 500 }
        );
    }
}
