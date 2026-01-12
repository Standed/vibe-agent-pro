import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
    try {
        const authResult = await authenticateRequest(request);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const shotId = searchParams.get('shotId');

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        // 验证用户有权访问该项目
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', user.id)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 403 });
        }

        // 查询 sora_tasks
        const { data: tasks, error: tasksError } = await supabase
            .from('sora_tasks')
            .select('*')
            .eq('project_id', projectId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });

        if (tasksError) {
            console.error('[API sora/tasks] Error fetching tasks:', tasksError);
            return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
        }

        // 如果指定了 shotId，过滤出与该分镜相关的任务
        let filteredTasks = tasks || [];
        if (shotId) {
            filteredTasks = filteredTasks.filter((task: any) =>
                task.shot_id === shotId ||
                (task.shot_ids && task.shot_ids.includes(shotId))
            );
        }

        // 只返回有视频 URL 的任务
        filteredTasks = filteredTasks.filter((task: any) =>
            task.r2_url || task.kaponai_url
        );

        // 转换为前端格式
        const videoMessages = filteredTasks.map((task: any) => ({
            id: `sora_task_${task.id}`,
            role: 'assistant',
            content: task.type === 'shot_generation' ? 'Agent 生成 Sora 视频完成' : 'Sora 视频生成完成',
            timestamp: task.updated_at || task.created_at,
            videoUrl: task.r2_url || task.kaponai_url,
            shotId: shotId || task.shot_id,
            metadata: {
                type: 'sora_video_complete',
                videoUrl: task.r2_url || task.kaponai_url,
                taskId: task.id,
                model: task.model || 'sora-2',
                prompt: task.prompt || '',
                source: task.type === 'shot_generation' ? 'agent' : 'pro'
            }
        }));

        return NextResponse.json({ videoMessages });
    } catch (error) {
        console.error('[API sora/tasks] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
