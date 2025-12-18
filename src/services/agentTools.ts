/**
 * Agent Tool Definitions - Function calling for project operations
 * These tools allow the Agent to query and manipulate project context
 */

import { Project, Scene, Shot, AspectRatio, ImageSize, GenerationHistoryItem, GridHistoryItem } from '@/types/project';
import { VolcanoEngineService } from './volcanoEngineService';
import { generateMultiViewGrid, generateSingleImage, urlsToReferenceImages } from './geminiService';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { useProjectStore } from '@/store/useProjectStore';
import { storageService } from '@/lib/storageService';

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
  process.env.AGENT_IMAGE_CONCURRENCY || process.env.NEXT_PUBLIC_AGENT_IMAGE_CONCURRENCY,
  3
);
const SEEDREAM_MAX_RETRIES = parseConcurrency(
  process.env.SEEDREAM_MAX_RETRIES || process.env.NEXT_PUBLIC_SEEDREAM_MAX_RETRIES,
  2
);
const SEEDREAM_RETRY_DELAY_MS = parseConcurrency(
  process.env.SEEDREAM_RETRY_DELAY_MS || process.env.NEXT_PUBLIC_SEEDREAM_RETRY_DELAY_MS,
  1200
);

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
        gridSize: {
          type: 'string',
          description: 'Grid 模式的网格大小（仅 grid 模式需要，默认 2x2）',
          enum: ['2x2', '3x3']
        },
        prompt: {
          type: 'string',
          description: '生成提示词（可选，如不提供则使用分镜描述）'
        },
        force: {
          type: 'boolean',
          description: '是否强制覆盖已有图片/历史（默认 false，不覆盖）'
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
        },
        force: {
          type: 'boolean',
          description: '是否覆盖已生成的镜头（默认 false，仅生成空缺镜头）'
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
          description: '生成模式：seedream (火山引擎单图)、gemini (Gemini 直出)、grid (Gemini Grid 按场景分组)',
          enum: ['seedream', 'gemini', 'grid']
        },
        gridSize: {
          type: 'string',
          description: 'Grid 模式的网格大小（仅 grid 模式需要，默认 2x2）',
          enum: ['2x2', '3x3']
        },
        prompt: {
          type: 'string',
          description: '额外的生成要求（可选）'
        },
        force: {
          type: 'boolean',
          description: '是否覆盖已生成的镜头（默认 false，仅生成空缺镜头）'
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
  private userId?: string;

  constructor(project: Project | null, storeCallbacks?: StoreCallbacks, userId?: string) {
    this.project = project;
    this.storeCallbacks = storeCallbacks;
    this.userId = userId;
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
      id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        sceneId,
        order: baseIndex + i + 1,
        shotSize: (spec?.shotSize as any) || 'Medium Shot',
        cameraMovement: (spec?.cameraMovement as any) || 'Static',
        duration: typeof spec?.duration === 'number' && spec.duration > 0 ? spec.duration : defaultDuration,
        description: spec?.description || description || `分镜 ${baseIndex + i + 1}`,
        narration: spec?.narration,
        dialogue: spec?.dialogue,
        status: 'draft',
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
    gridSize?: '2x2' | '3x3',
    prompt?: string,
    force: boolean = false
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
    const hasImage = !!shot.referenceImage;

    // 默认不覆盖已有图片，除非 force=true
    if (hasImage && !force) {
      return {
        tool: 'generateShotImage',
        result: {
          shotId,
          skipped: true,
          reason: '该镜头已存在图片，设置 force=true 可覆盖重生成',
        },
        success: true,
      };
    }

    try {
      let imageUrl: string;
      let modelName: string;
      const overwritten = hasImage && force;

      // Enrich prompt with assets
      const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(
        promptText,
        this.project,
        shot.description
      );

      // 获取参考图数据 (用于 Gemini 直出或 SeeDream)
      // 注意：Agent 模式下主要依赖资源库匹配，暂不支持用户实时上传
      let refImages = await urlsToReferenceImages(referenceImageUrls);
      // 如果镜头已有参考图，优先放在最前面作为基础参考
      if (shot.referenceImage) {
        const existing = await urlsToReferenceImages([shot.referenceImage]);
        refImages = [...existing, ...refImages];
      }

      if (mode === 'seedream') {
        // SeeDream mode with retry/backoff to handle upstream overload
        // 传递 referenceImageUrls 给 SeeDream (VolcanoEngineService 已更新支持)
        imageUrl = await this.generateSeedreamWithRetry(volcanoService, enrichedPrompt, aspectRatio, referenceImageUrls);
        modelName = 'SeeDream 4.5';
      } else if (mode === 'gemini') {
        // Gemini 直出（与 Pro 模式一致）：带资产/已有参考图生成单张
        imageUrl = await generateSingleImage(
          enrichedPrompt,
          aspectRatio as AspectRatio,
          refImages
        );
        modelName = 'Gemini Direct';
      } else if (mode === 'grid') {
        // Grid mode for single shot - generate Grid and return slices
        const size = gridSize || '2x2';
        const [rows, cols] = size === '2x2' ? [2, 2] : [3, 3];
        // Enrich with assets
        const { enrichedPrompt: finalPrompt, referenceImageUrls } = enrichPromptWithAssets(
          enrichedPrompt,
          this.project,
          shot.description
        );

        // Get reference images
        const refImages = await urlsToReferenceImages(referenceImageUrls);

        // Generate Grid
        const gridResult = await generateMultiViewGrid(
          finalPrompt,
          rows,
          cols,
          aspectRatio,
          ImageSize.K4,
          refImages
        );

        // Use the first slice as the main image
        imageUrl = gridResult.slices[0];
        modelName = `Gemini Grid ${size}`;

        // 持久化 Grid 全图和切片
        const folderBase = `projects/${this.project.id}/shots/${shotId}/grid_${Date.now()}`;
        let fullGridUrl = gridResult.fullImage;
        let sliceUrls = gridResult.slices;
        try {
          fullGridUrl = await storageService.uploadBase64ToR2(gridResult.fullImage, folderBase, 'grid_full.png', this.userId);
          sliceUrls = await storageService.uploadBase64ArrayToR2(gridResult.slices, `${folderBase}/slices`, this.userId);
        } catch (err) {
          console.error('[AgentTools] Grid 上传 R2 失败，使用 base64 兜底:', err);
        }
        const mainSliceUrl = sliceUrls[0] || gridResult.slices[0];

        // Store full grid and all slices in generation history
        if (this.storeCallbacks) {
          if (overwritten) {
            this.recordReplacementHistory(shot, modelName);
          }

          this.storeCallbacks.updateShot(shotId, {
            referenceImage: mainSliceUrl,
            gridImages: sliceUrls,
            fullGridUrl,
            status: 'done',
            // // lastModel: modelName, // ⚠️ Shot 类型中没有 lastModel 字段
          } as any);

          const historyItem: GenerationHistoryItem = {
            id: `gen_${Date.now()}`,
            type: 'image',
            timestamp: new Date(),
            result: mainSliceUrl,
            prompt: promptText,
            parameters: {
              model: modelName,
              gridSize: size,
              aspectRatio: aspectRatio,
              fullGridUrl,
              allSlices: sliceUrls,
            },
            status: 'success',
          };
          this.storeCallbacks.addGenerationHistory(shotId, historyItem);
        }

        return {
          tool: 'generateShotImage',
          result: {
            shotId,
            imageUrl: mainSliceUrl,
            model: modelName,
            prompt: promptText,
            gridSize: size,
            fullGridUrl,
            allSlices: sliceUrls,
            overwritten,
          },
          success: true,
        };
      } else {
        return {
          tool: 'generateShotImage',
          result: null,
          success: false,
          error: `Unknown mode: ${mode}`
        };
      }

      // 将生成结果持久化到 R2，避免上游链接过期
      const folder = `projects/${this.project.id}/shots/${shotId}`;
      const r2Url = await this.persistImageToR2(imageUrl, folder, `${mode}_${Date.now()}.png`);

      // 如果是覆盖生成，先把旧图存入历史（保留记录）
      if (this.storeCallbacks && overwritten) {
        this.recordReplacementHistory(shot, modelName);
      }

      // Update shot via store callback (for seedream and gemini modes)
      if (this.storeCallbacks) {
        this.storeCallbacks.updateShot(shotId, {
          referenceImage: r2Url,
          status: 'done',
          // // lastModel: modelName, // ⚠️ Shot 类型中没有 lastModel 字段
        } as any);

        // Add to generation history
        const historyItem: GenerationHistoryItem = {
          id: `gen_${Date.now()}`,
          type: 'image',
          timestamp: new Date(),
          result: r2Url,
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
          imageUrl: r2Url,
          model: modelName,
          prompt: promptText,
          overwritten: hasImage && force,
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
    aspectRatio?: string,
    referenceImageUrls: string[] = []
  ): Promise<string> {
    let attempt = 0;
    let delay = SEEDREAM_RETRY_DELAY_MS;

    // 只在明显的过载/限流时重试；其他错误直接抛出
    const isOverload = (msg: string) => /serveroverloaded|overload|too many|limit/i.test(msg || '');

    while (attempt <= SEEDREAM_MAX_RETRIES) {
      try {
        return await volcanoService.generateSingleImage(prompt, aspectRatio, referenceImageUrls);
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
   * 将图片 URL 或 base64 持久化到 R2，并返回稳定的 R2 URL
   */
  private async persistImageToR2(imageUrl: string, folder: string, filename: string): Promise<string> {
    try {
      if (storageService.isR2URL(imageUrl)) return imageUrl;

      let base64 = imageUrl;
      if (!imageUrl.startsWith('data:')) {
        base64 = await fetchToBase64(imageUrl);
      }
      return await storageService.uploadBase64ToR2(base64, folder, filename, this.userId);
    } catch (error) {
      console.error('[AgentTools] persistImageToR2 failed:', error);
      return imageUrl; // 兜底使用原始 URL，避免阻塞流程
    }
  }

  /**
   * 记录覆盖前的分镜图片到历史，方便用户回滚
   */
  private recordReplacementHistory(shot: Shot, modelName?: string, extraParams: Record<string, unknown> = {}) {
    if (!this.storeCallbacks || !shot.referenceImage) return;

    const historyItem: GenerationHistoryItem = {
      id: `replaced_${Date.now()}`,
      type: 'image',
      timestamp: new Date(),
      result: shot.referenceImage,
      prompt: '(覆盖前版本)',
      parameters: {
        model: (shot as any).lastModel || modelName || 'unknown',
        status: 'replaced',
        gridImages: shot.gridImages,
        fullGridUrl: shot.fullGridUrl,
        ...extraParams,
      },
      status: 'replaced',
    };
    this.storeCallbacks.addGenerationHistory(shot.id, historyItem);
  }

  /**
   * Batch generate images for a scene
   */
  private async batchGenerateSceneImages(
    sceneId: string,
    mode: 'seedream' | 'gemini' | 'grid',
    gridSize?: '2x2' | '3x3',
    prompt?: string,
    force: boolean = false
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
    const targetShots = force ? sceneShots : sceneShots.filter(shot => !shot.referenceImage);

    if (targetShots.length === 0) {
      return {
        tool: 'batchGenerateSceneImages',
        result: {
          sceneId,
          message: force ? '该场景没有可处理的分镜' : '该场景所有分镜都已有图片'
        },
        success: true,
      };
    }

    try {
      if (mode === 'grid') {
        // Grid mode with auto-assignment
        return await this.generateSceneGrid(sceneId, scene, targetShots, gridSize || '2x2', prompt, force);
      } else {
        // SeeDream or Gemini mode - generate with concurrency pool
        const results = await runWithConcurrency(
          targetShots,
          IMAGE_CONCURRENCY,
          async (shot) => this.generateShotImage(shot.id, mode, undefined, prompt, force)
        );

        const successCount = results.filter(r => r.success).length;
        return {
          tool: 'batchGenerateSceneImages',
          result: {
            sceneId,
            totalShots: targetShots.length,
            successCount,
            failedCount: targetShots.length - successCount,
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
    prompt?: string,
    force: boolean = false
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

    // 上传 Grid 全图和切片到 R2，避免外链过期
    const folderBase = `projects/${this.project!.id}/scenes/${sceneId}/grid_${Date.now()}`;
    let fullGridUrl = result.fullImage;
    let sliceUrls = result.slices;
    try {
      fullGridUrl = await storageService.uploadBase64ToR2(result.fullImage, folderBase, 'grid_full.png', this.userId);
      sliceUrls = await storageService.uploadBase64ArrayToR2(result.slices, `${folderBase}/slices`, this.userId);
    } catch (err) {
      console.error('[AgentTools] 场景 Grid 上传 R2 失败，使用 base64 兜底:', err);
    }

    // Auto-assign slices to shots
    const assignments: Record<string, string> = {};
    const overwrittenShots: string[] = [];
    shotsToUse.forEach((shot, idx) => {
      if (idx < result.slices.length) {
        const newUrl = sliceUrls[idx] || result.slices[idx];
        assignments[shot.id] = newUrl;
        const wasOverwrite = !!shot.referenceImage;
        if (wasOverwrite) {
          overwrittenShots.push(shot.id);
        }

        // Update shot
        if (this.storeCallbacks) {
          // 覆盖前保留旧图记录
          if (wasOverwrite) {
            this.recordReplacementHistory(shot, 'Gemini Grid');
          }

          this.storeCallbacks.updateShot(shot.id, {
            referenceImage: newUrl,
            status: 'done',
            // lastModel: 'Gemini Grid',
          });

          // Add to generation history
          const historyItem: GenerationHistoryItem = {
            id: `gen_${Date.now()}_${idx}`,
            type: 'image',
            timestamp: new Date(),
            result: newUrl,
            prompt: prompt || enhancedPrompt,
            parameters: {
              model: 'Gemini Grid',
              gridSize: gridSize,
              aspectRatio: aspectRatio,
              fullGridUrl: fullGridUrl,
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
        fullGridUrl: fullGridUrl,
        assignments,
        overwrittenShotIds: overwrittenShots,
      },
      success: true,
    };
  }

  /**
   * Batch generate images for all shots in project
   */
  private async batchGenerateProjectImages(
    mode: 'seedream' | 'gemini' | 'grid',
    gridSize?: '2x2' | '3x3',
    prompt?: string,
    force: boolean = false
  ): Promise<ToolResult> {
    if (!this.project) {
      return {
        tool: 'batchGenerateProjectImages',
        result: null,
        success: false,
        error: '项目不存在'
      };
    }

    const targetShots = force ? this.project.shots : this.project.shots.filter(shot => !shot.referenceImage);

    if (targetShots.length === 0) {
      return {
        tool: 'batchGenerateProjectImages',
        result: {
          message: force ? '没有可处理的分镜' : '所有分镜都已有图片'
        },
        success: true,
      };
    }

    try {
      if (mode === 'grid') {
        // Grid mode: Generate grids by scene
        const sceneResults: any[] = [];
        for (const scene of this.project.scenes) {
          const sceneShots = targetShots.filter(s => s.sceneId === scene.id);
          if (sceneShots.length > 0) {
            const result = await this.generateSceneGrid(
              scene.id,
              scene,
              sceneShots,
              gridSize || '2x2',
              prompt,
              force
            );
            sceneResults.push(result);
          }
        }

        const successCount = sceneResults.filter(r => r.success).length;
        return {
          tool: 'batchGenerateProjectImages',
          result: {
            mode: 'grid',
            totalScenes: sceneResults.length,
            successCount,
            failedCount: sceneResults.length - successCount,
            sceneResults,
          },
          success: successCount > 0,
        };
      } else {
        // SeeDream or Gemini mode
        const results = await runWithConcurrency(
          targetShots,
          IMAGE_CONCURRENCY,
          async (shot) => this.generateShotImage(shot.id, mode, undefined, prompt, force)
        );

        const successCount = results.filter(r => r.success).length;
        return {
          tool: 'batchGenerateProjectImages',
          result: {
            totalShots: targetShots.length,
            successCount,
            failedCount: targetShots.length - successCount,
            results,
          },
          success: successCount > 0,
        };
      }
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
