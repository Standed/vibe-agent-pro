/**
 * 策划模式意图识别服务
 * 
 * 用于识别用户在策划模式中的意图类型，节省 API token 的同时提供上下文感知能力。
 * 采用轻量级的关键词匹配方式，避免额外的 AI API 调用。
 */

export type PlanningIntent =
    | 'create'      // 创建新内容（首次输入或明确要求新建）
    | 'modify'      // 修改现有内容
    | 'delete'      // 删除内容
    | 'query'       // 查询/查看内容
    | 'continue';   // 继续/基于上下文扩展

// 意图识别结果
export interface IntentResult {
    intent: PlanningIntent;
    confidence: 'high' | 'medium' | 'low';
    targetType?: 'script' | 'scene' | 'shot' | 'character' | 'location' | 'general';
    targetName?: string;  // 识别到的目标名称
    requiresConfirmation?: boolean;  // 是否需要用户确认（如删除操作）
}

// 关键词配置
const INTENT_KEYWORDS = {
    delete: ['删除', '删掉', '移除', '去掉', '清除', '取消', '撤销'],
    modify: ['修改', '更新', '调整', '改成', '换成', '优化', '完善', '改一下', '改下'],
    query: ['查看', '显示', '列出', '展示', '看看', '有哪些', '是什么'],
    create: ['生成', '创建', '新建', '添加', '增加', '设计', '写一个'],
    continue: ['继续', '接着', '然后', '再来', '下一步'],
};

// 目标类型关键词
const TARGET_KEYWORDS = {
    script: ['剧本', '脚本', '故事', '内容'],
    scene: ['场景', '场次', 'scene'],
    shot: ['镜头', '分镜', 'shot'],
    character: ['角色', '人物', '主角', '配角'],
    location: ['地点', '场所', '环境', '背景'],
};

// 识别目标类型
function detectTargetType(text: string): IntentResult['targetType'] {
    for (const [type, keywords] of Object.entries(TARGET_KEYWORDS)) {
        if (keywords.some(kw => text.includes(kw))) {
            return type as IntentResult['targetType'];
        }
    }
    return 'general';
}

// 识别用户意图
export function detectPlanningIntent(
    userMessage: string,
    context: {
        hasScript: boolean;
        hasScenes: boolean;
        hasShots: boolean;
        isFirstMessage: boolean;
        previousScript?: string;
    }
): IntentResult {
    const text = userMessage.toLowerCase();

    // 1. 首次消息或没有内容时，视为创作意图（优先级最高）
    // 在空项目中，任何输入都应被视为剧本/创意，即使包含"删除"等关键词（可能是剧本内容）
    if (context.isFirstMessage || (!context.hasScript && !context.hasScenes)) {
        return {
            intent: 'create',
            confidence: 'high',
            targetType: 'script',
        };
    }

    // 2. 检查删除意图（需要确认）
    if (INTENT_KEYWORDS.delete.some(kw => text.includes(kw))) {
        return {
            intent: 'delete',
            confidence: 'high',
            targetType: detectTargetType(text),
            requiresConfirmation: true,
        };
    }

    // 3. 检查修改意图
    if (INTENT_KEYWORDS.modify.some(kw => text.includes(kw))) {
        return {
            intent: 'modify',
            confidence: 'high',
            targetType: detectTargetType(text),
        };
    }

    // 4. 检查查询意图
    if (INTENT_KEYWORDS.query.some(kw => text.includes(kw))) {
        return {
            intent: 'query',
            confidence: 'high',
            targetType: detectTargetType(text),
        };
    }

    // 5. 检查继续意图
    if (INTENT_KEYWORDS.continue.some(kw => text.includes(kw))) {
        return {
            intent: 'continue',
            confidence: 'medium',
            targetType: 'general',
        };
    }

    // 6. 检查重复内容（与现有剧本对比）
    if (context.previousScript && context.hasScenes) {
        const similarity = calculateSimilarity(text, context.previousScript.toLowerCase());
        if (similarity > 0.8) {
            // 内容高度相似，可能是重复输入
            return {
                intent: 'query',  // 提示用户已有内容
                confidence: 'medium',
                targetType: 'script',
            };
        }
    }

    // 7. 已有内容时，默认为修改/扩展意图
    if (context.hasScenes || context.hasShots) {
        return {
            intent: 'continue',
            confidence: 'low',
            targetType: 'general',
        };
    }

    // 8. 默认为创作意图
    return {
        intent: 'create',
        confidence: 'medium',
        targetType: 'script',
    };
}

