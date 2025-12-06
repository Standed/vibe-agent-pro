/**
 * Agent Tool Definitions - Function calling for project operations
 * These tools allow the Agent to query and manipulate project context
 */

import { Project, Scene, Shot } from '@/types/project';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
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
}

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
    name: 'batchGenerateSceneImages',
    description: '批量生成指定场景的所有镜头图片',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: '场景的ID'
        },
        mode: {
          type: 'string',
          description: '生成模式：grid (Gemini) 或 seedream (火山引擎)',
          enum: ['grid', 'seedream']
        }
      },
      required: ['sceneId', 'mode']
    }
  },
  {
    name: 'batchGenerateProjectImages',
    description: '批量生成整个项目中所有未生成图片的镜头',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '生成模式：grid (Gemini) 或 seedream (火山引擎)',
          enum: ['grid', 'seedream']
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
        }
      },
      required: ['sceneId', 'count']
    }
  }
];

/**
 * Execute tool calls with project context
 */
export class AgentToolExecutor {
  private project: Project | null;

  constructor(project: Project | null) {
    this.project = project;
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

        default:
          return {
            tool: toolCall.name,
            result: null,
            error: `Unknown tool: ${toolCall.name}`
          };
      }
    } catch (error: any) {
      return {
        tool: toolCall.name,
        result: null,
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
}

/**
 * Format tools for AI system prompt (OpenAI function calling format)
 */
export function formatToolsForPrompt(tools: ToolDefinition[]): string {
  return JSON.stringify(tools, null, 2);
}
