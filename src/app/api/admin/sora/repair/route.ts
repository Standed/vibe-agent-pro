import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';

export const maxDuration = 120;
export const runtime = 'nodejs';

const normalizeStatus = (status?: string) => {
  if (!status) return 'processing';
  if (status === 'running' || status === 'generating') return 'processing';
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
    return status;
  }
  return status;
};

export async function POST(req: Request) {
  const authResult = await authenticateRequest(req as any);
  if ('error' in authResult) {
    return authResult.error;
  }
  if (authResult.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Initialize Supabase client inside the function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) || 20;
    const safeLimit = Math.min(Math.max(limit, 1), 60);
    const concurrency = Math.min(Math.max(Number(body?.concurrency) || 3, 1), 6);
    const typeFilter = body?.type || 'all';
    const allowedTypes = new Set(['character_reference', 'shot_generation', 'all']);
    const normalizedType = allowedTypes.has(typeFilter) ? typeFilter : 'all';
    const statusFilter = Array.isArray(body?.statuses) && body.statuses.length > 0
      ? body.statuses
      : ['queued', 'processing', 'completed'];

    let query = supabase
      .from('sora_tasks')
      .select('*')
      .in('status', statusFilter)
      .order('created_at', { ascending: true })
      .limit(safeLimit);

    if (normalizedType !== 'all') {
      query = query.eq('type', normalizedType);
    }

    const { data: tasks, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const kaponaiService = new KaponaiService();
    const taskList = tasks || [];
    if (taskList.length === 0) {
      return NextResponse.json({ success: true, processed: 0, details: [] });
    }
    try {
      await kaponaiService.assertReachable();
    } catch (error: any) {
      return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
    }

    const runWithConcurrency = async <T, R>(
      items: T[],
      limitCount: number,
      iterator: (item: T, index: number) => Promise<R>
    ): Promise<R[]> => {
      if (items.length === 0) return [];
      const realLimit = Math.max(1, limitCount);
      const results: R[] = new Array(items.length);
      let cursor = 0;

      const worker = async () => {
        while (true) {
          const current = cursor;
          if (current >= items.length) break;
          cursor++;
          results[current] = await iterator(items[current], current);
        }
      };

      const workers = Array(Math.min(realLimit, items.length)).fill(null).map(() => worker());
      await Promise.all(workers);
      return results;
    };

    const results = await runWithConcurrency(taskList, concurrency, async (task) => {
      const taskId = task.id as string;
      try {
        const statusRes = await kaponaiService.getVideoStatus(taskId);
        const normalizedStatus = normalizeStatus(statusRes.status);

        const updates: any = {
          status: normalizedStatus,
          progress: statusRes.progress,
          updated_at: new Date().toISOString()
        };
        if (statusRes.video_url) updates.kaponai_url = statusRes.video_url;
        await supabase.from('sora_tasks').update(updates).eq('id', taskId);

        if (normalizedStatus !== 'completed') {
          return { id: taskId, status: normalizedStatus };
        }

        if (task.type === 'shot_generation') {
          let finalVideoUrl = task.r2_url || statusRes.video_url || task.kaponai_url;
          if (!finalVideoUrl) {
            return { id: taskId, status: 'completed', error: 'missing_video_url' };
          }

          if (!task.r2_url) {
            try {
              const vidRes = await fetch(finalVideoUrl);
              if (!vidRes.ok) throw new Error('Failed to download video');
              const filename = `sora_${task.id}_${Date.now()}.mp4`;
              const baseFolder = task.shot_id ? `shots/${task.shot_id}` : `scenes/${task.scene_id || 'unknown'}`;
              const key = `${task.user_id}/${baseFolder}/${filename}`;
              const r2Url = await uploadBufferToR2({
                buffer: Buffer.from(await vidRes.arrayBuffer()),
                key,
                contentType: 'video/mp4'
              });
              finalVideoUrl = r2Url;
              await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', taskId);
            } catch (uploadErr: any) {
              return { id: taskId, status: 'completed', error: `r2_upload_failed: ${uploadErr.message}` };
            }
          }

          const shotIds = new Set<string>();
          if (task.shot_id) shotIds.add(task.shot_id);
          if (Array.isArray(task.shot_ids)) {
            task.shot_ids.forEach((id: string) => shotIds.add(id));
          }

          if (shotIds.size === 0) {
            return { id: taskId, status: 'completed', warning: 'missing_shot_ids' };
          }

          const ranges = Array.isArray(task.shot_ranges) ? task.shot_ranges : [];
          for (const shotId of shotIds) {
            const range = ranges.find((r: any) => r?.shotId === shotId);
            const { data: shotData } = await supabase
              .from('shots')
              .select('metadata')
              .eq('id', shotId)
              .single();

            await supabase.from('shots').update({
              video_clip: finalVideoUrl,
              status: 'done',
              metadata: {
                ...(shotData?.metadata || {}),
                soraTaskId: task.id,
                soraVideoUrl: finalVideoUrl,
                ...(range ? { soraShotRange: { start: range.start, end: range.end } } : {})
              }
            }).eq('id', shotId);
          }

          return { id: taskId, status: 'completed', updatedShots: shotIds.size };
        }

        if (!task.character_id) {
          return { id: taskId, status: 'completed', warning: 'missing_character_id' };
        }

        const { data: charData } = await supabase
          .from('characters')
          .select('metadata')
          .eq('id', task.character_id)
          .single();

        if (charData?.metadata?.soraIdentity?.username) {
          return { id: taskId, status: 'completed', username: charData.metadata.soraIdentity.username };
        }

        let finalVideoUrl = task.r2_url || statusRes.video_url;
        if (!finalVideoUrl) {
          return { id: taskId, status: 'completed', error: 'missing_video_url' };
        }

        if (!task.r2_url) {
          try {
            const vidRes = await fetch(finalVideoUrl);
            if (!vidRes.ok) throw new Error('Failed to download video');
            const filename = `sora_ref_${task.character_id}_${Date.now()}.mp4`;
            const key = `${task.user_id}/characters/${task.character_id}/${filename}`;
            const r2Url = await uploadBufferToR2({
              buffer: Buffer.from(await vidRes.arrayBuffer()),
              key,
              contentType: 'video/mp4'
            });
            finalVideoUrl = r2Url;
            await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', taskId);
          } catch (uploadErr: any) {
            return { id: taskId, status: 'completed', error: `r2_upload_failed: ${uploadErr.message}` };
          }
        }

        const regResult = await kaponaiService.createCharacter({ url: finalVideoUrl, timestamps: '1,3' });
        if (regResult.username) {
          await supabase.from('characters').update({
            metadata: {
              ...charData?.metadata,
              soraIdentity: {
                username: regResult.username,
                referenceVideoUrl: finalVideoUrl,
                status: 'registered'
              },
              soraReferenceVideoUrl: finalVideoUrl
            }
          }).eq('id', task.character_id);
        }

        return { id: taskId, status: 'completed', username: regResult.username };
      } catch (taskErr: any) {
        return { id: taskId, error: taskErr.message };
      }
    });

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results
    });
  } catch (error: any) {
    console.error('[Repair] Error:', error);
    return NextResponse.json({ error: error.message || 'Repair failed' }, { status: 500 });
  }
}
