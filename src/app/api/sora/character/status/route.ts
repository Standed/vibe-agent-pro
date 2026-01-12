
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';
import { characterConsistencyService } from '@/services/CharacterConsistencyService';
import { SoraTask, Character } from '@/types/project';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';

export const maxDuration = 60;
export const runtime = 'nodejs';

// Initialize Supabase Client (Server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeSoraStatus = (status?: string) => {
    if (!status) return 'processing';
    if (status === 'running' || status === 'in_progress' || status === 'generating') return 'processing';
    if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
        return status;
    }
    return status;
};

export async function GET(req: NextRequest) {
    try {
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');

        if (!taskId) {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }

        // 1. Fetch Task from DB
        const { data: taskData, error: taskError } = await supabase
            .from('sora_tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (taskError || !taskData) {
            console.warn(`Character task ${taskId} not found in DB, might be ephemeral or wrong ID.`);
            // Optionally fall back to direct Kaponai check if we trust the ID format, but strictly we need DB record for context
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const task = taskData as any;
        if (task.user_id && task.user_id !== user.id) {
            return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
        }
        if (!task.user_id) {
            if (task.character_id) {
                const { data: character } = await supabase
                    .from('characters')
                    .select('id,user_id')
                    .eq('id', task.character_id)
                    .single();
                if (!character || character.user_id !== user.id) {
                    return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
                }
            } else if (task.project_id) {
                const { data: project } = await supabase
                    .from('projects')
                    .select('id,user_id')
                    .eq('id', task.project_id)
                    .single();
                if (!project || project.user_id !== user.id) {
                    return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
            }
        }

        const kaponaiService = new KaponaiService();
        const isFinalState = task.status === 'completed' || task.status === 'failed';
        let kaponaiStatus: any = null;

        if (!isFinalState) {
            try {
                await kaponaiService.assertReachable();
            } catch (error: any) {
                return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
            }
            kaponaiStatus = await kaponaiService.getVideoStatus(taskId);
        }

        let finalUsername: string | undefined = undefined;
        let finalVideoUrl = task.r2_url || task.kaponai_url;

        // 3. Update DB if changed
        const normalizedStatus = normalizeSoraStatus(kaponaiStatus?.status);
        if (kaponaiStatus && (normalizedStatus !== task.status || kaponaiStatus.progress !== task.progress)) {
            const updates: Partial<SoraTask> = {
                status: normalizedStatus as any,
                progress: kaponaiStatus.progress,
                updatedAt: new Date().toISOString() as any
            };

            if (kaponaiStatus.video_url) updates.kaponaiUrl = kaponaiStatus.video_url as any;

            await supabase.from('sora_tasks').update(updates).eq('id', taskId);
            if (!finalVideoUrl && kaponaiStatus.video_url) {
                finalVideoUrl = kaponaiStatus.video_url;
            }
        }

        const resolvedStatus = normalizedStatus || task.status;
        const resolvedProgress = kaponaiStatus?.progress ?? task.progress;
        const normalizedProgress = resolvedStatus === 'completed' ? 100 : resolvedProgress;

        if (resolvedStatus === 'completed' && task.character_id) {
            const { data: charData } = await supabase.from('characters').select('metadata').eq('id', task.character_id).single();
            const existingUsername = charData?.metadata?.soraIdentity?.username?.trim();
            if (existingUsername) {
                finalUsername = existingUsername;
            } else if (task.type === 'character_reference') {
                try {
                    if (!finalVideoUrl) {
                        try {
                            await kaponaiService.assertReachable();
                        } catch (error: any) {
                            return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
                        }
                        const latestStatus = await kaponaiService.getVideoStatus(taskId);
                        if (latestStatus.video_url) {
                            finalVideoUrl = latestStatus.video_url;
                            await supabase.from('sora_tasks').update({
                                kaponai_url: latestStatus.video_url,
                                updated_at: new Date().toISOString()
                            }).eq('id', taskId);
                        }
                    }

                    if (finalVideoUrl && !task.r2_url) {
                        const vidRes = await fetch(finalVideoUrl);
                        if (vidRes.ok) {
                            const buffer = Buffer.from(await vidRes.arrayBuffer());
                            const filename = `sora_ref_${task.character_id}_${Date.now()}.mp4`;
                            const key = `${task.user_id}/characters/${task.character_id}/${filename}`;
                            const r2Url = await uploadBufferToR2({
                                buffer,
                                key,
                                contentType: 'video/mp4'
                            });
                            finalVideoUrl = r2Url;
                            await supabase.from('sora_tasks').update({
                                r2_url: r2Url,
                                updated_at: new Date().toISOString()
                            }).eq('id', taskId);
                        }
                    }

                    if (finalVideoUrl) {
                        console.log('[AutoRegister] Triggering registration for task', taskId);
                        const regResult = await kaponaiService.createCharacter({
                            url: finalVideoUrl,
                            timestamps: '1,3'
                        });

                        if (regResult.username) {
                            finalUsername = regResult.username;
                            await supabase.from('characters').update({
                                metadata: {
                                    ...charData?.metadata,
                                    soraIdentity: {
                                        username: regResult.username,
                                        referenceVideoUrl: finalVideoUrl,
                                        status: 'registered',
                                        taskId: taskId
                                    },
                                    soraReferenceVideoUrl: finalVideoUrl
                                }
                            }).eq('id', task.character_id);
                        }
                    }
                } catch (err) {
                    console.error('[AutoRegister] Failed:', err);
                    if (task.character_id && finalVideoUrl) {
                        await supabase.from('characters').update({
                            metadata: {
                                ...charData?.metadata,
                                soraIdentity: {
                                    username: '',
                                    referenceVideoUrl: finalVideoUrl,
                                    status: 'failed',
                                    taskId: taskId
                                },
                                soraReferenceVideoUrl: finalVideoUrl
                            }
                        }).eq('id', task.character_id);
                    }
                }
            }
        }

        const responseStatus =
            resolvedStatus === 'completed' && !finalUsername && task.type === 'character_reference'
                ? 'registering'
                : resolvedStatus;

        return NextResponse.json({
            status: responseStatus,
            progress: normalizedProgress,
            videoUrl: finalVideoUrl,
            username: finalUsername
        });
    } catch (error: any) {
        console.error('Character Status API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
