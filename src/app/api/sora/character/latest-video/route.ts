import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';
import { KaponaiService } from '@/services/KaponaiService';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id,metadata')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single();

    if (characterError || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const { data: task, error: taskError } = await supabase
      .from('sora_tasks')
      .select('id,status,kaponai_url,r2_url,updated_at,user_id')
      .eq('character_id', characterId)
      .eq('type', 'character_reference')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ success: false, reason: 'no_completed_task' });
    }

    let videoUrl = task.r2_url || task.kaponai_url;
    if (!videoUrl) {
      return NextResponse.json({ success: false, reason: 'video_url_missing' });
    }

    const existingMetadata = character?.metadata || {};
    const existingIdentity = existingMetadata.soraIdentity || {};
    let existingUsername = (existingIdentity.username || '').trim();

    if (!existingUsername) {
      try {
        if (!task.r2_url && task.kaponai_url) {
          const vidRes = await fetch(task.kaponai_url);
          if (vidRes.ok) {
            const buffer = Buffer.from(await vidRes.arrayBuffer());
            const filename = `sora_ref_${characterId}_${Date.now()}.mp4`;
            const key = `${task.user_id || user.id}/characters/${characterId}/${filename}`;
            const r2Url = await uploadBufferToR2({
              buffer,
              key,
              contentType: 'video/mp4'
            });
            videoUrl = r2Url;
            await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);
          }
        }

        if (videoUrl) {
          const kaponaiService = new KaponaiService();
          const regResult = await kaponaiService.createCharacter({ url: videoUrl, timestamps: '1,3' });
          if (regResult.username) {
            existingUsername = regResult.username;
          }
        }
      } catch (error) {
        console.error('[LatestVideo] Auto register failed:', error);
      }
    }

    const nextIdentity = {
      username: existingUsername,
      referenceVideoUrl: videoUrl,
      status: existingUsername ? 'registered' : 'pending',
      taskId: existingIdentity.taskId || task.id
    };

    await supabase.from('characters').update({
      metadata: {
        ...existingMetadata,
        soraReferenceVideoUrl: videoUrl,
        soraIdentity: nextIdentity
      }
    }).eq('id', characterId);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      status: task.status,
      videoUrl,
      username: existingUsername,
      updatedAt: task.updated_at,
      writeback: true
    });
  } catch (error: any) {
    console.error('[LatestVideo] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load latest video' }, { status: 500 });
  }
}
