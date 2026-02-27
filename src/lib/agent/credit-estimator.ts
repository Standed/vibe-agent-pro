import { calculateCredits, calculateSoraCredits } from '@/config/credits';
import type { ToolCall } from '@/services/agentToolDefinitions';

type UserRole = 'user' | 'admin' | 'vip';

export interface CreditEstimateContext {
  sceneCount?: number;
  shotCount?: number;
  resources?: {
    locations?: number;
  };
}

export interface CreditEstimateProjectSnapshot {
  scenes?: Array<{
    id: string;
    soraStatus?: string | null;
  }>;
  shots?: Array<{
    id: string;
    sceneId: string;
    duration?: number;
    order?: number;
    globalOrder?: number;
    referenceImage?: string | null;
  }>;
  locations?: Array<{
    id: string;
    referenceImages?: string[] | null;
  }>;
}

export interface CreditEstimateBreakdown {
  tool: string;
  units: number;
  unitCost: number;
  credits: number;
  note?: string;
}

export interface CreditEstimateResult {
  estimatedCredits: number;
  breakdown: CreditEstimateBreakdown[];
}

export interface CreditEstimateInput {
  toolCalls: ToolCall[];
  userRole: UserRole;
  context?: CreditEstimateContext;
  projectSnapshot?: CreditEstimateProjectSnapshot | null;
}

const getGridDimensions = (gridSize?: string): { rows: number; cols: number } => {
  const [rowsRaw, colsRaw] = (gridSize || '2x2').split('x').map(Number);
  const rows = Number.isFinite(rowsRaw) && rowsRaw > 0 ? rowsRaw : 2;
  const cols = Number.isFinite(colsRaw) && colsRaw > 0 ? colsRaw : 2;
  return { rows, cols };
};

const getImageGenerationUnitCost = (mode: string | undefined, userRole: UserRole): number => {
  if (mode === 'grid') {
    return calculateCredits('GEMINI_GRID', userRole);
  }
  if (mode === 'gemini') {
    return calculateCredits('GEMINI_IMAGE', userRole);
  }
  if (mode === 'seedream' || mode === 'jimeng') {
    return calculateCredits('SEEDREAM_GENERATE', userRole);
  }
  return calculateCredits('VOLCANO_GENERATE', userRole);
};

const clampDuration = (duration: number): number => Math.min(Math.max(duration, 1), 10);

const listShots = (snapshot?: CreditEstimateProjectSnapshot | null) =>
  Array.isArray(snapshot?.shots) ? snapshot!.shots : [];

const listScenes = (snapshot?: CreditEstimateProjectSnapshot | null) =>
  Array.isArray(snapshot?.scenes) ? snapshot!.scenes : [];

const listLocations = (snapshot?: CreditEstimateProjectSnapshot | null) =>
  Array.isArray(snapshot?.locations) ? snapshot!.locations : [];

const normalizeShotDuration = (duration?: number): number => {
  const parsed = Number(duration);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
};

const sortShotsForStoryboard = <
  T extends { order?: number; globalOrder?: number }
>(shots: T[]): T[] => [...shots].sort((a, b) => {
  const aGlobal = Number.isFinite(a.globalOrder) ? Number(a.globalOrder) : Number.POSITIVE_INFINITY;
  const bGlobal = Number.isFinite(b.globalOrder) ? Number(b.globalOrder) : Number.POSITIVE_INFINITY;
  if (aGlobal !== bGlobal) return aGlobal - bGlobal;

  const aOrder = Number.isFinite(a.order) ? Number(a.order) : Number.POSITIVE_INFINITY;
  const bOrder = Number.isFinite(b.order) ? Number(b.order) : Number.POSITIVE_INFINITY;
  return aOrder - bOrder;
});

