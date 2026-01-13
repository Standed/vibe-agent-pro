import { Project } from '@/types/project';
import { ToolResult } from './agentToolDefinitions';
import { StoreCallbacks, BaseToolParams } from './tools/baseTool';
import { SceneTools } from './tools/sceneTools';
import { ShotTools } from './tools/shotTools';
import { CharacterTools } from './tools/characterTools';
import { LocationTools } from './tools/locationTools';
import { ProjectTools } from './tools/projectTools';
import { GenerationTools } from './tools/generationTools';

export type { StoreCallbacks };
export type { ToolResult };

export class AgentToolExecutor {
  private project: Project | null;
  private userId: string;
  private storeCallbacks: StoreCallbacks;

  // Modular tools
  private sceneTools: SceneTools;
  private shotTools: ShotTools;
  private characterTools: CharacterTools;
  private locationTools: LocationTools;
  private projectTools: ProjectTools;
  private generationTools: GenerationTools;

  constructor(project: Project | null, userId: string, storeCallbacks: StoreCallbacks) {
    this.project = project;
    this.userId = userId;
    this.storeCallbacks = storeCallbacks;

    const baseParams: BaseToolParams = {
      project: project!, // Note: Some tools might handle null project gracefully, others check it
      userId,
      storeCallbacks
    };

    this.sceneTools = new SceneTools(baseParams);
    this.shotTools = new ShotTools(baseParams);
    this.characterTools = new CharacterTools(baseParams);
    this.locationTools = new LocationTools(baseParams);
    this.projectTools = new ProjectTools(baseParams);
    this.generationTools = new GenerationTools(baseParams);
  }

  async execute(toolName: string, args: any): Promise<ToolResult> {
    console.log(`[AgentToolExecutor] Executing ${toolName}`, args);

    try {
      switch (toolName) {
        // --- Project Tools ---
        case 'getProjectContext':
          return this.projectTools.getProjectContext();

        // --- Scene Tools ---
        case 'getSceneDetails':
          return this.sceneTools.getSceneDetails(args.sceneId);
        case 'searchScenes':
          return this.sceneTools.searchScenes(args.query);
        case 'createScene':
          return this.sceneTools.createScene(args.name, args.description);
        case 'updateScene':
          return this.sceneTools.updateScene(args.sceneId, args.updates);
        case 'deleteScene': // Legacy single delete
          return this.sceneTools.deleteScenes([args.sceneId]);
        case 'deleteScenes':
          return this.sceneTools.deleteScenes(args.sceneIds, args.sceneIndexes, args.deleteDuplicates);

        // --- Shot Tools ---
        case 'getShotDetails':
          return this.shotTools.getShotDetails(args.shotId);
        case 'addShots':
          return this.shotTools.addShots(args.sceneId, args.count, args.description, args.shots);
        case 'updateShot':
          return this.shotTools.updateShot(args.shotId, args.updates);
        case 'deleteShot': // Legacy single delete
          return this.shotTools.deleteShots([args.shotId]);
        case 'deleteShots':
          return this.shotTools.deleteShots(args.shotIds, args.shotIndexes, args.deleteDuplicates);

        // --- Character Tools ---
        case 'addCharacter':
          return this.characterTools.addCharacter(args.name, args.description, args.appearance);
        case 'updateCharacter':
          return this.characterTools.updateCharacter(args.characterId, args.updates);
        case 'deleteCharacter': // Legacy single delete
          return this.characterTools.deleteCharacters([args.characterId]);
        case 'deleteCharacters':
          return this.characterTools.deleteCharacters(args.characterIds, args.characterNames);
        case 'generateCharacterThreeView':
          return this.characterTools.generateCharacterThreeView(args.characterId, args.prompt, args.artStyle);

        // --- Location Tools ---
        case 'addLocation':
          return this.locationTools.addLocation(args.name, args.description, args.appearance);
        case 'updateLocation':
          return this.locationTools.updateLocation(args.locationId, args.updates);
        case 'deleteLocation': // Legacy single delete
          return this.locationTools.deleteLocations([args.locationId]);
        case 'deleteLocations':
          return this.locationTools.deleteLocations(args.locationIds, args.locationNames);
        case 'generateLocationImages':
          return this.locationTools.generateLocationImages(args.locationIds, args.model);

        // --- Generation Tools ---
        case 'generateShotImage':
          return this.generationTools.generateShotImage(args.shotId, args.mode, args.gridSize, args.prompt, args.force);
        case 'batchGenerateSceneImages':
          return this.generationTools.batchGenerateSceneImages(args.sceneId, args.mode, args.gridSize, args.prompt, args.force);
        case 'batchGenerateProjectImages':
          return this.generationTools.batchGenerateProjectImages(args.mode, args.gridSize, args.prompt, args.force);
        case 'generateSceneVideo':
          return this.generationTools.generateSceneVideo(args.sceneId);
        case 'generateShotsVideo':
          return this.generationTools.generateShotsVideo(args.sceneId, args.shotIds, args.shotIndexes, args.globalShotIndexes);
        case 'batchGenerateProjectVideosSora':
          return this.generationTools.batchGenerateProjectVideosSora(args.force);

        default:
          return { tool: toolName, result: null, error: `Unknown tool: ${toolName}` };
      }
    } catch (error: any) {
      console.error(`[AgentToolExecutor] Error executing ${toolName}:`, error);
      return { tool: toolName, result: null, error: error.message || 'Unknown error' };
    }
  }
}
