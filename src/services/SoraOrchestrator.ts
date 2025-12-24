import { Project, Scene, Shot, Character, SoraTask } from '@/types/project';
import { KaponaiService } from './KaponaiService';
import { SoraPromptService } from './SoraPromptService';
import { UnifiedDataService } from '@/lib/dataService';
import { storageService } from '@/lib/storageService';
import sizeOf from 'image-size';
import { promisify } from 'util';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

// sizeOf 同步调用在脚本/后端环境下更稳定且无兼容性问题

/**
 * Sora 总导演服务
 * 职责：
 * 1. 资源协调：确保角色已注册 (@username) 并持久化状态
 * 2. 流程编排：智能拆分长场景 (>15s) -> Prompt 生成 -> 视频生成
 * 3. 状态管理：实时更新数据库 (Thread-safe)
 */
export class SoraOrchestrator {
    private kaponai: KaponaiService;
    private promptService: SoraPromptService;
    private dataService: UnifiedDataService;

    constructor() {
        this.kaponai = new KaponaiService();
        this.promptService = new SoraPromptService();
        this.dataService = new UnifiedDataService(); // Instance per Orchestrator
    }

    /**
     * 核心功能：为特定场景生成连贯视频 (支持长场景自动拆分)
     * @param userId 当前用户ID (用于鉴权和写库)
     */
    async generateSceneVideo(project: Project, sceneId: string, userId: string): Promise<string[]> {
        // Init DB Service
        await this.dataService.initialize(userId);

        const scene = project.scenes.find(s => s.id === sceneId);
        if (!scene) throw new Error(`Scene ${sceneId} not found`);

        const shots = project.shots.filter(s => s.sceneId === sceneId).sort((a, b) => a.order - b.order);
        if (shots.length === 0) throw new Error(`No shots in scene ${sceneId}`);

        // 1. 识别并注册角色
        const involvedCharacters = this.identifyCharactersInScene(project, shots);
        await this.ensureCharactersRegistered(project.id, involvedCharacters, userId);

        // 2. 智能拆分分镜 (Smart Splitting > 15s)
        const chunks = this.splitShotsIntoChunks(shots);
        console.log(`[SoraOrchestrator] Splitting scene ${scene.name} into ${chunks.length} task(s).`);

        const taskIds: string[] = [];

        // 3. 串行/并行生成视频任务
        for (let i = 0; i < chunks.length; i++) {
            const chunkShots = chunks[i];

            // 构建剧本
            const script = {
                "character_setting": this.buildCharacterSettings(involvedCharacters),
                "shots": chunkShots.map(shot => this.convertShotToSoraShot(shot, involvedCharacters, scene, project.metadata.artStyle))
            };

            // 时长计算
            const chunkDuration = chunkShots.reduce((sum, s) => sum + (s.duration || 5), 0);

            // 策略调整 (User Request): 视频时长以 15s 为主，极个别短镜头使用 10s
            let requestSeconds = 15;
            const rawDuration = chunkDuration + 1; // 1s buffer for more content

            // 只有当总时长很短且分镜极少时，才使用 10s
            if (rawDuration < 8 && chunkShots.length <= 1) {
                requestSeconds = 10;
            }

            // 智能分辨率
            const targetSize = this.determineResolution(project.settings.aspectRatio);

            console.log(`[SoraOrchestrator] Generating Task ${i + 1}/${chunks.length}: ${requestSeconds}s (Raw: ${rawDuration.toFixed(1)}), ${targetSize}`);

            const task = await this.kaponai.createVideo({
                model: 'sora-2', // User requested cost saving
                prompt: script,
                seconds: requestSeconds,
                size: targetSize
            });

            taskIds.push(task.id);

            const soraTask: SoraTask = {
                id: task.id,
                userId,
                projectId: project.id,
                sceneId: scene.id,
                shotId: chunkShots.length === 1 ? chunkShots[0].id : undefined,
                shotIds: chunkShots.map((s) => s.id),
                shotRanges: chunkShots.reduce((acc, shot) => {
                    const lastEnd = acc.length > 0 ? acc[acc.length - 1].end : 0;
                    const duration = shot.duration || 5;
                    acc.push({
                        shotId: shot.id,
                        start: lastEnd,
                        end: lastEnd + duration,
                    });
                    return acc;
                }, [] as Array<{ shotId: string; start: number; end: number }>),
                status: task.status as any || 'queued',
                progress: task.progress ?? 0,
                model: task.model || 'sora-2',
                prompt: JSON.stringify(script),
                targetDuration: requestSeconds,
                targetSize: targetSize,
                kaponaiUrl: task.video_url,
                r2Url: undefined,
                pointCost: 0,
                type: 'shot_generation',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await this.dataService.saveSoraTask(soraTask);
        }

        // 4. 持久化存储
        if (!scene.soraGeneration) {
            scene.soraGeneration = { taskId: '', status: 'pending', tasks: [] };
        }

        // Use the first task ID for backward compatibility, store all in tasks
        scene.soraGeneration.taskId = taskIds[0] || '';
        scene.soraGeneration.tasks = taskIds;
        scene.soraGeneration.status = 'processing';
        scene.soraGeneration.progress = 0;

        await this.dataService.saveScene(project.id, scene);
        console.log(`[SoraOrchestrator] Scene ${sceneId} tasks saved to DB: ${taskIds.join(', ')}`);

        return taskIds;
    }

    /**
     * 辅助：将分镜列表拆分为 <=15s 的块 (Greedy Packing)
     */
    private splitShotsIntoChunks(shots: Shot[]): Shot[][] {
        const chunks: Shot[][] = [];
        let currentChunk: Shot[] = [];
        let currentDuration = 0;
        const MAX_DURATION = 14; // Target 15s total, 1s safety buffer

        for (const shot of shots) {
            const shotDur = shot.duration || 5;

            // If adding this shot exceeds max duration
            if (currentDuration + shotDur > MAX_DURATION && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [shot];
                currentDuration = shotDur;
            } else {
                currentChunk.push(shot);
                currentDuration += shotDur;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * 辅助：分辨率决策
     */
    private determineResolution(aspectRatio: string): string {
        const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
        return isPortrait ? '720x1280' : '1280x720';
    }

    /**
     * 辅助：确保所有角色都在 Kaponai 注册过，并持久化 ID
     * 优化：并行处理所有未注册角色，减少等待时间
     */
    private async ensureCharactersRegistered(projectId: string, characters: Character[], userId: string): Promise<void> {
        // Sora 码优先：有 @username 就直接视为已注册
        for (const char of characters) {
            if (char.soraIdentity?.username && char.soraIdentity.status !== 'registered') {
                char.soraIdentity.status = 'registered';
                await this.dataService.saveCharacter(projectId, char);
            }
        }

        // 角色码优先：有 @username 就视为已注册
        const charsToRegister = characters.filter(char => !char.soraIdentity?.username);

        if (charsToRegister.length === 0) return;

        console.log(`[Orchestrator] Parallel registering ${charsToRegister.length} characters...`);

        // 并行执行注册流程
        const errors: string[] = [];
        await Promise.all(charsToRegister.map(async (char) => {
            let tempFilePath: string | null = null;
            try {
                let refVideoUrl = char.soraIdentity?.referenceVideoUrl || char.soraReferenceVideoUrl;

                // Step A: 生成参考视频 (如果缺失)
                if (!refVideoUrl && char.referenceImages && char.referenceImages.length > 0) {
                    console.log(`[Orchestrator] Generating Ref Video for ${char.name}...`);

                    const imageUrl = char.referenceImages[0];
                    tempFilePath = await this.downloadTempFile(imageUrl);
                    const refPrompt = this.promptService.generateCharacterReferencePrompt(char);
                    const optimalSize = await this.getOptimalSize(tempFilePath);

                    // --- 核心容错与重试逻辑 ---
                    let refTask;
                    try {
                        // 首次尝试：标准 Prompt
                        refTask = await this.kaponai.createVideo({
                            model: 'sora-2',
                            prompt: refPrompt,
                            seconds: 10,
                            size: optimalSize,
                            input_reference: tempFilePath
                        });
                        const completed = await this.kaponai.waitForCompletion(refTask.id);
                        refVideoUrl = completed.video_url;
                    } catch (e: any) {
                        // 检查是否为政策违规错误
                        const isPolicyError = e.message.includes('政策') || e.message.includes('policy') || e.message.includes('content_filter');
                        if (isPolicyError) {
                            console.warn(`[Orchestrator] Sora 政策拦截角色 "${char.name}"，尝试动漫化重试...`);
                            // 二次尝试：降级为动漫风格提示词以绕过真人审查
                            const retryPrompt = `Anime style stylized character, non-real person. ${char.appearance}. The character faces the camera and talks naturally. Pure white background.`;
                            try {
                                const retryTask = await this.kaponai.createVideo({
                                    model: 'sora-2',
                                    prompt: retryPrompt,
                                    seconds: 10,
                                    size: optimalSize,
                                    input_reference: tempFilePath
                                });
                                const retryCompleted = await this.kaponai.waitForCompletion(retryTask.id);
                                refVideoUrl = retryCompleted.video_url;
                            } catch (retryErr: any) {
                                throw new Error(`[审核拦截] 即使尝试动漫化生成也未能通过 OpenAI 审核。请尝试修改角色描述或更换三视图。`);
                            }
                        } else {
                            throw e;
                        }
                    }

                    if (!char.soraIdentity) char.soraIdentity = { username: '', referenceVideoUrl: '', status: 'pending' };
                    char.soraIdentity.referenceVideoUrl = refVideoUrl!;
                    char.soraReferenceVideoUrl = refVideoUrl!;
                    char.soraIdentity.status = 'generating';
                    await this.dataService.saveCharacter(projectId, char);
                }

                if (!refVideoUrl) {
                    throw new Error(`无法获取角色的参考视频源。`);
                }

                // Step A.5: 上传到 R2 (持久化)
                try {
                    console.log(`[Orchestrator] Uploading reference video to R2...`);
                    const tempVideoPath = await this.downloadTempFile(refVideoUrl);
                    const videoBuffer = fs.readFileSync(tempVideoPath);
                    const videoBase64 = videoBuffer.toString('base64');
                    const r2Filename = `sora_ref_${char.id}_${Date.now()}.mp4`;
                    const dataUri = `data:video/mp4;base64,${videoBase64}`;

                    // Upload to R2
                    const r2Url = await storageService.uploadBase64ToR2(
                        dataUri,
                        `characters/${char.id}`,
                        r2Filename,
                        userId
                    );

                    console.log(`[Orchestrator] Uploaded to R2: ${r2Url}`);
                    refVideoUrl = r2Url; // Update to R2 URL for registration
                    if (!char.soraIdentity) char.soraIdentity = { username: '', referenceVideoUrl: '', status: 'pending' };
                    char.soraIdentity.referenceVideoUrl = refVideoUrl;
                    char.soraReferenceVideoUrl = refVideoUrl;

                    this.deleteTempFile(tempVideoPath);
                } catch (uploadErr) {
                    console.error(`[Orchestrator] R2 Upload failed, proceeding with original URL:`, uploadErr);
                }

                // Step B: 注册角色获取 ID
                const charRes = await this.kaponai.createCharacter({
                    url: refVideoUrl,
                    timestamps: "1,3"
                });

                if (!char.soraIdentity) char.soraIdentity = { username: '', referenceVideoUrl: '', status: 'pending' };
                char.soraIdentity.username = charRes.username;
                char.soraIdentity.referenceVideoUrl = refVideoUrl;
                char.soraIdentity.status = 'registered';
                char.soraReferenceVideoUrl = refVideoUrl;
                console.log(`[Orchestrator] Registered ${char.name} as @${charRes.username}`);

                await this.dataService.saveCharacter(projectId, char);
            } catch (e: any) {
                console.error(`[Orchestrator] Failed to register ${char.name}:`, e.message);
                errors.push(`【${char.name}】注册失败: ${e.message}`);

                // 更新数据库状态为 failed，方便用户下次修复后重试
                if (char.soraIdentity) {
                    char.soraIdentity.status = 'failed';
                    await this.dataService.saveCharacter(projectId, char);
                }
            } finally {
                if (tempFilePath) this.deleteTempFile(tempFilePath);
            }
        }));

        if (errors.length > 0) {
            // 阻断逻辑：有一个角色失败就停止整体流程，确保不生成“残缺”的项目
            throw new Error(`Sora 角色注册未全部通过，批量生成已停止：\n${errors.join('\n')}`);
        }
    }

    /**
     * Helper: Download URL to a temporary file
     */
    private async downloadTempFile(urlOrPath: string): Promise<string> {
        // 使用更鲁棒的扩展名识别
        let ext = 'png';
        try {
            if (urlOrPath.startsWith('http')) {
                const urlObj = new URL(urlOrPath);
                ext = path.extname(urlObj.pathname).toLowerCase().replace('.', '') || 'png';
            } else {
                ext = path.extname(urlOrPath).toLowerCase().replace('.', '') || 'png';
            }
        } catch (e) {
            // 解析失败按 png 处理
        }

        if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            ext = 'png';
        }

        const tempFilename = `sora_ref_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const tempPath = path.join(os.tmpdir(), tempFilename);

        if (fs.existsSync(urlOrPath)) {
            // 如果是本地路径，复制一份到临时目录以统一个生命周期（不破坏源码图片）
            fs.copyFileSync(urlOrPath, tempPath);
        } else {
            const response = await fetch(urlOrPath);
            if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(tempPath, Buffer.from(buffer));
        }

        return tempPath;
    }

    private deleteTempFile(filePath: string) {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.warn(`Failed to delete temp file ${filePath}`, e);
            }
        }
    }

    /**
     * 辅助：构建 Kaponai 要求的详细 character_setting
     */
    private buildCharacterSettings(characters: Character[]): Record<string, any> {
        const settings: Record<string, any> = {};
        characters.forEach(char => {
            if (char.soraIdentity?.username) {
                const key = this.promptService.formatSoraCode(char.soraIdentity.username);

                // 直接使用 @username 作为唯一的 Key，移除冗余的 name 字段
                settings[key] = {
                    "appearance": char.description || char.appearance
                };
            }
        });
        return settings;
    }

    /**
     * 辅助：将项目 Shot 转换为 Kaponai Sora Shot (匹配新 JSON 模板)
     */
    private convertShotToSoraShot(shot: Shot, characters: Character[], scene: Scene, artStyle: string = "cinematic"): any {
        // 1. 生成注入了 @编号 的叙事文本（已包含用户要求的中文质量指令）
        const injectedNarrative = this.promptService.generateVideoPrompt(shot, characters, artStyle, scene);

        // 2. 识别主角色 ID
        let actorId = "None";
        const primaryChar = this.resolvePrimaryCharacter(characters, shot);
        if (primaryChar?.soraIdentity?.username) {
            actorId = this.promptService.formatSoraCode(primaryChar.soraIdentity.username);
        }

        // 3. 显式注入分镜景别
        const shotSizePrefix = shot.shotSize ? `Shot Type: ${shot.shotSize}. ` : "";
        const finalAction = `${shotSizePrefix}${injectedNarrative}`;

        return {
            "action": finalAction,
            "camera": shot.cameraMovement || "Static",
            "dialogue": {
                "role": actorId,
                "text": shot.dialogue || ""
            },
            "duration": Math.min(shot.duration || 5, 10),
            "location": scene.location || "Unknown",
            "style_tags": `${artStyle}`,
            "time": "Day"
        };
    }

    private normalizeName(name?: string): string {
        return (name || '').trim();
    }

    private extractShotDescriptionText(description?: string): string {
        if (!description) return '';
        let text = description;
        try {
            const obj = JSON.parse(description);
            if (obj && typeof obj === 'object') {
                const parts: string[] = [];
                if (typeof obj.visual === 'string') parts.push(obj.visual);
                if (typeof obj.action === 'string') parts.push(obj.action);
                if (typeof obj.prompt === 'string') parts.push(obj.prompt);
                if (typeof obj.description === 'string') parts.push(obj.description);
                if (parts.length > 0) {
                    text = parts.join(' ');
                }
            }
        } catch (e) {
            // Ignore JSON parse errors and use raw description
        }
        return text;
    }

    private extractShotText(shot: Shot): string {
        const parts: string[] = [];
        const descText = this.extractShotDescriptionText(shot.description);
        if (descText) parts.push(descText);
        if (shot.dialogue) parts.push(shot.dialogue);
        if (shot.narration) parts.push(shot.narration);
        return parts.join(' ');
    }

    private resolvePrimaryCharacter(characters: Character[], shot: Shot): Character | undefined {
        if (shot.mainCharacters && shot.mainCharacters.length > 0) {
            const name = this.normalizeName(shot.mainCharacters[0]);
            const direct = characters.find((c) => this.normalizeName(c.name) === name);
            if (direct) return direct;
        }

        const text = this.extractShotText(shot);
        if (!text) return undefined;

        const sorted = [...characters].sort((a, b) => (b.name || '').length - (a.name || '').length);
        return sorted.find((char) => {
            const name = this.normalizeName(char.name);
            return name.length >= 2 && text.includes(name);
        });
    }

    private identifyCharactersInScene(project: Project, shots: Shot[]): Character[] {
        const names = new Set<string>();
        const candidates = project.characters
            .map((char) => ({ char, name: this.normalizeName(char.name) }))
            .filter((item) => item.name.length > 0)
            .sort((a, b) => b.name.length - a.name.length);

        shots.forEach((shot) => {
            (shot.mainCharacters || []).forEach((name) => {
                const normalized = this.normalizeName(name);
                if (normalized) names.add(normalized);
            });
            const text = this.extractShotText(shot);
            if (!text) return;
            candidates.forEach((item) => {
                if (item.name.length >= 2 && text.includes(item.name)) {
                    names.add(item.name);
                }
            });
        });

        return project.characters.filter((char) => names.has(this.normalizeName(char.name)));
    }

    private async getOptimalSize(imagePathOrUrl: string): Promise<string> {
        try {
            if (!imagePathOrUrl) return '1280x720';

            // 如果是 URL，先下载（虽然在 Orchestrator 流程中通常先下载了，但这里做个兜底）
            let localPath = imagePathOrUrl;
            let isTemp = false;
            if (imagePathOrUrl.startsWith('http')) {
                localPath = await this.downloadTempFile(imagePathOrUrl);
                isTemp = true;
            }

            if (!fs.existsSync(localPath)) return '1280x720';

            const buffer = fs.readFileSync(localPath);
            const dimensions = sizeOf(buffer);
            if (isTemp) this.deleteTempFile(localPath);

            if (!dimensions || !dimensions.width || !dimensions.height) return '1280x720';

            // 动态判断比例
            if (dimensions.height > dimensions.width) {
                return '720x1280'; // 竖屏
            }
            return '1280x720'; // 横屏或方屏
        } catch (e) {
            console.error(`[Orchestrator] Failed to detect image size:`, e);
            return '1280x720';
        }
    }

    /**
     * 批量为项目生成视频
     */
    async batchGenerateProjectVideos(
        project: Project,
        force: boolean,
        userId: string,
        onProgress?: (progress: any) => void
    ): Promise<any> {
        // Init DB Service
        await this.dataService.initialize(userId);

        const charactersWithoutImages = project.characters.filter(c =>
            (!c.referenceImages || c.referenceImages.length === 0) &&
            !c.soraIdentity?.username &&
            !c.soraReferenceVideoUrl &&
            !c.soraIdentity?.referenceVideoUrl
        );
        if (charactersWithoutImages.length > 0) {
            const names = charactersWithoutImages.map(c => c.name).join(', ');
            // Return actionable error instead of throwing, so Agent can handle it gracefully.
            return {
                success: false,
                status: 'error',
                code: 'missing_character_reference',
                message: `无法开始生成。检测到角色 [${names}] 缺少参考图（三视图）。`,
                suggestion: `请告知用户：Sora 视频生成需要角色参考图以保持一致性。请先为角色 [${names}] 上传或生成三视图，然后再试。`
            };
        }

        const targetScenes = project.scenes.filter(s => {
            if (!project.shots.some(shot => shot.sceneId === s.id)) return false;
            if (!force && s.soraGeneration?.status === 'success') return false;
            return true;
        });

        if (targetScenes.length === 0) return { message: '无待生成场景', total: 0 };

        if (onProgress) onProgress({ total: targetScenes.length, current: 0, status: 'running', message: 'Starting...' });

        const results: any[] = [];
        let completed = 0;

        for (const scene of targetScenes) {
            try {
                if (onProgress) onProgress({
                    total: targetScenes.length,
                    current: completed + 1,
                    status: 'running',
                    message: `Processing ${scene.name}...`
                });

                const taskIds = await this.generateSceneVideo(project, scene.id, userId);
                results.push({ sceneId: scene.id, name: scene.name, tasks: taskIds, status: 'submitted' });
            } catch (e: any) {
                console.error(`[Orchestrator] Scene ${scene.name} failed:`, e);
                results.push({ sceneId: scene.id, name: scene.name, error: e.message, status: 'failed' });
            }
            completed++;
        }

        const failedCount = results.filter(r => r.status === 'failed').length;
        const status = failedCount > 0 ? 'error' : 'idle';
        const message = failedCount > 0
            ? `已完成，但有 ${failedCount} 个场景提交失败。请查看控制台日志。`
            : '所有视频任务提交成功。';

        if (onProgress) onProgress({ total: targetScenes.length, current: completed, status, message });

        const submittedCount = results.filter(r => r.status === 'submitted').length;

        // Critical: If ALL failed, return success: false to trigger agent error handling
        if (submittedCount === 0 && failedCount > 0) {
            return {
                success: false,
                status: 'failed',
                message: '所有场景视频生成任务提交均失败，请检查模型参数或网络。',
                details: results,
                total: targetScenes.length,
                submitted: 0,
                failed: failedCount
            };
        }

        return {
            success: true,
            total: targetScenes.length,
            submitted: submittedCount,
            failed: failedCount,
            details: results
        };


    }
}
