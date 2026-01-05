/**
 * 斜杠命令系统
 * 
 * 灵感来自 Midjourney 和 Claude Code 的命令风格
 * 支持命令 + 参数的形式，例如：
 * /grid all --ar 16:9 --style anime
 */

export interface SlashCommand {
    name: string;
    description: string;
    aliases?: string[];
    args?: CommandArg[];
    action: 'model_switch' | 'batch_generate' | 'settings' | 'help';
    modelId?: string;
}

export interface CommandArg {
    name: string;
    shorthand?: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'enum';
    enumValues?: string[];
    default?: string | number | boolean;
}

export interface ParsedCommand {
    command: SlashCommand | null;
    args: Record<string, string | number | boolean>;
    prompt: string;
    isValid: boolean;
    error?: string;
}

// 预定义斜杠命令
export const SLASH_COMMANDS: SlashCommand[] = [
    {
        name: 'gemini',
        description: '使用 Gemini 模型生成图片',
        aliases: ['g'],
        action: 'model_switch',
        modelId: 'gemini-direct',
        args: [
            {
                name: 'ar',
                shorthand: 'a',
                description: '画面比例',
                type: 'enum',
                enumValues: ['16:9', '9:16', '1:1', '4:3', '21:9'],
            },
        ],
    },
    {
        name: 'grid',
        description: '使用 Grid 模式生成分镜候选图',
        action: 'model_switch',
        modelId: 'gemini-grid',
        args: [
            {
                name: 'size',
                shorthand: 's',
                description: '网格大小',
                type: 'enum',
                enumValues: ['2x2', '3x3'],
                default: '2x2',
            },
            {
                name: 'all',
                description: '批量生成所有分镜',
                type: 'boolean',
                default: false,
            },
        ],
    },
    {
        name: 'jimeng',
        description: '使用即梦模型生成图片',
        aliases: ['jm'],
        action: 'model_switch',
        modelId: 'jimeng',
        args: [
            {
                name: 'model',
                shorthand: 'm',
                description: '模型版本',
                type: 'enum',
                enumValues: ['general_v2.1', 'general_v2.0_L'],
                default: 'general_v2.1',
            },
        ],
    },
    {
        name: 'sora',
        description: '使用 Sora 生成视频 (即将推出)',
        action: 'model_switch',
        modelId: 'sora',
        args: [
            {
                name: 'duration',
                shorthand: 'd',
                description: '视频时长(秒)',
                type: 'number',
                default: 5,
            },
        ],
    },
    {
        name: 'all',
        description: '批量生成所有分镜图片',
        action: 'batch_generate',
        args: [
            {
                name: 'model',
                shorthand: 'm',
                description: '使用的模型',
                type: 'enum',
                enumValues: ['gemini', 'grid', 'jimeng'],
                default: 'grid',
            },
        ],
    },
    {
        name: 'help',
        description: '显示帮助信息',
        aliases: ['h', '?'],
        action: 'help',
    },
];

/**
 * 解析输入文本中的斜杠命令
 */
export function parseSlashCommand(input: string): ParsedCommand {
    const trimmed = input.trim();

    // 检查是否以 / 开头
    if (!trimmed.startsWith('/')) {
        return {
            command: null,
            args: {},
            prompt: trimmed,
            isValid: true,
        };
    }

    // 分割命令和参数
    const parts = trimmed.split(/\s+/);
    const commandName = parts[0].slice(1).toLowerCase(); // 移除 /

    // 查找匹配的命令
    const command = SLASH_COMMANDS.find(
        cmd => cmd.name === commandName || cmd.aliases?.includes(commandName)
    );

    if (!command) {
        return {
            command: null,
            args: {},
            prompt: trimmed,
            isValid: false,
            error: `未知命令: /${commandName}`,
        };
    }

    // 解析参数
    const args: Record<string, string | number | boolean> = {};
    const promptParts: string[] = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        // 检查是否是参数 (--name 或 -n 格式)
        if (part.startsWith('--')) {
            const argName = part.slice(2);
            const argDef = command.args?.find(a => a.name === argName);

            if (argDef) {
                if (argDef.type === 'boolean') {
                    args[argName] = true;
                } else if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
                    args[argName] = parseArgValue(parts[++i], argDef);
                }
            }
        } else if (part.startsWith('-') && part.length === 2) {
            const shorthand = part.slice(1);
            const argDef = command.args?.find(a => a.shorthand === shorthand);

            if (argDef) {
                if (argDef.type === 'boolean') {
                    args[argDef.name] = true;
                } else if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
                    args[argDef.name] = parseArgValue(parts[++i], argDef);
                }
            }
        } else {
            // 普通文本，作为 prompt 的一部分
            promptParts.push(part);
        }
    }

    // 应用默认值
    command.args?.forEach(argDef => {
        if (args[argDef.name] === undefined && argDef.default !== undefined) {
            args[argDef.name] = argDef.default;
        }
    });

    return {
        command,
        args,
        prompt: promptParts.join(' '),
        isValid: true,
    };
}

/**
 * 解析参数值
 */
function parseArgValue(value: string, argDef: CommandArg): string | number | boolean {
    switch (argDef.type) {
        case 'number':
            return parseFloat(value) || 0;
        case 'boolean':
            return value.toLowerCase() === 'true' || value === '1';
        default:
            return value;
    }
}

/**
 * 获取命令建议（用于自动补全）
 */
export function getCommandSuggestions(input: string): SlashCommand[] {
    if (!input.startsWith('/')) return [];

    const query = input.slice(1).toLowerCase();
    if (!query) return SLASH_COMMANDS;

    return SLASH_COMMANDS.filter(cmd =>
        cmd.name.startsWith(query) ||
        cmd.aliases?.some(a => a.startsWith(query))
    );
}

/**
 * 生成命令帮助文本
 */
export function generateHelpText(): string {
    let help = '## 可用命令\n\n';

    SLASH_COMMANDS.forEach(cmd => {
        help += `### /${cmd.name}`;
        if (cmd.aliases?.length) {
            help += ` (${cmd.aliases.map(a => `/${a}`).join(', ')})`;
        }
        help += '\n';
        help += `${cmd.description}\n`;

        if (cmd.args?.length) {
            help += '\n**参数:**\n';
            cmd.args.forEach(arg => {
                help += `- \`--${arg.name}\``;
                if (arg.shorthand) {
                    help += ` / \`-${arg.shorthand}\``;
                }
                help += `: ${arg.description}`;
                if (arg.enumValues) {
                    help += ` (${arg.enumValues.join(' | ')})`;
                }
                if (arg.default !== undefined) {
                    help += ` [默认: ${arg.default}]`;
                }
                help += '\n';
            });
        }
        help += '\n';
    });

    help += '---\n';
    help += '**示例:**\n';
    help += '- `/grid all` - 批量生成所有分镜\n';
    help += '- `/jimeng -m general_v2.1 一个美丽的少女` - 使用即梦生成\n';
    help += '- `/gemini --ar 16:9 森林中的小屋` - 使用 Gemini 生成 16:9 图片\n';

    return help;
}
