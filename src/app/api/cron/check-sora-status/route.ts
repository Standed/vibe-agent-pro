import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { SoraTask } from '@/types/project';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';

// Initialize Supabase Client (Server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 1 minute timeout
export const runtime = 'nodejs';

const normalizeStatus = (status?: string) => {
    if (!status) return 'processing';
    if (status === 'running' || status === 'generating') return 'processing';
    if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
        return status;
    }
    return status;
};

export async function GET(req: Request) {
    // Optional: Add a shared secret check to prevent unauthorized calls
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting Sora status batch poll...');

        const batchLimit = Math.min(Math.max(Number(process.env.SORA_CRON_BATCH_SIZE) || 10, 1), 50);

        // 1. Fetch all 'queued' or 'generating' or 'processing' tasks
        const { data: tasks, error: dbError } = await supabase
            .from('sora_tasks')
            .select('*')
            .in('status', ['queued', 'generating', 'processing'])
            .order('created_at', { ascending: true })
            .limit(batchLimit); // Limit batch size

        if (dbError) throw dbError;
        if (!tasks || tasks.length === 0) {
            return NextResponse.json({ message: 'No pending tasks found.' });
        }

        console.log(`[Cron] Found ${tasks.length} pending tasks.`);
        const kaponaiService = new KaponaiService();
        try {
            await kaponaiService.assertReachable();
        } catch (error: any) {
            return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
        }
        const results = [];
        const touchedScenes = new Set<string>();

        // 2. Poll each task
        for (const taskRecord of tasks) {
            const task = taskRecord as any;
            try {
                const statusRes = await kaponaiService.getVideoStatus(task.id);
                const normalizedStatus = normalizeStatus(statusRes.status);

                // If status changed, update DB
                if (normalizedStatus !== task.status || statusRes.progress !== task.progress) {
                    const updates: any = {
                        status: normalizedStatus,
                        progress: statusRes.progress,
                        updated_at: new Date().toISOString()
                    };
                    if (statusRes.video_url) updates.kaponai_url = statusRes.video_url; // snake_case for DB

                    await supabase.from('sora_tasks').update(updates).eq('id', task.id);
                    results.push({ id: task.id, status: normalizedStatus, updated: true });
                    if (task.scene_id) touchedScenes.add(task.scene_id);

                    // 3. Auto-register if completed character reference
                    if (normalizedStatus === 'completed' && task.type === 'character_reference' && task.character_id && statusRes.video_url) {
                        try {
                            console.log(`[Cron] Task ${task.id} completed. Starting R2 upload...`);

                            // A. Download video
                            const vidRes = await fetch(statusRes.video_url);
                            if (!vidRes.ok) throw new Error('Failed to download video from Kaponai');
                            const vidBuffer = Buffer.from(await vidRes.arrayBuffer());

                            // B. Upload to R2 (server-side)
                            const filename = `sora_ref_${task.character_id}_${Date.now()}.mp4`;
                            const key = `${task.user_id}/characters/${task.character_id}/${filename}`;
                            const r2Url = await uploadBufferToR2({
                                buffer: vidBuffer,
                                key,
                                contentType: 'video/mp4'
                            });

                            console.log(`[Cron] Uploaded to R2: ${r2Url}`);

                            // Update Task with R2 URL
                            await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);

                            // C. Register Character using R2 URL
                            const regResult = await kaponaiService.createCharacter({ url: r2Url, timestamps: '1,3' });

                            if (regResult.username) {
                                await supabase.from('characters').update({
                                    metadata: {
                                        soraIdentity: {
                                            username: regResult.username,
                                            referenceVideoUrl: r2Url, // Use R2 URL
                                            status: 'registered'
                                        },
                                        soraReferenceVideoUrl: r2Url
                                    }
                                }).eq('id', task.character_id);
                                console.log(`[Cron] Auto-registered character ${regResult.username} with R2 video`);
                            }
                        } catch (uploadErr) {
                            console.error(`[Cron] Failed to process success logic for task ${task.id}:`, uploadErr);
                        }
                    }

                    if (normalizedStatus === 'completed' && task.type === 'shot_generation') {
                        let finalVideoUrl = task.r2_url || statusRes.video_url || task.kaponai_url;
                        if (!task.r2_url && statusRes.video_url) {
                            try {
                                const vidRes = await fetch(statusRes.video_url);
                                if (!vidRes.ok) throw new Error('Failed to download video from Kaponai');
                                const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
                                const filename = `sora_${task.id}_${Date.now()}.mp4`;
                                const baseFolder = task.shot_id ? `shots/${task.shot_id}` : `scenes/${task.scene_id || 'unknown'}`;
                                const key = `${task.user_id}/${baseFolder}/${filename}`;
                                const r2Url = await uploadBufferToR2({
                                    buffer: vidBuffer,
                                    key,
                                    contentType: 'video/mp4'
                                });
                                finalVideoUrl = r2Url;
                                await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);
                            } catch (uploadErr) {
                                console.error(`[Cron] Shot R2 upload failed for task ${task.id}:`, uploadErr);
                            }
                        }

                        if (task.shot_id && finalVideoUrl) {
                            const { data: shotData } = await supabase
                                .from('shots')
                                .select('metadata')
                                .eq('id', task.shot_id)
                                .single();
                            await supabase.from('shots').update({
                                video_clip: finalVideoUrl,
                                status: 'done',
                                metadata: {
                                    ...(shotData?.metadata || {}),
                                    soraTaskId: task.id,
                                    soraVideoUrl: finalVideoUrl
                                }
                            }).eq('id', task.shot_id);
                        }
                    }
                } else {
                    results.push({ id: task.id, status: normalizedStatus, updated: false });
                    if (task.scene_id) touchedScenes.add(task.scene_id);
                }
            } catch (err: any) {
                console.error(`[Cron] Failed to poll task ${task.id}:`, err);
                results.push({ id: task.id, error: err.message });
            }
        }

        for (const sceneId of touchedScenes) {
            try {
                const { data: sceneTasks } = await supabase
                    .from('sora_tasks')
                    .select('id, status, progress, r2_url, kaponai_url')
                    .eq('scene_id', sceneId);

                if (!sceneTasks || sceneTasks.length === 0) continue;

                const total = sceneTasks.length;
                const completedCount = sceneTasks.filter((t: any) => t.status === 'completed').length;
                const failedCount = sceneTasks.filter((t: any) => t.status === 'failed').length;
                const totalProgress = sceneTasks.reduce(
                    (sum: number, t: any) => sum + (t.status === 'completed' ? 100 : (t.progress || 0)),
                    0
                );
                const progress = Math.round(totalProgress / total);
                const status = failedCount > 0 ? 'failed' : (completedCount === total ? 'success' : 'processing');
                const singleVideo = total === 1 ? (sceneTasks[0].r2_url || sceneTasks[0].kaponai_url) : undefined;

                const { data: sceneData } = await supabase
                    .from('scenes')
                    .select('metadata')
                    .eq('id', sceneId)
                    .single();

                await supabase.from('scenes').update({
                    metadata: {
                        ...(sceneData?.metadata || {}),
                        soraGeneration: {
                            taskId: sceneTasks[0]?.id || '',
                            status,
                            progress,
                            tasks: sceneTasks.map((t: any) => t.id),
                            ...(singleVideo ? { videoUrl: singleVideo } : {})
                        }
                    }
                }).eq('id', sceneId);
            } catch (sceneErr) {
                console.error(`[Cron] Failed to update scene ${sceneId} aggregate:`, sceneErr);
            }
        }

        return NextResponse.json({ success: true, processed: results.length, details: results });

    } catch (error: any) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
