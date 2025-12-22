import { ShotSize, CameraMovement } from '@/types/project';

export interface ScriptAnalysis {
    characters: string[];
    locations: string[];
    summary: string;
    artStyle: string;
}

export interface CharacterDesign {
    name: string;
    style: string;
    genderAgeOccupation: string;
    bodyShape: string;
    faceFeatures: string;
    hair: string;
    outfit: string;
    expressionMood: string;
    pose: string;
    summary: string;
}

export interface StoryboardShot {
    id: string;
    shotSize: ShotSize;
    cameraMovement: CameraMovement;
    description: string;
    narration?: string;
    dialogue?: string;
    duration?: number;
    mainCharacters?: string[];
    location?: string;
    time?: string;
}

export interface SceneGroup {
    name: string;
    location: string;
    shotIds: string[];
}
