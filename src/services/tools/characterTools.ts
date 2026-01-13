import { ToolResult } from '../agentTools';
import { BaseToolParams, generateId } from './baseTool';
import { Character } from '@/types/project';
import { generateCharacterThreeView, urlsToReferenceImages } from '../geminiService';
import { storageService } from '@/lib/storageService';

export class CharacterTools {
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

    addCharacter(name: string, description: string, appearance: string): ToolResult {
        if (!this.storeCallbacks?.addCharacter) return { tool: 'addCharacter', result: null, error: 'Store callback missing' };

        const newCharacter: Character = {
            id: generateId(),
            name,
            description,
            appearance,
            referenceImages: []
        };

        this.storeCallbacks.addCharacter(newCharacter);
        return { tool: 'addCharacter', result: { characterId: newCharacter.id, name: newCharacter.name }, success: true, message: `Added character ${name}` };
    }

    updateCharacter(characterId: string, updates: { name?: string; description?: string; appearance?: string }): ToolResult {
        if (!this.project) return { tool: 'updateCharacter', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.updateCharacter) return { tool: 'updateCharacter', result: null, error: 'Store callback missing' };

        const character = this.project.characters.find(c => c.id === characterId);
        if (!character) return { tool: 'updateCharacter', result: null, error: `Character ${characterId} not found` };

        this.storeCallbacks.updateCharacter(characterId, updates);
        return { tool: 'updateCharacter', result: { characterId, updates }, success: true, message: `Updated character ${character.name}` };
    }

    deleteCharacters(characterIds?: string[], characterNames?: string[]): ToolResult {
        if (!this.project) return { tool: 'deleteCharacters', result: null, error: 'Project not found' };
        if (!this.storeCallbacks?.deleteCharacter) return { tool: 'deleteCharacters', result: null, error: 'Store callback missing' };

        const idsToDelete = new Set<string>();

        if (characterIds) {
            characterIds.forEach(id => idsToDelete.add(id));
        }

        if (characterNames) {
            characterNames.forEach(name => {
                const char = this.project!.characters.find(c => c.name === name);
                if (char) idsToDelete.add(char.id);
            });
        }

        const deletedIds = Array.from(idsToDelete);
        deletedIds.forEach(id => this.storeCallbacks!.deleteCharacter!(id));

        return {
            tool: 'deleteCharacters',
            result: { deletedCount: deletedIds.length, deletedIds, message: `Deleted ${deletedIds.length} characters` },
            success: true
        };
    }

    async generateCharacterThreeView(characterId: string, prompt: string, artStyle: string): Promise<ToolResult> {
        if (!this.project) return { tool: 'generateCharacterThreeView', result: null, error: 'Project not found' };
        const character = this.project.characters.find(c => c.id === characterId);
        if (!character) return { tool: 'generateCharacterThreeView', result: null, error: 'Character not found' };

        try {
            const base64Url = await generateCharacterThreeView(
                prompt || `${character.name}, ${character.description}, ${character.appearance}`,
                artStyle,
                await urlsToReferenceImages(character.referenceImages || [])
            );

            // Upload to R2
            let resultUrl = base64Url;
            const folder = `projects/characters/${this.userId || 'anonymous'}`;
            try {
                if (base64Url.startsWith('data:')) {
                    const base64Data = base64Url.split(',')[1];
                    resultUrl = await storageService.uploadBase64ToR2(base64Data, folder, undefined, this.userId);
                }
            } catch (uploadError) {
                console.error('Failed to upload character image to R2, falling back to base64:', uploadError);
            }

            // Update character
            if (this.storeCallbacks?.updateCharacter) {
                const newRefs = character.referenceImages ? [...character.referenceImages, resultUrl] : [resultUrl];
                this.storeCallbacks.updateCharacter(characterId, { referenceImages: newRefs });
            }

            return { tool: 'generateCharacterThreeView', result: { imageUrl: resultUrl }, success: true };
        } catch (e: any) {
            return { tool: 'generateCharacterThreeView', result: null, success: false, error: e.message };
        }
    }
}
