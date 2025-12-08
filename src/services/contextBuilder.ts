/**
 * Enhanced Context Builder - 上下文预注入增强
 *
 * 基于 Codex 最佳实践：在调用 AI 前预先收集所有相关数据
 * 减少 AI 需要调用工具来获取基础信息的次数
 */

import { Project, Scene, Shot, Character, Location } from '@/types/project';
import { AgentContext } from './agentService';

export interface EnhancedContext extends AgentContext {
  // 详细的场景信息
  scenes: Array<{
    id: string;
    name: string;
    description: string;
    shotCount: number;
    shotsWithImages: number;
    shotsWithVideos: number;
    hasGridHistory: boolean;
  }>;

  // 详细的镜头信息（最近的10个）
  recentShots: Array<{
    id: string;
    order: number;
    sceneId: string;
    sceneName: string;
    description: string;
    hasImage: boolean;
    hasVideo: boolean;
    status: string;
  }>;

  // 资源统计
  resources: {
    characters: number;
    locations: number;
    charactersWithImages: number;
    locationsWithImages: number;
  };

  // 近期操作历史（最近5条）
  recentOperations?: Array<{
    type: string;
    target: string;
    timestamp: Date;
    success: boolean;
  }>;

  // 当前选中项的详细信息
  currentSceneDetails?: {
    id: string;
    name: string;
    description: string;
    shotIds: string[];
    shotCount: number;
  };

  currentShotDetails?: {
    id: string;
    order: number;
    description: string;
    hasImage: boolean;
    hasVideo: boolean;
    generationHistory: number;
  };
}

/**
 * Build enhanced context with all relevant data pre-injected
 */
export function buildEnhancedContext(
  project: Project | null,
  currentSceneId?: string,
  selectedShotId?: string
): EnhancedContext {
  if (!project) {
    return {
      projectName: '未命名项目',
      sceneCount: 0,
      shotCount: 0,
      scenes: [],
      recentShots: [],
      resources: {
        characters: 0,
        locations: 0,
        charactersWithImages: 0,
        locationsWithImages: 0,
      },
    };
  }

  // Build scenes summary
  const scenes = project.scenes.map(scene => {
    const sceneShots = project.shots.filter(s => s.sceneId === scene.id);
    return {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      shotCount: sceneShots.length,
      shotsWithImages: sceneShots.filter(s => s.referenceImage).length,
      shotsWithVideos: sceneShots.filter(s => s.videoClip).length,
      hasGridHistory: (scene.gridHistory?.length || 0) > 0,
    };
  });

  // Build recent shots (last 10)
  const recentShots = project.shots
    .slice(-10)
    .map(shot => {
      const scene = project.scenes.find(s => s.id === shot.sceneId);
      return {
        id: shot.id,
        order: shot.order,
        sceneId: shot.sceneId,
        sceneName: scene?.name || '未知场景',
        description: shot.description,
        hasImage: !!shot.referenceImage,
        hasVideo: !!shot.videoClip,
        status: shot.status || 'draft',
      };
    });

  // Build resources summary
  const resources = {
    characters: project.characters.length,
    locations: project.locations.length,
    charactersWithImages: project.characters.filter(c => c.referenceImages && c.referenceImages.length > 0).length,
    locationsWithImages: project.locations.filter(l => l.referenceImages && l.referenceImages.length > 0).length,
  };

  // Build current scene details
  let currentSceneDetails;
  if (currentSceneId) {
    const scene = project.scenes.find(s => s.id === currentSceneId);
    if (scene) {
      currentSceneDetails = {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        shotIds: scene.shotIds,
        shotCount: scene.shotIds.length,
      };
    }
  }

  // Build current shot details
  let currentShotDetails;
  if (selectedShotId) {
    const shot = project.shots.find(s => s.id === selectedShotId);
    if (shot) {
      currentShotDetails = {
        id: shot.id,
        order: shot.order,
        description: shot.description,
        hasImage: !!shot.referenceImage,
        hasVideo: !!shot.videoClip,
        generationHistory: shot.generationHistory?.length || 0,
      };
    }
  }

  return {
    projectName: project.metadata.title,
    projectDescription: project.metadata.description,
    currentScene: currentSceneDetails?.name,
    currentShot: currentShotDetails ? `镜头 #${currentShotDetails.order}` : undefined,
    shotCount: project.shots.length,
    sceneCount: project.scenes.length,
    scenes,
    recentShots,
    resources,
    currentSceneDetails,
    currentShotDetails,
  };
}

/**
 * Format enhanced context for AI prompt
 */
export function formatEnhancedContextForPrompt(context: EnhancedContext): string {
  const parts: string[] = [];

  // Basic info
  parts.push(`## 项目信息`);
  parts.push(`- 名称: ${context.projectName}`);
  if (context.projectDescription) {
    parts.push(`- 描述: ${context.projectDescription}`);
  }
  parts.push(`- 场景数: ${context.sceneCount}`);
  parts.push(`- 镜头数: ${context.shotCount}`);

  // Resources
  parts.push(``);
  parts.push(`## 资源统计`);
  parts.push(`- 角色: ${context.resources.characters} 个 (${context.resources.charactersWithImages} 个有参考图)`);
  parts.push(`- 场景: ${context.resources.locations} 个 (${context.resources.locationsWithImages} 个有参考图)`);

  // Scenes summary
  if (context.scenes.length > 0) {
    parts.push(``);
    parts.push(`## 场景列表`);
    context.scenes.forEach((scene, index) => {
      parts.push(`${index + 1}. ${scene.name} - ${scene.shotCount} 个镜头 (${scene.shotsWithImages} 张图片, ${scene.shotsWithVideos} 个视频)`);
    });
  }

  // Current selections
  if (context.currentSceneDetails) {
    parts.push(``);
    parts.push(`## 当前选中场景`);
    parts.push(`- 名称: ${context.currentSceneDetails.name}`);
    parts.push(`- 描述: ${context.currentSceneDetails.description}`);
    parts.push(`- 镜头数: ${context.currentSceneDetails.shotCount}`);
  }

  if (context.currentShotDetails) {
    parts.push(``);
    parts.push(`## 当前选中镜头`);
    parts.push(`- 编号: #${context.currentShotDetails.order}`);
    parts.push(`- 描述: ${context.currentShotDetails.description}`);
    parts.push(`- 状态: ${context.currentShotDetails.hasImage ? '已有图片' : '无图片'} ${context.currentShotDetails.hasVideo ? '已有视频' : '无视频'}`);
  }

  return parts.join('\n');
}
