import { KaponaiService } from './KaponaiService';
import { SoraTask, Character } from '@/types/project';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { imageSize } from 'image-size';

// Server-side Supabase client initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export class CharacterConsistencyService {
    private kaponaiService: KaponaiService;

    constructor() {
        this.kaponaiService = new KaponaiService();
    }

    /**
     * 注册 Sora 角色
     */
    async registerCharacter(
        character: Character,
        videoUrl: string,
        userId: string
    ): Promise<Character> {
        console.log(`[CharacterConsistency] Registering character ${character.id} with video ${videoUrl}`);

        try {
            const result = await this.kaponaiService.createCharacter({
                url: videoUrl,
            });

            const username = result.username; // e.g. "@fmraejvq"

            const updatedIdentity = {
                username,
                referenceVideoUrl: videoUrl,
                status: 'registered' as const, // Fix literal type
            };

            const { error } = await supabase
                .from('characters')
                .update({
                    metadata: {
                        ...((character as any).metadata || {}), // Assuming character input has metadata or we preserve it
                        soraIdentity: updatedIdentity
                    }
                })
                .eq('id', character.id);

            if (error) throw new Error(error.message);

            return {
                ...character,
                soraIdentity: {
                    username,
                    referenceVideoUrl: videoUrl,
                    status: 'registered',
                }
            };
        } catch (error: any) {
            console.error(`[CharacterConsistency] Registration failed:`, error);

            // Update status to failed
            const failedIdentity = {
                username: '',
                referenceVideoUrl: videoUrl,
                status: 'failed' as const,
            };

            await supabase
                .from('characters')
                .update({
                    metadata: {
                        ...((character as any).metadata || {}),
                        soraIdentity: failedIdentity
                    }
                })
                .eq('id', character.id);

            throw error;
        }
    }

    /**
     * 生成角色参考视频
     */
    async generateReferenceVideo(
        character: Character,
        projectContext: { prompt: string, style?: string },
        userInfo: { userId: string, projectId: string }
    ): Promise<SoraTask> {
        console.log(`[CharacterConsistency] Generating reference video for ${character.name}`);

        const prompt = `"${character.name}" looking directly at the camera, making eye contact, slight movement, neutral background. High quality character reference.`;

        let tempImagePath = '';
        let targetSize = '1280x720'; // Default landscape

        try {
            // Handle Reference Image Download
            const refImage = character.referenceImages?.[0]; // Use first image as main reference
            if (refImage) {
                try {
                    console.log(`[CharacterConsistency] Downloading reference image: ${refImage}`);
                    const ext = path.extname(new URL(refImage).pathname) || '.jpg';
                    // Sanitize extension
                    const validExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';

                    tempImagePath = path.join(os.tmpdir(), `sora_ref_${Date.now()}_${Math.random().toString(36).substring(7)}${validExt}`);

                    const imgRes = await fetch(refImage);
                    if (!imgRes.ok) throw new Error(`Failed to download reference image: ${refImage}`);

                    const buffer = await imgRes.arrayBuffer();
                    fs.writeFileSync(tempImagePath, Buffer.from(buffer));
                    console.log(`[CharacterConsistency] Image downloaded to: ${tempImagePath}`);

                    // Dynamic Aspect Ratio Detection
                    const dimensions = imageSize(tempImagePath);
                    const width = dimensions.width || 1280;
                    const height = dimensions.height || 720;
                    const aspectRatio = width / height;

                    // Determine target size based on aspect ratio
                    // Landscape (>= 1): 1280x720
                    // Portrait (< 1): 720x1280 (9:16) or 1080x1920 if supported, but typically 720x1280/1080x1920
                    // Sora usually supports standard resolutions.
                    targetSize = aspectRatio >= 1 ? '1280x720' : '720x1280';
                    console.log(`[CharacterConsistency] Detected aspect ratio: ${aspectRatio.toFixed(2)}. Selected size: ${targetSize}`);

                } catch (err) {
                    console.error('[CharacterConsistency] Failed to download/analyze image, proceeding with default landscape text-only:', err);
                    tempImagePath = ''; // Reset on fail
                }
            }

            const response = await this.kaponaiService.createVideo({
                model: 'sora-2',
                prompt: prompt,
                seconds: '10',
                size: targetSize as any,
                input_reference: tempImagePath || undefined
            });

            const task: SoraTask = {
                id: response.id,
                userId: userInfo.userId,
                projectId: userInfo.projectId,
                characterId: character.id,
                type: 'character_reference',
                status: 'queued',
                progress: 0,
                model: 'sora-2',
                prompt: prompt,
                targetDuration: 10,
                targetSize: '1280x720',
                pointCost: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Save to DB
            const { error } = await supabase.from('sora_tasks').insert({
                id: task.id,
                user_id: task.userId,
                project_id: task.projectId,
                character_id: task.characterId,
                shot_id: null,
                scene_id: null,
                status: task.status,
                progress: task.progress,
                model: task.model,
                prompt: task.prompt,
                target_duration: task.targetDuration,
                target_size: task.targetSize,
                point_cost: task.pointCost,
                updated_at: new Date().toISOString(),
                type: 'character_reference' // Now schema supports it
            });

            if (error) throw new Error(`Failed to save task: ${error.message}`);

            // Update Character Status
            const identityStatus = {
                username: '',
                referenceVideoUrl: '',
                status: 'generating' as const,
                taskId: task.id
            };

            await supabase.from('characters').update({
                metadata: {
                    ...((character as any).metadata || {}),
                    soraIdentity: identityStatus
                }
            }).eq('id', character.id);

            return task;

        } finally {
            // Cleanup temp file
            if (tempImagePath && fs.existsSync(tempImagePath)) {
                try {
                    fs.unlinkSync(tempImagePath);
                    console.log(`[CharacterConsistency] Cleaned up temp image: ${tempImagePath}`);
                } catch (e) {
                    console.warn(`[CharacterConsistency] Failed to cleanup temp image:`, e);
                }
            }
        }
    }
}

export const characterConsistencyService = new CharacterConsistencyService();
