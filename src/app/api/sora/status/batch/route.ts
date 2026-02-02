import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { ViduTaskManager } from '@/services/ViduTaskManager';
import { transferVideoToR2 } from '@/lib/video-transfer';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';
import { assetLogService } from '@/lib/assetLogService';

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

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const whitelistCheck = checkWhitelist(user);
    if ('error' in whitelistCheck) return whitelistCheck.error;

    const body = await req.json();
    const taskIds = (body?.taskIds || []) as string[];
    const limit = Number(body?.limit) || 30;
    const safeLimit = Math.min(Math.max(limit, 1), 60);
    const concurrency = Math.min(Math.max(Number(body?.concurrency) || 4, 1), 6);

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'taskIds is required' }, { status: 400 });
    }

    const limitedTaskIds = taskIds.slice(0, safeLimit);
    const { data: taskRows, error: taskError } = await supabase
      .from('sora_tasks')
      .select('*')
      .in('id', limitedTaskIds);

    if (taskError || !taskRows) {
      return NextResponse.json({ error: taskError?.message || 'Tasks not found' }, { status: 404 });
    }

    const projectIdsToCheck = Array.from(new Set(taskRows.filter(t => !t.user_id && t.project_id).map(t => t.project_id)));
    const characterIdsToCheck = Array.from(new Set(taskRows.filter(t => !t.user_id && t.character_id).map(t => t.character_id)));

    const projectMap = new Map<string, any>();
    if (projectIdsToCheck.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id,user_id')
        .in('id', projectIdsToCheck as string[]);
      (projects || []).forEach((p: any) => projectMap.set(p.id, p));
    }

    const characterMap = new Map<string, any>();
    if (characterIdsToCheck.length > 0) {
      const { data: characters } = await supabase
        .from('characters')
        .select('id,user_id')
        .in('id', characterIdsToCheck as string[]);
      (characters || []).forEach((c: any) => characterMap.set(c.id, c));
    }

    const unauthorized = taskRows.filter((task: any) => {
      if (task.user_id) return task.user_id !== user.id;
      if (task.project_id) {
        const project = projectMap.get(task.project_id);
        return !project || project.user_id !== user.id;
      }
      if (task.character_id) {
        const character = characterMap.get(task.character_id);
        return !character || character.user_id !== user.id;
      }
      return true;
    });

    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
    }

    const kaponai = new KaponaiService();
    const hasNonViduTasks = taskRows.some((task: any) => task.provider !== 'vidu' && !(task.model && String(task.model).includes('vidu')));
    if (hasNonViduTasks) {
      try {
        await kaponai.assertReachable();
      } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
      }
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

    const results = await runWithConcurrency(taskRows, concurrency, async (task: any) => {
      const isVidu = task.provider === 'vidu' || (task.model && String(task.model).includes('vidu'));
      if (isVidu) {
        const updatedTask = await ViduTaskManager.checkAndUpdateTask(task.id);
        const resolvedStatus = normalizeStatus(updatedTask?.status || task.status);
        const resolvedProgress = updatedTask?.progress ?? task.progress ?? 0;
        const resolvedKaponaiUrl = updatedTask?.kaponai_url || task.kaponai_url || null;
        const resolvedR2Url = updatedTask?.r2_url || task.r2_url || null;
        const resolvedVideoUrl = resolvedR2Url || resolvedKaponaiUrl || null;

        return {
          id: task.id,
          status: resolvedStatus,
          progress: resolvedProgress,
          videoUrl: resolvedVideoUrl,
          kaponaiUrl: resolvedKaponaiUrl,
          r2Url: resolvedR2Url,
          error: updatedTask?.error_message || null,
        };
      }
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
        (task.type === 'shot_generation' || task.type === 'direct_generation')
      ) {
        try {
          const { r2Url } = await transferVideoToR2({
            providerUrl: resolvedKaponaiUrl,
            task: {
              id: task.id,
              user_id: task.user_id,
              project_id: task.project_id,
              scene_id: task.scene_id,
              shot_id: task.shot_id,
              provider: task.provider,
              model: task.model,
            },
            model: task.provider || task.model || 'sora',
            maxRetries: 4,
          });
          resolvedR2Url = r2Url;
          resolvedVideoUrl = resolvedR2Url;
          await supabase.from('sora_tasks').update({ r2_url: resolvedR2Url }).eq('id', task.id);

          if (task.type === 'shot_generation' && task.shot_id) {
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
          await supabase.from('sora_tasks').update({
            error_message: `R2 transfer failed: ${uploadErr?.message || 'unknown'}`
          }).eq('id', task.id);
          await assetLogService.logComplete({
            userId: task.user_id,
            operationType: 'sora_video',
            originalUrl: resolvedKaponaiUrl,
            status: 'FAILED',
            metadata: {
              taskId: task.id,
              provider: task.provider,
              model: task.model,
              context: 'sora_status_batch_transfer_to_r2',
              error: uploadErr?.message || 'unknown'
            }
          });
        }
      }

      if (resolvedStatus === 'completed' && resolvedVideoUrl && task.type === 'direct_generation') {
        const targetShotIds = task.shot_ids || (task.shot_id ? [task.shot_id] : []);
        if (targetShotIds.length > 0) {
          const { data: shotsData } = await supabase
            .from('shots')
            .select('id, generation_history')
            .in('id', targetShotIds);

          if (shotsData && shotsData.length > 0) {
            for (const shotData of shotsData) {
              const currentHistory = shotData.generation_history || [];
              const alreadyExists = currentHistory.some((item: any) => item?.parameters?.taskId === task.id);
              if (alreadyExists) continue;

              const newHistoryItem = {
                id: `sora_${task.id}_${Date.now()}`,
                type: 'video',
                timestamp: new Date().toISOString(),
                result: resolvedVideoUrl,
                prompt: task.prompt || 'Sora Video Generation',
                parameters: {
                  model: task.model || task.provider || 'sora',
                  taskId: task.id,
                  source: 'pro',
                  isMultiShot: targetShotIds.length > 1,
                  coveredShots: targetShotIds
                },
                status: 'success'
              };

              const updatedHistory = [newHistoryItem, ...currentHistory];

              await supabase.from('shots').update({
                generation_history: updatedHistory
              }).eq('id', shotData.id);
            }
          }
        }

        if (task.project_id) {
          const baseChatMessage = {
            user_id: task.user_id,
            project_id: task.project_id,
            role: 'assistant',
            content: 'Sora 视频生成完成！',
            metadata: {
              type: 'sora_video_complete',
              videoUrl: resolvedVideoUrl,
              taskId: task.id,
              model: task.model || task.provider || 'sora-2',
              prompt: task.prompt || '',
              source: 'pro',
              isMultiShot: targetShotIds.length > 1,
              coveredShots: targetShotIds
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          if (targetShotIds.length > 0) {
            for (const shotId of targetShotIds) {
              await supabase.from('chat_messages').upsert({
                id: `sora_complete_${task.id}_${shotId}`,
                ...baseChatMessage,
                scope: 'shot',
                scene_id: task.scene_id || null,
                shot_id: shotId
              }, { onConflict: 'id' });
            }
          } else if (task.scene_id) {
            await supabase.from('chat_messages').upsert({
              id: `sora_complete_${task.id}_scene`,
              ...baseChatMessage,
              scope: 'scene',
              scene_id: task.scene_id,
              shot_id: null
            }, { onConflict: 'id' });
          } else {
            await supabase.from('chat_messages').upsert({
              id: `sora_complete_${task.id}_project`,
              ...baseChatMessage,
              scope: 'project',
              scene_id: null,
              shot_id: null
            }, { onConflict: 'id' });
          }
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
    });

    return NextResponse.json({
      success: true,
      truncated: taskIds.length > limitedTaskIds.length,
      results
    });
  } catch (error: any) {
    console.error('[SoraStatusBatch] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
