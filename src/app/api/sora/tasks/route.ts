import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ViduTaskManager } from '@/services/ViduTaskManager';

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
        const includePending = searchParams.get('includePending') === '1';

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

        // 查询 sora_tasks（按需过滤，减少数据量）
        let tasksQuery = supabase
            .from('sora_tasks')
            .select('id, provider, model, prompt, status, type, shot_id, shot_ids, r2_url, kaponai_url, generation_params, created_at, updated_at')
            .eq('project_id', projectId);

        if (!includePending) {
            tasksQuery = tasksQuery.eq('status', 'completed');
        }

        if (shotId) {
            tasksQuery = tasksQuery.or(`shot_id.eq.${shotId},shot_ids.cs.{${shotId}}`);
        }

        const { data: tasks, error: tasksError } = await tasksQuery
            .order('created_at', { ascending: false });

        if (tasksError) {
            console.error('[API sora/tasks] Error fetching tasks:', tasksError);
            return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
        }

        // 如果指定了 shotId，上面已在 SQL 侧过滤
        let filteredTasks = tasks || [];

        // 兜底：当 includePending=1 时，尝试刷新少量 Vidu 待处理任务
        if (includePending) {
            const pendingVidu = filteredTasks
                .filter((task: any) => {
                    const isVidu = task.provider === 'vidu' || (task.model && String(task.model).includes('vidu'));
                    return isVidu && (task.status === 'queued' || task.status === 'processing');
                })
                .slice(0, 5);

            const completedMissingR2 = filteredTasks
                .filter((task: any) => {
                    const isVidu = task.provider === 'vidu' || (task.model && String(task.model).includes('vidu'));
                    return isVidu && task.status === 'completed' && !task.r2_url && task.kaponai_url;
                })
                .slice(0, 5);

            const needRefresh = [...pendingVidu, ...completedMissingR2];

            if (needRefresh.length > 0) {
                await Promise.allSettled(
                    needRefresh.map((task: any) => ViduTaskManager.checkAndUpdateTask(task.id))
                );

                const { data: refreshed, error: refreshError } = await supabase
                    .from('sora_tasks')
                    .select('id, provider, model, prompt, status, type, shot_id, shot_ids, r2_url, kaponai_url, generation_params, created_at, updated_at')
                    .in('id', needRefresh.map((t: any) => t.id));

                if (!refreshError && refreshed?.length) {
                    const refreshedMap = new Map(refreshed.map((t: any) => [t.id, t]));
                    filteredTasks = filteredTasks.map((t: any) => refreshedMap.get(t.id) || t);
                }
            }
        }

        // 只返回有视频 URL 的任务
        filteredTasks = filteredTasks.filter((task: any) =>
            task.r2_url || task.kaponai_url
        );

        // 转换为前端格式
        // 转换为前端格式
        const videoMessages = filteredTasks.map((task: any) => {
            const isVidu = task.provider === 'vidu' || (task.model && task.model.includes('vidu'));
            const modelName = isVidu ? 'Vidu' : 'Sora';

            return {
                id: `sora_task_${task.id}`,
                role: 'assistant',
                content: `${modelName} 视频生成完成`,
                timestamp: task.updated_at || task.created_at,
                videoUrl: task.r2_url || task.kaponai_url,
                shotId: shotId || task.shot_id,
                metadata: {
                    type: 'sora_video_complete',
                    videoUrl: task.r2_url || task.kaponai_url,
                    taskId: task.id,
                    model: task.model || (isVidu ? 'vidu-video' : 'sora-2'),
                    provider: task.provider || (isVidu ? 'vidu' : 'sora'),
                    mode: task.generation_params?.mode,
                    prompt: task.prompt || '',
                    source: task.type === 'shot_generation' ? 'agent' : 'pro'
                }
            };
        });

        return NextResponse.json({ videoMessages });
    } catch (error) {
        console.error('[API sora/tasks] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