const splitShotsIntoSoraChunks = <T extends { duration?: number }>(shots: T[]): T[][] => {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentDuration = 0;
  const MAX_DURATION = 14; // keep aligned with SoraOrchestrator

  for (const shot of shots) {
    const shotDuration = normalizeShotDuration(shot.duration);
    if (currentDuration + shotDuration > MAX_DURATION && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [shot];
      currentDuration = shotDuration;
    } else {
      currentChunk.push(shot);
      currentDuration += shotDuration;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const estimateSoraChunkCredits = (
  shots: Array<{ duration?: number }>,
  model: string | undefined,
  userRole: UserRole
): number => {
  if (shots.length === 0) {
    return calculateSoraCredits(model === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2', 15, userRole);
  }

  const soraModel = model === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2';
  const chunks = splitShotsIntoSoraChunks(shots);

  return chunks.reduce((sum, chunk) => {
    const chunkDuration = chunk.reduce((dur, shot) => dur + normalizeShotDuration(shot.duration), 0);
    const rawDuration = chunkDuration + 1; // match orchestrator buffer
    let requestSeconds = soraModel === 'sora-2-pro' ? 25 : 15;
    if (rawDuration < (soraModel === 'sora-2-pro' ? 12 : 8) && chunk.length <= 1) {
      requestSeconds = soraModel === 'sora-2-pro' ? 15 : 10;
    }

    return sum + calculateSoraCredits(soraModel, requestSeconds, userRole);
  }, 0);
};

const getAverageSceneShots = (context?: CreditEstimateContext): number => {
  if (context?.shotCount && context?.sceneCount) {
    return Math.max(1, Math.round(context.shotCount / Math.max(context.sceneCount, 1)));
  }
  return 5;
};

const getProjectShotCount = (snapshot?: CreditEstimateProjectSnapshot | null, context?: CreditEstimateContext): number => {
  const shots = listShots(snapshot);
  if (shots.length > 0) return shots.length;
  if (context?.shotCount && context.shotCount > 0) return context.shotCount;
  return 10;
};

const shouldForceRegeneration = (force: unknown): boolean => force !== false;

const countSceneTargetShots = (
  sceneId: string,
  force: unknown,
  snapshot?: CreditEstimateProjectSnapshot | null,
  context?: CreditEstimateContext
): number => {
  const shots = listShots(snapshot).filter(shot => shot.sceneId === sceneId);
  if (shots.length === 0) return getAverageSceneShots(context);

  if (shouldForceRegeneration(force)) {
    return shots.length;
  }
  return shots.filter(shot => !shot.referenceImage).length;
};

const countProjectTargetShots = (
  force: unknown,
  snapshot?: CreditEstimateProjectSnapshot | null,
  context?: CreditEstimateContext
): number => {
  const shots = listShots(snapshot);
  if (shots.length === 0) return getProjectShotCount(snapshot, context);

  if (shouldForceRegeneration(force)) {
    return shots.length;
  }
  return shots.filter(shot => !shot.referenceImage).length;
};

const countProjectGridCalls = (
  gridSize: string | undefined,
  force: unknown,
  snapshot?: CreditEstimateProjectSnapshot | null,
  context?: CreditEstimateContext
): number => {
  const { rows, cols } = getGridDimensions(gridSize);
  const perCallCapacity = Math.max(rows * cols, 1);

  const shots = listShots(snapshot);
  if (shots.length > 0) {
    const sceneIds = Array.from(new Set(shots.map(shot => shot.sceneId)));
    return Math.max(
      1,
      sceneIds.reduce((sum, sceneId) => {
        const sceneTargetShots = countSceneTargetShots(sceneId, force, snapshot, context);
        return sum + Math.max(1, Math.ceil(sceneTargetShots / perCallCapacity));
      }, 0)
    );
  }

  const sceneCount = Math.max(context?.sceneCount || 3, 1);
  const avgShotsPerScene = Math.max(1, Math.ceil(getProjectShotCount(snapshot, context) / sceneCount));
  const callsPerScene = Math.max(1, Math.ceil(avgShotsPerScene / perCallCapacity));
  return sceneCount * callsPerScene;
};

const resolveGenerateShotsTargets = (
  args: Record<string, any>,
  snapshot?: CreditEstimateProjectSnapshot | null
) => {
  const shots = listShots(snapshot);
  if (shots.length === 0) return [] as typeof shots;

  const byId = new Map(shots.map(shot => [shot.id, shot]));
  const dedupeById = (items: typeof shots) =>
    Array.from(new Map(items.map(item => [item.id, item])).values());
  const isShot = (value: (typeof shots)[number] | undefined): value is (typeof shots)[number] => Boolean(value);

  if (Array.isArray(args.shotIds) && args.shotIds.length > 0) {
    return dedupeById(args.shotIds.map((id: string) => byId.get(id)).filter(isShot));
  }

  if (Array.isArray(args.globalShotIndexes) && args.globalShotIndexes.length > 0) {
    const sortedAllShots = sortShotsForStoryboard(shots);
    return dedupeById(
      args.globalShotIndexes
        .map((index: number) => sortedAllShots[index - 1])
        .filter(isShot)
    );
  }

  if (Array.isArray(args.shotIndexes) && args.shotIndexes.length > 0 && args.sceneId) {
    const sceneShots = sortShotsForStoryboard(shots.filter(shot => shot.sceneId === args.sceneId));
    return dedupeById(
      args.shotIndexes
        .map((index: number) => sceneShots[index - 1])
        .filter(isShot)
    );
  }

  if (args.sceneId) {
    return sortShotsForStoryboard(shots.filter(shot => shot.sceneId === args.sceneId));
  }

  return [];
};

const estimateSoraCreditsForSceneShots = (
  shots: ReturnType<typeof listShots>,
  model: string | undefined,
  userRole: UserRole
) => estimateSoraChunkCredits(sortShotsForStoryboard(shots), model, userRole);

const estimateToolCredits = (
  toolCall: ToolCall,
  userRole: UserRole,
  context?: CreditEstimateContext,
  snapshot?: CreditEstimateProjectSnapshot | null
): CreditEstimateBreakdown => {
  const args = (toolCall.arguments || {}) as Record<string, any>;

  switch (toolCall.name) {
    case 'generateShotImage': {
      if (args.mode === 'grid') {
        const { rows, cols } = getGridDimensions(args.gridSize);
        const unitCost = calculateCredits(`GEMINI_GRID_${rows}X${cols}` as any, userRole);
        return { tool: toolCall.name, units: 1, unitCost, credits: unitCost };
      }
      const unitCost = getImageGenerationUnitCost(args.mode, userRole);
      return { tool: toolCall.name, units: 1, unitCost, credits: unitCost };
    }
    case 'batchGenerateSceneImages': {
      const mode = args.mode;
      if (mode === 'grid') {
        const { rows, cols } = getGridDimensions(args.gridSize);
        const sceneTargetShots = countSceneTargetShots(args.sceneId, args.force, snapshot, context);
        const units = Math.max(1, Math.ceil(sceneTargetShots / Math.max(rows * cols, 1)));
        const unitCost = calculateCredits(`GEMINI_GRID_${rows}X${cols}` as any, userRole);
        return {
          tool: toolCall.name,
          units,
          unitCost,
          credits: units * unitCost,
          note: `${sceneTargetShots} shots`,
        };
      }
      const targetShots = countSceneTargetShots(args.sceneId, args.force, snapshot, context);
      const unitCost = getImageGenerationUnitCost(mode, userRole);
      return { tool: toolCall.name, units: targetShots, unitCost, credits: targetShots * unitCost };
    }
    case 'batchGenerateProjectImages': {
      const mode = args.mode;
      if (mode === 'grid') {
        const { rows, cols } = getGridDimensions(args.gridSize);
        const units = countProjectGridCalls(args.gridSize, args.force, snapshot, context);
        const unitCost = calculateCredits(`GEMINI_GRID_${rows}X${cols}` as any, userRole);
        return { tool: toolCall.name, units, unitCost, credits: units * unitCost };
      }
      const targetShots = countProjectTargetShots(args.force, snapshot, context);
      const unitCost = getImageGenerationUnitCost(mode, userRole);
      return { tool: toolCall.name, units: targetShots, unitCost, credits: targetShots * unitCost };
    }
    case 'generateSceneVideo': {
      const sceneShots = args.sceneId
        ? sortShotsForStoryboard(listShots(snapshot).filter(shot => shot.sceneId === args.sceneId))
        : [];
      const estimatedCredits = sceneShots.length > 0
        ? estimateSoraCreditsForSceneShots(sceneShots, args.model, userRole)
        : calculateSoraCredits(args.model === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2', 15, userRole);
      const chunkCount = sceneShots.length > 0
        ? splitShotsIntoSoraChunks(sceneShots).length
        : 1;
      return {
        tool: toolCall.name,
        units: 1,
        unitCost: estimatedCredits,
        credits: estimatedCredits,
        note: `${sceneShots.length || getAverageSceneShots(context)} shots / ${chunkCount} chunks`,
      };
    }
    case 'generateShotsVideo': {
      const targetShots = resolveGenerateShotsTargets(args, snapshot);
      if (targetShots.length === 0) {
        const fallbackCredits = calculateSoraCredits(args.model === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2', 15, userRole);
        return {
          tool: toolCall.name,
          units: 1,
          unitCost: fallbackCredits,
          credits: fallbackCredits,
          note: '1 fallback chunk',
        };
      }

      const sceneBuckets = new Map<string, typeof targetShots>();
      for (const shot of targetShots) {
        const list = sceneBuckets.get(shot.sceneId) || [];
        list.push(shot);
        sceneBuckets.set(shot.sceneId, list);
      }

      let totalCredits = 0;
      let totalChunks = 0;
      for (const sceneShots of sceneBuckets.values()) {
        const sortedSceneShots = sortShotsForStoryboard(sceneShots);
        totalCredits += estimateSoraCreditsForSceneShots(sortedSceneShots, args.model, userRole);
        totalChunks += Math.max(1, splitShotsIntoSoraChunks(sortedSceneShots).length);
      }

      return {
        tool: toolCall.name,
        units: 1,
        unitCost: totalCredits,
        credits: totalCredits,
        note: `${targetShots.length} shots / ${totalChunks} chunks`,
      };
    }
    case 'batchGenerateProjectVideosSora': {
      const shots = listShots(snapshot);
      if (shots.length === 0) {
        return { tool: toolCall.name, units: 0, unitCost: 0, credits: 0 };
      }

      const scenes = listScenes(snapshot);
      const force = args.force === true;
      const targetSceneIds = scenes.length > 0
        ? scenes
          .filter(scene => force || scene.soraStatus !== 'success')
          .map(scene => scene.id)
        : Array.from(new Set(shots.map(shot => shot.sceneId)));

      if (targetSceneIds.length === 0) {
        return { tool: toolCall.name, units: 0, unitCost: 0, credits: 0, note: 'all scenes already generated' };
      }

      let totalCredits = 0;
      let totalChunks = 0;
      let totalShots = 0;

      for (const sceneId of targetSceneIds) {
        const sceneShots = sortShotsForStoryboard(shots.filter(shot => shot.sceneId === sceneId));
        if (sceneShots.length === 0) continue;

        totalCredits += estimateSoraCreditsForSceneShots(sceneShots, args.model, userRole);
        totalChunks += Math.max(1, splitShotsIntoSoraChunks(sceneShots).length);
        totalShots += sceneShots.length;
      }

      return {
        tool: toolCall.name,
        units: 1,
        unitCost: totalCredits,
        credits: totalCredits,
        note: `${totalShots} shots / ${totalChunks} chunks`,
      };
    }
    case 'generateCharacterThreeView': {
      const unitCost = calculateCredits('GEMINI_IMAGE', userRole);
      return { tool: toolCall.name, units: 1, unitCost, credits: unitCost };
    }
    case 'generateLocationImages': {
      const locationIds = Array.isArray(args.locationIds) ? args.locationIds : [];
      const locations = listLocations(snapshot);
      const units = locationIds.length > 0
        ? locationIds.length
        : (locations.length > 0
          ? locations.filter(location => !Array.isArray(location.referenceImages) || location.referenceImages.length === 0).length
          : (context?.resources?.locations || 1));
      const unitCost = calculateCredits('GEMINI_IMAGE', userRole);
      return { tool: toolCall.name, units: Math.max(units, 1), unitCost, credits: Math.max(units, 1) * unitCost };
    }
    case 'generateViduVideo': {
      const shots = listShots(snapshot);
      const shotDuration = args.shotId
        ? shots.find(shot => shot.id === args.shotId)?.duration
        : undefined;
      const duration = clampDuration(Number.isFinite(Number(args.duration)) ? Number(args.duration) : Number(shotDuration || 5));
      const resolution = args.resolution === '720p' ? '720p' : '1080p';
      const unitCost = resolution === '720p'
        ? calculateCredits('VIDU_VIDEO_720P_PER_SECOND', userRole)
        : calculateCredits('VIDU_VIDEO_1080P_PER_SECOND', userRole);
      let credits = duration * unitCost;
      if (args.off_peak) {
        credits = Math.floor(credits / 2);
      }
      return {
        tool: toolCall.name,
        units: duration,
        unitCost,
        credits,
        note: args.off_peak ? 'off-peak' : undefined,
      };
    }
    default:
      return { tool: toolCall.name, units: 0, unitCost: 0, credits: 0 };
  }
};

export function estimateAgentCreditsDetailed(input: CreditEstimateInput): CreditEstimateResult {
  const breakdown = input.toolCalls.map(toolCall =>
    estimateToolCredits(toolCall, input.userRole, input.context, input.projectSnapshot)
  );

  return {
    estimatedCredits: breakdown.reduce((sum, item) => sum + item.credits, 0),
    breakdown,
  };
}
