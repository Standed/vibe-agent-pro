import { ChatPanelMessage } from '@/types/project';

export interface GenerationResultDisplayPreset {
  hideGridBadge: boolean;
  hideSliceSelector: boolean;
}

export const DEFAULT_GENERATION_RESULT_PRESET: GenerationResultDisplayPreset = {
  hideGridBadge: false,
  hideSliceSelector: false,
};

export const PRO_STYLE_GRID_PRESET: GenerationResultDisplayPreset = {
  hideGridBadge: true,
  hideSliceSelector: true,
};

export function resolveGenerationResultPreset(
  message: Pick<ChatPanelMessage, 'model' | 'gridData' | 'shotId' | 'metadata'>
): GenerationResultDisplayPreset {
  const isGeminiGrid = message.model === 'gemini-grid';
  const hasGridData = !!message.gridData;
  if (!isGeminiGrid || !hasGridData) return DEFAULT_GENERATION_RESULT_PRESET;

  if (message.shotId) {
    return PRO_STYLE_GRID_PRESET;
  }

  const source = typeof message.metadata?.source === 'string' ? message.metadata.source : '';
  const fromAgentSync = source === 'agent_sync';

  if (fromAgentSync) {
    return PRO_STYLE_GRID_PRESET;
  }

  return DEFAULT_GENERATION_RESULT_PRESET;
}
