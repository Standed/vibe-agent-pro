import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';
import { transferVideoToR2 } from '@/lib/video-transfer';
import { assetLogService } from '@/lib/assetLogService';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if ('error' in authResult) return authResult.error;
  if (authResult.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const taskIds = Array.isArray(body?.taskIds) ? body.taskIds : [];
    const projectId = body?.projectId as string | undefined;
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
    const dryRun = Boolean(body?.dryRun);

    const providerFilter = body?.provider as string | undefined;
    const includeProviders = Array.isArray(body?.providers) ? body.providers : null;

    let query = supabase
      .from('sora_tasks')
      .select('*')
      .eq('type', 'direct_generation')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (providerFilter) {
      query = query.eq('provider', providerFilter);
    } else if (includeProviders && includeProviders.length > 0) {
      query = query.in('provider', includeProviders);
    }

    if (taskIds.length > 0) {
      query = query.in('id', taskIds);
    } else if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: tasks, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to query tasks' }, { status: 500 });
    }
    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ success: true, processed: 0, updatedHistory: 0, insertedChat: 0, transferred: 0, skipped: 0 });
    }

    let updatedHistory = 0;
    let insertedChat = 0;
    let transferred = 0;
    let skipped = 0;
    const errors: Array<{ taskId: string; error: string }> = [];

    for (const task of tasks as any[]) {
      const targetShotIds = Array.isArray(task.shot_ids) && task.shot_ids.length > 0
        ? task.shot_ids
        : (task.shot_id ? [task.shot_id] : []);

      if (targetShotIds.length === 0) {
        skipped++;
        continue;
      }

      let finalVideoUrl = task.r2_url || task.kaponai_url || null;
      if (!task.r2_url && task.kaponai_url && !dryRun) {
        try {
          const { r2Url } = await transferVideoToR2({
            providerUrl: task.kaponai_url,
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
          finalVideoUrl = r2Url;
          transferred++;
          await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);
        } catch (err: any) {
          await supabase.from('sora_tasks').update({
            error_message: `R2 transfer failed: ${err?.message || 'unknown'}`
          }).eq('id', task.id);
          await assetLogService.logComplete({
            userId: task.user_id,
            operationType: task.provider === 'vidu' ? 'vidu_video' : 'sora_video',
            originalUrl: task.kaponai_url,
            status: 'FAILED',
            metadata: {
              taskId: task.id,
              provider: task.provider,
              model: task.model,
              context: 'admin_fix_direct_transfer',
              error: err?.message || 'unknown'
            }
          });
          errors.push({ taskId: task.id, error: err?.message || 'R2 transfer failed' });
        }
      }

      if (!finalVideoUrl) {
        skipped++;
        continue;
      }

      const { data: shotsData } = await supabase
        .from('shots')
        .select('id, generation_history')
        .in('id', targetShotIds);

      if (shotsData && shotsData.length > 0) {
        for (const shotData of shotsData as any[]) {
          const currentHistory = shotData.generation_history || [];
          const alreadyExists = currentHistory.some((item: any) => item?.parameters?.taskId === task.id);
          if (!alreadyExists) {
            updatedHistory++;
            if (!dryRun) {
              const newHistoryItem = {
                id: `sora_${task.id}_${Date.now()}`,
                type: 'video',
                timestamp: new Date().toISOString(),
                result: finalVideoUrl,
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
              const updatedHistoryList = [newHistoryItem, ...currentHistory];
              await supabase.from('shots').update({
                generation_history: updatedHistoryList
              }).eq('id', shotData.id);
            }
          }
        }
      }

      if (task.project_id && !dryRun) {
        const baseChatMessage = {
          user_id: task.user_id,
          project_id: task.project_id,
          role: 'assistant',
          content: 'Sora 视频生成完成！',
          metadata: {
            type: 'sora_video_complete',
            videoUrl: finalVideoUrl,
            taskId: task.id,
            model: task.model || task.provider || 'sora-2',
            provider: task.provider || 'sora',
            mode: task.generation_params?.mode,
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
            insertedChat++;
          }
        } else if (task.scene_id) {
          await supabase.from('chat_messages').upsert({
            id: `sora_complete_${task.id}_scene`,
            ...baseChatMessage,
            scope: 'scene',
            scene_id: task.scene_id,
            shot_id: null
          }, { onConflict: 'id' });
          insertedChat++;
        } else {
          await supabase.from('chat_messages').upsert({
            id: `sora_complete_${task.id}_project`,
            ...baseChatMessage,
            scope: 'project',
            scene_id: null,
            shot_id: null
          }, { onConflict: 'id' });
          insertedChat++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: tasks.length,
      updatedHistory,
      insertedChat,
      transferred,
      skipped,
      errors
    });
  } catch (err: any) {
    console.error('[Admin] Fix direct generation history failed:', err);
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
