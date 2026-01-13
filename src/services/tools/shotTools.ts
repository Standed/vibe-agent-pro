import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId, sanitizeForToolOutput } from './baseTool';
import { Shot, ShotSize, CameraMovement } from '@/types/project';

export class ShotTools {
    private params: BaseToolParams;

    constructor(params: BaseToolParams) {
        this.params = params;
    }

    get project() {
        return this.params.project;
    }

    get storeCallbacks() {
        return this.params.storeCallbacks;
    }

    getShotDetails(shotId: string): ToolResult {
        if (!this.project) return { tool: 'getShotDetails', result: null, error: 'Project not found' };
        const shot = this.project.shots.find(s => s.id === shotId);
        if (!shot) return { tool: 'getShotDetails', result: null, error: 'Shot not found' };
        const scene = this.project.scenes.find(s => s.id === shot.sceneId);
        return { tool: 'getShotDetails', result: sanitizeForToolOutput({ ...shot, sceneName: scene?.name }) };
    }

    addShots(sceneId: string, count: number, description: string, shots?: any[]): ToolResult {
        if (!this.project) return { tool: 'addShots', result: null, error: 'Project not found' };
        const scene = this.project.scenes.find(s => s.id === sceneId);
        if (!scene) return { tool: 'addShots', result: null, error: 'Scene not found' };
        if (!this.storeCallbacks?.addShot) return { tool: 'addShots', result: null, error: 'Store callback missing' };

        const newShots: any[] = [];
        const currentCount = this.project.shots.filter(s => s.sceneId === sceneId).length;
        for (let i = 0; i < count; i++) {
            const shotDef = shots ? shots[i] : null;
            const newShot: Shot = {
                id: generateId(),
                sceneId,
                order: currentCount + i + 1,
                shotSize: (shotDef?.shotSize as ShotSize) || 'Medium Shot',
                cameraMovement: (shotDef?.cameraMovement as CameraMovement) || 'Static',
                description: shotDef?.description || `${description} ${i + 1}`,
                duration: shotDef?.duration || 5,
                status: 'draft',
                narration: shotDef?.narration,
                dialogue: shotDef?.dialogue
            };
            this.storeCallbacks.addShot(newShot);
            newShots.push({ id: newShot.id, description: newShot.description });
        }
        return { tool: 'addShots', result: { sceneId, addedCount: count, shots: newShots }, success: true };
    }

    updateShot(shotId: string, updates: { description?: string; shotSize?: string; cameraMovement?: string; duration?: number; narration?: string; dialogue?: string }): ToolResult {
        if (!this.project) return { tool: 'updateShot', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.updateShot) return { tool: 'updateShot', result: null, error: 'Store callback missing' };

        const shot = this.project.shots.find(s => s.id === shotId);
        if (!shot) return { tool: 'updateShot', result: null, error: `Shot ${shotId} not found` };

        const finalUpdates: Partial<Shot> = { ...updates } as any;
        // Ensure types match
        if (updates.shotSize) finalUpdates.shotSize = updates.shotSize as ShotSize;
        if (updates.cameraMovement) finalUpdates.cameraMovement = updates.cameraMovement as CameraMovement;

        this.storeCallbacks.updateShot(shotId, finalUpdates);
        return {
            tool: 'updateShot',
            result: { shotId, updates },
            success: true,
            message: `Updated shot ${shotId}`
        };
    }

    deleteShots(shotIds?: string[], shotIndexes?: number[], deleteDuplicates?: boolean): ToolResult {
        if (!this.project) return { tool: 'deleteShots', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.deleteShot) return { tool: 'deleteShots', result: null, error: 'Store callback missing' };

        const idsToDelete = new Set<string>();

        // 1. By ID
        if (shotIds) {
            shotIds.forEach(id => idsToDelete.add(id));
        }

        // 2. By Index (Global order assumption for simplicity, or we could refine to scene-relative if needed)
        if (shotIndexes) {
            shotIndexes.forEach(index => {
                const shot = this.project!.shots.find(s => s.order === index);
                if (shot) idsToDelete.add(shot.id);
            });
        }

        // 3. Delete Duplicates
        if (deleteDuplicates) {
            const seenContent = new Map<string, string>();
            this.project.shots.forEach(shot => {
                const key = `${shot.sceneId}-${shot.description}`;
                if (seenContent.has(key)) {
                    idsToDelete.add(shot.id);
                } else {
                    seenContent.set(key, shot.id);
                }
            });
        }

        const deletedIds = Array.from(idsToDelete);
        deletedIds.forEach(id => this.storeCallbacks!.deleteShot!(id));

        return {
            tool: 'deleteShots',
            result: { deletedCount: deletedIds.length, deletedIds, message: `Deleted ${deletedIds.length} shots` },
            success: true
        };
    }
}
