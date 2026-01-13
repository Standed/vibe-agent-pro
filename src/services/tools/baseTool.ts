import { Project, Scene, Shot, Character, Location, GenerationHistoryItem, GridHistoryItem } from '@/types/project';
import { ToolResult } from '../agentToolDefinitions';

export interface StoreCallbacks {
    addGenerationHistory: (shotId: string, item: GenerationHistoryItem) => void;
    addGridHistory: (sceneId: string, item: GridHistoryItem) => void;
    addScene?: (scene: Scene) => void;
    updateScene?: (id: string, updates: Partial<Scene>) => void;
    deleteScene?: (id: string) => void;
    addShot?: (shot: Shot) => void;
    updateShot: (shotId: string, updates: Partial<Shot>) => void;
    deleteShot?: (id: string) => void;
    addCharacter?: (character: Character) => void;
    updateCharacter?: (characterId: string, updates: Partial<any>) => void;
    deleteCharacter?: (id: string) => void;
    addLocation?: (location: Location) => void;
    deleteLocation?: (id: string) => void;
    updateLocation?: (id: string, updates: Partial<Location>) => void;
    renumberScenesAndShots?: () => void;
    setSavingStatus?: (isSaving: boolean) => void;
    setGenerationProgress?: (progress: Partial<{ total: number; current: number; status: 'idle' | 'running' | 'success' | 'error'; message?: string }>) => void;
}

export interface BaseToolParams {
    project: Project;
    userId: string;
    storeCallbacks: StoreCallbacks;
}

export interface IAgentTool {
    execute(params: any): Promise<ToolResult> | ToolResult;
}

export function sanitizeForToolOutput(data: any): any {
    return JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'embedding' || key === 'vector') return undefined;
        if (value === null) return undefined;
        return value;
    }));
}

export function generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
