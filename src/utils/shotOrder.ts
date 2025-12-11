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
    // 根据镜头自身的 order / created 排序，避免依赖可能失真的 shotIds
    const sceneShots = allShots.filter((s) => s.sceneId === scene.id);
    const sortedShots = [...sceneShots].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const createdA = a.created ? new Date(a.created).getTime() : Number.MAX_SAFE_INTEGER;
      const createdB = b.created ? new Date(b.created).getTime() : Number.MAX_SAFE_INTEGER;
      if (createdA !== createdB) return createdA - createdB;
      return a.id.localeCompare(b.id);
    });

    const shotIds = sortedShots.map((s) => s.id);
    scene.shotIds = shotIds;
    let localOrder = 0;
    sortedShots.forEach((shot) => {
      localOrder += 1;
      globalOrder += 1;
      shot.order = localOrder; // 场景内序号
      (shot as any).globalOrder = globalOrder; // 全局序号
      shot.sceneId = scene.id;
    });
  });

  // 无场景镜头排到最后
  allShots
    .filter((s) => !s.sceneId)
    .forEach((shot) => {
      globalOrder += 1;
      shot.order = globalOrder;
      (shot as any).globalOrder = globalOrder;
    });
}

export function formatShotCode(sceneOrder?: number, shotOrder?: number): string {
  const scenePart = sceneOrder && sceneOrder > 0 ? String(sceneOrder).padStart(2, '0') : '??';
  const shotPart = shotOrder && shotOrder > 0 ? String(shotOrder).padStart(2, '0') : '??';
  return `S${scenePart}_${shotPart}`;
}

export function formatGlobalShot(globalOrder?: number): string {
  if (!globalOrder || globalOrder <= 0) return '#???';
  return `#${String(globalOrder).padStart(3, '0')}`;
}

export function formatShotLabel(sceneOrder?: number, shotOrder?: number, globalOrder?: number): string {
  // 若全局序号缺失，则退化为局部序号（保持可读）
  const globalPart =
    globalOrder && globalOrder > 0
      ? `#${String(globalOrder).padStart(3, '0')}`
      : shotOrder && shotOrder > 0
        ? `#${String(shotOrder).padStart(3, '0')}`
        : '#???';
  return `${formatShotCode(sceneOrder, shotOrder)} · ${globalPart}`;
}
