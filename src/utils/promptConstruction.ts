import { Project, Shot, ShotSize, CameraMovement } from '@/types/project';
import { translateShotSize, translateCameraMovement } from './translations';

/**
 * Constructs the base prompt for a shot, including art style, shot size, description, and scene info.
 * This logic is shared between Agent Mode (generationTools) and Pro Mode (UI default prompt).
 * 
 * Order:
 * 1. Art Style
 * 2. Shot Size (Chinese)
 * 3. Camera Movement (Chinese)
 * 4. Shot Description
 * 5. Scene Context (Name + Location + Description)
 */
export interface PromptConstructionOptions {
    includeCameraMovement?: boolean;
}

export function constructBaseShotPrompt(project: Project, shot: Shot, options: PromptConstructionOptions = {}): string[] {
    const { includeCameraMovement = false } = options;
    const scene = project.scenes.find(s => s.id === shot.sceneId);
    const promptParts: string[] = [];

    // 1. 添加画风
    if (project.metadata?.artStyle) {
        promptParts.push(project.metadata.artStyle);
    }

    // 2. 添加景别（中文）
    if (shot.shotSize) {
        // Handle potential comma-separated values (dirty data repair)
        // e.g. "Close-Up, Zoom In" -> Translate each part
        const parts = shot.shotSize.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        const translatedParts = parts.map(p => translateShotSize(p as ShotSize));
        // Join with space or nothing? Usually single value. 
        promptParts.push(translatedParts.join(' '));
    }

    // 3. 添加运镜（中文）- 仅在视频生成模式下启用
    if (includeCameraMovement && shot.cameraMovement) {
        const parts = shot.cameraMovement.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        const translatedParts = parts.map(p => translateCameraMovement(p as CameraMovement));
        // Some users might prefer "运镜：xxx" prefix, but to stay minimal and consistent with shotSize:
        // We will just push the value. If users want prefix, they can add in description.
        // But for Camera Movement, usually it's better to be explicit or just keywords.
        // Let's us just keywords for now to match user's screenshot style "Close-Up, Zoom In" => "特写 变焦推"
        promptParts.push(translatedParts.join(' '));
    }

    // 4. 添加分镜描述
    if (shot.description) {
        promptParts.push(shot.description);
    }

    // 5. 添加场景信息（仅描述）
    if (scene?.description) {
        promptParts.push(`场景描述：${scene.description}`);
    }

    return promptParts;
}
