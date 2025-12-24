import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';

export const maxDuration = 60;
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeStatus = (status?: string) => {
  if (!status) return 'processing';
  if (status === 'running' || status === 'generating') return 'processing';
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
    return status;
  }
  return status;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const { data: taskData, error: taskError } = await supabase
      .from('sora_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !taskData) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = taskData as any;
    const kaponai = new KaponaiService();
    const isFinal = task.status === 'completed' || task.status === 'failed';
    let statusRes: any = null;

    if (!isFinal) {
      try {
        await kaponai.assertReachable();
      } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
      }
      statusRes = await kaponai.getVideoStatus(taskId);
    }

    const resolvedStatus = normalizeStatus(statusRes?.status || task.status);
    const resolvedProgress = resolvedStatus === 'completed' ? 100 : (statusRes?.progress ?? task.progress ?? 0);
    const resolvedKaponaiUrl = statusRes?.video_url || task.kaponai_url || null;
    const resolvedR2Url = task.r2_url || null;
    const resolvedVideoUrl = resolvedR2Url || resolvedKaponaiUrl || null;

    if (statusRes) {
      const shouldUpdate =
        resolvedStatus !== task.status ||
        statusRes.progress !== task.progress ||
        (statusRes.video_url && statusRes.video_url !== task.kaponai_url);

      if (shouldUpdate) {
        const updates: any = {
          status: resolvedStatus,
          progress: statusRes.progress,
          updated_at: new Date().toISOString(),
        };
        if (statusRes.video_url) updates.kaponai_url = statusRes.video_url;
        await supabase.from('sora_tasks').update(updates).eq('id', taskId);
      }
    }

    return NextResponse.json({
      status: resolvedStatus,
      progress: resolvedProgress,
      videoUrl: resolvedVideoUrl,
      kaponaiUrl: resolvedKaponaiUrl,
      r2Url: resolvedR2Url,
      error: statusRes?.error,
    });
  } catch (error: any) {
    console.error('[SoraStatus] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