// 简单的相似度计算（基于词频）
function calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 1));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 1));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    words1.forEach(w => {
        if (words2.has(w)) intersection++;
    });

    return intersection / Math.max(words1.size, words2.size);
}

// 生成上下文摘要（用于 AI 对话，节省 token）
export function buildContextSummary(project: {
    script?: string;
    scenes?: Array<{ name: string; location?: string }>;
    shots?: Array<{ description?: string }>;
    characters?: Array<{ name: string }>;
    locations?: Array<{ name: string }>;
}): string {
    const parts: string[] = [];

    // 场景列表（最多5个）
    if (project.scenes && project.scenes.length > 0) {
        const sceneNames = project.scenes.slice(0, 5).map(s => s.name).join('、');
        parts.push(`当前有 ${project.scenes.length} 个场景：${sceneNames}${project.scenes.length > 5 ? '等' : ''}`);
    }

    // 镜头数量
    if (project.shots && project.shots.length > 0) {
        parts.push(`共 ${project.shots.length} 个镜头`);
    }

    // 角色列表
    if (project.characters && project.characters.length > 0) {
        const charNames = project.characters.slice(0, 5).map(c => c.name).join('、');
        parts.push(`角色：${charNames}${project.characters.length > 5 ? '等' : ''}`);
    }

    // 场景地点列表
    if (project.locations && project.locations.length > 0) {
        const locNames = project.locations.slice(0, 3).map(l => l.name).join('、');
        parts.push(`地点：${locNames}${project.locations.length > 3 ? '等' : ''}`);
    }

    return parts.length > 0 ? `[项目上下文] ${parts.join('；')}` : '';
}

// ===== 删除功能增强 =====

// 删除目标描述符
export interface DeleteTarget {
    type: 'scene' | 'shot' | 'character' | 'location' | 'all_scenes' | 'all_shots' | 'duplicate';
    ids?: string[];           // 具体的 ID 列表
    names?: string[];         // 名称列表（用于模糊匹配）
    sceneIndex?: number;      // 场景编号
    shotIndexes?: number[];   // 镜头编号列表
    isDuplicate?: boolean;    // 是否是删除重复项
}

// 删除解析结果
export interface DeleteParseResult {
    canDelete: boolean;
    targets: DeleteTarget[];
    confirmMessage: string;
    warningMessage?: string;
}

// 关键词模式
const DELETE_PATTERNS = {
    duplicate: ['重复', '重复的', '相同的', '一样的'],
    all: ['所有', '全部', '全都'],
    scene: ['场景', '场次'],
    shot: ['镜头', '分镜'],
    character: ['角色', '人物'],
    location: ['地点', '场所'],
    specificScene: /(?:第\s*)?(\d+)\s*(?:个|场)?场景/,
    specificShot: /(?:第\s*)?(\d+)\s*(?:个)?(?:镜头|分镜)/,
    rangeShot: /(?:第\s*)?(\d+)\s*到\s*(?:第\s*)?(\d+)\s*(?:个)?(?:镜头|分镜)/,
};

/**
 * 解析用户的删除请求，识别要删除的目标
 */
