import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
    try {
        // 验证用户身份 (可选，允许匿名反馈)
        const authResult = await authenticateRequest(request);
        const user = 'user' in authResult ? authResult.user : null;

        const body = await request.json();
        const { type, content, context } = body;

        if (!type || !content) {
            return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('error_reports')
            .insert({
                user_id: user?.id || null,
                type,
                content,
                context: {
                    ...context,
                    userAgent: request.headers.get('user-agent'),
                    timestamp: new Date().toISOString(),
                },
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            console.error('[Error Report] 写入失败:', error);
            return NextResponse.json({ error: '提交失败' }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: data.id });
    } catch (err: any) {
        console.error('[Error Report] 接口异常:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * 管理员获取反馈列表
 */
export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabaseAdmin
        .from('error_reports')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
}

/**
 * 管理员更新反馈状态
 */
export async function PATCH(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, status, admin_note } = body;

        if (!id) {
            return NextResponse.json({ error: '缺少 ID' }, { status: 400 });
        }

        const updates: any = {};
        if (status) updates.status = status;
        if (admin_note !== undefined) updates.admin_note = admin_note;

        const { data, error } = await supabaseAdmin
            .from('error_reports')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
