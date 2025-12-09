/**
 * Agent Tool Definitions - Function calling for project operations
 * These tools allow the Agent to query and manipulate project context
 */

import { Project, Scene, Shot, AspectRatio, ImageSize, GenerationHistoryItem, GridHistoryItem } from '@/types/project';
import { VolcanoEngineService } from './volcanoEngineService';
import { generateMultiViewGrid, editImageWithGemini, urlsToReferenceImages } from './geminiService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { useProjectStore } from '@/store/useProjectStore';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>; // Changed to any to support nested structures
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool: string;
  result: any;
  error?: string;
  success?: boolean;
}

/**
 * 并发池配置
 * 使用 NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY（或 AGENT_IMAGE_CONCURRENCY）动态控制生成并发，默认 3
 */
const parseConcurrency = (val: string | undefined, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const IMAGE_CONCURRENCY = parseConcurrency(
  process.env.NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY || process.env.AGENT_IMAGE_CONCURRENCY,
  3
);
const SEEDREAM_MAX_RETRIES = parseConcurrency(
  process.env.NEXT_PUBLIC_SEEDREAM_MAX_RETRIES || process.env.SEEDREAM_MAX_RETRIES,
  2
);
const SEEDREAM_RETRY_DELAY_MS = parseConcurrency(
  process.env.NEXT_PUBLIC_SEEDREAM_RETRY_DELAY_MS || process.env.SEEDREAM_RETRY_DELAY_MS,
  1200
);

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
 * Define available tools for the Agent
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'getProjectContext',
    description: '获取项目的完整上下文信息，包括所有场景和镜头的详细信息',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getSceneDetails',
    description: '获取指定场景的详细信息，包括该场景下的所有镜头',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: '场景的ID'
        }
      },
      required: ['sceneId']
    }
  },
  {
    name: 'searchScenes',
    description: '根据名称或描述搜索场景',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词（场景名称或描述）'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'getShotDetails',
    description: '获取指定镜头的详细信息',
    parameters: {
      type: 'object',
      properties: {
        shotId: {
          type: 'string',
          description: '镜头的ID'
        }
      },
      required: ['shotId']
    }
  },
  {
    name: 'generateShotImage',
    description: '为单个分镜生成图片（支持 SeeDream、Gemini 直出、Grid 三种模式）',
    parameters: {
      type: 'object',
      properties: {
        shotId: {
          type: 'string',
          description: '分镜的ID'
        },
        mode: {
          type: 'string',
          description: '生成模式：seedream (火山引擎单图)、gemini (Gemini 直出)、grid (Gemini Grid 多视图)',
          enum: ['seedream', 'gemini', 'grid']
        },
        prompt: {
          type: 'string',
          description: '生成提示词（可选，如不提供则使用分镜描述）'
        }
      },
      required: ['shotId', 'mode']
    }
  },
  {
    name: 'batchGenerateSceneImages',
    description: '批量生成指定场景的所有未生成图片的分镜',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: '场景的ID'
        },
        mode: {
          type: 'string',
          description: '生成模式：seedream (火山引擎单图)、gemini (Gemini 直出)、grid (Gemini Grid 自动分配)',
          enum: ['seedream', 'gemini', 'grid']
        },
        gridSize: {
          type: 'string',
          description: 'Grid 模式的网格大小（仅 grid 模式需要）',
          enum: ['2x2', '3x3']
        },
        prompt: {
          type: 'string',
          description: '额外的生成要求（可选）'
        }
      },
      required: ['sceneId', 'mode']
    }
  },
  {
    name: 'batchGenerateProjectImages',
    description: '批量生成整个项目中所有未生成图片的分镜',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '生成模式：seedream (火山引擎单图)、gemini (Gemini 直出)',
          enum: ['seedream', 'gemini']
        },
        prompt: {
          type: 'string',
          description: '额外的生成要求（可选）'
        }
      },
      required: ['mode']
    }
  },
  {
    name: 'createScene',
    description: '创建新的场景',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '场景名称'
        },
        description: {
          type: 'string',
          description: '场景描述'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'addShots',
    description: '向指定场景添加镜头',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: '目标场景ID'
        },
        count: {
          type: 'number',
          description: '要添加的镜头数量'
        },
        description: {
          type: 'string',
          description: '镜头描述'
        },
        shots: {
          type: 'array',
          description: '可选：指定每个新镜头的详细要素（推荐携带视听语言）',
          items: {
            type: 'object',
            properties: {
              shotSize: { type: 'string', description: '镜头景别，如 Medium Shot, Close-Up 等' },
              cameraMovement: { type: 'string', description: '镜头运动，如 Dolly In, Pan Left 等' },
              description: { type: 'string', description: '画面/动作/情绪描述，含视听语言细节' },
              narration: { type: 'string', description: '旁白/内心独白（可选）' },
              dialogue: { type: 'string', description: '对话（可选）' },
              duration: { type: 'number', description: '时长（秒，可选）' },
            },
            required: ['shotSize', 'cameraMovement', 'description']
          }
        }
      },
      required: ['sceneId', 'count']
    }
  }
];

