
import { Shot, Character, Scene } from '../types/project';

/**
 * 提示词服务：负责将项目中的分镜、角色、场景信息转换为 Sora 视频生成专用的 Prompt
 * 遵循 "Adapter Pattern" —— 适配现有数据结构到 Sora API
 */
export class SoraPromptService {
    formatSoraCode(username: string, withTrailingSpace: boolean = false): string {
        const normalized = username.startsWith('@') ? username.slice(1) : username;
        return withTrailingSpace ? `@${normalized} ` : `@${normalized}`;
    }

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
            const candidates: string[] = [];
            if (descObj && typeof descObj === 'object') {
                if (typeof descObj.visual === 'string') candidates.push(descObj.visual);
                if (typeof descObj.action === 'string') candidates.push(descObj.action);
                if (typeof descObj.prompt === 'string') candidates.push(descObj.prompt);
                if (typeof descObj.description === 'string') candidates.push(descObj.description);
            }
            if (candidates.length > 0) {
                visual = candidates.join(' ');
            }
        } catch (e) { }

        // 2. 角色替换：将中文名替换为 @username
        // 重要 (User Request): 确保提示词中直接使用角色码，例如 "@username 正在..."
        const sorted = [...characters].sort((a, b) => (b.name || '').length - (a.name || '').length);
        sorted.forEach(char => {
            if (char.soraIdentity?.username) {
                const id = this.formatSoraCode(char.soraIdentity.username, true);
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
        return [
            `参考角色: ${character.name}。`,
            `描述: ${description}。`,
            '动作：角色正对镜头，自然说话，有眼神交流，轻微自然动作。',
            '镜头：固定机位或轻微稳定推拉，确保面部与上半身清晰，避免镜头环绕 360 度。',
            '灯光/背景：干净画面，柔和均匀灯光，纯白背景或干净浅色背景。',
            '画质：超高清，无闪烁，无字幕，无音乐，无明显运动模糊。',
            "保持角色的面部、服装和身体比例等一致性。"
        ].join(' ');
    }
}
