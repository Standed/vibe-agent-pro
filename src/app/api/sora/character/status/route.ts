
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KaponaiService } from '@/services/KaponaiService';
import { characterConsistencyService } from '@/services/CharacterConsistencyService';
import { SoraTask, Character } from '@/types/project';

// Initialize Supabase Client (Server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
    try {
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

        const task = taskData as SoraTask;

        // If already completed, return info (maybe populate result url if missing in response but present in DB)
        if (task.status === 'completed' || task.status === 'failed') {
            return NextResponse.json({
                status: task.status,
                progress: 100,
                videoUrl: task.r2Url || task.kaponaiUrl
            });
        }

        // 2. Check Status from Kaponai
        const kaponaiService = new KaponaiService();
        const kaponaiStatus = await kaponaiService.getVideoStatus(taskId);

        // 3. Update DB if changed
        if (kaponaiStatus.status !== task.status || kaponaiStatus.progress !== task.progress) {
            const updates: Partial<SoraTask> = {
                status: kaponaiStatus.status as any,
                progress: kaponaiStatus.progress,
                updatedAt: new Date() // Type issue possible, but Supabase handles string ISO
            };

            if (kaponaiStatus.video_url) {
                updates.kaponaiUrl = kaponaiStatus.video_url;
            }
            if (kaponaiStatus.error) {
                updates.errorMessage = JSON.stringify(kaponaiStatus.error);
            }

            await supabase.from('sora_tasks').update(updates).eq('id', taskId);

            // 4. AUTO-REGISTER LOGIC
            // If task just completed and it is a character_reference task
            if (kaponaiStatus.status === 'completed' && task.type === 'character_reference' && task.characterId && kaponaiStatus.video_url) {
                try {
                    // Fetch character to ensure we have latest data
                    const { data: charData } = await supabase.from('characters').select('*').eq('id', task.characterId).single();
                    if (charData) {
                        const character = charData as Character; // Cast might need mapping if snake_case
                        // Mapping snake_case to camelCase manually if needed, or relying on our types matching if Supabase returns typed
                        // Note: Supabase JS returns data matching the table columns (snake_case) usually.
                        // But our project type `Character` is camelCase.
                        // We need to construct a robust object.

                        const mappedChar: Character = {
                            id: charData.id,
                            name: charData.name,
                            description: charData.description,
                            appearance: charData.appearance,
                            referenceImages: charData.reference_images,
                            soraReferenceVideoUrl: charData.sora_reference_video_url, // Might be empty
                            soraIdentity: charData.metadata?.soraIdentity, // important
                            userId: charData.user_id,
                            projectId: charData.project_id
                        };

                        // Call service to register
                        // Note: The service uses `dataService` (client-side fetch) which might fail on server?
                        // CharacterConsistencyService imports `dataService`. `dataService` uses `authenticatedFetch` -> `window.fetch`.
                        // `window` is not available in Next.js API route. 
                        // CRITICAL: We cannot use `CharacterConsistencyService` logic AS IS if it relies on client-side specific auth/fetch.
                        // We must verify `CharacterConsistencyService`.

                        // Re-implement registration logic here directly to avoid client-side dep issues.
                        // (Or refactor Service to be isomorphic)

                        console.log('[AutoRegister] Triggering registration for', mappedChar.name);
                        const regKey = process.env.KAPONAI_API_KEY;
                        // Use KaponaiService directly
                        const regResult = await kaponaiService.createCharacter({
                            url: kaponaiStatus.video_url
                        });

                        if (regResult.username) {
                            const updatedIdentity = {
                                username: regResult.username,
                                referenceVideoUrl: kaponaiStatus.video_url,
                                status: 'registered'
                            };

                            await supabase.from('characters').update({
                                metadata: {
                                    ...charData.metadata,
                                    soraIdentity: updatedIdentity
                                },
                                // Also update the direct field if we want
                                // sora_reference_video_url: kaponaiStatus.video_url 
                            }).eq('id', task.characterId);

                            console.log('[AutoRegister] Success:', regResult.username);
                        }
                    }
                } catch (err) {
                    console.error('[AutoRegister] Failed:', err);
                }
            }
        }

        let finalUsername = undefined;
        // If completed, try to get the username from the DB again to pass it back to frontend
        if (kaponaiStatus.status === 'completed' && task.characterId) {
            const { data: latestChar } = await supabase.from('characters').select('metadata').eq('id', task.characterId).single();
            if (latestChar?.metadata?.soraIdentity?.username) {
                finalUsername = latestChar.metadata.soraIdentity.username;
            }
        }

        return NextResponse.json({
            status: kaponaiStatus.status,
            progress: kaponaiStatus.progress,
            videoUrl: kaponaiStatus.video_url,
            username: finalUsername
        });
    } catch (error: any) {
        console.error('Character Status API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
