
import { Shot, Character, Scene } from '../types/project';

/**
 * 提示词服务：负责将项目中的分镜、角色、场景信息转换为 Sora 视频生成专用的 Prompt
 * 遵循 "Adapter Pattern" —— 适配现有数据结构到 Sora API
 */
export class SoraPromptService {

    /**
     * 生成单个分镜的 Sora 视频提示词
     * @param shot 分镜对象
     * @param characters 本分镜涉及的角色列表（必须已包含 soraIdentity）
     * @param artStyle 项目画风
     * @param scene 所属场景（可选）
     */
    generateVideoPrompt(shot: Shot, characters: Character[], artStyle: string = "cinematic", scene?: Scene): string {
        // 1. 获取核心视觉描述
        let visual = shot.description;
        try {
            const descObj = JSON.parse(shot.description);
            if (descObj.visual) visual = descObj.visual;
        } catch (e) { }

        // 2. 角色替换：将中文名替换为 @username
        // 重要 (User Request): 确保提示词中直接使用角色码，例如 "@username 正在..."
        characters.forEach(char => {
            if (char.soraIdentity?.username) {
                const id = `@${char.soraIdentity.username}`;
                // 全文切分并连接，确保替换掉所有出现的角色名
                visual = visual.split(char.name).join(id);
            }
        });

        // 3. 返回包含中文指令的叙事文本
        // 重要 (User Request): 追加质量与配音指令
        const qualitySuffix = "。中文配音，不要增减旁白，无字幕，高清，无配乐，画面无闪烁。请根据这个参考图片里的场景帮我生成动画。";
        return `${visual.trim()}${qualitySuffix}`;
    }

    /**
     * 生成适合角色注册的 Prompt (互动式模式以提升面部一致性)
     */
    generateCharacterReferencePrompt(character: Character): string {
        const description = character.description || character.appearance;
        // 采用互动模式生成 10s 参考视频，以便更容易被提取为稳定的 @username
        return `Character Reference: ${character.name}. Description: ${description}. Action: The character faces the camera and talks naturally, making eye contact and interacting with the lens. Background: Pure white background, clean lighting. Cinematic, high quality, absolute stability.`;
    }
}
