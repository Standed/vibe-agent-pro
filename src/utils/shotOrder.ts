import type { Project, Scene } from '@/types/project';

const sceneSortScore = (scene: Scene, idx: number) => {
  const orderScore = typeof scene.order === 'number' ? scene.order : Number.MAX_SAFE_INTEGER;
  const createdScore = scene.created ? new Date(scene.created).getTime() : Number.MAX_SAFE_INTEGER;
  return { orderScore, createdScore, idx };
};

/**
 * 按现有顺序/创建时间归一化场景序号（1 开始），返回排序后的场景列表。
 */
export function normalizeSceneOrder(project: Project | null | undefined): Scene[] {
  if (!project) return [];
  const scenes = project.scenes || [];
  const sorted = [...scenes].sort((a, b) => {
    const sa = sceneSortScore(a, scenes.indexOf(a));
    const sb = sceneSortScore(b, scenes.indexOf(b));
    if (sa.orderScore !== sb.orderScore) return sa.orderScore - sb.orderScore;
    if (sa.createdScore !== sb.createdScore) return sa.createdScore - sb.createdScore;
    return sa.idx - sb.idx;
  });
  sorted.forEach((scene, idx) => {
    scene.order = idx + 1;
  });
  project.scenes = sorted;
  return sorted;
}

/**
 * 根据场景顺序重新计算全局镜头编号（从 1 连续递增），并同步 scene.shotIds。
 * 会直接修改传入的 project 对象。
 */
export function recalcShotOrders(project: Project | null | undefined): void {
  if (!project) return;

  const scenesSorted = normalizeSceneOrder(project);

  let globalOrder = 0;
  const allShots = project.shots || [];
  const shotMap = new Map(allShots.map((s) => [s.id, s]));

  scenesSorted.forEach((scene) => {
    let shotIds: string[] = [];
    if (scene.shotIds && scene.shotIds.length > 0) {
      shotIds = scene.shotIds.filter((id) => shotMap.has(id));
    }
    if (shotIds.length === 0) {
      shotIds = allShots
        .filter((s) => s.sceneId === scene.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => s.id);
    }

    scene.shotIds = shotIds;
    shotIds.forEach((id) => {
      const shot = shotMap.get(id);
      if (shot) {
        globalOrder += 1;
        shot.order = globalOrder;
        shot.sceneId = scene.id;
      }
    });
  });

  // 无场景镜头排到最后
  allShots
    .filter((s) => !s.sceneId)
    .forEach((shot) => {
      globalOrder += 1;
      shot.order = globalOrder;
    });
}
