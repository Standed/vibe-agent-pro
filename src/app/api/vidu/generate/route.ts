import { NextRequest, NextResponse } from 'next/server';
import { ViduService } from '@/services/ViduService';
import { ViduTaskManager } from '@/services/ViduTaskManager';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkCredits, checkWhitelist, consumeCredits } from '@/lib/auth-middleware';
import { calculateViduCredits } from '@/types/vidu';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/vidu/generate
 * 创建 Vidu 视频生成任务
 * 
 * Body:
 * - mode: 'img2video' | 'start-end2video' | 'reference2video' - 生成模式
 * - images: string[] - 图片 URL 数组（根据模式不同，1-7 张）
 * - prompt?: string - 提示词（仅 reference2video 模式需要，但建议都要有）
 * - duration?: number - 视频时长（1-10s、但是首尾帧最多是 8s），默认 5s
 * - resolution?: '720p' | '1080p' - 分辨率，默认 1080p
 * - off_peak?: boolean - 错峰模式，默认 false，使用 true 只需要花费一半积分
 * - projectId?: string - 项目 ID（可选）
 * - shotId?: string - 分镜 ID（可选）
 */
export async function POST(req: NextRequest) {
    try {
        // 认证和白名单检查
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const body = await req.json();
        const {
            mode,
            images,
            prompt,
            duration = 5,
            resolution = '1080p',
            off_peak,
            offPeak,
            projectId,
            shotId,
            sceneId,
            aspect_ratio, // 添加 aspect_ratio
        } = body;

        // 支持两种参数名
        const isOffPeak = off_peak ?? offPeak ?? false;

        // 验证参数
        if (!mode || !['img2video', 'start-end2video', 'reference2video'].includes(mode)) {
            return NextResponse.json(
                { error: 'Invalid mode. Must be img2video, start-end2video, or reference2video' },
                { status: 400 }
            );
        }

        if (!images || !Array.isArray(images) || images.length === 0) {
            return NextResponse.json(
                { error: 'Images array is required' },
                { status: 400 }
            );
        }

        // 验证图片数量
        if (mode === 'img2video' && images.length !== 1) {
            return NextResponse.json(
                { error: 'img2video mode requires exactly 1 image' },
                { status: 400 }
            );
        }

        if (mode === 'start-end2video' && images.length !== 2) {
            return NextResponse.json(
                { error: 'start-end2video mode requires exactly 2 images (start and end)' },
                { status: 400 }
            );
        }

        if (mode === 'reference2video') {
            if (!prompt) {
                return NextResponse.json(
                    { error: 'reference2video mode requires a prompt' },
                    { status: 400 }
                );
            }
            if (images.length < 1 || images.length > 7) {
                return NextResponse.json(
                    { error: 'reference2video mode requires 1-7 reference images' },
                    { status: 400 }
                );
            }
        }

        // 验证 duration 范围
        // 基础范围 1-10s
        if (typeof duration !== 'number' || duration < 1 || duration > 10) {
            return NextResponse.json(
                { error: 'Duration must be a number between 1 and 10 seconds' },
                { status: 400 }
            );
        }
        // 首尾帧模式特殊限制：最大 8s
        if (mode === 'start-end2video' && duration > 8) {
            return NextResponse.json(
                { error: 'Start-End mode duration cannot exceed 8 seconds' },
                { status: 400 }
            );
        }

        // 验证 resolution 枚举
        if (!['720p', '1080p'].includes(resolution)) {
            return NextResponse.json(
                { error: 'Resolution must be either 720p or 1080p' },
                { status: 400 }
            );
        }

        // 计算积分消耗 (支持错峰半价)
        const requiredCredits = calculateViduCredits(duration, resolution as '720p' | '1080p', isOffPeak);
        console.log(`[Vidu] 生成需要 ${requiredCredits} 积分 (${duration}s ${resolution})`);

        // 检查积分余额
        const creditsCheck = checkCredits(user, requiredCredits);
        if ('error' in creditsCheck) return creditsCheck.error;

        // 验证项目和分镜权限
        let resolvedProjectId: string | null = projectId || null;
        let resolvedShotId: string | null = shotId || null;

        if (shotId) {
            const { data: shotData, error: shotError } = await supabase
                .from('shots')
                .select('id, scene_id, scenes(project_id)')
                .eq('id', shotId)
                .single();

            if (shotError || !shotData) {
                return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
            }

            const projectIdFromShot = (shotData.scenes as any)?.project_id;
            if (projectId && projectId !== projectIdFromShot) {
                return NextResponse.json({ error: 'Shot does not belong to project' }, { status: 403 });
            }

            resolvedProjectId = projectIdFromShot;
            resolvedShotId = shotId;
        }

        if (resolvedProjectId) {
            const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('id, user_id')
                .eq('id', resolvedProjectId)
                .single();

            if (projectError || !project || project.user_id !== user.id) {
                return NextResponse.json({ error: 'Unauthorized project access' }, { status: 403 });
            }
        }

        // **前置扣除积分**（在创建任务前）
        try {
            const consumeResult = await consumeCredits(
                user.id,
                requiredCredits,
                'vidu-generate',
                `Vidu ${mode} ${duration}s ${resolution}`
            );
            if (!consumeResult.success) {
                return NextResponse.json(
                    { error: `积分扣除失败: ${consumeResult.error}` },
                    { status: 500 }
                );
            }
        } catch (consumeError: any) {
            console.error('[Vidu] Credits consume error:', consumeError);
            return NextResponse.json(
                { error: `积分扣除异常: ${consumeError.message}` },
                { status: 500 }
            );
        }

        // 创建 Vidu 服务实例
        const viduService = new ViduService();

        // 根据模式调用对应方法
        let result;
        const commonParams = { duration, resolution, off_peak: isOffPeak };

        if (mode === 'img2video') {
            result = await viduService.img2video({
                images: [images[0]],
                ...commonParams
            });
        } else if (mode === 'start-end2video') {
            result = await viduService.startEnd2video({
                images: [images[0], images[1]],
                ...commonParams
            });
        } else if (mode === 'reference2video') {
            result = await viduService.reference2video({
                images,
                prompt,
                aspect_ratio, // 传递比例
                ...commonParams
            });
        }

        if (!result) {
            throw new Error('Failed to create Vidu task');
        }

        // 保存任务到数据库
        try {
            await ViduTaskManager.createTask({
                taskId: result.task_id,
                userId: user.id,
                projectId: resolvedProjectId!,
                sceneId: sceneId || undefined, // 使用请求中的 sceneId
                shotId: resolvedShotId || undefined,
                mode,
                prompt: prompt || '',
                duration,
                resolution: resolution as '720p' | '1080p',
                creditsCost: requiredCredits,
            });
        } catch (taskError: any) {
            console.error('[Vidu] 创建任务记录失败:', taskError);
            // 不阻断流程，任务ID已返回给用户
        }

        return NextResponse.json({
            success: true,
            taskId: result.task_id,
            state: result.state,
            message: 'Vidu 视频任务已提交'
        });

    } catch (error: any) {
        console.error('[Vidu] Generate Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate Vidu video' },
            { status: 500 }
        );
    }
}
