import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionCookie, parseJWT, isTokenExpired } from '@/lib/supabase/cookie-utils';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = body?.projectId as string | undefined;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const cookieHeader = req.headers.get('cookie') || '';
    if (!cookieHeader) {
      return NextResponse.json({ error: 'Missing session cookie' }, { status: 401 });
    }
    const session = readSessionCookie(cookieHeader);
    if (!session?.access_token || isTokenExpired(session.access_token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const payload = parseJWT(session.access_token);
    const userId = payload?.sub as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project || project.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized project access' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('sora_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tasks: data || [] });
  } catch (error: any) {
    console.error('[SoraTaskList] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
