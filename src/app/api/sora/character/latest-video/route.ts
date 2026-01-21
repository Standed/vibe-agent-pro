import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';

export const maxDuration = 60;
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) {
    return whitelistCheck.error;
  }

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

    const checkActive = searchParams.get('checkActive') === 'true';

    let query = supabase
      .from('sora_tasks')
      .select('id,status,kaponai_url,r2_url,updated_at,user_id')
      .eq('character_id', characterId)
      .eq('type', 'character_reference');

    if (checkActive) {
      // 只查询真正活跃的任务（排除 completed 和 failed）
      query = query.in('status', ['queued', 'processing', 'generating', 'registering', 'in_progress']);
    } else {
      query = query.eq('status', 'completed');
    }

    const { data: task, error: taskError } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (taskError || !task) {
      // 如果是 checkActive 模式且没有活跃任务，返回空结果而不是错误
      if (checkActive) {
        return NextResponse.json({ success: false, reason: 'no_active_task' });
      }
      return NextResponse.json({ success: false, reason: 'no_completed_task' });
    }

    let videoUrl = task.r2_url || task.kaponai_url;
    if (!videoUrl) {
      return NextResponse.json({ success: false, reason: 'video_url_missing' });
    }

    // 纯读取模式：不做任何副作用操作（R2 上传和角色注册应由其他 API 完成）
    // 这确保 GET 请求是幂等且快速的
    const existingMetadata = character?.metadata || {};
    const existingIdentity = existingMetadata.soraIdentity || {};
    const existingUsername = (existingIdentity.username || '').trim();

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
