import { KaponaiService } from './KaponaiService';
import { SoraPromptService } from './SoraPromptService';
import { SoraTask, Character } from '@/types/project';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sizeOf from 'image-size';
import fetch from 'node-fetch';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';

// Server-side Supabase client initialization
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

export class CharacterConsistencyService {
    private kaponaiService: KaponaiService;
    private promptService: SoraPromptService;

    constructor() {
        this.kaponaiService = new KaponaiService();
        this.promptService = new SoraPromptService();
    }

    /**
     * 注册 Sora 角色
     */
    async registerCharacter(
        character: Character,
        videoUrl: string,
        userId: string,
        timestamps?: string
    ): Promise<Character> {
        console.log(`[CharacterConsistency] Registering character ${character.id} with video ${videoUrl}`);

        try {
            const result = await this.kaponaiService.createCharacter({
                url: videoUrl,
                timestamps: timestamps || '1,3'
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
                        soraIdentity: updatedIdentity,
                        soraReferenceVideoUrl: videoUrl
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
                        soraIdentity: failedIdentity,
                        soraReferenceVideoUrl: videoUrl
                    }
                })
                .eq('id', character.id);

            throw error;
        }
    }

    /**
     * 后台等待任务完成并自动注册角色
     */
    async waitAndRegisterTask(
        taskId: string,
        userId: string,
        timestamps?: string
    ): Promise<void> {
        try {
            const { data: taskData, error: taskError } = await supabase
                .from('sora_tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (taskError || !taskData) {
                console.warn(`[CharacterConsistency] Task not found: ${taskId}`);
                return;
            }

            const task = taskData as any;
            let statusRes: any = null;

            if (task.status !== 'completed') {
                statusRes = await this.kaponaiService.waitForCompletion(taskId, 600, 5000);
                const updates: any = {
                    status: normalizeSoraStatus(statusRes.status),
                    progress: statusRes.progress,
                    updated_at: new Date().toISOString()
                };
                if (statusRes.video_url) updates.kaponai_url = statusRes.video_url;
                await supabase.from('sora_tasks').update(updates).eq('id', taskId);
            } else {
                statusRes = {
                    status: task.status,
                    progress: task.progress,
                    video_url: task.kaponai_url
                };
            }

            if (statusRes.status !== 'completed') {
                console.warn(`[CharacterConsistency] Task ${taskId} finished with status ${statusRes.status}`);
                return;
            }

            if (!task.character_id) {
                console.warn(`[CharacterConsistency] Task ${taskId} missing character_id`);
                return;
            }

            let finalVideoUrl = task.r2_url || statusRes.video_url;
            if (!finalVideoUrl) {
                console.warn(`[CharacterConsistency] Task ${taskId} missing video url`);
                return;
            }

            if (!task.r2_url) {
                try {
                    const vidRes = await fetch(finalVideoUrl);
                    if (!vidRes.ok) throw new Error('Failed to download video');
                    const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
                    const filename = `sora_ref_${task.character_id}_${Date.now()}.mp4`;
                    const key = `${userId}/characters/${task.character_id}/${filename}`;
                    const r2Url = await uploadBufferToR2({
                        buffer: vidBuffer,
                        key,
                        contentType: 'video/mp4'
                    });
                    finalVideoUrl = r2Url;
                    await supabase.from('sora_tasks').update({ r2_url: r2Url }).eq('id', taskId);
                } catch (uploadErr: any) {
                    console.error(`[CharacterConsistency] R2 upload failed: ${uploadErr.message}`);
                }
            }

            const { data: charData } = await supabase
                .from('characters')
                .select('metadata')
                .eq('id', task.character_id)
                .single();

            const existingUsername = charData?.metadata?.soraIdentity?.username?.trim();
            if (existingUsername) {
                await supabase.from('characters').update({
                    metadata: {
                        ...charData?.metadata,
                        soraReferenceVideoUrl: finalVideoUrl,
                        soraIdentity: {
                            ...charData?.metadata?.soraIdentity,
                            referenceVideoUrl: finalVideoUrl,
                            status: 'registered'
                        }
                    }
                }).eq('id', task.character_id);
                return;
            }

            try {
                const regResult = await this.kaponaiService.createCharacter({
                    url: finalVideoUrl,
                    timestamps: timestamps || '1,3'
                });

                if (regResult.username) {
                    await supabase.from('characters').update({
                        metadata: {
                            ...charData?.metadata,
                            soraIdentity: {
                                username: regResult.username,
                                referenceVideoUrl: finalVideoUrl,
                                status: 'registered',
                                taskId
                            },
                            soraReferenceVideoUrl: finalVideoUrl
                        }
                    }).eq('id', task.character_id);
                }
            } catch (registerErr: any) {
                console.error(`[CharacterConsistency] Auto register failed: ${registerErr.message}`);
                await supabase.from('characters').update({
                    metadata: {
                        ...charData?.metadata,
                        soraIdentity: {
                            username: '',
                            referenceVideoUrl: finalVideoUrl,
                            status: 'failed',
                            taskId
                        },
                        soraReferenceVideoUrl: finalVideoUrl
                    }
                }).eq('id', task.character_id);
            }
        } catch (error: any) {
            console.error('[CharacterConsistency] waitAndRegisterTask failed:', error);
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

        const prompt = this.promptService.generateCharacterReferencePrompt(character);

        let tempImagePath = '';
        let targetSize: '1280x720' | '720x1280' = '1280x720';

        try {
            // Handle Reference Image Download
            const refImage = character.referenceImages?.[0]; // Use first image as main reference
            if (!refImage) {
                throw new Error('角色缺少参考图，无法生成参考视频');
            }

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

                    // Dynamic Aspect Ratio Detection (using Buffer for speed and reliability)
                    const dimensions = sizeOf(Buffer.from(buffer));
                    const width = dimensions.width;
                    const height = dimensions.height;

                    if (width && height) {
                        const aspectRatio = width / height;
                        // Always map to 16:9 or 9:16 for Sora
                        targetSize = aspectRatio >= 1 ? '1280x720' : '720x1280';
                        console.log(`[CharacterConsistency] SUCCESS: Detected ${width}x${height} (Ratio: ${aspectRatio.toFixed(2)}). Selected size: ${targetSize}`);
                    } else {
                        console.warn('[CharacterConsistency] WARNING: Image detection failed to return valid dimensions, defaulting to 16:9');
                    }

                    // Optimization: We successfully analyzed the image. 
                    // To avoid upload timeout, we will pass the URL directly to Kaponai
                    // Kaponai will download it server-side.
                    // This assumes the URL is publicly accessible.

            } catch (err) {
                console.error('[CharacterConsistency] Failed to download/analyze image:', err);
                tempImagePath = ''; // Reset on fail
                throw err;
            }

            // Use the URL directly for input_reference to improve performance and avoid upload timeouts
            // However, ensure we pass the string, not the file path
            const referenceInput = refImage || undefined;

            const response = await this.kaponaiService.createVideo({
                model: 'sora-2',
                prompt: prompt,
                seconds: '10', // String type required by our interface
                size: targetSize as any,
                // Kaponai API expects input_reference to be an array of strings (URLs) when using JSON
                input_reference: referenceInput ? [referenceInput] : undefined
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
                targetSize: targetSize, // Fix: Use calculated targetSize, not hardcoded
                pointCost: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Save to DB
            const { error } = await supabase.from('sora_tasks').insert({
                id: task.id,
                user_id: task.userId,
                project_id: task.projectId || null,
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
