import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId } from './baseTool';
import { AspectRatio, ImageSize, ShotSize } from '@/types/project';
import { generateMultiViewGrid, urlsToReferenceImages, generateSingleImage } from '../geminiService';
import { VolcanoEngineService } from '../volcanoEngineService';
import { jimengService } from '../jimengService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { storageService } from '@/lib/storageService';
import type { R2PathContext } from '@/lib/r2-path';
import { dataService } from '@/lib/dataService';
import { constructBaseShotPrompt } from '@/utils/promptConstruction';



const parseConcurrency = (val: string | undefined, fallback: number) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const IMAGE_CONCURRENCY = parseConcurrency(
    process.env.AGENT_IMAGE_CONCURRENCY || process.env.NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY,
    3
);

// 场景级并发度：控制同时处理多少个场景（用于 batchGenerateProjectImages）
const SCENE_CONCURRENCY = parseConcurrency(
    process.env.AGENT_SCENE_CONCURRENCY || process.env.NEXT_PUBLIC_AGENT_SCENE_CONCURRENCY,
    2
);

async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<void>
): Promise<void> {
    const results = [];
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < items.length; i++) {
        const p = fn(items[i], i).then(() => {
            executing.delete(p);
        });
        executing.add(p);
        results.push(p);

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    await Promise.all(results);
}

export class GenerationTools {
    private params: BaseToolParams;

    constructor(params: BaseToolParams) {
        this.params = params;
    }

    get project() {
        return this.params.project;
    }

    get storeCallbacks() {
        return this.params.storeCallbacks;
    }

    get userId() {
        return this.params.userId;
    }

