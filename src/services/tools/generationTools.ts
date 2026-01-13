import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId } from './baseTool';
import { AspectRatio, ImageSize } from '@/types/project';
import { generateMultiViewGrid, urlsToReferenceImages, generateSingleImage } from '../geminiService';
import { VolcanoEngineService } from '../volcanoEngineService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { storageService } from '@/lib/storageService';
import { dataService } from '@/lib/dataService';

const parseConcurrency = (val: string | undefined, fallback: number) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const IMAGE_CONCURRENCY = parseConcurrency(
    process.env.AGENT_IMAGE_CONCURRENCY || process.env.NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY,
    3
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
            const modelKey = model.toLowerCase().includes('seedream') ? 'seedream' :
                (model.toLowerCase().includes('grid') ? 'gemini-grid' : 'gemini-direct');

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
                    images: [result.imageUrl],
                    model: modelKey,
                }
            };

            if (modelKey === 'gemini-grid') {
                assistantMsg.metadata.gridData = {
                    fullImage: result.fullGridUrl || result.imageUrl,
                    slices: result.allSlices || [result.imageUrl],
                    sceneId: sceneId,
                    shotId: shotId,
                    prompt: finalPrompt,
                    gridRows: result.gridSize === '3x3' ? 3 : 2,
                    gridCols: result.gridSize === '3x3' ? 3 : 2,
                    gridSize: result.gridSize || '2x2',
                    aspectRatio: result.aspectRatio || this.project.settings.aspectRatio,
                };
                assistantMsg.metadata.images = [assistantMsg.metadata.gridData.fullImage];
            }

            await dataService.saveChatMessage(assistantMsg, this.userId);
        } catch (err) {
            console.error('[AgentTools] ❌ Failed to sync Pro chat message:', err);
        }
    }

    async generateShotImage(shotId: string, mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateShotImage', result: null, error: 'Project not found' };

        const shot = this.project.shots.find(s => s.id === shotId);
        if (!shot) return { tool: 'generateShotImage', result: null, error: 'Shot not found' };

        if (!force && shot.referenceImage) {
            return { tool: 'generateShotImage', result: { imageUrl: shot.referenceImage, message: 'Image already exists' }, success: true };
        }

        try {
            const scene = this.project.scenes.find(s => s.id === shot.sceneId);
            const promptParts: string[] = [];

            if (scene?.description) {
                promptParts.push(`场景：${scene.description}`);
            }

            const shotDetails: string[] = [];
            if (shot.shotSize) shotDetails.push(`景别：${shot.shotSize}`);
            if (shot.cameraMovement) shotDetails.push(`运镜：${shot.cameraMovement}`);
            if (shot.description) shotDetails.push(`内容：${shot.description}`);
            if (shotDetails.length > 0) {
                promptParts.push(shotDetails.join('，'));
            }

            if (this.project.metadata?.artStyle) {
                promptParts.push(`画风：${this.project.metadata.artStyle}`);
            }

            if (prompt) {
                promptParts.push(`额外要求：${prompt}`);
            }

            const basePrompt = promptParts.filter(Boolean).join('\n') || prompt || shot.description || 'Cinematic shot';
            const compactPrompt = basePrompt
                .split('\n')
                .map(part => part.trim())
                .filter(Boolean)
                .join('，');

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
                    refs
                );

                // Upload to R2 (Full Grid & Slices)
                let fullGridUrl = gridData.fullImage;
                let sliceUrls = gridData.slices;
                try {
                    const folder = `projects/${this.project.id}/grids`;
                    if (fullGridUrl.startsWith('data:')) {
                        const base64Data = fullGridUrl.split(',')[1];
                        fullGridUrl = await storageService.uploadBase64ToR2(base64Data, folder, `grid_full_${Date.now()}.png`, this.userId);
                    }
                    sliceUrls = await Promise.all(gridData.slices.map(async (slice, idx) => {
                        if (slice.startsWith('data:')) {
                            const base64Data = slice.split(',')[1];
                            return await storageService.uploadBase64ToR2(base64Data, folder, `grid_slice_${Date.now()}_${idx}.png`, this.userId);
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
                if (mode === 'seedream' || mode === 'jimeng') {
                    // Volcano Engine (SeeDream / Jimeng)
                    resultUrl = await VolcanoEngineService.getInstance().generateSingleImage(
                        enrichedPrompt,
                        aspectRatio,
                        referenceImageUrls // expects string[]
                    );
                    finalResult = { imageUrl: resultUrl };
                } else {
                    // Gemini Direct
                    resultUrl = await generateSingleImage(
                        enrichedPrompt,
                        aspectRatio,
                        refs
                    );
                    finalResult = { imageUrl: resultUrl };
                }

                // Upload resultUrl to R2 if it is Base64
                try {
                    if (resultUrl && resultUrl.startsWith('data:')) {
                        const base64Data = resultUrl.split(',')[1];
                        const r2Url = await storageService.uploadBase64ToR2(
                            base64Data,
                            `projects/shots/${this.userId || 'anonymous'}`,
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

                // Update shot
                if (this.storeCallbacks?.updateShot) {
                    this.storeCallbacks.updateShot(shotId, { referenceImage: resultUrl });
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

    async batchGenerateSceneImages(sceneId: string, mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
        if (!this.project) return { tool: 'batchGenerateSceneImages', result: null, error: 'Project not found' };

        const shouldForce = force || /all|regenerate|update|全部|所有|重新|覆盖/i.test(prompt || '');
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
                        combinedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}`;
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
                        refs
                    );

                    // Upload logic
                    let fullGridUrl = gridData.fullImage;
                    let sliceUrls = gridData.slices;
                    const folder = `projects/${this.project.id}/grids`;
                    try {
                        if (fullGridUrl.startsWith('data:')) {
                            const base64Data = fullGridUrl.split(',')[1];
                            fullGridUrl = await storageService.uploadBase64ToR2(base64Data, folder, `grid_full_${Date.now()}_${chunkIndex}.png`, this.userId);
                        }
                        sliceUrls = await Promise.all(gridData.slices.map(async (slice, idx) => {
                            if (slice.startsWith('data:')) {
                                const base64Data = slice.split(',')[1];
                                return await storageService.uploadBase64ToR2(base64Data, folder, `grid_slice_${Date.now()}_${chunkIndex}_${idx}.png`, this.userId);
                            }
                            return slice;
                        }));
                    } catch (e) {
                        console.warn('R2 upload failed', e);
                    }

                    // Update shots
                    chunk.forEach((shot, idx) => {
                        if (idx < sliceUrls.length) {
                            const sliceUrl = sliceUrls[idx];
                            if (this.storeCallbacks?.updateShot) {
                                this.storeCallbacks.updateShot(shot.id, {
                                    referenceImage: sliceUrl,
                                    fullGridUrl: fullGridUrl,
                                    gridImages: sliceUrls
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
                            successCount++;
                        } else {
                            failedCount++;
                        }
                    });

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

        let totalSuccess = 0;
        let totalFailed = 0;
        let totalShots = 0;

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            if (this.storeCallbacks?.setGenerationProgress) {
                this.storeCallbacks.setGenerationProgress({ current: i + 1, message: `Processing scene ${i + 1}/${scenes.length}: ${scene.name}` });
            }

            const result = await this.batchGenerateSceneImages(scene.id, mode, gridSize, prompt, force);
            if (result.success && result.result) {
                totalSuccess += result.result.successCount || 0;
                totalFailed += result.result.failedCount || 0;
                totalShots += result.result.totalShots || 0;
            }
        }

        if (this.storeCallbacks?.setGenerationProgress) {
            this.storeCallbacks.setGenerationProgress({ status: 'idle', message: 'Project generation complete' });
        }

        return {
            tool: 'batchGenerateProjectImages',
            result: { totalShots, successCount: totalSuccess, failedCount: totalFailed },
            success: true
        };
    }

    async generateSceneVideo(sceneId: string): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateSceneVideo', result: null, success: false, error: 'Project not found' };

        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'generateSceneVideo',
                    args: { sceneId },
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

    async generateShotsVideo(sceneId: string, shotIds: string[], shotIndexes: number[], globalShotIndexes: number[]): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateShotsVideo', result: null, success: false, error: 'Project not found' };

        let finalShotIds = shotIds || [];

        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'generateShotsVideo',
                    args: { sceneId, shotIds: finalShotIds },
                    project: this.project,
                    userId: this.userId
                })
            });
            const data = await response.json();
            return { tool: 'generateShotsVideo', result: data.result, success: true };
        } catch (e: any) {
            return { tool: 'generateShotsVideo', result: null, success: false, error: e.message };
        }
    }

    async batchGenerateProjectVideosSora(force: boolean): Promise<ToolResult> {
        if (!this.project) return { tool: 'batchGenerateProjectVideosSora', result: null, success: false, error: 'Project not found' };
        try {
            const response = await fetch('/api/agent/tools/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool: 'batchGenerateProjectVideosSora',
                    args: { force },
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
}