/**
 * Store update callbacks interface
 */
export interface StoreCallbacks {
  updateShot: (shotId: string, updates: Partial<Shot>) => void;
  addGenerationHistory: (shotId: string, item: GenerationHistoryItem) => void;
  addGridHistory: (sceneId: string, item: GridHistoryItem) => void;
  addScene?: (scene: Scene) => void;
  addShot?: (shot: Shot) => void;
  renumberScenesAndShots?: () => void;
}

/**
 * Execute tool calls with project context
 */
export class AgentToolExecutor {
  private project: Project | null;
  private storeCallbacks?: StoreCallbacks;

  constructor(project: Project | null, storeCallbacks?: StoreCallbacks) {
    this.project = project;
    this.storeCallbacks = storeCallbacks;
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
            toolCall.arguments.prompt
          );

        case 'batchGenerateSceneImages':
          return await this.batchGenerateSceneImages(
            toolCall.arguments.sceneId,
            toolCall.arguments.mode,
            toolCall.arguments.gridSize,
            toolCall.arguments.prompt
          );

        case 'batchGenerateProjectImages':
          return await this.batchGenerateProjectImages(
            toolCall.arguments.mode,
            toolCall.arguments.prompt
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

  /**
   * Get full project context
   */
  private getProjectContext(): ToolResult {
    if (!this.project) {
      return {
        tool: 'getProjectContext',
        result: null,
        error: '项目不存在'
      };
    }

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
      result: {
        projectName: this.project.metadata.title,
        projectDescription: this.project.metadata.description,
        sceneCount: this.project.scenes.length,
        shotCount: this.project.shots.length,
        aspectRatio: this.project.settings.aspectRatio,
        scenes: scenes
      }
    };
  }

  /**
   * Get details of a specific scene
   */
  private getSceneDetails(sceneId: string): ToolResult {
    if (!this.project) {
      return {
        tool: 'getSceneDetails',
        result: null,
        error: '项目不存在'
      };
    }

    const scene = this.project.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return {
        tool: 'getSceneDetails',
        result: null,
        error: `场景 ${sceneId} 不存在`
      };
    }

    const shots = this.project.shots.filter(s => s.sceneId === sceneId);

