import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId } from './baseTool';
import { Location, AspectRatio } from '@/types/project';
import { generateSingleImage } from '../geminiService';
import { storageService } from '@/lib/storageService';

export class LocationTools {
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

    get userId() {
        return this.params.userId;
    }

    addLocation(name: string, description: string, appearance: string): ToolResult {
        if (!this.storeCallbacks?.addLocation) return { tool: 'addLocation', result: null, error: 'Store callback missing' };

        // Note: Location type does not have 'appearance' field, so we append it to description
        const fullDescription = appearance ? `${description}\nAppearance: ${appearance}` : description;

        const newLocation: Location = {
            id: generateId(),
            name,
            description: fullDescription,
            type: 'exterior', // Default to exterior as type is required
            referenceImages: []
        };

        this.storeCallbacks.addLocation(newLocation);
        return { tool: 'addLocation', result: { locationId: newLocation.id, name: newLocation.name }, success: true, message: `Added location ${name}` };
    }

    updateLocation(locationId: string, updates: { name?: string; description?: string; appearance?: string }): ToolResult {
        if (!this.project) return { tool: 'updateLocation', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.updateLocation) return { tool: 'updateLocation', result: null, error: 'Store callback missing' };

        const location = this.project.locations.find(l => l.id === locationId);
        if (!location) return { tool: 'updateLocation', result: null, error: `Location ${locationId} not found` };

        const finalUpdates: Partial<Location> = {};
        if (updates.name) finalUpdates.name = updates.name;

        if (updates.description || updates.appearance) {
            const baseDesc = updates.description || location.description;
            const app = updates.appearance ? `\nAppearance: ${updates.appearance}` : '';
            // If updating description, we overwrite. If only updating appearance, we append/replace if we could parse it, 
            // but for simplicity let's just append if appearance is provided.
            // Actually, if description is provided, use it. If appearance is provided, append it.
            finalUpdates.description = `${baseDesc}${app}`;
        }

        this.storeCallbacks.updateLocation(locationId, finalUpdates);
        return { tool: 'updateLocation', result: { locationId, updates }, success: true, message: `Updated location ${location.name}` };
    }

    deleteLocations(locationIds?: string[], locationNames?: string[]): ToolResult {
        if (!this.project) return { tool: 'deleteLocations', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.deleteLocation) return { tool: 'deleteLocations', result: null, error: 'Store callback missing' };

        const idsToDelete = new Set<string>();

        if (locationIds) {
            locationIds.forEach(id => idsToDelete.add(id));
        }

        if (locationNames) {
            locationNames.forEach(name => {
                const loc = this.project!.locations.find(l => l.name === name);
                if (loc) idsToDelete.add(loc.id);
            });
        }

        const deletedIds = Array.from(idsToDelete);
        deletedIds.forEach(id => this.storeCallbacks!.deleteLocation!(id));

        return {
            tool: 'deleteLocations',
            result: { deletedCount: deletedIds.length, deletedIds, message: `Deleted ${deletedIds.length} locations` },
            success: true
        };
    }

    async generateLocationImages(locationIds: string[], model: string = 'flux'): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateLocationImages', result: null, error: 'Project not found' };

        const results: any[] = [];
        const errors: string[] = [];

        // If no IDs provided, generate for all locations without reference images
        const targetIds = locationIds && locationIds.length > 0
            ? locationIds
            : this.project.locations.filter(l => !l.referenceImages || l.referenceImages.length === 0).map(l => l.id);

        for (const id of targetIds) {
            const location = this.project.locations.find(l => l.id === id);
            if (!location) {
                errors.push(`Location ${id} not found`);
                continue;
            }

            try {
                // Use generateSingleImage as fallback since generateLocationImage is missing
                const prompt = `${location.name}, ${location.description}. Cinematic concept art, high quality, detailed lighting. Art Style: ${this.project.metadata.artStyle || 'Cinematic'}`;
                const base64Url = await generateSingleImage(
                    prompt,
                    AspectRatio.WIDE // Default to wide for locations
                );

                // Upload to R2
                let resultUrl = base64Url;
                const folder = `projects/locations/${this.userId || 'anonymous'}`;
                try {
                    if (base64Url.startsWith('data:')) {
                        const base64Data = base64Url.split(',')[1];
                        resultUrl = await storageService.uploadBase64ToR2(base64Data, folder, undefined, this.userId);
                    }
                } catch (uploadError) {
                    console.error('Failed to upload location image to R2:', uploadError);
                }

                // Update location
                if (this.storeCallbacks?.updateLocation) {
                    const newRefs = location.referenceImages ? [...location.referenceImages, resultUrl] : [resultUrl];
                    this.storeCallbacks.updateLocation(id, { referenceImages: newRefs });
                }

                results.push({ id, imageUrl: resultUrl });

            } catch (e: any) {
                errors.push(`Failed to generate for ${location.name}: ${e.message}`);
            }
        }

        return {
            tool: 'generateLocationImages',
            result: { generated: results, errors },
            success: results.length > 0,
            message: `Generated images for ${results.length} locations. ${errors.length > 0 ? `Errors: ${errors.join(', ')}` : ''}`
        };
    }
}