export function parseDeleteRequest(
    userMessage: string,
    project: {
        scenes?: Array<{ id: string; name: string; order?: number }>;
        shots?: Array<{ id: string; sceneId: string; order?: number; description?: string }>;
        characters?: Array<{ id: string; name: string }>;
        locations?: Array<{ id: string; name: string }>;
    }
): DeleteParseResult {
    const text = userMessage;
    const targets: DeleteTarget[] = [];

    // 1. 检测是否要删除重复项
    if (DELETE_PATTERNS.duplicate.some(kw => text.includes(kw))) {
        // 检测重复的场景（基于名称）
        if (DELETE_PATTERNS.scene.some(kw => text.includes(kw)) && project.scenes) {
            const duplicateSceneIds = findDuplicatesByName(project.scenes);
            if (duplicateSceneIds.length > 0) {
                targets.push({
                    type: 'duplicate',
                    ids: duplicateSceneIds,
                    isDuplicate: true,
                });
            }
        }
        // 检测重复的分镜（基于描述）
        if (DELETE_PATTERNS.shot.some(kw => text.includes(kw)) && project.shots) {
            const duplicateShotIds = findDuplicateShotsByDescription(project.shots);
            if (duplicateShotIds.length > 0) {
                targets.push({
                    type: 'duplicate',
                    ids: duplicateShotIds,
                    isDuplicate: true,
                });
            }
        }
        // 如果没有指定具体类型，尝试检测所有重复
        if (targets.length === 0 && project.scenes && project.shots) {
            const duplicateSceneIds = findDuplicatesByName(project.scenes);
            const duplicateShotIds = findDuplicateShotsByDescription(project.shots);
            if (duplicateSceneIds.length > 0) {
                targets.push({ type: 'duplicate', ids: duplicateSceneIds, isDuplicate: true });
            }
            if (duplicateShotIds.length > 0) {
                targets.push({ type: 'duplicate', ids: duplicateShotIds, isDuplicate: true });
            }
        }
    }

    // 2. 检测多个场景编号（如：1、2、3 或 第1、2、3个场景）
    const multiSceneMatch = text.match(/(?:删除|移除|去掉).*?(?:第)?([0-9、,，\s]+)(?:个|场)?场景/);
    if (multiSceneMatch && project.scenes) {
        // 解析数字列表
        const numbersStr = multiSceneMatch[1];
        const numbers = numbersStr.split(/[、,，\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
            const matchedSceneIds: string[] = [];
            const sortedScenes = [...project.scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
            numbers.forEach(num => {
                // 尝试按 order 匹配
                const scene = sortedScenes.find(s => s.order === num);
                if (scene) {
                    matchedSceneIds.push(scene.id);
                } else if (num >= 1 && num <= sortedScenes.length) {
                    // 按索引匹配
                    matchedSceneIds.push(sortedScenes[num - 1].id);
                }
            });
            if (matchedSceneIds.length > 0) {
                targets.push({
                    type: 'scene',
                    ids: matchedSceneIds,
                    shotIndexes: numbers, // 复用字段存储编号
                });
            }
        }
    }

    // 3. 检测多个镜头编号（如：1、2、3 或 第1、2、3个镜头）
    const multiShotMatch = text.match(/(?:删除|移除|去掉).*?(?:第)?([0-9、,，\s]+)(?:个)?(?:镜头|分镜)/);
    if (multiShotMatch && project.shots && targets.length === 0) {
        const numbersStr = multiShotMatch[1];
        const numbers = numbersStr.split(/[、,，\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
            const sortedShots = [...project.shots].sort((a, b) => (a.order || 0) - (b.order || 0));
            const matchedShotIds: string[] = [];
            numbers.forEach(num => {
                if (num >= 1 && num <= sortedShots.length) {
                    matchedShotIds.push(sortedShots[num - 1].id);
                }
            });
            if (matchedShotIds.length > 0) {
                targets.push({
                    type: 'shot',
                    ids: matchedShotIds,
                    shotIndexes: numbers,
                });
            }
        }
    }

    // 4. 检测特定编号的场景（单个）
    const sceneMatch = text.match(DELETE_PATTERNS.specificScene);
    if (sceneMatch && project.scenes && targets.length === 0) {
        const sceneIndex = parseInt(sceneMatch[1], 10);
        const scene = project.scenes.find(s => s.order === sceneIndex);
        if (scene) {
            targets.push({ type: 'scene', ids: [scene.id], sceneIndex });
        }
    }

    // 3. 检测特定编号的镜头
    const shotMatch = text.match(DELETE_PATTERNS.specificShot);
    if (shotMatch && project.shots) {
        const shotIndex = parseInt(shotMatch[1], 10);
        // shots 按 order 排序后取对应索引
        const sortedShots = [...project.shots].sort((a, b) => (a.order || 0) - (b.order || 0));
        if (shotIndex >= 1 && shotIndex <= sortedShots.length) {
            targets.push({ type: 'shot', ids: [sortedShots[shotIndex - 1].id], shotIndexes: [shotIndex] });
        }
    }

    // 4. 检测镜头范围
    const rangeMatch = text.match(DELETE_PATTERNS.rangeShot);
    if (rangeMatch && project.shots) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        const sortedShots = [...project.shots].sort((a, b) => (a.order || 0) - (b.order || 0));
        const shotIds: string[] = [];
        const indexes: number[] = [];
        for (let i = start; i <= end && i <= sortedShots.length; i++) {
            shotIds.push(sortedShots[i - 1].id);
            indexes.push(i);
        }
        if (shotIds.length > 0) {
            targets.push({ type: 'shot', ids: shotIds, shotIndexes: indexes });
        }
    }

    // 5. 检测删除所有
    if (DELETE_PATTERNS.all.some(kw => text.includes(kw))) {
        if (DELETE_PATTERNS.scene.some(kw => text.includes(kw)) && project.scenes) {
            targets.push({ type: 'all_scenes', ids: project.scenes.map(s => s.id) });
        }
        if (DELETE_PATTERNS.shot.some(kw => text.includes(kw)) && project.shots) {
            targets.push({ type: 'all_shots', ids: project.shots.map(s => s.id) });
        }
    }

    // 6. 按名称匹配角色或地点
    if (DELETE_PATTERNS.character.some(kw => text.includes(kw)) && project.characters) {
        const matchedChars = project.characters.filter(c => text.includes(c.name));
        if (matchedChars.length > 0) {
            targets.push({ type: 'character', ids: matchedChars.map(c => c.id), names: matchedChars.map(c => c.name) });
        }
    }
    if (DELETE_PATTERNS.location.some(kw => text.includes(kw)) && project.locations) {
        const matchedLocs = project.locations.filter(l => text.includes(l.name));
        if (matchedLocs.length > 0) {
            targets.push({ type: 'location', ids: matchedLocs.map(l => l.id), names: matchedLocs.map(l => l.name) });
        }
    }

    // 生成确认消息
    if (targets.length === 0) {
        return {
            canDelete: false,
            targets: [],
            confirmMessage: '无法识别要删除的具体内容，请更明确地描述，例如："删除第3个场景" 或 "删除重复的分镜"。',
        };
    }

    const descriptions = targets.map(t => {
        if (t.isDuplicate) return `${t.ids?.length || 0} 个重复项`;
        if (t.type === 'all_scenes') return `所有 ${t.ids?.length || 0} 个场景`;
        if (t.type === 'all_shots') return `所有 ${t.ids?.length || 0} 个镜头`;
        if (t.type === 'scene') return `场景 #${t.sceneIndex}`;
        if (t.type === 'shot') return `镜头 #${t.shotIndexes?.join(', ')}`;
        if (t.type === 'character') return `角色: ${t.names?.join(', ')}`;
        if (t.type === 'location') return `地点: ${t.names?.join(', ')}`;
        return '未知项';
    });

    return {
        canDelete: true,
        targets,
        confirmMessage: `确定要删除以下内容吗？\n${descriptions.join('\n')}\n\n此操作不可撤销。`,
        warningMessage: targets.some(t => t.type === 'all_scenes' || t.type === 'all_shots')
            ? '⚠️ 警告：这将删除大量内容！'
            : undefined,
    };
}

/**
 * 查找重复的项（基于名称）
 */
function findDuplicatesByName(items: Array<{ id: string; name: string }>): string[] {
    const nameCount: Record<string, string[]> = {};
    items.forEach(item => {
        const key = item.name.trim().toLowerCase();
        if (!nameCount[key]) nameCount[key] = [];
        nameCount[key].push(item.id);
    });

    // 返回重复项（保留第一个，删除后续的）
    const duplicateIds: string[] = [];
    Object.values(nameCount).forEach(ids => {
        if (ids.length > 1) {
            duplicateIds.push(...ids.slice(1)); // 保留第一个，标记其他为重复
        }
    });
    return duplicateIds;
}

/**
 * 查找重复的分镜（基于描述）
 */
function findDuplicateShotsByDescription(shots: Array<{ id: string; description?: string }>): string[] {
    const descCount: Record<string, string[]> = {};
    shots.forEach(shot => {
        const key = (shot.description || '').trim().toLowerCase();
        if (!key) return; // 忽略空描述
        if (!descCount[key]) descCount[key] = [];
        descCount[key].push(shot.id);
    });

    const duplicateIds: string[] = [];
    Object.values(descCount).forEach(ids => {
        if (ids.length > 1) {
            duplicateIds.push(...ids.slice(1));
        }
    });
    return duplicateIds;
}

// ===== 查询功能 =====

export interface QueryResult {
    found: boolean;
    type: 'scene' | 'shot' | 'character' | 'location' | 'summary';
    data: Array<{ name: string; id: string; description?: string }>;
    message: string;
}

/**
 * 解析查询请求，返回匹配的内容
 */
export function parseQueryRequest(
    userMessage: string,
    project: {
        scenes?: Array<{ id: string; name: string; order?: number }>;
        shots?: Array<{ id: string; description?: string; order?: number }>;
        characters?: Array<{ id: string; name: string; description?: string }>;
        locations?: Array<{ id: string; name: string; description?: string }>;
    }
): QueryResult {
    const text = userMessage;

    // 查询场景
    if (TARGET_KEYWORDS.scene.some(kw => text.includes(kw)) && project.scenes) {
        return {
            found: project.scenes.length > 0,
            type: 'scene',
            data: project.scenes.map(s => ({ id: s.id, name: s.name })),
            message: project.scenes.length > 0
                ? `当前共有 ${project.scenes.length} 个场景：\n${project.scenes.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}`
                : '当前没有任何场景',
        };
    }

    // 查询镜头
    if (TARGET_KEYWORDS.shot.some(kw => text.includes(kw)) && project.shots) {
        return {
            found: project.shots.length > 0,
            type: 'shot',
            data: project.shots.map(s => ({ id: s.id, name: `镜头 ${s.order || ''}`, description: s.description })),
            message: project.shots.length > 0
                ? `当前共有 ${project.shots.length} 个镜头`
                : '当前没有任何镜头',
        };
    }

    // 查询角色
    if (TARGET_KEYWORDS.character.some(kw => text.includes(kw)) && project.characters) {
        return {
            found: project.characters.length > 0,
            type: 'character',
            data: project.characters.map(c => ({ id: c.id, name: c.name, description: c.description })),
            message: project.characters.length > 0
                ? `当前共有 ${project.characters.length} 个角色：\n${project.characters.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`
                : '当前没有任何角色',
        };
    }

    // 查询地点
    if (TARGET_KEYWORDS.location.some(kw => text.includes(kw)) && project.locations) {
        return {
            found: project.locations.length > 0,
            type: 'location',
            data: project.locations.map(l => ({ id: l.id, name: l.name, description: l.description })),
            message: project.locations.length > 0
                ? `当前共有 ${project.locations.length} 个地点：\n${project.locations.map((l, i) => `${i + 1}. ${l.name}`).join('\n')}`
                : '当前没有任何地点',
        };
    }

    // 默认返回摘要
    const summary = buildContextSummary(project);
    return {
        found: true,
        type: 'summary',
        data: [],
        message: summary || '当前项目没有任何内容',
    };
}

// ===== 修改功能 =====

export interface ModifyTarget {
    type: 'scene' | 'shot' | 'character' | 'location';
    id: string;
    name: string;
    field?: 'name' | 'description' | 'content';
    newValue?: string;
}

export interface ModifyParseResult {
    canModify: boolean;
    targets: ModifyTarget[];
    message: string;
}

const MODIFY_PATTERNS = {
    sceneName: /(?:把|将)?(?:第\s*)?(\d+)\s*(?:个|场)?场景.*?(?:改|换|改成|换成|重命名)(?:为|成)?\s*[""']?([^""']+)[""']?/,
    shotDesc: /(?:把|将)?(?:第\s*)?(\d+)\s*(?:个)?(?:镜头|分镜).*?(?:改|换|改成|换成)(?:为|成)?\s*[""']?([^""']+)[""']?/,
    characterName: /(?:把|将)?角色\s*[""']?([^""']+)[""']?\s*(?:改|换|改成|换成|重命名)(?:为|成)?\s*[""']?([^""']+)[""']?/,
    locationName: /(?:把|将)?地点\s*[""']?([^""']+)[""']?\s*(?:改|换|改成|换成|重命名)(?:为|成)?\s*[""']?([^""']+)[""']?/,
};

/**
 * 解析修改请求，返回要修改的目标
 */
export function parseModifyRequest(
    userMessage: string,
    project: {
        scenes?: Array<{ id: string; name: string; order?: number }>;
        shots?: Array<{ id: string; description?: string; order?: number }>;
        characters?: Array<{ id: string; name: string }>;
        locations?: Array<{ id: string; name: string }>;
    }
): ModifyParseResult {
    const targets: ModifyTarget[] = [];
    const text = userMessage;

    // 修改场景名称
    const sceneMatch = text.match(MODIFY_PATTERNS.sceneName);
    if (sceneMatch && project.scenes) {
        const sceneIndex = parseInt(sceneMatch[1], 10);
        const newName = sceneMatch[2].trim();
        const scene = project.scenes.find((s, idx) => (s.order ?? idx + 1) === sceneIndex);
        if (scene) {
            targets.push({
                type: 'scene',
                id: scene.id,
                name: scene.name,
                field: 'name',
                newValue: newName,
            });
        }
    }

    // 修改镜头描述
    const shotMatch = text.match(MODIFY_PATTERNS.shotDesc);
    if (shotMatch && project.shots) {
        const shotIndex = parseInt(shotMatch[1], 10);
        const newDesc = shotMatch[2].trim();
        const sortedShots = [...project.shots].sort((a, b) => (a.order || 0) - (b.order || 0));
        if (shotIndex >= 1 && shotIndex <= sortedShots.length) {
            targets.push({
                type: 'shot',
                id: sortedShots[shotIndex - 1].id,
                name: `镜头 ${shotIndex}`,
                field: 'description',
                newValue: newDesc,
            });
        }
    }

    // 修改角色名称
    const charMatch = text.match(MODIFY_PATTERNS.characterName);
    if (charMatch && project.characters) {
        const oldName = charMatch[1].trim();
        const newName = charMatch[2].trim();
        const char = project.characters.find(c => c.name.includes(oldName) || oldName.includes(c.name));
        if (char) {
            targets.push({
                type: 'character',
                id: char.id,
                name: char.name,
                field: 'name',
                newValue: newName,
            });
        }
    }

    // 修改地点名称
    const locMatch = text.match(MODIFY_PATTERNS.locationName);
    if (locMatch && project.locations) {
        const oldName = locMatch[1].trim();
        const newName = locMatch[2].trim();
        const loc = project.locations.find(l => l.name.includes(oldName) || oldName.includes(l.name));
        if (loc) {
            targets.push({
                type: 'location',
                id: loc.id,
                name: loc.name,
                field: 'name',
                newValue: newName,
            });
        }
    }

    if (targets.length === 0) {
        return {
            canModify: false,
            targets: [],
            message: '无法识别要修改的内容，请更明确地描述，例如："把第1个场景名称改成 开场"',
        };
    }

    const descriptions = targets.map(t => `${t.name} → ${t.newValue}`);
    return {
        canModify: true,
        targets,
        message: `确认修改以下内容？\n${descriptions.join('\n')}`,
    };
}

// ===== 添加功能 =====

export interface AddTarget {
    type: 'scene' | 'shot' | 'character' | 'location';
    name?: string;
    description?: string;
    afterIndex?: number;  // 插入位置
}

export interface AddParseResult {
    canAdd: boolean;
    targets: AddTarget[];
    message: string;
}

const ADD_PATTERNS = {
    scene: /(?:添加|新建|创建|增加)(?:一个)?场景\s*[""']?([^""']*)[""']?/,
    shot: /(?:在)?(?:第\s*)?(\d+)?\s*(?:个|场)?场景?(?:后面|之后)?(?:添加|新建|创建|增加)(?:一个)?(?:镜头|分镜)/,
    character: /(?:添加|新建|创建|增加)(?:一个)?角色\s*[""']?([^""']+)[""']?/,
    location: /(?:添加|新建|创建|增加)(?:一个)?(?:地点|场所)\s*[""']?([^""']+)[""']?/,
};

/**
 * 解析添加请求
 */
export function parseAddRequest(userMessage: string): AddParseResult {
    const targets: AddTarget[] = [];
    const text = userMessage;

    // 添加场景
    const sceneMatch = text.match(ADD_PATTERNS.scene);
    if (sceneMatch) {
        targets.push({
            type: 'scene',
            name: sceneMatch[1]?.trim() || undefined,
        });
    }

    // 添加镜头
    const shotMatch = text.match(ADD_PATTERNS.shot);
    if (shotMatch) {
        targets.push({
            type: 'shot',
            afterIndex: shotMatch[1] ? parseInt(shotMatch[1], 10) : undefined,
        });
    }

    // 添加角色
    const charMatch = text.match(ADD_PATTERNS.character);
    if (charMatch) {
        targets.push({
            type: 'character',
            name: charMatch[1]?.trim(),
        });
    }

    // 添加地点
    const locMatch = text.match(ADD_PATTERNS.location);
    if (locMatch) {
        targets.push({
            type: 'location',
            name: locMatch[1]?.trim(),
        });
    }

    if (targets.length === 0) {
        return {
            canAdd: false,
            targets: [],
            message: '无法识别要添加的内容类型',
        };
    }

    const descriptions = targets.map(t => {
        if (t.type === 'scene') return `新场景${t.name ? `: ${t.name}` : ''}`;
        if (t.type === 'shot') return `新镜头${t.afterIndex ? ` (在场景 ${t.afterIndex} 之后)` : ''}`;
        if (t.type === 'character') return `新角色: ${t.name}`;
        if (t.type === 'location') return `新地点: ${t.name}`;
        return '未知';
    });

    return {
        canAdd: true,
        targets,
        message: `将添加：${descriptions.join('、')}`,
    };
}
