import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { ViduTaskManager } from '@/services/ViduTaskManager';

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
        const hasNonViduTasks = tasks.some((task: any) => task.provider !== 'vidu' && !(task.model && String(task.model).includes('vidu')));

        if (hasNonViduTasks) {
            try {
                await kaponaiService.assertReachable();
            } catch (error: any) {
                return NextResponse.json({ error: error.message || 'Kaponai unreachable' }, { status: 503 });
            }
        }

        const results = [];
        const touchedScenes = new Set<string>();

        // 2. Poll each task
        for (const taskRecord of tasks) {
            const task = taskRecord as any;
            try {
                const isVidu = task.provider === 'vidu' || (task.model && String(task.model).includes('vidu'));
                if (isVidu) {
                    const updatedTask = await ViduTaskManager.checkAndUpdateTask(task.id);
                    results.push({
                        id: task.id,
                        status: updatedTask?.status || task.status,
                        updated: true
                    });
                    continue;
                }

                // Kaponai (Sora) logic
                const statusRes = await kaponaiService.getVideoStatus(task.id);
                const normalizedStatus = normalizeStatus(statusRes.status);

                // If status changed or completed, update DB
                if (normalizedStatus !== task.status || statusRes.progress !== task.progress || normalizedStatus === 'completed') {
                    const updates: any = {
                        status: normalizedStatus,
                        progress: statusRes.progress,
                        updated_at: new Date().toISOString()
                    };
                    if (statusRes.video_url) updates.kaponai_url = statusRes.video_url; // snake_case for DB

                    // Special handling for completed tasks: Mark as pending_upload to avoid timeout
                    if (normalizedStatus === 'completed' && statusRes.video_url && !task.r2_url) {
                        updates.status = 'pending_upload';
                        console.log(`[Cron] Task ${task.id} marked as pending_upload`);
                    }

                    await supabase.from('sora_tasks').update(updates).eq('id', task.id);
                    results.push({ id: task.id, status: updates.status, updated: true });

                    if (task.scene_id && (task.type === 'shot_generation' || !task.type)) {
                        touchedScenes.add(task.scene_id);
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

        // 3. Update scene aggregate status (optional but good for UX)
        for (const sceneId of touchedScenes) {
            try {
                const { data: sceneTasks } = await supabase
                    .from('sora_tasks')
                    .select('id, status, progress, r2_url, kaponai_url')
                    .eq('scene_id', sceneId)
                    .or('type.eq.shot_generation,type.is.null');

                if (!sceneTasks || sceneTasks.length === 0) continue;

                const total = sceneTasks.length;
                const completedCount = sceneTasks.filter((t: any) => t.status === 'completed' || t.status === 'pending_upload').length;
                const failedCount = sceneTasks.filter((t: any) => t.status === 'failed').length;
                const totalProgress = sceneTasks.reduce(
                    (sum: number, t: any) => sum + ((t.status === 'completed' || t.status === 'pending_upload') ? 100 : (t.progress || 0)),
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
