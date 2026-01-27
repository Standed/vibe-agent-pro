import { Project, Shot, ShotSize } from '@/types/project';
import { translateShotSize } from './translations';

/**
 * Constructs the base prompt for a shot, including art style, shot size, description, and scene info.
 * This logic is shared between Agent Mode (generationTools) and Pro Mode (UI default prompt).
 * 
 * Order:
 * 1. Art Style
 * 2. Shot Size (Chinese)
 * 3. Shot Description
 * 4. Scene Context (Name + Location + Description)
 */
export function constructBaseShotPrompt(project: Project, shot: Shot): string[] {
    const scene = project.scenes.find(s => s.id === shot.sceneId);
    const promptParts: string[] = [];

    // 1. 添加画风
    if (project.metadata?.artStyle) {
        promptParts.push(project.metadata.artStyle);
    }

    // 2. 添加景别（中文）
    if (shot.shotSize) {
        const chineseShotSize = translateShotSize(shot.shotSize as ShotSize);
        promptParts.push(`${chineseShotSize}`);
    }

    // 3. 添加分镜描述
    if (shot.description) {
        promptParts.push(shot.description);
    }

    // 4. 添加场景信息（仅描述）
    if (scene?.description) {
        promptParts.push(`场景描述：${scene.description}`);
    }

    return promptParts;
}
