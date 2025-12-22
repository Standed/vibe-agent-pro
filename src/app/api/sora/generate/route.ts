import { NextRequest, NextResponse } from 'next/server';
import { RunningHubService } from '@/services/RunningHubService';
import { SoraParams } from '@/types/runninghub';

export async function POST(req: NextRequest) {
    try {
        const { prompt, params } = await req.json();

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const service = new RunningHubService();
        const result = await service.submitTask(prompt, params as SoraParams);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Sora Generate Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate video' },
            { status: 500 }
        );
    }
}
