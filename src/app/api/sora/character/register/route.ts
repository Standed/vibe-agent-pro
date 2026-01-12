import { NextRequest, NextResponse } from 'next/server';
import { characterConsistencyService } from '@/services/CharacterConsistencyService';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkCredits, checkWhitelist, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 60;

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
    try {
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const body = await req.json();
        const { characterId, projectId, mode, timestamps } = body;
        // mode: 'register_direct' (video exists) or 'generate_and_register' (images only)

        let character = null;
        let userId = user.id;
        let fallbackVideoUrl: string | null = null;

        if (characterId) {
            // Fetch from DB
            const { data, error } = await supabase
                .from('characters')
                .select('*')
                .eq('id', characterId)
                .single();

            if (data) {
                if (data.user_id && data.user_id !== user.id) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
                character = {
                    id: data.id,
                    name: data.name,
                    description: data.description,
                    appearance: data.appearance,
                    referenceImages: data.reference_images,
                    soraReferenceVideoUrl: data.metadata?.soraReferenceVideoUrl || data.metadata?.soraIdentity?.referenceVideoUrl || data.sora_reference_video_url, // try both based on schema
                    soraIdentity: data.metadata?.soraIdentity,
                    userId: data.user_id,
                    projectId: data.project_id
                };
                userId = data.user_id;
            }
        }

        // If still no character (maybe it's a new one passed in body, not yet saved?)
        if (!character && body.character) {
            character = body.character;
        }

        if (!character) {
            return NextResponse.json({ error: 'Character data missing' }, { status: 400 });
        }

        if (projectId) {
            const { data: project } = await supabase
                .from('projects')
                .select('id,user_id')
                .eq('id', projectId)
                .single();
            if (!project || project.user_id !== user.id) {
                return NextResponse.json({ error: 'Unauthorized project access' }, { status: 403 });
            }
        }

        if (mode === 'register_direct') {
            if (!character.soraReferenceVideoUrl && character.id) {
                const { data: latestTask } = await supabase
                    .from('sora_tasks')
                    .select('r2_url,kaponai_url,updated_at')
                    .eq('character_id', character.id)
                    .eq('type', 'character_reference')
                    .eq('status', 'completed')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                fallbackVideoUrl = latestTask?.r2_url || latestTask?.kaponai_url || null;
                if (fallbackVideoUrl) {
                    character.soraReferenceVideoUrl = fallbackVideoUrl;
                }
            }

            if (!character.soraReferenceVideoUrl) {
                return NextResponse.json({ error: 'No reference video available for registration' }, { status: 400 });
            }

            const result = await characterConsistencyService.registerCharacter(
                character,
                character.soraReferenceVideoUrl,
                userId,
                timestamps
            );
            return NextResponse.json({ success: true, character: result });

        } else if (mode === 'generate_and_register') {
            // Trigger generation
            const prompt = body.prompt || `Character ${character.name}: ${character.description}, ${character.appearance} `;
            const requiredCredits = calculateCredits('VOLCANO_VIDEO', user.role);
            const operationDesc = getOperationDescription('VOLCANO_VIDEO');

            const creditsCheck = checkCredits(user, requiredCredits);
            if ('error' in creditsCheck) return creditsCheck.error;

            const task = await characterConsistencyService.generateReferenceVideo(
                character,
                { prompt },
                { userId, projectId: projectId || character.projectId || '' }
            );

            void characterConsistencyService
                .waitAndRegisterTask(task.id, userId, timestamps)
                .catch((err) => console.error('[AutoRegister] Failed:', err));

            try {
                const consumeResult = await consumeCredits(
                    user.id,
                    requiredCredits,
                    'sora-character-reference',
                    operationDesc
                );
                if (!consumeResult.success) {
                    console.error('[SoraCharacter] Credits consume failed:', consumeResult.error);
                }
            } catch (consumeError) {
                console.error('[SoraCharacter] Credits consume exception:', consumeError);
            }

            return NextResponse.json({ success: true, task, status: 'generating_reference' });

        } else {
            return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Character API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
