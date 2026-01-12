import { NextRequest, NextResponse } from 'next/server';
import { KaponaiService } from '@/services/KaponaiService';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkCredits, checkWhitelist, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/sora/generate
 * 创建 Sora 视频生成任务
 * 
 * Body:
 * - prompt: string - 视频提示词
 * - model?: 'sora-2' | 'sora-2-pro' - 模型选择，默认 sora-2
 * - seconds?: number - 视频时长（10 或 15），默认 10
 * - size?: string - 分辨率，如 '1280x720' 或 '720x1280'
 * - input_reference?: string[] - 参考图URL数组（可选）
 * - projectId?: string - 项目ID（可选）
 * - userId?: string - 用户ID（可选）
 */
export async function POST(req: NextRequest) {
    try {
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const requiredCredits = calculateCredits('VOLCANO_VIDEO', user.role);
        const operationDesc = getOperationDescription('VOLCANO_VIDEO');

        const body = await req.json();
        const {
            prompt,
            model = 'sora-2',
            seconds = 10,
            size = '1280x720',
            input_reference,
            projectId,
        } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const creditsCheck = checkCredits(user, requiredCredits);
        if ('error' in creditsCheck) return creditsCheck.error;

        const kaponai = new KaponaiService();

        // 构建Kaponai参数
        const params: any = {
            model,
            prompt,
            seconds,
            size,
        };

        // 如果有参考图URL数组，添加到参数
        if (input_reference && Array.isArray(input_reference) && input_reference.length > 0) {
            params.input_reference = input_reference;
        }

        if (projectId) {
            const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('id,user_id')
                .eq('id', projectId)
                .single();

            if (projectError || !project || project.user_id !== user.id) {
                return NextResponse.json({ error: 'Unauthorized project access' }, { status: 403 });
            }
        }

        const result = await kaponai.createVideo(params);

        // 保存任务到数据库
        const soraTask = {
            id: result.id,
            user_id: user.id,
            project_id: projectId || null,
            status: result.status || 'queued',
            progress: result.progress ?? 0,
            model: model,
            prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
            target_duration: seconds,
            target_size: size,
            kaponai_url: result.video_url || null,
            type: 'direct_generation',
            point_cost: requiredCredits,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { error: saveError } = await supabase
            .from('sora_tasks')
            .upsert(soraTask, { onConflict: 'id' });

        if (saveError) {
            console.warn('Failed to save sora task to database:', saveError);
            // 不阻断流程，任务已提交成功
        }

        try {
            const consumeResult = await consumeCredits(
                user.id,
                requiredCredits,
                'sora-generate',
                operationDesc
            );
            if (!consumeResult.success) {
                console.error('[SoraGenerate] Credits consume failed:', consumeResult.error);
            }
        } catch (consumeError) {
            console.error('[SoraGenerate] Credits consume exception:', consumeError);
        }

        return NextResponse.json({
            success: true,
            taskId: result.id,
            status: result.status,
            message: '视频任务已提交'
        });
    } catch (error: any) {
        console.error('Sora Generate Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate video' },
            { status: 500 }
        );
    }
}
