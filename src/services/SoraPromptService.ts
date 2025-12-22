
import { Shot, Character, Scene } from '@/types/project';

/**
 * 提示词服务：负责将项目中的分镜、角色、场景信息转换为 Sora 视频生成专用的 Prompt
 * 遵循 "Adapter Pattern" —— 适配现有数据结构到 Sora API
 */
export class SoraPromptService {

    /**
     * 生成单个分镜的 Sora 视频提示词
     * @param shot 分镜对象
     * @param characters 本分镜涉及的角色列表（必须已包含 soraIdentity）
     * @param scene 所属场景（可选）
     */
    generateVideoPrompt(shot: Shot, characters: Character[], scene?: Scene): string {
        // 1. 基础视觉描述映射
        let visualDescription = shot.description;

        // 尝试解析 visual 字段 (如果 description 是 JSON 字符串)
        try {
            const descObj = JSON.parse(shot.description);
            if (descObj.visual) visualDescription = descObj.visual;
        } catch (e) {
            // 它是普通文本，保持原样
        }

        // 2. 角色身份注入 (@username)
        // 遍历所有角色，将文本中的角色名替换为 Sora 标识
        characters.forEach(char => {
            if (char.soraIdentity?.username) {
                // 使用正则全局替换角色名
                const regex = new RegExp(char.name, 'g');
                visualDescription = visualDescription.replace(regex, `@${char.soraIdentity.username}`);
            }
        });

        // 3. 场景氛围增强
        let contextPrompt = '';
        if (scene) {
            contextPrompt += ` Environment: ${scene.location}, ${scene.description}.`;
        }

        // 4. 技术参数增强 (Quality & Stability)
        const technicalPrompts = [
            "high quality",
            "4k resolution",
            "stable footage",
            "no flickering",
            "cinematic lighting",
            "highly detailed",
            "fluid motion"
        ];

        // 5. 运镜与景别指令映射 (严格使用分镜数据)
        let visualElements: string[] = [];

        if (shot.shotSize) {
            visualElements.push(`Shot Size: ${shot.shotSize}`);
        }
        if (shot.cameraMovement) {
            visualElements.push(`Camera Movement: ${shot.cameraMovement}`);
        }
        // 之前定义的 cameraPrompt 这里通过 visualElements 统一处理，避免重复
        // 修正：上面的 visualElements 已经包含 cameraMovement，所以这里移除之前重复的 cameraPrompt 变量逻辑


        // 6. 最终组装 (Pipe Animation Studio Style)
        // Structure: [Subject] [Action] [Environment] [Camera/Lighting] [Style/Tech]

        // Subject & Action (Core)
        // Ensure subject comes first for stability
        const subjectAction = `${visualDescription}`; // visualDescription already contains @username

        // Technical & Style (Anti-flicker & Quality)
        const stabilityKeywords = [
            "consistent character details",
            "no morphing",
            "fluid motion",
            "stable footage",
            "high fidelity",
            "4k resolution",
            "cinematic lighting"
        ];

        // Combine
        const finalPrompt = `${subjectAction}. ${contextPrompt} ${visualElements.join(', ')}. Style: ${stabilityKeywords.join(', ')}.`;

        return finalPrompt;
    }

    /**
     * 生成适合角色注册的 Prompt (用于 generateCharacter)
     * 严格使用角色编辑页面已有的 "appearance" 字段，不做额外发散
     * 采用互动式 Prompt (对着镜头说话) 以提升面部一致性，背景简化为白底
     * @param character 角色对象
     */
    generateCharacterReferencePrompt(character: Character): string {
        // 直接读取 Gemini 自动生成好的外貌特征
        const appearance = character.appearance;

        // 互动式 Prompt：对着镜头说话，模拟真实互动，白底背景
        return `Character Reference Video: ${character.name}. Appearance: ${appearance}. Action: The character faces the camera and talks naturally, saying 'Nice weather today, let's go out and play', making eye contact and interacting with the lens. Background: Pure white background, clean lighting.`;
    }
}
