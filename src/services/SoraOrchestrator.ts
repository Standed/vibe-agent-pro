import { Project, Scene, Shot, Character } from '@/types/project';
import { KaponaiService } from './KaponaiService';
import { SoraPromptService } from './SoraPromptService';
import { UnifiedDataService } from '@/lib/dataService';
import sizeOf from 'image-size';
import { promisify } from 'util';

const sizeOfAsync = promisify(sizeOf);

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
                "shots": chunkShots.map(shot => this.convertShotToSoraShot(shot, involvedCharacters, scene))
            };

            // 时长计算 (Padding & Clamping)
            const chunkDuration = chunkShots.reduce((sum, s) => sum + (s.duration || 5), 0);

            // 策略调整 (User Request):
            // 1. 基础缓冲: +2s 用于剪辑余量
            // 2. 最小时长: 10s (针对单镜头或极短场景，补足到 10s 以提升生成质量和可用性)
            // 3. 最长时长: 15s (Sora 2 限制)

            let requestSeconds = Math.ceil(chunkDuration + 2);
            if (requestSeconds < 10) requestSeconds = 10; // 强制补足到 10s
            if (requestSeconds > 15) requestSeconds = 15; // 限制在 15s

            // 智能分辨率
            const targetSize = this.determineResolution(project.settings.aspectRatio);

            console.log(`[SoraOrchestrator] Generating Task ${i + 1}/${chunks.length}: ${requestSeconds}s, ${targetSize}`);

            const task = await this.kaponai.createVideo({
                model: 'sora-2', // Cost Optimization (5 credits)
                prompt: script,
                seconds: requestSeconds,
                size: targetSize
            });

            taskIds.push(task.id);
        }

        // 4. 持久化存储
        if (!scene.soraGeneration) {
            scene.soraGeneration = { taskId: '', status: 'pending', tasks: [] };
        }

        // Use the first task ID for backward compatibility, store all in tasks
        scene.soraGeneration.taskId = taskIds[0];
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
        const MAX_DURATION = 13; // 2s buffer -> 15s max

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
        // 过滤出需要注册的角色
        const charsToRegister = characters.filter(char =>
            !char.soraIdentity?.username || char.soraIdentity.status !== 'registered'
        );

        if (charsToRegister.length === 0) return;

        console.log(`[Orchestrator] Parallel registering ${charsToRegister.length} characters...`);

        // 并行执行注册流程
        await Promise.all(charsToRegister.map(async (char) => {
            try {
                let refVideoUrl = char.soraIdentity?.referenceVideoUrl;

                // Step A: 生成参考视频 (如果缺失)
                if (!refVideoUrl && char.referenceImages && char.referenceImages.length > 0) {
                    console.log(`[Orchestrator] Generating Ref Video for ${char.name}...`);
                    const refPrompt = this.promptService.generateCharacterReferencePrompt(char);
                    const optimalSize = await this.getOptimalSize(char.referenceImages[0]);

                    const refTask = await this.kaponai.createVideo({
                        model: 'sora-2',
                        prompt: refPrompt,
                        seconds: 10,
                        size: optimalSize,
                        input_reference: char.referenceImages[0]
                    });

                    // 这里的 Wait 是阻塞的，但多个 Wait 并行
                    const completed = await this.kaponai.waitForCompletion(refTask.id);
                    refVideoUrl = completed.video_url || `https://models.kapon.cloud/v1/videos/${refTask.id}/content`;

                    // 更新并立即持久化 URL，防止后续步骤失败导致丢失
                    if (!char.soraIdentity) char.soraIdentity = { username: '', referenceVideoUrl: '', status: 'pending' };
                    char.soraIdentity.referenceVideoUrl = refVideoUrl;
                    char.soraIdentity.taskId = refTask.id;

                    await this.dataService.saveCharacter(projectId, char);
                }

                if (!refVideoUrl) {
                    console.warn(`[Orchestrator] Skip ${char.name}: No ref video source.`);
                    return;
                }

                // Step B: 注册角色获取 ID
                const charRes = await this.kaponai.createCharacter({
                    url: refVideoUrl,
                    timestamps: "1,5"
                });

                if (!char.soraIdentity) char.soraIdentity = { username: '', referenceVideoUrl: '', status: 'pending' };
                char.soraIdentity.username = charRes.username;
                char.soraIdentity.status = 'registered';
                console.log(`[Orchestrator] Registered ${char.name} as @${charRes.username}`);

                await this.dataService.saveCharacter(projectId, char);
            } catch (e) {
                console.error(`[Orchestrator] Failed to register ${char.name}:`, e);
            }
        }));
    }

    /**
     * 辅助：构建 Kaponai 需要的 character_setting
     */
    private buildCharacterSettings(characters: Character[]): Record<string, any> {
        const settings: Record<string, any> = {};
        characters.forEach(char => {
            if (char.soraIdentity?.username) {
                const key = `@${char.soraIdentity.username}`;
                settings[key] = {
                    "name": char.name,
                    "appearance": `${char.appearance} 角色编码：${key}`,
                    "age": 25,
                    "voice": "Hero Brave"
                };
            }
        });
        return settings;
    }

    /**
     * 辅助：将项目 Shot 转换为 Kaponai Sora Shot
     */
    private convertShotToSoraShot(shot: Shot, characters: Character[], scene: Scene): any {
        const visualPrompt = this.promptService.generateVideoPrompt(shot, characters, scene);

        return {
            "action": visualPrompt.slice(0, 50),
            "action_description": visualPrompt,
            "camera": shot.cameraMovement || "Static",
            "duration": shot.duration || 5,
            "location": scene.location || "Unknown",
            "visual": visualPrompt,
            "time": "Day",
            "weather": "Clear"
        };
    }

    private identifyCharactersInScene(project: Project, shots: Shot[]): Character[] {
        const combinedText = shots.map(s => s.description).join(' ');
        return project.characters.filter(char => combinedText.includes(char.name));
    }

    private async getOptimalSize(imagePathOrUrl: string): Promise<string> {
        try {
            if (!imagePathOrUrl) return '1280x720';
            return '1280x720';
        } catch (e) {
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

        const charactersWithoutImages = project.characters.filter(c => !c.referenceImages || c.referenceImages.length === 0);
        if (charactersWithoutImages.length > 0) {
            const names = charactersWithoutImages.map(c => c.name).join(', ');
            throw new Error(`缺少参考图的角色: ${names}`);
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

        if (onProgress) onProgress({ total: targetScenes.length, current: completed, status: 'idle', message: 'Done' });

        return {
            total: targetScenes.length,
            submitted: results.filter(r => r.status === 'submitted').length,
            failed: results.filter(r => r.status === 'failed').length,
            details: results
        };
    }
}
