import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { SoraTask } from '@/types/project';

// Initialize Supabase Client (Server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 1 minute timeout

export async function GET(req: Request) {
    // Optional: Add a shared secret check to prevent unauthorized calls
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting Sora status batch poll...');

        // 1. Fetch all 'queued' or 'generating' or 'processing' tasks
        const { data: tasks, error: dbError } = await supabase
            .from('sora_tasks')
            .select('*')
            .in('status', ['queued', 'generating', 'processing'])
            .order('created_at', { ascending: true })
            .limit(50); // Limit batch size

        if (dbError) throw dbError;
        if (!tasks || tasks.length === 0) {
            return NextResponse.json({ message: 'No pending tasks found.' });
        }

        console.log(`[Cron] Found ${tasks.length} pending tasks.`);
        const kaponaiService = new KaponaiService();
        const results = [];

        // 2. Poll each task
        for (const taskRecord of tasks) {
            const task = taskRecord as SoraTask;
            try {
                const statusRes = await kaponaiService.getVideoStatus(task.id);

                // If status changed, update DB
                if (statusRes.status !== task.status || statusRes.progress !== task.progress) {
                    const updates: any = {
                        status: statusRes.status,
                        progress: statusRes.progress,
                        updated_at: new Date().toISOString()
                    };
                    if (statusRes.video_url) updates.kaponai_url = statusRes.video_url; // snake_case for DB

                    await supabase.from('sora_tasks').update(updates).eq('id', task.id);
                    results.push({ id: task.id, status: statusRes.status, updated: true });

                    // 3. Auto-register if completed character reference
                    if (statusRes.status === 'completed' && task.type === 'character_reference' && task.characterId && statusRes.video_url) {
                        try {
                            console.log(`[Cron] Task ${task.id} completed. Starting R2 upload...`);

                            // A. Download video
                            const vidRes = await fetch(statusRes.video_url);
                            if (!vidRes.ok) throw new Error('Failed to download video from Kaponai');
                            const vidBuffer = await vidRes.arrayBuffer();
                            const base64Video = Buffer.from(vidBuffer).toString('base64');

                            // B. Upload to R2
                            // Format: data:video/mp4;base64,... for storageService? 
                            // storageService.uploadBase64ToR2 expects raw base64 usually or handling it.
                            // Let's check storageService.base64ToFile implementation. It handles "data:..." prefix if present.
                            // It defaults to image/png if not found.
                            // I should construct a proper data url or bypass storageService and use r2Service to be safe.
                            // Let's construct Data URL to be safe with storageService.base64ToFile logic.
                            const dataUrl = `data:video/mp4;base64,${base64Video}`;

                            // Upload
                            const { storageService } = await import('@/lib/storageService');
                            const filename = `sora_ref_${task.characterId}_${Date.now()}.mp4`;
                            const r2Url = await storageService.uploadBase64ToR2(
                                dataUrl,
                                `characters/${task.characterId}`,
                                filename,
                                task.user_id
                            );

                            console.log(`[Cron] Uploaded to R2: ${r2Url}`);

                            // Update Task with R2 URL
                            await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', task.id);

                            // C. Register Character using R2 URL
                            const regResult = await kaponaiService.createCharacter({ url: r2Url });

                            if (regResult.username) {
                                await supabase.from('characters').update({
                                    metadata: {
                                        soraIdentity: {
                                            username: regResult.username,
                                            referenceVideoUrl: r2Url, // Use R2 URL
                                            status: 'registered'
                                        }
                                    },
                                    // Update direct column if exists, otherwise metadata is fine
                                    sora_reference_video_url: r2Url
                                }).eq('id', task.characterId);
                                console.log(`[Cron] Auto-registered character ${regResult.username} with R2 video`);
                            }
                        } catch (uploadErr) {
                            console.error(`[Cron] Failed to process success logic for task ${task.id}:`, uploadErr);
                        }
                    }
                } else {
                    results.push({ id: task.id, status: statusRes.status, updated: false });
                }
            } catch (err: any) {
                console.error(`[Cron] Failed to poll task ${task.id}:`, err);
                results.push({ id: task.id, error: err.message });
            }
        }

        return NextResponse.json({ success: true, processed: results.length, details: results });

    } catch (error: any) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
