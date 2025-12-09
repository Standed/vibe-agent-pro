/**
 * Parallel Execution Engine - 并行工具执行
 *
 * 基于 Codex 最佳实践：
 * - 分析工具调用之间的依赖关系
 * - 无依赖的工具并行执行
 * - 有依赖的工具串行执行
 * - 支持并行调用多个 Gemini API
 */

import { ToolCall, StoreCallbacks } from './agentTools';
import { AgentToolExecutor, ToolResult } from './agentTools';
import { Project } from '@/types/project';

export interface ExecutionPlan {
  independent: ToolCall[];  // 可以并行执行的工具
  dependent: ToolCall[][];  // 需要串行执行的工具组（按依赖顺序）
}

export interface ExecutionProgress {
  completed: number;
  total: number;
  currentStep: string;
  errors: Array<{ tool: string; error: string }>;
}

/**
 * Analyze tool dependencies and create execution plan
 */
export function analyzeToolDependencies(toolCalls: ToolCall[]): ExecutionPlan {
  // Simple heuristic-based dependency analysis
  const independent: ToolCall[] = [];
  const dependent: ToolCall[][] = [];

  // Tools that are always independent (read-only queries)
  const readOnlyTools = new Set([
    'getProjectContext',
    'searchScenes',
    'getSceneShots',
    'getShotDetails',
  ]);

  // Tools that modify state (need to be serial)
  const writeTools = new Set([
    'createScene',
    'addShot',
    'addShots',
    'updateShot',
    'batchGenerateSceneImages',
    'generateShotVideo',
  ]);

  // First pass: separate read-only from write operations
  const readOps: ToolCall[] = [];
  const writeOps: ToolCall[] = [];

  for (const tool of toolCalls) {
    if (readOnlyTools.has(tool.name)) {
      readOps.push(tool);
    } else {
      writeOps.push(tool);
    }
  }

  // All read operations can be executed in parallel
  independent.push(...readOps);

  // Write operations need to be serialized
  if (writeOps.length > 0) {
    // Group batch operations
    const batchOps = writeOps.filter(t => t.name.startsWith('batch'));
    const singleOps = writeOps.filter(t => !t.name.startsWith('batch'));

    if (batchOps.length > 0) {
      dependent.push(batchOps);
    }
    if (singleOps.length > 0) {
      dependent.push(singleOps);
    }
  }

  return { independent, dependent };
}

/**
 * Execute tools in parallel with progress tracking
 */
export async function executeToolsInParallel(
  toolCalls: ToolCall[],
  project: Project | null,
  storeCallbacks?: StoreCallbacks,
  onProgress?: (progress: ExecutionProgress) => void
): Promise<ToolResult[]> {
  const { independent, dependent } = analyzeToolDependencies(toolCalls);
  const allResults: ToolResult[] = [];
  const errors: Array<{ tool: string; error: string }> = [];

  const total = toolCalls.length;
  let completed = 0;

  const updateProgress = (currentStep: string) => {
    onProgress?.({
      completed,
      total,
      currentStep,
      errors,
    });
  };

  const executor = new AgentToolExecutor(project, storeCallbacks);

  // Phase 1: Execute independent tools in parallel
  if (independent.length > 0) {
    updateProgress(`并行执行 ${independent.length} 个独立工具...`);

    const independentPromises = independent.map(async (tool) => {
      try {
        const result = await executor.execute(tool);
        completed++;
        updateProgress(`已完成: ${tool.name}`);
        return result;
      } catch (error: any) {
        completed++;
        errors.push({ tool: tool.name, error: error.message });
        updateProgress(`失败: ${tool.name}`);
        return {
          tool: tool.name,
          result: null,
          success: false,
          error: error.message,
        };
      }
    });

    const independentResults = await Promise.all(independentPromises);
    allResults.push(...independentResults);
  }

  // Phase 2: Execute dependent tools serially (group by group)
  for (let groupIndex = 0; groupIndex < dependent.length; groupIndex++) {
    const group = dependent[groupIndex];
    updateProgress(`串行执行第 ${groupIndex + 1} 组工具 (${group.length} 个)...`);

    for (const tool of group) {
      try {
        const result = await executor.execute(tool);
        completed++;
        allResults.push(result);
        updateProgress(`已完成: ${tool.name}`);
      } catch (error: any) {
        completed++;
        errors.push({ tool: tool.name, error: error.message });
        allResults.push({
          tool: tool.name,
          result: null,
          success: false,
          error: error.message,
        });
        updateProgress(`失败: ${tool.name}`);
      }
    }
  }

  updateProgress('所有工具执行完成');

  return allResults;
}

/**
 * Execute multiple tool calls with automatic parallel/serial optimization
 */
export class ParallelExecutor {
  private project: Project | null;
  private storeCallbacks?: StoreCallbacks;
  private onProgress?: (progress: ExecutionProgress) => void;

  constructor(
    project: Project | null,
    storeCallbacks?: StoreCallbacks,
    onProgress?: (progress: ExecutionProgress) => void
  ) {
    this.project = project;
    this.storeCallbacks = storeCallbacks;
    this.onProgress = onProgress;
  }

  async execute(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    if (toolCalls.length === 0) {
      return [];
    }

    if (toolCalls.length === 1) {
      // Single tool, execute directly
      const executor = new AgentToolExecutor(this.project, this.storeCallbacks);
      try {
        const result = await executor.execute(toolCalls[0]);
        return [result];
      } catch (error: any) {
        return [{
          tool: toolCalls[0].name,
          result: null,
          success: false,
          error: error.message,
        }];
      }
    }

    // Multiple tools, use parallel execution
    return executeToolsInParallel(toolCalls, this.project, this.storeCallbacks, this.onProgress);
  }
}
