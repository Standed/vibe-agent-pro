// 数据模型定义

export type ShotSize =
  | 'Extreme Wide Shot'
  | 'Wide Shot'
  | 'Medium Shot'
  | 'Close-Up'
  | 'Extreme Close-Up';

export type CameraMovement =
  | 'Static'
  | 'Pan Left'
  | 'Pan Right'
  | 'Tilt Up'
  | 'Tilt Down'
  | 'Dolly In'
  | 'Dolly Out'
  | 'Zoom In'
  | 'Zoom Out'
  | 'Handheld';

export type GenerationMode = 'grid' | 'single';
export type ShotStatus = 'pending' | 'processing' | 'done' | 'error';
export type LocationType = 'interior' | 'exterior';
export type AudioType = 'voice' | 'music' | 'sfx';
export type TrackType = 'video' | 'audio';
export type TimelineMode = 'collapsed' | 'default' | 'expanded';
export type ControlMode = 'agent' | 'pro';

// Image generation types
export enum AspectRatio {
  SQUARE = '1:1',
  STANDARD = '4:3',
  PORTRAIT = '3:4',
  WIDE = '16:9',
  MOBILE = '9:16',
  CINEMA = '21:9'
}

export enum ImageSize {
  K4 = '4K'
}

export enum GridMode {
  GRID_2x2 = '2x2',
  GRID_3x3 = '3x3'
}

export interface ProjectMetadata {
  title: string;
  description: string;
  artStyle: string;
  created: Date;
  modified: Date;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  appearance: string;
  referenceImages: string[];
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  description: string;
  referenceImages: string[];
}

export interface AudioAsset {
  id: string;
  name: string;
  type: AudioType;
  url: string;
  duration: number;
}

export interface GenerationConfig {
  mode: GenerationMode;
  model: string;
  prompt: string;
  videoPrompt?: string;
}

export interface Shot {
  id: string;
  sceneId: string;
  order: number;

  // 分镜信息（来自 AI 生成）
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  duration: number;
  description: string;
  narration?: string;
  dialogue?: string;

  // 生成的素材
  referenceImage?: string;
  gridImages?: string[];
  fullGridUrl?: string;
  videoClip?: string;
  audioTrack?: string;

  // 生成配置
  generationConfig?: GenerationConfig;

  // 状态
  status: ShotStatus;
  error?: string;
}

export interface Scene {
  id: string;
  name: string;
  location: string;
  description: string;
  shotIds: string[];
  position: { x: number; y: number };
}

export interface TimelineClip {
  id: string;
  shotId?: string;
  audioAssetId?: string;
  startTime: number;
  duration: number;
  trimIn?: number;
  trimOut?: number;
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  clips: TimelineClip[];
}

export interface ProjectSettings {
  videoResolution: { width: number; height: number };
  fps: number;
  audioSampleRate: number;
  defaultShotDuration: number;
}

export interface Project {
  id: string;
  metadata: ProjectMetadata;

  // 资源
  characters: Character[];
  locations: Location[];
  audioAssets: AudioAsset[];

  // 剧本和场景
  script: string;
  scenes: Scene[];
  shots: Shot[];

  // 时间轴
  timeline: TimelineTrack[];

  // 设置
  settings: ProjectSettings;
}

// 用于 IndexedDB 存储的资产类型
export interface Asset {
  id: string;
  projectId: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  blob?: Blob;
  metadata: Record<string, unknown>;
  created: Date;
}