    return {
      tool: 'getSceneDetails',
      result: {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        location: scene.location,
        order: scene.order,
        status: scene.status,
        shotCount: shots.length,
        shots: shots.map(shot => ({
          id: shot.id,
          order: shot.order,
          description: shot.description,
          shotSize: shot.shotSize,
          cameraMovement: shot.cameraMovement,
          duration: shot.duration,
          hasImage: !!shot.referenceImage,
          hasVideo: !!shot.videoClip,
          status: shot.status
        }))
      }
    };
  }

  /**
   * Search scenes by name, description, or scene number/order
   */
  private searchScenes(query: string): ToolResult {
    if (!this.project) {
      return {
        tool: 'searchScenes',
        result: null,
        error: '项目不存在'
      };
    }

    const lowerQuery = query.toLowerCase();
    let matchedScenes = this.project.scenes;

    // Try to extract scene number/order from query (e.g., "场景 2", "scene 2", "2")
    const numberMatch = query.match(/(\d+)/);
    if (numberMatch) {
      const sceneNumber = parseInt(numberMatch[1], 10);

      // First try to match by order
      const sceneByOrder = this.project.scenes.find(scene => scene.order === sceneNumber);
      if (sceneByOrder) {
        matchedScenes = [sceneByOrder];
      } else {
        // If no exact order match, try to match by index (1-based)
        const sceneByIndex = this.project.scenes[sceneNumber - 1];
        if (sceneByIndex) {
          matchedScenes = [sceneByIndex];
        } else {
          // Fallback to text search
          matchedScenes = this.project.scenes.filter(scene =>
            scene.name.toLowerCase().includes(lowerQuery) ||
            scene.description.toLowerCase().includes(lowerQuery)
          );
        }
      }
    } else {
      // Text-based search
      matchedScenes = this.project.scenes.filter(scene =>
        scene.name.toLowerCase().includes(lowerQuery) ||
        scene.description.toLowerCase().includes(lowerQuery)
      );
    }

    return {
      tool: 'searchScenes',
      result: {
        query: query,
        matchCount: matchedScenes.length,
        scenes: matchedScenes.map(scene => ({
          id: scene.id,
          name: scene.name,
          description: scene.description,
          order: scene.order,
          shotCount: this.project!.shots.filter(s => s.sceneId === scene.id).length
        }))
      }
    };
  }

  /**
   * Get details of a specific shot
   */
  private getShotDetails(shotId: string): ToolResult {
    if (!this.project) {
      return {
        tool: 'getShotDetails',
        result: null,
        error: '项目不存在'
      };
    }

    const shot = this.project.shots.find(s => s.id === shotId);
    if (!shot) {
      return {
        tool: 'getShotDetails',
        result: null,
        error: `镜头 ${shotId} 不存在`
      };
    }

    const scene = this.project.scenes.find(s => s.id === shot.sceneId);

    return {
      tool: 'getShotDetails',
      result: {
        id: shot.id,
        order: shot.order,
        sceneName: scene?.name || 'Unknown',
        description: shot.description,
        shotSize: shot.shotSize,
        cameraMovement: shot.cameraMovement,
        duration: shot.duration,
        hasImage: !!shot.referenceImage,
        hasVideo: !!shot.videoClip,
        status: shot.status,
        generationHistory: shot.generationHistory?.length || 0
      }
    };
  }

  /**
   * Create a new scene
   */
  private createScene(name: string, description?: string): ToolResult {
    if (!this.project) {
      return {
        tool: 'createScene',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    if (!this.storeCallbacks?.addScene) {
      return {
        tool: 'createScene',
        result: null,
        success: false,
        error: '缺少 addScene 回调，无法创建场景'
      };
    }

    // 名称归一化：尝试提取“场景 X”编号，或前缀匹配，避免重复创建
    const normalize = (n: string) =>
      n
        .trim()
        .replace(/[:：-].*$/, '') // 去掉冒号后缀
        .replace(/\s+/g, ' ') // 归一空格
        .toLowerCase();
    const baseName = normalize(name || '');

    const extractIndex = (n: string): number | null => {
      const m = n.match(/场景\s*(\d+)/);
      return m ? Number(m[1]) : null;
    };
    const targetIndex = extractIndex(name || '');

    const existing = this.project.scenes.find(s => {
      const n = s.name || '';
      const norm = normalize(n);
      if (baseName && (norm === baseName || norm.startsWith(baseName))) return true;
      const idx = extractIndex(n);
      if (targetIndex !== null && idx === targetIndex) return true;
      return false;
    });
    if (existing) {
      return {
        tool: 'createScene',
        result: {
          sceneId: existing.id,
          name: existing.name,
          order: existing.order,
          reused: true,
        },
        success: true,
      };
    }

    const order = this.project.scenes.length + 1;
    const scene: Scene = {
      id: `scene_${Date.now()}`,
      name: name || `场景 ${order}`,
      location: '',
      description: description || '',
      shotIds: [],
      position: { x: order * 200, y: 100 },
      order,
      status: 'draft',
      created: new Date(),
      modified: new Date(),
    };

    this.storeCallbacks.addScene(scene);

    return {
      tool: 'createScene',
      result: {
        sceneId: scene.id,
        name: scene.name,
        order: scene.order,
      },
      success: true,
    };
  }

  /**
   * Add multiple shots to a scene
   */
  private addShots(
    sceneId: string,
    count: number,
    description?: string,
    shots?: Array<Partial<Shot>>
  ): ToolResult {
    if (!this.project) {
      return {
        tool: 'addShots',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    if (!this.storeCallbacks?.addShot) {
      return {
        tool: 'addShots',
        result: null,
        success: false,
        error: '缺少 addShot 回调，无法添加分镜'
      };
    }

    const scene = this.project.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return {
        tool: 'addShots',
        result: null,
        success: false,
        error: `场景 ${sceneId} 不存在`
      };
    }

    const countNum = Number(count);
    if (!Number.isFinite(countNum) || countNum <= 0) {
      return {
        tool: 'addShots',
        result: null,
        success: false,
        error: '镜头数量无效'
      };
    }

    const defaultDuration = this.project.settings?.defaultShotDuration || 5;
    const createdShots: Shot[] = [];
    const baseIndex = this.project.shots.filter(s => s.sceneId === sceneId).length;

    const providedShots = Array.isArray(shots) && shots.length > 0 ? shots : undefined;

    for (let i = 0; i < countNum; i++) {
      const spec = providedShots?.[i];
      const shot: Shot = {
        id: `shot_${Date.now()}_${i}`,
        sceneId,
        order: baseIndex + i + 1,
        shotSize: (spec?.shotSize as any) || 'Medium Shot',
        cameraMovement: (spec?.cameraMovement as any) || 'Static',
        duration: typeof spec?.duration === 'number' && spec.duration > 0 ? spec.duration : defaultDuration,
        description: spec?.description || description || `分镜 ${baseIndex + i + 1}`,
        narration: spec?.narration,
        dialogue: spec?.dialogue,
        status: 'pending',
        created: new Date(),
        modified: new Date(),
      };
      this.storeCallbacks.addShot(shot);
      createdShots.push(shot);
    }

    // 统一重排场景/镜头编号，确保删除/新增后顺序连续
    if (this.storeCallbacks?.renumberScenesAndShots) {
      this.storeCallbacks.renumberScenesAndShots();
    }

    return {
      tool: 'addShots',
      result: {
        sceneId,
        added: createdShots.length,
        shotIds: createdShots.map(s => s.id),
      },
      success: true,
    };
  }

  /**
   * Generate image for a single shot
   */
  private async generateShotImage(
    shotId: string,
    mode: 'seedream' | 'gemini' | 'grid',
    prompt?: string
  ): Promise<ToolResult> {
    if (!this.project) {
      return {
        tool: 'generateShotImage',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    const shot = this.project.shots.find(s => s.id === shotId);
    if (!shot) {
      return {
        tool: 'generateShotImage',
        result: null,
        success: false,
        error: `镜头 ${shotId} 不存在`
      };
    }

    const volcanoService = new VolcanoEngineService();
    const promptText = prompt || shot.description || '生成分镜图片';
    const aspectRatio = this.project.settings.aspectRatio;

    try {
      let imageUrl: string;
      let modelName: string;

      // Enrich prompt with assets
      const { enrichedPrompt } = enrichPromptWithAssets(
        promptText,
        this.project,
        shot.description
      );

      if (mode === 'seedream') {
        // SeeDream mode with retry/backoff to handle upstream overload
        imageUrl = await this.generateSeedreamWithRetry(volcanoService, enrichedPrompt, aspectRatio);
        modelName = 'SeeDream 4.5';
      } else if (mode === 'gemini') {
        // Gemini direct output (requires existing image to edit)
        if (!shot.referenceImage) {
          return {
            tool: 'generateShotImage',
            result: null,
            success: false,
            error: 'Gemini 直出模式需要先有参考图片，请先使用 SeeDream 生成'
          };
        }
        imageUrl = await editImageWithGemini(shot.referenceImage, enrichedPrompt, aspectRatio);
        modelName = 'Gemini Image Edit';
      } else {
        return {
          tool: 'generateShotImage',
          result: null,
          success: false,
          error: 'Grid 模式请使用 batchGenerateSceneImages 批量生成'
        };
      }

      // Update shot via store callback
      if (this.storeCallbacks) {
        this.storeCallbacks.updateShot(shotId, {
          referenceImage: imageUrl,
          status: 'done',
        });

        // Add to generation history
        const historyItem: GenerationHistoryItem = {
          id: `gen_${Date.now()}`,
          type: 'image',
          timestamp: new Date(),
          result: imageUrl,
          prompt: promptText,
          parameters: {
            model: modelName,
            aspectRatio: aspectRatio,
          },
          status: 'success',
        };
        this.storeCallbacks.addGenerationHistory(shotId, historyItem);
      }

      return {
        tool: 'generateShotImage',
        result: {
          shotId,
          imageUrl,
          model: modelName,
          prompt: promptText,
        },
        success: true,
      };
    } catch (error: any) {
      return {
        tool: 'generateShotImage',
        result: null,
        success: false,
        error: error.message || '图片生成失败'
      };
    }
  }

  /**
   * SeeDream 生成，带重试和退避，避免 ServerOverloaded
   */
  private async generateSeedreamWithRetry(
    volcanoService: VolcanoEngineService,
    prompt: string,
    aspectRatio?: string
  ): Promise<string> {
    let attempt = 0;
    let delay = SEEDREAM_RETRY_DELAY_MS;

    // 只在明显的过载/限流时重试；其他错误直接抛出
    const isOverload = (msg: string) => /serveroverloaded|overload|too many|limit/i.test(msg || '');

    while (attempt <= SEEDREAM_MAX_RETRIES) {
      try {
        return await volcanoService.generateSingleImage(prompt, aspectRatio);
      } catch (error: any) {
        attempt++;
        const msg = error?.message || '';
        if (attempt > SEEDREAM_MAX_RETRIES || !isOverload(msg)) {
          throw error;
        }
        await sleep(delay);
        delay = Math.min(delay * 1.5, 8000);
      }
    }
    throw new Error('SeeDream 生成失败');
  }

  /**
   * Batch generate images for a scene
   */
  private async batchGenerateSceneImages(
    sceneId: string,
    mode: 'seedream' | 'gemini' | 'grid',
    gridSize?: '2x2' | '3x3',
    prompt?: string
  ): Promise<ToolResult> {
    if (!this.project) {
      return {
        tool: 'batchGenerateSceneImages',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    const scene = this.project.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return {
        tool: 'batchGenerateSceneImages',
        result: null,
        success: false,
        error: `场景 ${sceneId} 不存在`
      };
    }

    const sceneShots = this.project.shots.filter(s => s.sceneId === sceneId);
    const unassignedShots = sceneShots.filter(shot => !shot.referenceImage);

    if (unassignedShots.length === 0) {
      return {
        tool: 'batchGenerateSceneImages',
        result: {
          sceneId,
          message: '该场景所有分镜都已有图片'
        },
        success: true,
      };
    }

    try {
      if (mode === 'grid') {
        // Grid mode with auto-assignment
        return await this.generateSceneGrid(sceneId, scene, unassignedShots, gridSize || '2x2', prompt);
      } else {
        // SeeDream or Gemini mode - generate with concurrency pool
        const results = await runWithConcurrency(
          unassignedShots,
          IMAGE_CONCURRENCY,
          async (shot) => this.generateShotImage(shot.id, mode, prompt)
        );

        const successCount = results.filter(r => r.success).length;
        return {
          tool: 'batchGenerateSceneImages',
          result: {
            sceneId,
            totalShots: unassignedShots.length,
            successCount,
            failedCount: unassignedShots.length - successCount,
            results,
          },
          success: successCount > 0,
        };
      }
    } catch (error: any) {
      return {
        tool: 'batchGenerateSceneImages',
        result: null,
        success: false,
        error: error.message || '批量生成失败'
      };
    }
  }

  /**
   * Generate Grid and auto-assign to shots
   */
  private async generateSceneGrid(
    sceneId: string,
    scene: Scene,
    targetShots: Shot[],
    gridSize: '2x2' | '3x3',
    prompt?: string
  ): Promise<ToolResult> {
    const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
    const totalSlices = rows * cols;
    const aspectRatio = this.project!.settings.aspectRatio;

    // Build enhanced prompt
    let enhancedPrompt = '';
    if (scene.description) {
      enhancedPrompt += `场景：${scene.description}\n`;
    }
    if (this.project!.metadata.artStyle) {
      enhancedPrompt += `画风：${this.project!.metadata.artStyle}\n`;
    }

    // Add shot descriptions
    const shotsToUse = targetShots.slice(0, totalSlices);
    if (shotsToUse.length > 0) {
      enhancedPrompt += `\n分镜要求（${shotsToUse.length} 个镜头）：\n`;
      shotsToUse.forEach((shot, idx) => {
        enhancedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}`;
        if (shot.description) {
          const briefDesc = gridSize === '3x3' && shot.description.length > 50
            ? shot.description.substring(0, 50) + '...'
            : shot.description;
          enhancedPrompt += ` - ${briefDesc}`;
        }
        enhancedPrompt += '\n';
      });
    }

    if (prompt) {
      enhancedPrompt += `\n额外要求：${prompt}`;
    }

    // Enrich with assets
    const { enrichedPrompt: finalPrompt, referenceImageUrls } = enrichPromptWithAssets(
      enhancedPrompt,
      this.project!
    );

    // Get reference images
    const refImages = await urlsToReferenceImages(referenceImageUrls);

    // Generate Grid
    const result = await generateMultiViewGrid(
      finalPrompt,
      rows,
      cols,
      aspectRatio,
      ImageSize.K4,
      refImages
    );

    // Auto-assign slices to shots
    const assignments: Record<string, string> = {};
    shotsToUse.forEach((shot, idx) => {
      if (idx < result.slices.length) {
        assignments[shot.id] = result.slices[idx];

        // Update shot
        if (this.storeCallbacks) {
          this.storeCallbacks.updateShot(shot.id, {
            referenceImage: result.slices[idx],
            status: 'done',
          });

          // Add to generation history
          const historyItem: GenerationHistoryItem = {
            id: `gen_${Date.now()}_${idx}`,
            type: 'image',
            timestamp: new Date(),
            result: result.slices[idx],
            prompt: prompt || enhancedPrompt,
            parameters: {
              model: 'Gemini Grid',
              gridSize: gridSize,
              aspectRatio: aspectRatio,
              fullGridUrl: result.fullImage,
            },
            status: 'success',
          };
          this.storeCallbacks.addGenerationHistory(shot.id, historyItem);
        }
      }
    });

    // Save Grid history
    if (this.storeCallbacks) {
      const gridHistory: GridHistoryItem = {
        id: `grid_${Date.now()}`,
        timestamp: new Date(),
        fullGridUrl: result.fullImage,
        slices: result.slices,
        gridSize,
        prompt: prompt || enhancedPrompt,
        aspectRatio,
        assignments,
      };
      this.storeCallbacks.addGridHistory(sceneId, gridHistory);
    }

    return {
      tool: 'batchGenerateSceneImages',
      result: {
        sceneId,
        mode: 'grid',
        gridSize,
        totalSlices: result.slices.length,
        assignedShots: Object.keys(assignments).length,
        fullGridUrl: result.fullImage,
        assignments,
      },
      success: true,
    };
  }

  /**
   * Batch generate images for all shots in project
   */
  private async batchGenerateProjectImages(
    mode: 'seedream' | 'gemini',
    prompt?: string
  ): Promise<ToolResult> {
    if (!this.project) {
      return {
        tool: 'batchGenerateProjectImages',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    const unassignedShots = this.project.shots.filter(shot => !shot.referenceImage);

    if (unassignedShots.length === 0) {
      return {
        tool: 'batchGenerateProjectImages',
        result: {
          message: '所有分镜都已有图片'
        },
        success: true,
      };
    }

    try {
      const results = await runWithConcurrency(
        unassignedShots,
        IMAGE_CONCURRENCY,
        async (shot) => this.generateShotImage(shot.id, mode, prompt)
      );

      const successCount = results.filter(r => r.success).length;
      return {
        tool: 'batchGenerateProjectImages',
        result: {
          totalShots: unassignedShots.length,
          successCount,
          failedCount: unassignedShots.length - successCount,
          results,
        },
        success: successCount > 0,
      };
    } catch (error: any) {
      return {
        tool: 'batchGenerateProjectImages',
        result: null,
        success: false,
        error: error.message || '批量生成失败'
      };
    }
  }
}

/**
 * Format tools for AI system prompt (OpenAI function calling format)
 */
export function formatToolsForPrompt(tools: ToolDefinition[]): string {
  return JSON.stringify(tools, null, 2);
}
