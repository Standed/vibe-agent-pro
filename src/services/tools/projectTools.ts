import { ToolResult } from '../agentTools';
import { BaseToolParams, sanitizeForToolOutput } from './baseTool';

export class ProjectTools {
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

    getProjectContext(): ToolResult {
        if (!this.project) return { tool: 'getProjectContext', result: null, error: 'Project not found' };
        const scenes = this.project.scenes.map(scene => {
            const shots = this.project!.shots.filter(s => s.sceneId === scene.id);
            return {
                id: scene.id,
                name: scene.name,
                description: scene.description,
                order: scene.order,
                shotCount: shots.length,
                shots: shots.map(shot => ({
                    id: shot.id,
                    order: shot.order,
                    description: shot.description,
                    shotSize: shot.shotSize,
                    duration: shot.duration,
                    hasImage: !!shot.referenceImage,
                    hasVideo: !!shot.videoClip,
                    status: shot.status
                }))
            };
        });
        return {
            tool: 'getProjectContext',
            result: sanitizeForToolOutput({
                projectName: this.project.metadata.title,
                projectDescription: this.project.metadata.description,
                sceneCount: this.project.scenes.length,
                shotCount: this.project.shots.length,
                aspectRatio: this.project.settings.aspectRatio,
                scenes: scenes,
                locations: this.project.locations.map(loc => ({
                    id: loc.id,
                    name: loc.name,
                    description: loc.description
                })),
                characters: this.project.characters.map(char => ({
                    id: char.id,
                    name: char.name,
                    description: char.description
                }))
            })
        };
    }
}
