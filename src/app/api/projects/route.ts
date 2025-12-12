import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 使用 Service Role Key（服务端安全，绕过 RLS）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * GET /api/projects?userId=xxx
 * 获取用户的所有项目
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: '缺少 userId 参数' },
        { status: 400 }
      );
    }

    console.log('[API] 📋 获取项目列表, userId:', userId);

    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, title, description, art_style, created_at, updated_at, scene_count, shot_count, metadata')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[API] ❌ 查询失败:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[API] ✅ 查询成功，返回', projects.length, '个项目');
    return NextResponse.json({ data: projects });
  } catch (err) {
    console.error('[API] ❌ 服务器错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * 保存/创建项目
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project, userId } = body;

    if (!project || !userId) {
      return NextResponse.json(
        { error: '缺少 project 或 userId 参数' },
        { status: 400 }
      );
    }

    console.log('[API] 💾 保存项目, id:', project.id, 'title:', project.metadata.title, 'userId:', userId);

    // 保存项目基本信息
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .upsert({
        id: project.id,
        user_id: userId,
        title: project.metadata.title,
        description: project.metadata.description,
        art_style: project.metadata.artStyle,
        settings: project.settings || {},
        metadata: {
          created: project.metadata.created,
          modified: project.metadata.modified,
          script: project.script || '',
          chatHistory: project.chatHistory || [],
          timeline: project.timeline || [],
        },
        scene_count: project.scenes?.length || 0,
        shot_count: project.shots?.length || 0,
      })
      .select();

    if (projectError) {
      console.error('[API] ❌ 保存项目失败:', projectError);
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }

    console.log('[API] ✅ 项目保存成功');
    return NextResponse.json({ success: true, data: projectData });
  } catch (err) {
    console.error('[API] ❌ 服务器错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects?id=xxx&userId=xxx
 * 删除项目
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!projectId || !userId) {
      return NextResponse.json(
        { error: '缺少 id 或 userId 参数' },
        { status: 400 }
      );
    }

    console.log('[API] 🗑️ 删除项目, id:', projectId, 'userId:', userId);

    // Supabase RLS + CASCADE 会自动删除关联的 scenes, shots, characters, audio_assets
    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('[API] ❌ 删除失败:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[API] ✅ 项目删除成功');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API] ❌ 服务器错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
