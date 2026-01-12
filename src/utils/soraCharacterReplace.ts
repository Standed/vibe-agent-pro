import { Character } from '@/types/project';

/**
 * 将提示词中的角色名替换为Sora角色码
 * 
 * 匹配规则：
 * 1. @角色名 → @sora码 (如 @小明 → @fmraejvq)
 * 2. 角色全名 → @sora码 (如 小明 → @fmraejvq)
 * 
 * 注意：为避免误伤，不做模糊匹配
 */
export function replaceSoraCharacterCodes(
    prompt: string,
    characters: Character[]
): { result: string; replacements: Array<{ from: string; to: string }> } {
    let result = prompt;
    const replacements: Array<{ from: string; to: string }> = [];

    // 按名称长度降序排序，防止短名称先匹配导致长名称匹配失败
    const sortedCharacters = [...characters]
        .filter(c => c.soraIdentity?.username)
        .sort((a, b) => b.name.length - a.name.length);

    for (const char of sortedCharacters) {
        const soraCode = char.soraIdentity!.username;
        // 如果soraCode已经带@，去掉重复
        const cleanCode = soraCode.startsWith('@') ? soraCode : `@${soraCode}`;
        const charName = char.name.trim();

        if (!charName) continue;

        // 转义正则特殊字符
        const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 模式1: @角色名 → @sora码
        const atPattern = new RegExp(`@${escapedName}(?![\\w])`, 'g');
        const atMatches = result.match(atPattern);
        if (atMatches) {
            result = result.replace(atPattern, cleanCode);
            atMatches.forEach(() => {
                replacements.push({ from: `@${charName}`, to: cleanCode });
            });
        }

        // 模式2: 角色全名（非@开头）→ @sora码
        // 使用负向前瞻和后瞻确保是完整词
        const namePattern = new RegExp(`(?<![\\w@])${escapedName}(?![\\w])`, 'g');
        const nameMatches = result.match(namePattern);
        if (nameMatches) {
            result = result.replace(namePattern, cleanCode);
            nameMatches.forEach(() => {
                replacements.push({ from: charName, to: cleanCode });
            });
        }
    }

    return { result, replacements };
}
