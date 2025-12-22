import { CharacterDesign } from '@/types/storyboard';
import { Character } from '@/types/project';

export const buildCharacterTemplate = (artStyle?: string) => {
    const normalizeSegment = (text?: string) =>
        (text || '').trim().replace(/[。．\.！!？?\s]+$/u, '');
    const appendPeriod = (text: string) =>
        text && /[。．.！!？?]$/.test(text) ? text : `${text}。`;

    const style = artStyle?.trim();
    const baseStyle = style ? `画风与风格定位：${style}` : '画风与风格定位：保持项目统一画风';
    const parts = [
        baseStyle,
        '性别、年龄、职业/身份：',
        '身材与整体比例：',
        '脸型与五官特征：',
        '发型与发色：',
        '服装与主要配饰：',
        '表情与气质：',
        '姿态/动作：'
    ]
        .map(normalizeSegment)
        .filter(Boolean);
    const sentence = parts.join('。');
    return appendPeriod(sentence);
};

export const buildAppearanceFromDesign = (design?: CharacterDesign, artStyle?: string) => {
    const normalizeSegment = (text?: string) =>
        (text || '').trim().replace(/[。．\.！!？?\s]+$/u, '');
    const appendPeriod = (text: string) =>
        text && /[。．.！!？?]$/.test(text) ? text : `${text}。`;

    if (!design) return buildCharacterTemplate(artStyle);
    const parts = [
        design.style,
        design.genderAgeOccupation,
        design.bodyShape,
        design.faceFeatures,
        design.hair,
        design.outfit,
        design.expressionMood,
        design.pose,
    ]
        .map(normalizeSegment)
        .filter(Boolean);
    if (parts.length === 0) return buildCharacterTemplate(artStyle);
    const sentence = parts.join('。');
    return appendPeriod(sentence);
};

export const isPlaceholderDescription = (desc?: string) => {
    if (!desc) return true;
    const trimmed = desc.trim();
    if (trimmed.length < 10) return true; // 太短,认为是占位符
    return trimmed.includes('形象设计草稿') || trimmed.includes('请按项补充具体信息') || trimmed.includes('角色定位：');
};

export const isPlaceholderAppearance = (appearance?: string) => {
    if (!appearance) return true;
    const normalized = appearance.trim();
    if (normalized.length < 20) return true; // 太短,认为是占位符
    // 检查是否包含占位符关键词
    const hasPlaceholder = normalized.includes('保持项目统一画风') ||
        normalized.includes('画风与风格定位：') ||
        normalized.includes('性别、年龄、职业/身份：') ||
        normalized.includes('请按项补充');
    return hasPlaceholder;
};

export const isCharacterDesignComplete = (design?: CharacterDesign) => {
    if (!design) {
        console.log('❌ [角色检查] 设计对象为空');
        return false;
    }

    // 只检查是否有name，其他字段有数据就用
    const hasName = !!design.name;
    console.log(`🔍 [角色检查] "${design.name}": ${hasName ? '✅ 有效' : '❌ 无效'}`);
    return hasName;
};

export const normalizeNameKey = (value?: string) =>
    (value || '')
        .toLowerCase()
        .replace(/[\s"'“”、，,。()（）]/g, '')
        .trim();

export const addCandidateName = (map: Map<string, string>, name?: string) => {
    if (!name) return;
    const key = normalizeNameKey(name);
    if (!key) return;
    if (!map.has(key)) {
        map.set(key, name.trim());
    }
};

interface ApplyDesignResult {
    updated: number;
    missing: string[];
}

export const applyCharacterDesigns = (
    names: string[],
    designs: Record<string, CharacterDesign> = {},
    projectCharacters: Character[],
    updateCharacter: (id: string, updates: Partial<Character>) => void,
    addCharacter: (character: Character) => void,
    artStyle?: string
): ApplyDesignResult => {
    let updated = 0;
    const missing: string[] = [];

    console.log(`\n📋 [回填角色设计] 开始处理 ${names.length} 个角色`);
    console.log(`📋 [回填角色设计] 收到的设计数量: ${Object.keys(designs).length}`);

    // 预构建归一化名称索引，兼容 "多萝西(Dorothy)" vs "dorothy"
    const designByKey: Record<string, CharacterDesign> = {};
    Object.entries(designs || {}).forEach(([k, v]) => {
        const key1 = normalizeNameKey(k);
        const key2 = normalizeNameKey(v?.name);
        if (key1) designByKey[key1] = v;
        if (key2) designByKey[key2] = v;
    });

    const findDesign = (name: string) => {
        const key = normalizeNameKey(name);
        return designs[name] || designByKey[key];
    };

    names.forEach((name) => {
        const design = findDesign(name);

        if (!design) {
            console.warn(`⚠️ 角色 "${name}" 没有找到对应的设计`);
            missing.push(name);
            return;
        }

        console.log(`\n🎭 [处理角色] "${name}"`);
        console.log(`  设计对象:`, design);

        // 构建appearance和description
        const appearance = buildAppearanceFromDesign(design, artStyle);
        const description = design.summary || `角色 "${name}"`;

        console.log(`  生成的appearance: "${appearance.slice(0, 80)}..."`);
        console.log(`  生成的description: "${description.slice(0, 80)}..."`);

        const existing = projectCharacters.find(
            (c) => normalizeNameKey(c.name) === normalizeNameKey(name)
        );

        if (existing) {
            // 直接更新，不检查是否是占位符
            updateCharacter(existing.id, {
                appearance,
                description,
            });
            updated += 1;
            console.log(`✅ 更新角色 "${name}"`);
        } else {
            // 新建角色
            addCharacter({
                id: crypto.randomUUID(),
                name,
                description,
                appearance,
                referenceImages: [],
            });
            updated += 1;
            console.log(`✅ 新建角色 "${name}"`);
        }
    });

    console.log(`\n📊 [回填完成] 更新: ${updated}, 缺失: ${missing.length}`);
    return { updated, missing };
};
