import { NextRequest, NextResponse } from 'next/server';
import { RunningHubService } from '@/services/RunningHubService';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');

        if (!taskId) {
            return NextResponse.json(
                { error: 'taskId is required' },
                { status: 400 }
            );
        }

        const service = new RunningHubService();
        const status = await service.getTaskStatus(taskId);

        return NextResponse.json(status);
    } catch (error: any) {
        console.error('Sora Status Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to check status' },
            { status: 500 }
        );
    }
}
