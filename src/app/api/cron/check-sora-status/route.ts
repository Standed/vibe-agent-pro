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
                    if (task.scene_id && (task.type === 'shot_generation' || !task.type)) {
                        touchedScenes.add(task.scene_id);
                    }

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

                    if (normalizedStatus === 'completed' && (task.type === 'shot_generation' || task.type === 'direct_generation')) {
                        let finalVideoUrl = task.r2_url || statusRes.video_url || task.kaponai_url;
                        if (!task.r2_url && statusRes.video_url) {
                            try {
                                const vidRes = await fetch(statusRes.video_url);
                                if (!vidRes.ok) throw new Error('Failed to download video from Kaponai');
                                const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
                                const filename = `sora_${task.id}_${Date.now()}.mp4`;

                                let baseFolder = `generated/${task.user_id || 'anonymous'}`;
                                if (task.shot_id) baseFolder = `shots/${task.shot_id}`;
                                else if (task.scene_id) baseFolder = `scenes/${task.scene_id}`;
                                else if (task.project_id) baseFolder = `projects/${task.project_id}`;

                                const key = `${task.user_id}/${baseFolder}/${filename}`;
                                const r2Url = await uploadBufferToR2({
                                    buffer: vidBuffer,
                                    key,
                                    contentType: 'video/mp4'
                                });
                                finalVideoUrl = r2Url;
                                await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);
                            } catch (uploadErr) {
                                console.error(`[Cron] Shot/Direct R2 upload failed for task ${task.id}:`, uploadErr);
                            }
                        }

                        const targetShotIds = task.shot_ids || (task.shot_id ? [task.shot_id] : []);
                        console.log(`[Cron] Task ${task.id}: shot_ids=${JSON.stringify(task.shot_ids)}, shot_id=${task.shot_id}, targetShotIds=${JSON.stringify(targetShotIds)}`);

                        if (task.type === 'shot_generation') {
                            if (targetShotIds.length > 0 && finalVideoUrl) {
                                // Fetch all affected shots
                                const { data: shotsData, error: shotsError } = await supabase
                                    .from('shots')
                                    .select('id, metadata, generation_history')
                                    .in('id', targetShotIds);

                                console.log(`[Cron] Fetched shots: count=${shotsData?.length}, error=${shotsError?.message}`);

                                if (shotsData && shotsData.length > 0) {
                                    for (const shotData of shotsData) {
                                        const newHistoryItem = {
                                            id: `sora_${task.id}_${Date.now()}`,
                                            type: 'video',
                                            timestamp: new Date().toISOString(),
                                            result: finalVideoUrl,
                                            prompt: task.prompt || 'Sora Video Generation',
                                            parameters: {
                                                model: 'sora',
                                                taskId: task.id,
                                                isMultiShot: targetShotIds.length > 1,
                                                coveredShots: targetShotIds
                                            },
                                            status: 'success'
                                        };

                                        const currentHistory = shotData.generation_history || [];
                                        const updatedHistory = [newHistoryItem, ...currentHistory];

                                        const { error: updateError } = await supabase.from('shots').update({
                                            video_clip: finalVideoUrl,
                                            status: 'done',
                                            metadata: {
                                                ...(shotData.metadata || {}),
                                                soraTaskId: task.id,
                                                soraVideoUrl: finalVideoUrl
                                            },
                                            generation_history: updatedHistory
                                        }).eq('id', shotData.id);

                                        if (updateError) {
                                            console.error(`[Cron] ❌ Failed to update shot ${shotData.id}:`, updateError);
                                        } else {
                                            console.log(`[Cron] ✅ Updated shot ${shotData.id}: generation_history length = ${updatedHistory.length}`);
                                        }
                                    }
                                }
                            }
                        } else if (task.type === 'direct_generation') {
                            if (targetShotIds.length > 0 && finalVideoUrl) {
                                const { data: shotsData, error: shotsError } = await supabase
                                    .from('shots')
                                    .select('id, generation_history')
                                    .in('id', targetShotIds);

                                console.log(`[Cron] Pro shots fetched: count=${shotsData?.length}, error=${shotsError?.message}`);

                                if (shotsData && shotsData.length > 0) {
                                    for (const shotData of shotsData) {
                                        const newHistoryItem = {
                                            id: `sora_${task.id}_${Date.now()}`,
                                            type: 'video',
                                            timestamp: new Date().toISOString(),
                                            result: finalVideoUrl,
                                            prompt: task.prompt || 'Sora Video Generation',
                                            parameters: {
                                                model: 'sora',
                                                taskId: task.id,
                                                source: 'pro',
                                                isMultiShot: targetShotIds.length > 1,
                                                coveredShots: targetShotIds
                                            },
                                            status: 'success'
                                        };

                                        const currentHistory = shotData.generation_history || [];
                                        const updatedHistory = [newHistoryItem, ...currentHistory];

                                        const { error: updateError } = await supabase.from('shots').update({
                                            generation_history: updatedHistory
                                        }).eq('id', shotData.id);

                                        if (updateError) {
                                            console.error(`[Cron] ❌ Failed to update pro history for shot ${shotData.id}:`, updateError);
                                        } else {
                                            console.log(`[Cron] ✅ Pro history updated for shot ${shotData.id}: generation_history length = ${updatedHistory.length}`);
                                        }
                                    }
                                }
                            }

                            if (task.project_id && finalVideoUrl) {
                                const baseChatMessage = {
                                    user_id: task.user_id,
                                    project_id: task.project_id,
                                    role: 'assistant',
                                    content: 'Sora 视频生成完成！',
                                    metadata: {
                                        type: 'sora_video_complete',
                                        videoUrl: finalVideoUrl,
                                        taskId: task.id,
                                        model: 'sora-2',
                                        prompt: task.prompt || '',
                                        source: 'pro',
                                        isMultiShot: targetShotIds.length > 1,
                                        coveredShots: targetShotIds
                                    },
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                };

                                if (targetShotIds.length > 0) {
                                    for (const shotId of targetShotIds) {
                                        await supabase.from('chat_messages').insert({
                                            id: `sora_complete_${task.id}_${shotId}_${Date.now()}`,
                                            ...baseChatMessage,
                                            scope: 'shot',
                                            scene_id: task.scene_id || null,
                                            shot_id: shotId
                                        });
                                        console.log(`[Cron] Inserted Pro chat message for shot ${shotId}`);
                                    }
                                } else if (task.scene_id) {
                                    await supabase.from('chat_messages').insert({
                                        id: `sora_complete_${task.id}_${Date.now()}`,
                                        ...baseChatMessage,
                                        scope: 'scene',
                                        scene_id: task.scene_id,
                                        shot_id: null
                                    });
                                    console.log(`[Cron] Inserted Pro chat message for scene ${task.scene_id}`);
                                } else {
                                    await supabase.from('chat_messages').insert({
                                        id: `sora_complete_${task.id}_${Date.now()}`,
                                        ...baseChatMessage,
                                        scope: 'project',
                                        scene_id: null,
                                        shot_id: null
                                    });
                                    console.log(`[Cron] Inserted Pro chat message for project ${task.project_id}`);
                                }
                            }
                        }
                    }
                } else {
                    results.push({ id: task.id, status: normalizedStatus, updated: false });
                    if (task.scene_id && (task.type === 'shot_generation' || !task.type)) {
                        touchedScenes.add(task.scene_id);
                    }
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
                    .eq('scene_id', sceneId)
                    .or('type.eq.shot_generation,type.is.null');

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
