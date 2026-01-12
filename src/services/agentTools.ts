/**
 * Agent Tool Definitions - Function calling for project operations
 * These tools allow the Agent to query and manipulate project context
 */

import { Project, Scene, Shot, AspectRatio, ImageSize, GenerationHistoryItem, GridHistoryItem, Character } from '@/types/project';
import { VolcanoEngineService } from './volcanoEngineService';
import { generateMultiViewGrid, generateSingleImage, generateCharacterThreeView, urlsToReferenceImages, editImageWithGemini } from './geminiService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
// import { useProjectStore } from '@/store/useProjectStore'; // Not used directly in executor currently
import { storageService } from '@/lib/storageService';
import { dataService } from '@/lib/dataService';
import { AGENT_TOOLS, ToolCall, ToolResult } from './agentToolDefinitions';

// Re-export for compatibility
export { AGENT_TOOLS };
export type { ToolCall, ToolResult };

/**
 * 并发池配置
 * 使用 NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY（或 AGENT_IMAGE_CONCURRENCY）动态控制生成并发，默认 3
 */
const parseConcurrency = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const IMAGE_CONCURRENCY = parseConcurrency(
  process.env.AGENT_IMAGE_CONCURRENCY || process.env.NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY,
  3
);

/**
 * Helper to download and convert image URL to Base64
 */
const fetchToBase64 = async (url: string): Promise<string> => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`获取图片失败: ${resp.status}`);
  }
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片转换失败'));
    reader.readAsDataURL(blob);
  });
};

/**
 * 简单的并发控制器（保序）
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  iterator: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const realLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const current = cursor;
      if (current >= items.length) break;
      cursor++;
      results[current] = await iterator(items[current], current);
    }
  };

  const workers = Array(Math.min(realLimit, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to sanitize tool outputs by removing large Base64 strings
 */
