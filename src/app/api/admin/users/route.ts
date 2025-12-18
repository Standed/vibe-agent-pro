import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * 获取用户列表
 */
export async function GET(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
}

/**
 * 更新用户信息 (白名单, 积分, 角色)
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
        const { targetUserId, updates } = body;

        if (!targetUserId || !updates) {
            return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
        }

        // 允许更新的字段
        const allowedUpdates: any = {};
        if (updates.role) allowedUpdates.role = updates.role;
        if (updates.credits !== undefined) allowedUpdates.credits = updates.credits;
        if (updates.is_whitelisted !== undefined) allowedUpdates.is_whitelisted = updates.is_whitelisted;
        if (updates.is_active !== undefined) allowedUpdates.is_active = updates.is_active;

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(allowedUpdates)
            .eq('id', targetUserId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // 记录管理员操作日志
        await supabaseAdmin.from('admin_logs').insert({
            admin_id: user.id,
            action: 'update_user',
            target_id: targetUserId,
            details: { updates: allowedUpdates },
        });

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
