/**
 * Agent Tool Definitions - Pure JSON Schema definitions safe for client-side import
 */

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
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
    },
    {
        name: 'generateCharacterThreeView',
        description: '为指定角色生成三视图（正面、侧面、背面），用于角色设计一致性',
        parameters: {
            type: 'object',
            properties: {
                characterId: {
                    type: 'string',
                    description: '角色的ID'
                },
                prompt: {
                    type: 'string',
                    description: '额外的设计要求（可选，如不提供则使用角色描述和外貌描述）'
                },
                artStyle: {
                    type: 'string',
                    description: '艺术风格（可选，默认使用项目设定的风格）'
                }
            },
            required: ['characterId']
        }
    },
    {
        name: 'generateSceneVideo',
        description: '使用 Sora2 为整个场景生成连贯的长视频 (自动处理角色一致性和多镜头衔接)',
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
        name: 'batchGenerateProjectVideosSora',
        description: '批量为项目中所有场景生成 Sora2 视频。自动检查角色参考图，处理角色注册，并生成视频。',
        parameters: {
            type: 'object',
            properties: {
                force: {
                    type: 'boolean',
                    description: '是否强制重新生成已有的视频（默认 false）'
                }
            },
            required: []
        }
    }
];

export function formatToolsForPrompt(tools: ToolDefinition[]): string {
    return tools.map(tool => {
        return `- ${tool.name}: ${tool.description}\n  Parameters: ${JSON.stringify(tool.parameters)}`;
    }).join('\n');
}