    private async saveProChatMessage(shotId: string, prompt: string, result: any, model: string, enrichedPrompt?: string) {
        if (!this.userId || !this.project) {
            console.warn('[AgentTools] Skip Pro chat sync: missing userId or project');
            return;
        }

        try {
            const finalPrompt = enrichedPrompt || prompt;
            const sceneId = result.sceneId || this.project.shots.find(s => s.id === shotId)?.sceneId;

            const userMsgId = generateId();
            await dataService.saveChatMessage({
                id: userMsgId,
                userId: this.userId,
                projectId: this.project.id,
                sceneId: sceneId,
                shotId: shotId,
                scope: 'shot',
                role: 'user',
                content: finalPrompt,
                timestamp: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }, this.userId);

            const assistantMsgId = generateId();
            const lowerModel = model.toLowerCase();
            const modelKey = lowerModel.includes('seedream')
                ? 'seedream'
                : lowerModel.includes('jimeng')
                    ? 'jimeng'
                    : lowerModel.includes('grid')
                        ? 'gemini-grid'
                        : 'gemini-direct';

            const imageUrls = Array.isArray(result?.imageUrls) && result.imageUrls.length > 0
                ? result.imageUrls
                : result?.imageUrl
                    ? [result.imageUrl]
                    : [];

            const assistantMsg: any = {
                id: assistantMsgId,
                userId: this.userId,
                projectId: this.project.id,
                sceneId: sceneId,
                shotId: shotId,
                scope: 'shot',
                role: 'assistant',
                content: `已使用 ${model} 为您生成了分镜图片。`,
                timestamp: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                    images: imageUrls,
                    model: modelKey,
                    source: 'agent_sync',
                }
            };

            if (modelKey === 'gemini-grid') {
                const gridSlices = result.allSlices || [result.imageUrl];
                assistantMsg.metadata.gridData = {
                    fullImage: result.fullGridUrl || result.imageUrl,
                    slices: gridSlices,
                    sceneId: sceneId,
                    shotId: shotId,
                    prompt: finalPrompt,
                    gridRows: result.gridSize === '3x3' ? 3 : 2,
                    gridCols: result.gridSize === '3x3' ? 3 : 2,
                    gridSize: result.gridSize || '2x2',
                    aspectRatio: result.aspectRatio || this.project.settings.aspectRatio,
                };
                assistantMsg.metadata.images = shotId
                    ? gridSlices
                    : [assistantMsg.metadata.gridData.fullImage];
            }

            await dataService.saveChatMessage(assistantMsg, this.userId);
        } catch (err) {
            console.error('[AgentTools] ❌ Failed to sync Pro chat message:', err);
        }
    }

    async generateShotImage(shotId: string, mode: string, gridSize: string, prompt: string, force: boolean = true): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateShotImage', result: null, error: 'Project not found' };

        const shot = this.project.shots.find(s => s.id === shotId);
        if (!shot) return { tool: 'generateShotImage', result: null, error: 'Shot not found' };

        // Agent calls default to force=true to ensure generation happens
        // unless explicitly set to false (which Agent rarely does)
        if (force === false && shot.referenceImage) {
            return { tool: 'generateShotImage', result: { imageUrl: shot.referenceImage, message: 'Image already exists' }, success: true };
        }

        try {
            const scene = this.project.scenes.find(s => s.id === shot.sceneId);
            // 使用共享工具构建基础 Prompt
            const promptParts = constructBaseShotPrompt(this.project, shot);

            // 5. 添加用户额外提示词
            if (prompt) {
                promptParts.push(prompt);
            }

            const basePrompt = promptParts.filter(Boolean).join('\n') || prompt || shot.description || 'Cinematic shot';
            const cleanParts = basePrompt
                .split('\n')
                .map(part => part.trim().replace(/[，,。.]+$/, ''))
                .filter(Boolean);

            const compactPrompt = cleanParts.reduce((acc, part, index) => {
                if (index === 0) return part;
                const separator = part.startsWith('场景描述：') ? '。' : '，';
                return `${acc}${separator}${part}`;
            }, '');

            const promptForModel = mode === 'grid'
                ? Array.from({ length: gridSize === '3x3' ? 9 : 4 }, (_, idx) => `${idx + 1}. ${compactPrompt}`).join('\n')
                : basePrompt;

            // Enrich prompt
            const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(
                promptForModel,
                this.project,
                shot.description // Pass shot description for context
            );

            const refs = await urlsToReferenceImages(referenceImageUrls);
            const aspectRatio = this.project.settings.aspectRatio as AspectRatio;
            const uploadContextBase: R2PathContext = {
                projectId: this.project.id,
                scope: 'shots',
                entityId: shotId,
                model: mode
            };

            let resultUrl: string;
            let finalResult: any = {};

            if (mode === 'grid') {
                const [rows, cols] = gridSize === '3x3' ? [3, 3] : [2, 2];
                const gridData = await generateMultiViewGrid(
                    enrichedPrompt,
                    rows,
                    cols,
                    aspectRatio,
                    '1024x1024' as ImageSize, // Default
                    refs,
                    [],
                    { ...uploadContextBase, assetType: 'grid' }
                );

                // Upload to R2 (Full Grid & Slices)
                let fullGridUrl = gridData.fullImage;
                let sliceUrls = gridData.slices;
                try {
                    const folder = { ...uploadContextBase, assetType: 'grid' } as R2PathContext;
                    if (fullGridUrl.startsWith('data:')) {
                        const base64Data = fullGridUrl.split(',')[1];
                        fullGridUrl = await storageService.uploadBase64ToR2(base64Data, folder, `grid_full_${Date.now()}.png`, this.userId);
                    }
                    sliceUrls = await Promise.all(gridData.slices.map(async (slice, idx) => {
                        if (slice.startsWith('data:')) {
                            const base64Data = slice.split(',')[1];
                            return await storageService.uploadBase64ToR2(base64Data, { ...uploadContextBase, assetType: 'slice' }, `grid_slice_${Date.now()}_${idx}.png`, this.userId);
                        }
                        return slice;
                    }));
                } catch (e) {
                    console.warn('Failed to upload grid/slices to R2, using base64 fallback', e);
                }

                resultUrl = fullGridUrl;
                finalResult = { fullGridUrl, allSlices: sliceUrls, gridSize, aspectRatio };

                // Update Shot (Auto-assign first slice)
                if (this.storeCallbacks?.updateShot) {
                    this.storeCallbacks.updateShot(shotId, {
                        referenceImage: sliceUrls[0],
                        fullGridUrl: fullGridUrl,
                        gridImages: sliceUrls
                    });
                }

                // Add to Shot Generation History
                if (this.storeCallbacks?.addGenerationHistory) {
                    this.storeCallbacks.addGenerationHistory(shotId, {
                        id: generateId(),
                        type: 'image',
                        timestamp: new Date(),
                        prompt: enrichedPrompt,
                        result: sliceUrls[0], // Use result instead of url to match GenerationHistoryItem
                        status: 'success',
                        parameters: {
                            model: 'gemini-grid',
                            aspectRatio: aspectRatio,
                            gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
                            slices: sliceUrls,
                            fullGridUrl: fullGridUrl
                        }
                    });
                }

                // Add to Scene Grid History
                if (this.storeCallbacks?.addGridHistory && shot.sceneId) {
                    this.storeCallbacks.addGridHistory(shot.sceneId, {
                        id: generateId(),
                        fullGridUrl: fullGridUrl,
                        prompt: enrichedPrompt,
                        timestamp: new Date(),
                        gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
                        slices: sliceUrls,
                        aspectRatio: aspectRatio
                    });
                }

            } else {
                // --- Non-Grid Modes ---
                if (mode === 'seedream') {
                    // SeeDream API
                    resultUrl = await VolcanoEngineService.getInstance().generateSingleImage(
                        enrichedPrompt,
                        aspectRatio,
                        referenceImageUrls,
                        { ...uploadContextBase, assetType: 'image', model: 'seedream' }
                    );
                    finalResult = { imageUrl: resultUrl };
                } else if (mode === 'jimeng') {
                    // Jimeng API (异步：生成 + 轮询)
                    const sessionid = typeof window !== 'undefined'
                        ? localStorage.getItem('jimeng_session_id') || undefined
                        : process.env.JIMENG_SESSION_ID;
                    const jimengContext: R2PathContext = {
                        projectId: this.project.id,
                        scope: 'shots',
                        entityId: shotId,
                        assetType: 'image',
                        model: 'jimeng'
                    };

                    const genResult = await jimengService.generateImage({
                        prompt: enrichedPrompt,
                        aspectRatio,
                        imageUrls: referenceImageUrls,
                        sessionid,
                        uploadContext: jimengContext,
                    });

                    if (!genResult.historyId) {
                        throw new Error('Jimeng 生成失败：未返回 historyId');
                    }

                    // 客户端轮询等待完成（避免服务端长阻塞）
                    const pollResult = await jimengService.pollTaskClient(genResult.historyId, sessionid, 120, jimengContext);
                    const jimengUrls = (pollResult.urls && pollResult.urls.length > 0 ? pollResult.urls : (pollResult.url ? [pollResult.url] : []))
                        .filter(Boolean)
                        .slice(0, 4);

                    if (!pollResult.success || jimengUrls.length === 0) {
                        throw new Error('Jimeng 生成失败：轮询超时或无结果');
                    }

                    resultUrl = jimengUrls[0];
                    finalResult = { imageUrl: resultUrl, imageUrls: jimengUrls };
                } else {
                    // Gemini Direct
                    resultUrl = await generateSingleImage(
                        enrichedPrompt,
                        aspectRatio,
                        refs,
                        '2K',
                        { ...uploadContextBase, assetType: 'image' }
                    );
                    finalResult = { imageUrl: resultUrl };
                }

                // Upload resultUrl to R2 if it is Base64
                try {
                    if (resultUrl && resultUrl.startsWith('data:')) {
                        const base64Data = resultUrl.split(',')[1];
                        const r2Url = await storageService.uploadBase64ToR2(
                            base64Data,
                            { ...uploadContextBase, assetType: 'image' },
                            `shot_gen_${shotId}_${Date.now()}.png`,
                            this.userId
                        );
                        resultUrl = r2Url;

                        // Also update finalResult for chat persistence
                        if (finalResult.imageUrl) finalResult.imageUrl = r2Url;
                    }
                } catch (uploadError) {
                    console.error('Failed to upload shot image to R2:', uploadError);
                }

                // Update shot with status = done
                if (this.storeCallbacks?.updateShot) {
                    this.storeCallbacks.updateShot(shotId, { referenceImage: resultUrl, status: 'done' });
                }
                if (this.storeCallbacks?.addGenerationHistory) {
                    this.storeCallbacks.addGenerationHistory(shotId, {
                        id: generateId(),
                        type: 'image',
                        timestamp: new Date(),
                        prompt: enrichedPrompt,
                        result: resultUrl,
                        status: 'success',
                        parameters: {
                            model: mode,
                            gridSize: gridSize as any
                        }
                    });
                }
            }

            // Sync Chat
            await this.saveProChatMessage(shotId, prompt || shot.description, { ...finalResult, imageUrl: resultUrl }, mode, enrichedPrompt);

            return { tool: 'generateShotImage', result: { imageUrl: resultUrl, ...finalResult }, success: true };

        } catch (e: any) {
            return { tool: 'generateShotImage', result: null, success: false, error: e.message };
        }
    }

    async batchGenerateSceneImages(sceneId: string, mode: string, gridSize: string, prompt: string, force: boolean = true): Promise<ToolResult> {
        if (!this.project) return { tool: 'batchGenerateSceneImages', result: null, error: 'Project not found' };

        // Force is true by default for Agent
        const shouldForce = force !== false;
        const shots = this.project.shots.filter(s => s.sceneId === sceneId && (shouldForce || !s.referenceImage));

        if (shots.length === 0) {
            return { tool: 'batchGenerateSceneImages', result: { message: 'No shots to generate', count: 0 }, success: true };
        }

        if (this.storeCallbacks?.setGenerationProgress) {
            this.storeCallbacks.setGenerationProgress({ total: shots.length, current: 0, status: 'running', message: 'Starting batch generation...' });
        }

        let successCount = 0;
        let failedCount = 0;

        if (mode === 'grid') {
            const [rows, cols] = gridSize === '3x3' ? [3, 3] : [2, 2];
            const batchSize = rows * cols;
            const sortedShots = [...shots].sort((a, b) => (a.order || 0) - (b.order || 0));
            const chunks = [];
            for (let i = 0; i < sortedShots.length; i += batchSize) {
                chunks.push(sortedShots.slice(i, i + batchSize));
            }

            await Promise.all(chunks.map(async (chunk, i) => {
                const chunkIndex = i + 1;
                if (this.storeCallbacks?.setGenerationProgress) {
                    this.storeCallbacks.setGenerationProgress({
                        current: successCount + failedCount + 1,
                        message: `Generating Grid Batch ${chunkIndex}/${chunks.length}`
                    });
                }

                try {
                    // Construct Combined Prompt
                    const artStyleVal = this.project?.metadata?.artStyle;
                    const artStyle = artStyleVal ? `Art Style: ${artStyleVal}\n` : '';
                    const sceneDesc = this.project?.scenes?.find(s => s.id === sceneId)?.description || '';
                    let combinedPrompt = `${artStyle}Scene Context: ${sceneDesc}\n`;

                    const involvedCharacters = new Set<string>();
                    chunk.forEach(shot => {
                        shot.mainCharacters?.forEach(c => involvedCharacters.add(c));
                    });
                    if (involvedCharacters.size > 0) {
                        combinedPrompt += `Characters: ${Array.from(involvedCharacters).join(', ')}\n`;
                    }
                    if (prompt) combinedPrompt += `Additional Instructions: ${prompt}\n`;
                    combinedPrompt += `\nShot Requirements (${chunk.length} shots):\n`;
                    chunk.forEach((shot, idx) => {
                        combinedPrompt += `${idx + 1}. ${shot.shotSize}`; // Image gen: Remove camera movement
                        if (shot.description) combinedPrompt += ` - ${shot.description}`;
                        combinedPrompt += '\n';
                    });

                    const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(combinedPrompt, this.project);
                    const refs = await urlsToReferenceImages(referenceImageUrls);
                    const aspectRatio = this.project.settings.aspectRatio as AspectRatio;

                    const gridData = await generateMultiViewGrid(
                        enrichedPrompt,
                        rows,
                        cols,
                        aspectRatio,
                        '1024x1024' as ImageSize,
                        refs,
                        [],
                        { projectId: this.project.id, scope: 'scenes', entityId: sceneId, assetType: 'grid', model: 'gemini-grid' }
                    );

                    // Upload logic
                    let fullGridUrl = gridData.fullImage;
                    let sliceUrls = gridData.slices;
                    const folder = { projectId: this.project.id, scope: 'scenes', entityId: sceneId, assetType: 'grid', model: 'gemini-grid' } as R2PathContext;
                    try {
                        if (fullGridUrl.startsWith('data:')) {
                            const base64Data = fullGridUrl.split(',')[1];
                            fullGridUrl = await storageService.uploadBase64ToR2(base64Data, folder, `grid_full_${Date.now()}_${chunkIndex}.png`, this.userId);
                        }
                        sliceUrls = await Promise.all(gridData.slices.map(async (slice, idx) => {
                            if (slice.startsWith('data:')) {
                                const base64Data = slice.split(',')[1];
                                return await storageService.uploadBase64ToR2(base64Data, { projectId: this.project.id, scope: 'scenes', entityId: sceneId, assetType: 'slice', model: 'gemini-grid' }, `grid_slice_${Date.now()}_${chunkIndex}_${idx}.png`, this.userId);
                            }
                            return slice;
                        }));
                    } catch (e) {
                        console.warn('R2 upload failed', e);
                    }

                    // Update shots
                    const chatSyncPromises: Promise<void>[] = [];
                    chunk.forEach((shot, idx) => {
                        if (idx < sliceUrls.length) {
                            const sliceUrl = sliceUrls[idx];
                            if (this.storeCallbacks?.updateShot) {
                                this.storeCallbacks.updateShot(shot.id, {
                                    referenceImage: sliceUrl,
                                    fullGridUrl: fullGridUrl,
                                    gridImages: sliceUrls,
                                    status: 'done'
                                });
                            }
                            // History
                            if (this.storeCallbacks?.addGenerationHistory) {
                                this.storeCallbacks.addGenerationHistory(shot.id, {
                                    id: generateId(),
                                    type: 'image',
                                    timestamp: new Date(),
                                    prompt: enrichedPrompt,
                                    result: sliceUrl,
                                    status: 'success',
                                    parameters: {
                                        model: 'gemini-grid',
                                        aspectRatio: aspectRatio,
                                        gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
                                        slices: sliceUrls,
                                        fullGridUrl: fullGridUrl
                                    }
                                });
                            }

                            // Pro 聊天同步（批量 Grid 也要在分镜 Pro 历史中可见）
                            chatSyncPromises.push(
                                this.saveProChatMessage(
                                    shot.id,
                                    prompt || shot.description || enrichedPrompt,
                                    {
                                        imageUrl: sliceUrl,
                                        imageUrls: [sliceUrl],
                                        fullGridUrl,
                                        allSlices: sliceUrls,
                                        gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
                                        aspectRatio,
                                        sceneId: shot.sceneId
                                    },
                                    'gemini-grid',
                                    enrichedPrompt
                                )
                            );
                            successCount++;
                        } else {
                            failedCount++;
                        }
                    });

                    await Promise.allSettled(chatSyncPromises);

                    // Scene History
                    if (this.storeCallbacks?.addGridHistory) {
                        this.storeCallbacks.addGridHistory(sceneId, {
                            id: generateId(),
                            fullGridUrl: fullGridUrl,
                            prompt: enrichedPrompt,
                            timestamp: new Date(),
                            gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
                            slices: sliceUrls,
                            aspectRatio: aspectRatio
                        });
                    }

                } catch (e) {
                    console.error(`Failed batch ${chunkIndex}`, e);
                    failedCount += chunk.length;
                }
            }));

        } else {
            // Non-grid mode
            await runWithConcurrency(shots, IMAGE_CONCURRENCY, async (shot, idx) => {
                if (this.storeCallbacks?.setGenerationProgress) {
                    this.storeCallbacks.setGenerationProgress({ current: successCount + failedCount + 1, message: `Generating shot ${idx + 1}/${shots.length}` });
                }
                try {
                    const res = await this.generateShotImage(shot.id, mode, gridSize, prompt, force);
                    if (res.success) successCount++; else failedCount++;
                } catch (e) {
                    failedCount++;
                }
            });
        }

        if (this.storeCallbacks?.setGenerationProgress) {
            this.storeCallbacks.setGenerationProgress({ status: 'idle', message: 'Batch generation complete' });
        }

        return {
            tool: 'batchGenerateSceneImages',
            result: { sceneId, totalShots: shots.length, successCount, failedCount },
            success: true
        };
    }

    async batchGenerateProjectImages(mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
        if (!this.project) return { tool: 'batchGenerateProjectImages', result: null, error: 'Project not found' };

        const scenes = this.project.scenes;
        if (scenes.length === 0) return { tool: 'batchGenerateProjectImages', result: { message: 'No scenes', count: 0 }, success: true };

        if (this.storeCallbacks?.setGenerationProgress) {
            this.storeCallbacks.setGenerationProgress({ total: scenes.length, current: 0, status: 'running', message: 'Starting project generation...' });
        }

        // 使用原子计数器处理并发统计
        const stats = { totalSuccess: 0, totalFailed: 0, totalShots: 0, completed: 0 };

        // 场景级并行处理（使用 SCENE_CONCURRENCY 控制并发度）
        await runWithConcurrency(scenes, SCENE_CONCURRENCY, async (scene, i) => {
            if (this.storeCallbacks?.setGenerationProgress) {
                this.storeCallbacks.setGenerationProgress({
                    current: stats.completed + 1,
                    message: `Processing scene ${i + 1}/${scenes.length}: ${scene.name || `Scene ${i + 1}`}`
                });
            }

            const result = await this.batchGenerateSceneImages(scene.id, mode, gridSize, prompt, force);

            // 原子更新统计
            if (result.success && result.result) {
                stats.totalSuccess += result.result.successCount || 0;
                stats.totalFailed += result.result.failedCount || 0;
                stats.totalShots += result.result.totalShots || 0;
            }
            stats.completed++;
        });

        if (this.storeCallbacks?.setGenerationProgress) {
            this.storeCallbacks.setGenerationProgress({ status: 'idle', message: 'Project generation complete' });
        }

        return {
            tool: 'batchGenerateProjectImages',
            result: { totalShots: stats.totalShots, successCount: stats.totalSuccess, failedCount: stats.totalFailed },
            success: true
        };
    }

    async generateSceneVideo(sceneId: string, model?: 'sora-2' | 'sora-2-pro'): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateSceneVideo', result: null, success: false, error: 'Project not found' };

        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'generateSceneVideo',
                    args: { sceneId, model },
                    project: this.project,
                    userId: this.userId
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success || (data.result && data.result.success === false)) {
                throw new Error(data.error || (data.result && data.result.message) || 'Server execution failed');
            }

            await this.backfillSoraTasks({ ...data.result, sceneId });

            return { tool: 'generateSceneVideo', result: data.result, success: true };
        } catch (e: any) {
            return { tool: 'generateSceneVideo', result: null, success: false, error: `Sora failed: ${e.message}` };
        }
    }

    async generateShotsVideo(
        sceneId: string,
        shotIds: string[],
        shotIndexes: number[],
        globalShotIndexes: number[],
        model?: 'sora-2' | 'sora-2-pro'
    ): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateShotsVideo', result: null, success: false, error: 'Project not found' };

        let finalShotIds = shotIds || [];
        let finalSceneId = sceneId;

        // 按 globalOrder 排序的所有 shots
        const allShotsSorted = [...this.project.shots].sort((a, b) => (a.globalOrder || a.order || 0) - (b.globalOrder || b.order || 0));

        // 优先级 1：globalShotIndexes（全局序号，从 1 开始）
        if (globalShotIndexes && globalShotIndexes.length > 0) {
            finalShotIds = globalShotIndexes
                .map(idx => allShotsSorted[idx - 1]) // 转换为 0-indexed
                .filter((s): s is typeof allShotsSorted[0] => !!s)
                .map(s => s.id);

            // 从第一个 shot 提取 sceneId（如果未指定）
            if (!finalSceneId && finalShotIds.length > 0) {
                const firstShot = this.project.shots.find(s => s.id === finalShotIds[0]);
                finalSceneId = firstShot?.sceneId || '';
            }
        }
        // 优先级 2：shotIndexes（场景内序号，需要 sceneId）
        else if (shotIndexes && shotIndexes.length > 0 && finalSceneId) {
            const sceneShots = this.project.shots
                .filter(s => s.sceneId === finalSceneId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            finalShotIds = shotIndexes
                .map(idx => sceneShots[idx - 1]) // 转换为 0-indexed
                .filter((s): s is typeof sceneShots[0] => !!s)
                .map(s => s.id);
        }

        if (finalShotIds.length === 0) {
            return {
                tool: 'generateShotsVideo',
                result: null,
                success: false,
                error: '未找到对应的分镜，请检查分镜序号是否正确。'
            };
        }

        // 确保 sceneId 有值
        if (!finalSceneId) {
            const firstShot = this.project.shots.find(s => s.id === finalShotIds[0]);
            finalSceneId = firstShot?.sceneId || '';
        }

        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'generateShotsVideo',
                    args: { sceneId: finalSceneId, shotIds: finalShotIds, model },
                    project: this.project,
                    userId: this.userId
                })
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || '服务器执行失败');
            }

            return { tool: 'generateShotsVideo', result: data.result, success: true };
        } catch (e: any) {
            return { tool: 'generateShotsVideo', result: null, success: false, error: e.message };
        }
    }

    async batchGenerateProjectVideosSora(force: boolean = false, model?: 'sora-2' | 'sora-2-pro'): Promise<ToolResult> {
        if (!this.project) return { tool: 'batchGenerateProjectVideosSora', result: null, success: false, error: 'Project not found' };
        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'batchGenerateProjectVideosSora',
                    args: { force: force === true, model },
                    project: this.project,
                    userId: this.userId
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Failed');
            await this.backfillSoraTasks(data.result);
            return { tool: 'batchGenerateProjectVideosSora', result: data.result, success: true };
        } catch (e: any) {
            return { tool: 'batchGenerateProjectVideosSora', result: null, success: false, error: e.message };
        }
    }

    private async backfillSoraTasks(result: any) {
        // Placeholder for backfill logic
    }

    /**
     * Vidu 视频生成（Agent 模式）
     * 根据分镜时长（1-10s，默认 5s）和运镜提示词生成视频
     */
    async generateViduVideo(
        shotId: string,
        mode?: 'img2video' | 'start-end2video' | 'reference2video',
        resolution?: '720p' | '1080p',
        off_peak?: boolean
    ): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateViduVideo', result: null, success: false, error: 'Project not found' };

        const shot = this.project.shots.find(s => s.id === shotId);
        if (!shot) return { tool: 'generateViduVideo', result: null, success: false, error: 'Shot not found' };

        try {
            // 1. 根据分镜时长设置视频时长（1-10s，默认 5s）
            let duration = shot.duration || 5;
            if (duration < 1 || duration > 10) {
                console.warn(`[Vidu] Shot duration ${duration}s 超出范围，使用默认值 5s`);
                duration = 5;
            }

            // 2. 使用 constructBaseShotPrompt 构建提示词（包含运镜信息）
            const promptParts = constructBaseShotPrompt(this.project, shot, { includeCameraMovement: true });

            // (Manual camera movement logic removed as it's now in constructBaseShotPrompt)

            const prompt = promptParts.filter(Boolean).join('，');

            // 3. 准备图片（确保分镜有参考图）
            if (!shot.referenceImage) {
                return {
                    tool: 'generateViduVideo',
                    result: null,
                    success: false,
                    error: '分镜没有参考图，请先生成分镜图片'
                };
            }

            // 4. 调用 API
            const response = await fetch('/api/vidu/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: mode || 'img2video',
                    images: [shot.referenceImage], // 使用数组格式
                    prompt, // prompt 用于所有模式
                    duration,
                    resolution: resolution || '1080p',
                    off_peak: off_peak || false,
                    shotId,
                    projectId: this.project.id
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Vidu 生成失败');
            }

            return {
                tool: 'generateViduVideo',
                result: {
                    taskId: data.taskId,
                    shotId,
                    duration,
                    resolution: resolution || '1080p',
                    message: `Vidu 视频生成任务已提交，任务ID: ${data.taskId}`
                },
                success: true
            };

        } catch (e: any) {
            return { tool: 'generateViduVideo', result: null, success: false, error: `Vidu 生成失败: ${e.message}` };
        }
    }
}
