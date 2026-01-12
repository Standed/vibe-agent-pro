
import { NextRequest, NextResponse } from 'next/server';
import { SoraOrchestrator } from '@/services/SoraOrchestrator';
import { Project } from '@/types/project';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
    try {
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const { tool, args, project } = await req.json();

        if (!project) {
            return NextResponse.json(
                { success: false, error: 'Project context is required' },
                { status: 400 }
            );
        }

        if (!project.id) {
            return NextResponse.json({ success: false, error: 'Project id is required' }, { status: 400 });
        }

        const { data: projectRow } = await supabase
            .from('projects')
            .select('id,user_id')
            .eq('id', project.id)
            .single();

        if (!projectRow || projectRow.user_id !== user.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized project access' }, { status: 403 });
        }

        const orchestrator = new SoraOrchestrator();

        // Note: Orchestrator methods might expect full project object. 
        // We assume the payload contains necessary project data.

        let result: any;

        switch (tool) {
            case 'generateSceneVideo':
                const taskIds = await orchestrator.generateSceneVideo(project as Project, args.sceneId, user.id);
                result = {
                    taskIds: taskIds,
                    message: `Sora 视频生成任务已提交，共拆分为 ${taskIds.length} 个子任务`
                };
                break;

            case 'generateShotsVideo':
                const shotTaskIds = await orchestrator.generateShotsVideo(
                    project as Project,
                    args.sceneId,
                    args.shotIds,
                    user.id
                );
                result = {
                    taskIds: shotTaskIds,
                    sceneId: args.sceneId,
                    shotIds: args.shotIds,
                    message: `Sora 分镜视频任务已提交，共拆分为 ${shotTaskIds.length} 个子任务`
                };
                break;

            case 'batchGenerateProjectVideosSora':
                // Progress callback is not supported via simple API call yet (needs SSE or polling)
                // We just trigger it.
                result = await orchestrator.batchGenerateProjectVideos(
                    project as Project,
                    args.force,
                    user.id
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
