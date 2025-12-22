
import { NextRequest, NextResponse } from 'next/server';
import { SoraOrchestrator } from '@/services/SoraOrchestrator';
import { Project } from '@/types/project';

export async function POST(req: NextRequest) {
    try {
        const { tool, args, project, userId } = await req.json();

        if (!project) {
            return NextResponse.json(
                { success: false, error: 'Project context is required' },
                { status: 400 }
            );
        }

        const orchestrator = new SoraOrchestrator();

        // Note: Orchestrator methods might expect full project object. 
        // We assume the payload contains necessary project data.

        let result: any;

        switch (tool) {
            case 'generateSceneVideo':
                const taskIds = await orchestrator.generateSceneVideo(project as Project, args.sceneId, userId);
                result = {
                    taskIds: taskIds,
                    message: `Sora 视频生成任务已提交，共拆分为 ${taskIds.length} 个子任务`
                };
                break;

            case 'batchGenerateProjectVideosSora':
                // Progress callback is not supported via simple API call yet (needs SSE or polling)
                // We just trigger it.
                result = await orchestrator.batchGenerateProjectVideos(
                    project as Project,
                    args.force,
                    userId
                    // No progress callback for API mode currently
                );
                break;

            default:
                return NextResponse.json(
                    { success: false, error: `Unknown tool: ${tool}` },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            tool,
            result
        });

    } catch (error: any) {
        console.error('Agent Tool Execution Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Tool execution failed' },
            { status: 500 }
        );
    }
}
