import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskIds = (body?.taskIds || []) as string[];

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'taskIds is required' }, { status: 400 });
    }

    const { data: taskRows, error: taskError } = await supabase
      .from('sora_tasks')
      .select('*')
      .in('id', taskIds);

    if (taskError || !taskRows) {
      return NextResponse.json({ error: taskError?.message || 'Tasks not found' }, { status: 404 });
    }

    const kaponai = new KaponaiService();

    const results = await Promise.all(taskRows.map(async (task: any) => {
      const isFinal = task.status === 'completed' || task.status === 'failed';
      let statusRes: any = null;

      if (!isFinal) {
        try {
          statusRes = await kaponai.getVideoStatus(task.id);
        } catch (error: any) {
          return {
            id: task.id,
            status: task.status,
            progress: task.progress ?? 0,
            kaponaiUrl: task.kaponai_url || null,
            r2Url: task.r2_url || null,
            videoUrl: task.r2_url || task.kaponai_url || null,
            error: error.message || 'Status fetch failed',
          };
        }
      }

      const resolvedStatus = normalizeStatus(statusRes?.status || task.status);
      const resolvedProgress = resolvedStatus === 'completed' ? 100 : (statusRes?.progress ?? task.progress ?? 0);
      const resolvedKaponaiUrl = statusRes?.video_url || task.kaponai_url || null;
      let resolvedR2Url = task.r2_url || null;
      let resolvedVideoUrl = resolvedR2Url || resolvedKaponaiUrl || null;

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
          await supabase.from('sora_tasks').update(updates).eq('id', task.id);
        }
      }

      if (
        resolvedStatus === 'completed' &&
        !resolvedR2Url &&
        resolvedKaponaiUrl &&
        task.type === 'shot_generation'
      ) {
        try {
          const vidRes = await fetch(resolvedKaponaiUrl);
          if (!vidRes.ok) throw new Error('Failed to download video from Kaponai');
          const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
          const filename = `sora_${task.id}_${Date.now()}.mp4`;
          const baseFolder = task.shot_id ? `shots/${task.shot_id}` : `scenes/${task.scene_id || 'unknown'}`;
          const key = `${task.user_id}/${baseFolder}/${filename}`;
          resolvedR2Url = await uploadBufferToR2({
            buffer: vidBuffer,
            key,
            contentType: 'video/mp4'
          });
          resolvedVideoUrl = resolvedR2Url;
          await supabase.from('sora_tasks').update({ r2_url: resolvedR2Url }).eq('id', task.id);

          if (task.shot_id) {
            const { data: shotData } = await supabase
              .from('shots')
              .select('metadata')
              .eq('id', task.shot_id)
              .single();
            await supabase.from('shots').update({
              video_clip: resolvedR2Url,
              status: 'done',
              metadata: {
                ...(shotData?.metadata || {}),
                soraTaskId: task.id,
                soraVideoUrl: resolvedR2Url
              }
            }).eq('id', task.shot_id);
          }
        } catch (uploadErr: any) {
          console.error(`[SoraStatusBatch] R2 upload failed for task ${task.id}:`, uploadErr);
        }
      }

      return {
        id: task.id,
        status: resolvedStatus,
        progress: resolvedProgress,
        videoUrl: resolvedVideoUrl,
        kaponaiUrl: resolvedKaponaiUrl,
        r2Url: resolvedR2Url,
        error: statusRes?.error,
      };
    }));

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('[SoraStatusBatch] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
