import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId, sanitizeForToolOutput } from './baseTool';
import { Scene } from '@/types/project';

export class SceneTools {
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

    async getSceneDetails(sceneId: string): Promise<ToolResult> {
        if (!this.project) return { tool: 'getSceneDetails', result: null, error: 'Project not found' };
        const scene = this.project.scenes.find(s => s.id === sceneId);
        if (!scene) return { tool: 'getSceneDetails', result: null, error: `Scene ${sceneId} not found` };
        const shots = this.project.shots.filter(s => s.sceneId === sceneId);
        return { tool: 'getSceneDetails', result: sanitizeForToolOutput({ ...scene, shotCount: shots.length, shots }) };
    }

    searchScenes(query: string): ToolResult {
        if (!this.project) return { tool: 'searchScenes', result: null, error: 'Project not found' };
        const lowerQuery = query.toLowerCase();
        const matchedScenes = this.project.scenes.filter(scene =>
            scene.name.toLowerCase().includes(lowerQuery) ||
            scene.description.toLowerCase().includes(lowerQuery)
        );
        return {
            tool: 'searchScenes',
            result: {
                query,
                matchCount: matchedScenes.length,
                scenes: matchedScenes.map(s => ({ id: s.id, name: s.name, description: s.description }))
            }
        };
    }

    createScene(name: string, description: string): ToolResult {
        if (!this.storeCallbacks?.addScene) return { tool: 'createScene', result: null, error: 'Store callback missing' };

        const newScene: Scene = {
            id: generateId(),
            name,
            description,
            location: 'Unknown',
            order: (this.project?.scenes.length || 0) + 1,
            status: 'draft',
            shotIds: [],
            position: { x: 0, y: 0 }
        };

        this.storeCallbacks.addScene(newScene);
        return { tool: 'createScene', result: { sceneId: newScene.id, name: newScene.name, order: newScene.order }, success: true };
    }

    updateScene(sceneId: string, updates: { name?: string; description?: string; location?: string }): ToolResult {
        if (!this.project) return { tool: 'updateScene', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.updateScene) return { tool: 'updateScene', result: null, error: 'Store callback missing' };

        const scene = this.project.scenes.find(s => s.id === sceneId);
        if (!scene) return { tool: 'updateScene', result: null, error: `Scene ${sceneId} not found` };

        this.storeCallbacks.updateScene(sceneId, updates);
        return {
            tool: 'updateScene',
            result: { sceneId, updates },
            success: true,
            message: `Updated scene ${scene.name}`
        };
    }

    deleteScenes(sceneIds?: string[], sceneIndexes?: number[], deleteDuplicates?: boolean): ToolResult {
        if (!this.project) return { tool: 'deleteScenes', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.deleteScene) return { tool: 'deleteScenes', result: null, error: 'Store callback missing' };

        const idsToDelete = new Set<string>();

        // 1. By ID
        if (sceneIds) {
            sceneIds.forEach(id => idsToDelete.add(id));
        }

        // 2. By Index
        if (sceneIndexes) {
            sceneIndexes.forEach(index => {
                const scene = this.project!.scenes.find(s => s.order === index);
                if (scene) idsToDelete.add(scene.id);
            });
        }

        // 3. Delete Duplicates
        if (deleteDuplicates) {
            const seenNames = new Map<string, string>(); // name -> id
            this.project.scenes.forEach(scene => {
                if (seenNames.has(scene.name)) {
                    idsToDelete.add(scene.id);
                } else {
                    seenNames.set(scene.name, scene.id);
                }
            });
        }

        const deletedIds = Array.from(idsToDelete);
        deletedIds.forEach(id => this.storeCallbacks!.deleteScene!(id));

        return {
            tool: 'deleteScenes',
            result: { deletedCount: deletedIds.length, deletedIds, message: `Deleted ${deletedIds.length} scenes` },
            success: true
        };
    }
}
