import { NextRequest, NextResponse } from 'next/server';
import { ViduTaskManager } from '@/services/ViduTaskManager';
import { authenticateRequest } from '@/lib/auth-middleware';

export const maxDuration = 30;

/**
 * POST /api/vidu/cancel
 * 取消 Vidu 任务（带归属校验）
 * 
 * Body:
 * - taskId: string - 任务 ID
 */
export async function POST(req: NextRequest) {
    try {
        // 认证
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const body = await req.json();
        const { taskId } = body;

        if (!taskId) {
            return NextResponse.json(
                { error: 'Missing taskId' },
                { status: 400 }
            );
        }

        // 取消任务（内部包含归属校验）
        const success = await ViduTaskManager.cancelTask(taskId, user.id);

        return NextResponse.json({
            success,
            message: 'Task cancelled successfully'
        });

    } catch (error: any) {
        console.error('[Vidu Cancel] Error:', error);

        // 处理特定错误
        if (error.message.includes('Unauthorized') || error.message.includes('not found')) {
            return NextResponse.json(
                { error: error.message },
                { status: error.message.includes('Unauthorized') ? 403 : 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to cancel task' },
            { status: 500 }
        );
    }
}
