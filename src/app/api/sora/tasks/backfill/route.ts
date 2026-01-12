import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type BackfillTask = {
  id: string;
  sceneId?: string;
  shotId?: string;
  type?: 'shot_generation' | 'character_reference';
};

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const whitelistCheck = checkWhitelist(user);
    if ('error' in whitelistCheck) return whitelistCheck.error;

    const body = await req.json();
    const projectId = body?.projectId as string | undefined;
    const tasks = (body?.tasks || []) as BackfillTask[];

    if (!projectId || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'projectId, tasks are required' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized project access' }, { status: 403 });
    }

    const inputById = new Map<string, BackfillTask>();
    tasks.forEach((task) => {
      if (task?.id) inputById.set(task.id, task);
    });

    const taskIds = Array.from(inputById.keys());
    if (taskIds.length === 0) {
      return NextResponse.json({ success: true, inserted: 0, updated: 0 });
    }

    const { data: existingRows } = await supabase
      .from('sora_tasks')
      .select('id, user_id, project_id, scene_id, shot_id, type')
      .in('id', taskIds);

    const existingMap = new Map<string, any>();
    (existingRows || []).forEach((row) => existingMap.set(row.id, row));

    const insertRows = taskIds
      .filter((id) => !existingMap.has(id))
      .map((id) => {
        const input = inputById.get(id);
        return {
          id,
          user_id: user.id,
          project_id: projectId,
          scene_id: input?.sceneId || null,
          shot_id: input?.shotId || null,
          type: input?.type || 'shot_generation',
          status: 'queued',
          progress: 0,
          model: 'sora-2',
          prompt: '',
          target_duration: 0,
          target_size: '',
          point_cost: 0,
          updated_at: new Date().toISOString(),
        };
      });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from('sora_tasks').insert(insertRows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    let updated = 0;
    for (const [id, row] of existingMap.entries()) {
      const input = inputById.get(id);
      const updates: Record<string, any> = {};
      if (!row.user_id) updates.user_id = userId;
      if (!row.project_id) updates.project_id = projectId;
      if (!row.scene_id && input?.sceneId) updates.scene_id = input.sceneId;
      if (!row.shot_id && input?.shotId) updates.shot_id = input.shotId;
      if (!row.type && input?.type) updates.type = input.type;

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('sora_tasks')
          .update(updates)
          .eq('id', id);
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        updated += 1;
      }
    }

    return NextResponse.json({ success: true, inserted: insertRows.length, updated });
  } catch (error: any) {
    console.error('[SoraBackfill] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