function sanitizeForToolOutput(value: any): any {
  if (typeof value === 'string') {
    if (value.startsWith('data:image') && value.length > 100) {
      return '[Base64 Image Data]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForToolOutput);
  }
  if (typeof value === 'object' && value !== null) {
    const newObj: any = {};
    for (const key in value) {
      newObj[key] = sanitizeForToolOutput(value[key]);
    }
    return newObj;
  }
  return value;
}

/**
 * Store update callbacks interface
 */
export interface StoreCallbacks {
  addGenerationHistory: (shotId: string, item: GenerationHistoryItem) => void;
  addGridHistory: (sceneId: string, item: GridHistoryItem) => void;
  addScene?: (scene: Scene) => void;
  updateScene?: (id: string, updates: Partial<Scene>) => void;
  deleteScene?: (id: string) => void;
  addShot?: (shot: Shot) => void;
  updateShot: (shotId: string, updates: Partial<Shot>) => void;
  deleteShot?: (id: string) => void;
  addCharacter?: (character: Character) => void;
  updateCharacter?: (characterId: string, updates: Partial<any>) => void;
  deleteCharacter?: (id: string) => void;
  renumberScenesAndShots?: () => void;
  setSavingStatus?: (isSaving: boolean) => void;
  setGenerationProgress?: (progress: Partial<{ total: number; current: number; status: 'idle' | 'running' | 'success' | 'error'; message?: string }>) => void;
}

/**
 * Execute tool calls with project context
 */
export class AgentToolExecutor {
  private project: Project | null;
  private storeCallbacks?: StoreCallbacks;
  private userId?: string;
  private pendingTasks: number = 0;

  constructor(project: Project | null, storeCallbacks?: StoreCallbacks, userId?: string) {
    this.project = project;
    this.storeCallbacks = storeCallbacks;
    this.userId = userId;
  }

  private async backfillSoraTasks(result: any): Promise<void> {
    if (!this.project?.id || !this.userId || !result) return;

    const tasks: Array<{ id: string; sceneId?: string; type?: 'shot_generation' | 'character_reference' }> = [];

    if (Array.isArray(result.taskIds)) {
      result.taskIds.forEach((id: string) => {
        if (id) tasks.push({ id, sceneId: result.sceneId, type: 'shot_generation' });
      });
    }

    if (Array.isArray(result.details)) {
      result.details.forEach((item: any) => {
        if (!Array.isArray(item?.tasks)) return;
        item.tasks.forEach((id: string) => {
          if (id) tasks.push({ id, sceneId: item.sceneId, type: 'shot_generation' });
        });
      });
    }

    if (tasks.length === 0) return;

    try {
      await fetch('/api/sora/tasks/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: this.project.id,
          userId: this.userId,
          tasks,
        }),
      });
    } catch (error) {
      console.warn('[AgentTools] Failed to backfill sora tasks:', error);
    }
  }

  /**
   * 使用 Sora 此生场景视频 (Server Action via API)
   */
  private async generateSceneVideo(sceneId: string): Promise<ToolResult> {
    if (!this.project) return { tool: 'generateSceneVideo', result: null, success: false, error: '项目不存在' };

    try {
      // Call Server API
      const response = await fetch('/api/agent/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generateSceneVideo',
          args: { sceneId },
          project: this.project, // Sending full project context
          userId: this.userId
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success || (data.result && data.result.success === false)) {
        const errorMsg = data.error || (data.result && data.result.message) || 'Server execution failed';
        throw new Error(errorMsg);
      }

      await this.backfillSoraTasks({
        ...data.result,
        sceneId,
      });

      return {
        tool: 'generateSceneVideo',
        result: data.result,
        success: true
      };
    } catch (e: any) {
      return {
        tool: 'generateSceneVideo',
        result: null,
        success: false,
        error: `Sora 生成失败: ${e.message}`
      };
    }
  }

  /**
   * 使用 Sora 生成指定分镜视频 (Server Action via API)
   */
  private async generateShotsVideo(
    sceneId?: string,
    shotIds?: string[],
    shotIndexes?: number[],
    globalShotIndexes?: number[]
  ): Promise<ToolResult> {
    if (!this.project) return { tool: 'generateShotsVideo', result: null, success: false, error: '项目不存在' };

    const project = this.project;
    const shotById = new Map(project.shots.map((shot) => [shot.id, shot]));

    const resolveSceneIdForShots = (resolvedShotIds: string[]) => {
      const sceneIds = new Set<string>();
      resolvedShotIds.forEach((id) => {
        const shot = shotById.get(id);
        if (shot?.sceneId) sceneIds.add(shot.sceneId);
      });
      if (sceneIds.size > 1) {
        return { error: '分镜跨多个场景，请按场景分别生成。' } as const;
      }
      const resolvedSceneId = sceneId || Array.from(sceneIds)[0];
      if (!resolvedSceneId) {
        return { error: '缺少场景ID' } as const;
      }
      if (sceneId && sceneId !== resolvedSceneId) {
        return { error: '分镜不属于指定场景' } as const;
      }
      return { sceneId: resolvedSceneId } as const;
    };

    const resolveShotIdsFromSceneIndexes = (sceneShotIndexes: number[]) => {
      if (!sceneId) {
        return { error: '请提供场景ID以解析分镜序号' } as const;
      }
      const sceneShots = project.shots
        .filter((shot) => shot.sceneId === sceneId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (sceneShots.length === 0) {
        return { error: '场景下没有分镜' } as const;
      }
      const resolved = sceneShotIndexes.map((index) => sceneShots[index - 1]).filter(Boolean);
      if (resolved.length !== sceneShotIndexes.length) {
        return { error: '分镜序号超出场景范围' } as const;
      }
      return { shotIds: resolved.map((shot) => shot.id) } as const;
    };

    const normalizeList = (input?: Array<string | number>) => {
      if (!Array.isArray(input)) return [] as number[];
      const seen = new Set<number>();
      const normalized: number[] = [];
      input.forEach((value) => {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) return;
        const index = Math.floor(num);
        if (index < 1 || seen.has(index)) return;
        seen.add(index);
        normalized.push(index);
      });
      return normalized;
    };

    const normalizedGlobalIndexes = normalizeList(globalShotIndexes);

    const buildGlobalShotGroups = (globalIndexes: number[]) => {
      const globalMap = new Map<number, { id: string; sceneId: string | undefined }>();
      for (const shot of project.shots) {
        if (typeof shot.globalOrder !== 'number') {
          return { error: '全局镜头序号不可用，请指定场景' } as const;
        }
        if (globalMap.has(shot.globalOrder)) {
          return { error: '全局镜头序号存在重复，请指定场景' } as const;
        }
        globalMap.set(shot.globalOrder, { id: shot.id, sceneId: shot.sceneId });
      }
      const resolved = globalIndexes
        .map((index) => globalMap.get(index))
        .filter(Boolean) as Array<{ id: string; sceneId?: string }>;
      if (resolved.length !== globalIndexes.length) {
        return { error: '全局镜头序号不存在，请检查输入' } as const;
      }

      const groups = new Map<string, string[]>();
      for (const shot of resolved) {
        if (!shot.sceneId) {
          return { error: '分镜缺少场景信息' } as const;
        }
        const list = groups.get(shot.sceneId) || [];
        list.push(shot.id);
        groups.set(shot.sceneId, list);
      }
      return { groups } as const;
    };

    const runGenerateShots = async (targetSceneId: string, targetShotIds: string[]) => {
      const response = await fetch('/api/agent/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generateShotsVideo',
          args: { sceneId: targetSceneId, shotIds: targetShotIds },
          project: this.project,
          userId: this.userId
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success || (data.result && data.result.success === false)) {
        const errorMsg = data.error || (data.result && data.result.message) || 'Server execution failed';
        throw new Error(errorMsg);
      }
      return data.result;
    };

    const resolvedShotIds = (() => {
      if (Array.isArray(shotIds) && shotIds.length > 0) {
        const unique = Array.from(new Set(shotIds.filter(Boolean)));
        const missing = unique.filter((id) => !shotById.has(id));
        if (missing.length > 0) {
          return { error: `分镜不存在: ${missing.join(', ')}` } as const;
        }
        return { shotIds: unique } as const;
      }

      if (normalizedGlobalIndexes.length > 0) {
        const grouped = buildGlobalShotGroups(normalizedGlobalIndexes);
        if ('error' in grouped) {
          return { error: grouped.error } as const;
        }
        if (grouped.groups.size > 1) {
          return { groupedShots: grouped.groups } as const;
        }
        const [[singleSceneId, ids]] = Array.from(grouped.groups.entries());
        if (sceneId && sceneId !== singleSceneId) {
          return { error: '分镜不属于指定场景' } as const;
        }
        return { shotIds: ids, sceneId: singleSceneId } as const;
      }

      const sceneIndexes = normalizeList(shotIndexes);
      if (sceneIndexes.length > 0) {
        return resolveShotIdsFromSceneIndexes(sceneIndexes);
      }

      return { error: '缺少分镜ID或序号' } as const;
    })();

    if ('error' in resolvedShotIds) {
      return { tool: 'generateShotsVideo', result: null, success: false, error: resolvedShotIds.error };
    }

    if ('groupedShots' in resolvedShotIds) {
      const groupedShots = resolvedShotIds.groupedShots;
      if (!groupedShots) {
        return { tool: 'generateShotsVideo', result: null, success: false, error: '无法解析分镜分组' };
      }
      const details: Array<{ sceneId: string; shotIds: string[]; tasks?: string[]; status: string; error?: string }> = [];
      const allTaskIds: string[] = [];
      let failedCount = 0;

      for (const [targetSceneId, targetShotIds] of groupedShots.entries()) {
        try {
          const result = await runGenerateShots(targetSceneId, targetShotIds);
          const taskIds = Array.isArray(result?.taskIds) ? result.taskIds : [];
          taskIds.forEach((id: string) => allTaskIds.push(id));
          details.push({
            sceneId: targetSceneId,
            shotIds: targetShotIds,
            tasks: taskIds,
            status: 'submitted'
          });
        } catch (error: any) {
          failedCount += 1;
          details.push({
            sceneId: targetSceneId,
            shotIds: targetShotIds,
            status: 'failed',
            error: error.message || '提交失败'
          });
        }
      }

      const submittedCount = details.filter((d) => d.status === 'submitted').length;
      const result = {
        success: submittedCount > 0,
        status: failedCount > 0 ? 'partial' : 'submitted',
        message: failedCount > 0
          ? `已提交 ${submittedCount} 个场景，失败 ${failedCount} 个。`
          : `已提交 ${submittedCount} 个场景。`,
        taskIds: allTaskIds,
        details
      };

      await this.backfillSoraTasks(result);

      return {
        tool: 'generateShotsVideo',
        result,
        success: submittedCount > 0,
        error: submittedCount === 0 ? '所有场景提交失败' : undefined
      };
    }

    const resolvedScene = resolveSceneIdForShots(resolvedShotIds.shotIds);
    if ('error' in resolvedScene) {
      return { tool: 'generateShotsVideo', result: null, success: false, error: resolvedScene.error };
    }
    const targetSceneId = ('sceneId' in resolvedShotIds && resolvedShotIds.sceneId)
      ? resolvedShotIds.sceneId
      : resolvedScene.sceneId;

    try {
      const result = await runGenerateShots(targetSceneId, resolvedShotIds.shotIds);

      await this.backfillSoraTasks({
        ...result,
        sceneId: targetSceneId,
        shotIds: resolvedShotIds.shotIds
      });

      return {
        tool: 'generateShotsVideo',
        result,
        success: true
      };
    } catch (e: any) {
      return {
        tool: 'generateShotsVideo',
        result: null,
        success: false,
        error: `Sora 分镜生成失败: ${e.message}`
      };
    }
  }

  /**
   * 批量为项目生成 Sora 视频 (Server Action via API)
   */
  private async batchGenerateProjectVideosSora(force: boolean = false): Promise<ToolResult> {
    if (!this.project) return { tool: 'batchGenerateProjectVideosSora', result: null, success: false, error: '项目不存在' };

    try {
      // Call Server API
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
      if (!response.ok || !data.success || (data.result && data.result.success === false)) {
        const errorMsg = data.error || (data.result && data.result.message) || 'Server execution failed';
        throw new Error(errorMsg);
      }

      await this.backfillSoraTasks(data.result);

      return {
        tool: 'batchGenerateProjectVideosSora',
        result: data.result,
        success: true
      };
    } catch (e: any) {
      return {
        tool: 'batchGenerateProjectVideosSora',
        result: null,
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Execute a single tool call
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'getProjectContext':
          return this.getProjectContext();

        case 'getSceneDetails':
          return this.getSceneDetails(toolCall.arguments.sceneId);

        case 'searchScenes':
          return this.searchScenes(toolCall.arguments.query);

        case 'getShotDetails':
          return this.getShotDetails(toolCall.arguments.shotId);

        case 'generateShotImage':
          return await this.generateShotImage(
            toolCall.arguments.shotId,
            toolCall.arguments.mode,
            toolCall.arguments.gridSize,
            toolCall.arguments.prompt,
            toolCall.arguments.force
          );

        case 'batchGenerateSceneImages':
          return await this.batchGenerateSceneImages(
            toolCall.arguments.sceneId,
            toolCall.arguments.mode,
            toolCall.arguments.gridSize,
            toolCall.arguments.prompt,
            toolCall.arguments.force
          );

        case 'batchGenerateProjectImages':
          return await this.batchGenerateProjectImages(
            toolCall.arguments.mode,
            toolCall.arguments.gridSize,
            toolCall.arguments.prompt,
            toolCall.arguments.force
          );
        case 'createScene':
          return this.createScene(toolCall.arguments.name, toolCall.arguments.description);
        case 'addShots':
          return this.addShots(
            toolCall.arguments.sceneId,
            toolCall.arguments.count,
            toolCall.arguments.description,
            toolCall.arguments.shots
          );

        case 'generateSceneVideo':
          return await this.generateSceneVideo(
            toolCall.arguments.sceneId
          );

        case 'generateShotsVideo':
          return await this.generateShotsVideo(
            toolCall.arguments.sceneId,
            toolCall.arguments.shotIds,
            toolCall.arguments.shotIndexes,
            toolCall.arguments.globalShotIndexes
          );

        case 'batchGenerateProjectVideosSora':
          return await this.batchGenerateProjectVideosSora(
            toolCall.arguments.force
          );

        case 'generateCharacterThreeView':
          return await this.generateCharacterThreeView(
            toolCall.arguments.characterId,
            toolCall.arguments.prompt,
            toolCall.arguments.artStyle
          );

        case 'generateLocationImages':
          return await this.generateLocationImages(
            toolCall.arguments.locationIds,
            toolCall.arguments.model
          );

        default:
          return {
            tool: toolCall.name,
            result: null,
            success: false,
            error: `Unknown tool: ${toolCall.name}`
          };
      }
    } catch (error: any) {
      return {
        tool: toolCall.name,
        result: null,
        success: false,
        error: error.message || '工具执行失败'
      };
    }
  }

  // --- Helpers ---

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async saveProChatMessage(shotId: string, prompt: string, result: any, model: string, enrichedPrompt?: string) {
    if (!this.userId || !this.project) {
      console.warn('[AgentTools] Skip Pro chat sync: missing userId or project');
      return;
    }

    try {
      const finalPrompt = enrichedPrompt || prompt;
      const sceneId = result.sceneId || this.project.shots.find(s => s.id === shotId)?.sceneId;

      const userMsgId = this.generateId();
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

      const assistantMsgId = this.generateId();
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

  private incrementPendingTasks() {
    this.pendingTasks++;
    if (this.pendingTasks === 1 && this.storeCallbacks?.setSavingStatus) {
      this.storeCallbacks.setSavingStatus(true);
    }
  }

  private decrementPendingTasks() {
    this.pendingTasks = Math.max(0, this.pendingTasks - 1);
    if (this.pendingTasks === 0 && this.storeCallbacks?.setSavingStatus) {
      this.storeCallbacks.setSavingStatus(false);
    }
  }

  // --- Core Tool Implementations ---

  private async getProjectContext(): Promise<ToolResult> {
    if (!this.project) return { tool: 'getProjectContext', result: null, error: '项目不存在' };
    const scenes = this.project.scenes.map(scene => {
      const shots = this.project!.shots.filter(s => s.sceneId === scene.id);
      return {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        order: scene.order,
        shotCount: shots.length,
        shots: shots.map(shot => ({
          id: shot.id,
          order: shot.order,
          description: shot.description,
          shotSize: shot.shotSize,
          duration: shot.duration,
          hasImage: !!shot.referenceImage,
          hasVideo: !!shot.videoClip,
          status: shot.status
        }))
      };
    });
    return {
      tool: 'getProjectContext',
      result: sanitizeForToolOutput({
        projectName: this.project.metadata.title,
        projectDescription: this.project.metadata.description,
        sceneCount: this.project.scenes.length,
        shotCount: this.project.shots.length,
        aspectRatio: this.project.settings.aspectRatio,
        scenes: scenes
      })
    };
  }

  private async getSceneDetails(sceneId: string): Promise<ToolResult> {
    if (!this.project) return { tool: 'getSceneDetails', result: null, error: '项目不存在' };
    const scene = this.project.scenes.find(s => s.id === sceneId);
    if (!scene) return { tool: 'getSceneDetails', result: null, error: `场景 ${sceneId} 不存在` };
    const shots = this.project.shots.filter(s => s.sceneId === sceneId);
    return { tool: 'getSceneDetails', result: sanitizeForToolOutput({ ...scene, shotCount: shots.length, shots }) };
  }

  private searchScenes(query: string): ToolResult {
    if (!this.project) return { tool: 'searchScenes', result: null, error: '项目不存在' };
    const lowerQuery = query.toLowerCase();
    const matchedScenes = this.project.scenes.filter(scene =>
      scene.name.toLowerCase().includes(lowerQuery) ||
      scene.description.toLowerCase().includes(lowerQuery)
    );
    return { tool: 'searchScenes', result: { query, matchCount: matchedScenes.length, scenes: matchedScenes.map(s => ({ id: s.id, name: s.name, description: s.description })) } };
  }

  private getShotDetails(shotId: string): ToolResult {
    if (!this.project) return { tool: 'getShotDetails', result: null, error: '项目不存在' };
    const shot = this.project.shots.find(s => s.id === shotId);
    if (!shot) return { tool: 'getShotDetails', result: null, error: '镜头不存在' };
    const scene = this.project.scenes.find(s => s.id === shot.sceneId);
    return { tool: 'getShotDetails', result: sanitizeForToolOutput({ ...shot, sceneName: scene?.name }) };
  }

  private createScene(name: string, description: string): ToolResult {
    if (!this.storeCallbacks?.addScene) return { tool: 'createScene', result: null, error: 'Store callback missing' };
    const newScene: Scene = {
      id: this.generateId(),
      name,
      description,
      location: 'Unknown',
      order: (this.project?.scenes.length || 0) + 1,
      status: 'draft',
      shotIds: [],
      position: { x: 0, y: 0 }
    };
    this.storeCallbacks.addScene(newScene);
    return { tool: 'createScene', result: { sceneId: newScene.id, name: newScene.name, order: newScene.order }, success: true };
  }

  private addShots(sceneId: string, count: number, description: string, shots?: any[]): ToolResult {
    if (!this.project) return { tool: 'addShots', result: null, error: 'Project not found' };
    const scene = this.project.scenes.find(s => s.id === sceneId);
    if (!scene) return { tool: 'addShots', result: null, error: 'Scene not found' };
    if (!this.storeCallbacks?.addShot) return { tool: 'addShots', result: null, error: 'Store callback missing' };

    const newShots: any[] = [];
    const currentCount = this.project.shots.filter(s => s.sceneId === sceneId).length;
    for (let i = 0; i < count; i++) {
      const shotDef = shots ? shots[i] : null;
      const newShot: Shot = {
        id: this.generateId(),
        sceneId,
        order: currentCount + i + 1,
        shotSize: shotDef?.shotSize || 'Medium Shot',
        cameraMovement: shotDef?.cameraMovement || 'Static',
        description: shotDef?.description || `${description} ${i + 1}`,
        duration: shotDef?.duration || 5,
        status: 'draft',
        narration: shotDef?.narration,
        dialogue: shotDef?.dialogue
      };
      this.storeCallbacks.addShot(newShot);
      newShots.push({ id: newShot.id, description: newShot.description });
    }
    return { tool: 'addShots', result: { sceneId, addedCount: count, shots: newShots }, success: true };
  }

  private async generateCharacterThreeView(characterId: string, prompt: string, artStyle: string): Promise<ToolResult> {
    if (!this.project) return { tool: 'generateCharacterThreeView', result: null, error: 'Project not found' };
    const character = this.project.characters.find(c => c.id === characterId);
    if (!character) return { tool: 'generateCharacterThreeView', result: null, error: 'Character not found' };

    this.incrementPendingTasks();
    try {
      const base64Url = await generateCharacterThreeView(
        prompt || `${character.name}, ${character.description}, ${character.appearance}`,
        artStyle,
        await urlsToReferenceImages(character.referenceImages || [])
      );

      // Upload to R2
      let resultUrl = base64Url;
      const folder = `projects/characters/${this.userId || 'anonymous'}`;
      try {
        if (base64Url.startsWith('data:')) {
          const base64Data = base64Url.split(',')[1];
          resultUrl = await storageService.uploadBase64ToR2(base64Data, folder, undefined, this.userId);
        }
      } catch (uploadError) {
        console.error('Failed to upload character image to R2, falling back to base64:', uploadError);
      }

      // Update character
      if (this.storeCallbacks?.updateCharacter) {
        const newRefs = character.referenceImages ? [...character.referenceImages, resultUrl] : [resultUrl];
        this.storeCallbacks.updateCharacter(characterId, { referenceImages: newRefs });
      }

      return { tool: 'generateCharacterThreeView', result: { imageUrl: resultUrl }, success: true };
    } catch (e: any) {
      return { tool: 'generateCharacterThreeView', result: null, success: false, error: e.message };
    } finally {
      this.decrementPendingTasks();
    }
  }

  private async generateShotImage(shotId: string, mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
    if (!this.project) return { tool: 'generateShotImage', result: null, error: 'Project not found' };

    const shot = this.project.shots.find(s => s.id === shotId);
    if (!shot) return { tool: 'generateShotImage', result: null, error: 'Shot not found' };

    if (!force && shot.referenceImage) {
      return { tool: 'generateShotImage', result: { imageUrl: shot.referenceImage, message: 'Image already exists' }, success: true };
    }

    this.incrementPendingTasks();
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
        shot.description
      );

      // Fix typo in above line "shoot.description" -> "shot.description" during execution below
      // ... re-implement logic

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
            id: this.generateId(),
            type: 'image',
            timestamp: new Date(),
            result: fullGridUrl,
            prompt: enrichedPrompt,
            parameters: {
              model: 'gemini-grid',
              aspectRatio,
              gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
              slices: sliceUrls,
              fullGridUrl: fullGridUrl
            },
            status: 'success'
          });
        }

        // Add to Scene Grid History
        if (this.storeCallbacks?.addGridHistory) {
          this.storeCallbacks.addGridHistory(shot.sceneId, {
            id: this.generateId(),
            timestamp: new Date(),
            prompt: enrichedPrompt,
            gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
            fullGridUrl: fullGridUrl,
            slices: sliceUrls,
            aspectRatio: aspectRatio
          });
        }

        // Sync Chat
        await this.saveProChatMessage(shotId, prompt || shot.description, { ...finalResult, imageUrl: fullGridUrl }, mode, enrichedPrompt);

        return { tool: 'generateShotImage', result: { imageUrl: fullGridUrl, ...finalResult }, success: true };

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
            id: this.generateId(),
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

        // Sync Chat
        await this.saveProChatMessage(shotId, prompt || shot.description, { ...finalResult, imageUrl: resultUrl }, mode, enrichedPrompt);

        return { tool: 'generateShotImage', result: { imageUrl: resultUrl, ...finalResult }, success: true };
      }

    } catch (e: any) {
      return { tool: 'generateShotImage', result: null, success: false, error: e.message };
    } finally {
      this.decrementPendingTasks();
    }
  }

  private async batchGenerateSceneImages(sceneId: string, mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
    if (!this.project) return { tool: 'batchGenerateSceneImages', result: null, error: 'Project not found' };

    // Heuristic: If prompt contains keywords implying regeneration or "all", force generation for all shots
    const shouldForce = force || /all|regenerate|update|全部|所有|重新|覆盖/i.test(prompt || '');

    const shots = this.project.shots.filter(s => s.sceneId === sceneId && (shouldForce || !s.referenceImage));
    if (shots.length === 0) {
      const msg = shouldForce
        ? 'No shots found to generate (even with force=true).'
        : 'No shots found to generate. All shots already have images. If you intended to regenerate them, please set force=true or use keywords like "regenerate all".';
      return { tool: 'batchGenerateSceneImages', result: { message: msg, count: 0 }, success: true };
    }

    if (this.storeCallbacks?.setGenerationProgress) {
      this.storeCallbacks.setGenerationProgress({ total: shots.length, current: 0, status: 'running', message: '开始批量生成...' });
    }

    let successCount = 0;
    let failedCount = 0;

    // --- Batch Grid Generation Logic ---
    if (mode === 'grid') {
      const [rows, cols] = gridSize === '3x3' ? [3, 3] : [2, 2];
      const batchSize = rows * cols;

      // Sort shots by order to ensure sequential grid generation
      const sortedShots = [...shots].sort((a, b) => (a.order || 0) - (b.order || 0));

      // Chunk shots
      const chunks = [];
      for (let i = 0; i < sortedShots.length; i += batchSize) {
        chunks.push(sortedShots.slice(i, i + batchSize));
      }

      // Process chunks in parallel
      await Promise.all(chunks.map(async (chunk, i) => {
        const chunkIndex = i + 1;

        if (this.storeCallbacks?.setGenerationProgress) {
          this.storeCallbacks.setGenerationProgress({
            current: successCount + failedCount + 1,
            message: `正在生成 Grid 批次 ${chunkIndex}/${chunks.length} (${chunk.length} 个镜头)`
          });
        }

        try {
          // 1. Construct Combined Prompt
          const artStyleVal = this.project?.metadata?.artStyle;
          const artStyle = artStyleVal ? `Art Style: ${artStyleVal}\n` : '';
          const sceneDesc = this.project?.scenes?.find(s => s.id === sceneId)?.description || '';
          let combinedPrompt = `${artStyle}Scene Context: ${sceneDesc}\n`;

          // Collect character names from shots to help enrichment
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

          // 2. Enrich Prompt (Character Consistency)
          // We pass the project and the combined prompt. 
          // enrichPromptWithAssets will look for character names in the prompt.
          console.log(`[AgentTools] Enriching prompt for chunk ${chunkIndex}. CombinedPrompt length: ${combinedPrompt.length}`);
          const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(
            combinedPrompt,
            this.project
          );
          console.log(`[AgentTools] Enriched prompt. Found ${referenceImageUrls.length} reference images.`);
          if (referenceImageUrls.length > 0) {
            console.log(`[AgentTools] Reference URLs: ${JSON.stringify(referenceImageUrls)}`);
          }

          // 3. Prepare Reference Images
          const refs = await urlsToReferenceImages(referenceImageUrls);
          console.log(`[AgentTools] Converted to ReferenceImageData. Count: ${refs.length}`);

          // 4. Generate Grid
          const aspectRatio = this.project!.settings.aspectRatio as AspectRatio;
          const gridData = await generateMultiViewGrid(
            enrichedPrompt,
            rows,
            cols,
            aspectRatio,
            '1024x1024' as ImageSize,
            refs
          );

          // 5. Upload to R2 (Full Grid & Slices)
          let fullGridUrl = gridData.fullImage;
          let sliceUrls = gridData.slices;

          try {
            const folder = `projects/${this.project!.id}/grids`;
            if (fullGridUrl.startsWith('data:')) {
              const base64Data = fullGridUrl.split(',')[1];
              fullGridUrl = await storageService.uploadBase64ToR2(base64Data, folder, `grid_full_${Date.now()}.png`, this.userId);
            }

            // Upload slices in parallel
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

          // 6. Assign Slices to Shots & Save History
          chunk.forEach((shot, idx) => {
            if (idx < sliceUrls.length) {
              const sliceUrl = sliceUrls[idx];

              // Update Shot
              if (this.storeCallbacks?.updateShot) {
                this.storeCallbacks.updateShot(shot.id, {
                  referenceImage: sliceUrl,
                  fullGridUrl: fullGridUrl,
                  gridImages: sliceUrls // Store all slices for re-selection
                });
              }

              // Add Generation History
              if (this.storeCallbacks?.addGenerationHistory) {
                this.storeCallbacks.addGenerationHistory(shot.id, {
                  id: this.generateId(),
                  type: 'image',
                  timestamp: new Date(),
                  prompt: enrichedPrompt,
                  result: sliceUrl,
                  status: 'success',
                  parameters: {
                    model: 'gemini-grid',
                    gridSize: gridSize as any,
                    fullGridUrl: fullGridUrl,
                    slices: sliceUrls,
                    sliceIndex: idx
                  }
                });
              }
              successCount++;
            } else {
              failedCount++;
            }
          });

          // 7. Add Scene Grid History
          if (this.storeCallbacks?.addGridHistory) {
            this.storeCallbacks.addGridHistory(sceneId, {
              id: this.generateId(),
              timestamp: new Date(),
              prompt: enrichedPrompt,
              gridSize: (gridSize === '3x3' ? '3x3' : '2x2'),
              fullGridUrl: fullGridUrl,
              slices: sliceUrls,
              aspectRatio: aspectRatio
            });
          }

        } catch (e) {
          console.error(`Failed to generate grid batch ${chunkIndex}`, e);
          failedCount += chunk.length;
        }
      }));

    } else {
      // --- Original Concurrent Logic for Non-Grid Modes ---
      await runWithConcurrency(shots, IMAGE_CONCURRENCY, async (shot, idx) => {
        if (this.storeCallbacks?.setGenerationProgress) {
          this.storeCallbacks.setGenerationProgress({ current: successCount + failedCount + 1, message: `正在生成镜头 ${idx + 1}/${shots.length}` });
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
      this.storeCallbacks.setGenerationProgress({ status: 'idle', message: '批量生成完成' });
    }

    return {
      tool: 'batchGenerateSceneImages',
      result: {
        sceneId,
        totalShots: shots.length,
        successCount,
        failedCount
      },
      success: true
    };
  }

  private async batchGenerateProjectImages(mode: string, gridSize: string, prompt: string, force: boolean): Promise<ToolResult> {
    if (!this.project) return { tool: 'batchGenerateProjectImages', result: null, error: 'Project not found' };

    const scenes = this.project.scenes;
    if (scenes.length === 0) {
      return { tool: 'batchGenerateProjectImages', result: { message: 'No scenes to generate', count: 0 }, success: true };
    }

    if (this.storeCallbacks?.setGenerationProgress) {
      this.storeCallbacks.setGenerationProgress({ total: scenes.length, current: 0, status: 'running', message: '开始项目批量生成...' });
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalShots = 0;

    // Process scenes sequentially to manage concurrency and progress better
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (this.storeCallbacks?.setGenerationProgress) {
        this.storeCallbacks.setGenerationProgress({
          current: i + 1,
          message: `正在处理场景 ${i + 1}/${scenes.length}: ${scene.name}`
        });
      }

      const result = await this.batchGenerateSceneImages(scene.id, mode, gridSize, prompt, force);

      if (result.success && result.result) {
        totalSuccess += result.result.successCount || 0;
        totalFailed += result.result.failedCount || 0;
        totalShots += result.result.totalShots || 0;
      }
    }

    if (this.storeCallbacks?.setGenerationProgress) {
      this.storeCallbacks.setGenerationProgress({ status: 'idle', message: '项目批量生成完成' });
    }

    return {
      tool: 'batchGenerateProjectImages',
      result: {
        totalShots,
        successCount: totalSuccess,
        failedCount: totalFailed,
        message: totalShots === 0 && !force
          ? 'No shots generated. All shots might already have images. Set force=true to regenerate.'
          : undefined
      },
      success: true
    };
  }


  // --- CRUD Implementations ---

  private addCharacter(name: string, description: string, appearance: string): ToolResult {
    if (!this.storeCallbacks?.addCharacter) return { tool: 'addCharacter', result: null, error: 'Store callback missing' };
    const newCharacter: Character = {
      id: this.generateId(),
      name,
      description,
      appearance,
      referenceImages: []
    };
    this.storeCallbacks.addCharacter(newCharacter);
    return { tool: 'addCharacter', result: { characterId: newCharacter.id, name }, success: true };
  }

  private updateCharacter(characterId: string, updates: Partial<Character>): ToolResult {
    if (!this.project) return { tool: 'updateCharacter', result: null, error: 'Project not found' };
    const character = this.project.characters.find(c => c.id === characterId);
    if (!character) return { tool: 'updateCharacter', result: null, error: 'Character not found' };
    if (!this.storeCallbacks?.updateCharacter) return { tool: 'updateCharacter', result: null, error: 'Store callback missing' };

    this.storeCallbacks.updateCharacter(characterId, updates);
    return { tool: 'updateCharacter', result: { characterId, updates }, success: true };
  }

  private deleteCharacter(characterId: string): ToolResult {
    if (!this.project) return { tool: 'deleteCharacter', result: null, error: 'Project not found' };
    if (!this.storeCallbacks?.deleteCharacter) return { tool: 'deleteCharacter', result: null, error: 'Store callback missing' };

    this.storeCallbacks.deleteCharacter(characterId);
    return { tool: 'deleteCharacter', result: { characterId }, success: true };
  }

  private updateScene(sceneId: string, updates: Partial<Scene>): ToolResult {
    if (!this.project) return { tool: 'updateScene', result: null, error: 'Project not found' };
    if (!this.storeCallbacks?.updateScene) return { tool: 'updateScene', result: null, error: 'Store callback missing' };

    this.storeCallbacks.updateScene(sceneId, updates);
    return { tool: 'updateScene', result: { sceneId, updates }, success: true };
  }

  private deleteScene(sceneId: string): ToolResult {
    if (!this.project) return { tool: 'deleteScene', result: null, error: 'Project not found' };
    if (!this.storeCallbacks?.deleteScene) return { tool: 'deleteScene', result: null, error: 'Store callback missing' };

    this.storeCallbacks.deleteScene(sceneId);
    return { tool: 'deleteScene', result: { sceneId }, success: true };
  }

  private updateShot(shotId: string, updates: Partial<Shot>): ToolResult {
    if (!this.project) return { tool: 'updateShot', result: null, error: 'Project not found' };
    if (!this.storeCallbacks?.updateShot) return { tool: 'updateShot', result: null, error: 'Store callback missing' };

    this.storeCallbacks.updateShot(shotId, updates);
    return { tool: 'updateShot', result: { shotId, updates }, success: true };
  }

  private deleteShot(shotId: string): ToolResult {
    if (!this.project) return { tool: 'deleteShot', result: null, error: 'Project not found' };
    if (!this.storeCallbacks?.deleteShot) return { tool: 'deleteShot', result: null, error: 'Store callback missing' };

    this.storeCallbacks.deleteShot(shotId);
    return { tool: 'deleteShot', result: { shotId }, success: true };
  }

  /**
   * 批量为没有参考图的场景地点生成参考图
   */
  private async generateLocationImages(locationIds?: string[], model: string = 'jimeng'): Promise<ToolResult> {
    if (!this.project) return { tool: 'generateLocationImages', result: null, success: false, error: 'Project not found' };

    const locations = this.project.locations || [];

    // Filter locations to process
    let targetLocations = locations.filter(loc => !loc.referenceImages || loc.referenceImages.length === 0);

    if (locationIds && locationIds.length > 0) {
      targetLocations = targetLocations.filter(loc => locationIds.includes(loc.id));
    }

    if (targetLocations.length === 0) {
      return {
        tool: 'generateLocationImages',
        result: { message: '所有场景地点都已有参考图' },
        success: true
      };
    }

    const results: Array<{ locationId: string; name: string; status: string; imageUrl?: string; error?: string }> = [];
    let successCount = 0;

    for (const location of targetLocations) {
      try {
        // Build prompt from location data
        const prompt = this.buildLocationPrompt(location);

        // Generate image using Jimeng (via VolcanoEngineService)
        const volcanoEngine = new VolcanoEngineService();
        const aspectRatio = this.project.settings?.aspectRatio || '21:9';

        const imageBase64 = await volcanoEngine.generateSingleImage(prompt, aspectRatio);

        if (!imageBase64) {
          throw new Error('图片生成失败');
        }

        // Upload to R2
        let finalUrl = imageBase64;
        if (this.userId && imageBase64.startsWith('data:')) {
          try {
            const base64Data = imageBase64.split(',')[1];
            const folder = `projects/${this.project.id}/locations`;
            finalUrl = await storageService.uploadBase64ToR2(
              base64Data,
              folder,
              `${location.id}_reference_${Date.now()}.png`,
              this.userId
            );
          } catch (uploadErr) {
            console.warn('[generateLocationImages] R2 upload failed, using base64');
          }
        }

        results.push({
          locationId: location.id,
          name: location.name,
          status: 'success',
          imageUrl: finalUrl
        });
        successCount++;

      } catch (err: any) {
        results.push({
          locationId: location.id,
          name: location.name,
          status: 'failed',
          error: err.message
        });
      }
    }

    return {
      tool: 'generateLocationImages',
      result: {
        total: targetLocations.length,
        success: successCount,
        failed: targetLocations.length - successCount,
        details: results
      },
      success: successCount > 0
    };
  }

  private buildLocationPrompt(location: { name: string; type: string; description: string }): string {
    const parts: string[] = [];

    if (location.name) {
      parts.push(location.name);
    }

    if (location.description) {
      parts.push(location.description);
    }

    if (location.type === 'interior') {
      parts.push('室内场景');
    } else {
      parts.push('室外场景');
    }

    parts.push('电影级场景概念设计图，高质量，细节丰富，光影考究，宽屏构图');

    if (this.project?.metadata?.artStyle) {
      parts.push(`艺术风格: ${this.project.metadata.artStyle}`);
    }

    return parts.join('，');
  }
}
