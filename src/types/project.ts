// 数据模型定义

export type ShotSize =
  | 'Extreme Wide Shot'
  | 'Wide Shot'
  | 'Full Shot'
  | 'Medium Wide Shot'
  | 'Medium Shot'
  | 'Medium Close-Up'
  | 'Close-Up'
  | 'Extreme Close-Up'
  | 'Low Angle Shot'
  | 'High Angle Shot'
  | 'Over the Shoulder Shot'
  | 'Point of View Shot'
  | 'Bird\'s Eye View'
  | 'Dutch Angle'
  | 'Establishing Shot';

export type CameraMovement =
  | 'Pan'
  | 'Tilt'
  | 'Dolly'
  | 'Zoom'
  | 'Truck'
  | 'Pedestal'
  | 'Static'
  | 'Pan Left'
  | 'Pan Right'
  | 'Tilt Up'
  | 'Tilt Down'
  | 'Dolly In'
  | 'Dolly Out'
  | 'Zoom In'
  | 'Zoom Out'
  | 'Truck Left'
  | 'Truck Right'
  | 'Pedestal Up'
  | 'Pedestal Down'
  | 'Handheld'
  | 'Arc'
  | 'Crane';

export const SHOT_SIZE_OPTIONS: ShotSize[] = [
  'Extreme Wide Shot',
  'Wide Shot',
  'Full Shot',
  'Medium Wide Shot',
  'Medium Shot',
  'Medium Close-Up',
  'Close-Up',
  'Extreme Close-Up',
  'Low Angle Shot',
  'High Angle Shot',
  'Over the Shoulder Shot',
  'Point of View Shot',
  'Bird\'s Eye View',
  'Dutch Angle',
  'Establishing Shot'
];

export const CAMERA_MOVEMENT_OPTIONS: CameraMovement[] = [
  'Pan',
  'Tilt',
  'Dolly',
  'Zoom',
  'Truck',
  'Pedestal',
  'Static',
  'Pan Left',
  'Pan Right',
  'Tilt Up',
  'Tilt Down',
  'Dolly In',
  'Dolly Out',
  'Zoom In',
  'Zoom Out',
  'Truck Left',
  'Truck Right',
  'Pedestal Up',
  'Pedestal Down',
  'Handheld',
  'Arc',
  'Crane'
];

export type GenerationMode = 'grid' | 'single';
export type ShotStatus = 'draft' | 'pending' | 'processing' | 'done' | 'error';
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

export type BatchMode = 'grid' | 'seedream' | 'jimeng';
export type AIModel = 'seedream' | 'jimeng';

// Grid Generation Result (for modal preview)
export interface GridGenerationResult {
  fullImage: string;
  slices: string[];
  sceneId: string;
  gridRows: number;
  gridCols: number;
  prompt: string;
  aspectRatio: AspectRatio;
  gridSize: '2x2' | '3x3';
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
  // Sora 专属参考视频（用户可选上传，跳过图生视频步骤）
  soraReferenceVideoUrl?: string;
  // Sora 专属身份信息 (可选，保持向后兼容)
  soraIdentity?: {
    username: string;          // e.g., "@fmraejvq"
    referenceVideoUrl: string; // 10s 参考视频 URL
    status: 'pending' | 'generating' | 'registering' | 'registered' | 'failed';
    taskId?: string;           // 生成参考视频的任务 ID
  };
  // 角色归属
  userId?: string;   // 拥有者 ID (用于全局角色)
  projectId?: string | null; // 所属项目 ID (可空，空表示全局角色)
}

// 剧集 (Series) 定义
export interface Series {
  id: string;
  title: string;
  description?: string;
  userId: string;
  coverImage?: string;
  created: Date;
  updated: Date;
  projectIds?: string[]; // 包含的项目 ID 列表
}

// 制作策略 (Production Strategy)
export interface ProductionStrategy {
  // 核心管线选择
  workflow: 'flux_sora' | 'jimeng_sora' | 'sora_native';

  // 角色一致性模式
  consistencyMode: 'reference_image' | 'sora_character_id' | 'off';

  // 批量生成配置
  batchSize?: number;
  autoRefinePrompt?: boolean;
}

// Agent 状态
export interface AgentState {
  isAnalyzing: boolean;
  isGenerating: boolean;
  progress: number;
  currentTask?: string;
  strategy: ProductionStrategy;
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

export interface GridData {
  fullImage: string; // 完整 Grid 图片 URL
  slices: string[]; // 所有切片 URL
  sceneId?: string; // 关联的场景 ID（场景级 Grid）
  shotId?: string; // 关联的镜头 ID（单镜头 Grid）
  gridRows: number; // Grid 行数
  gridCols: number; // Grid 列数
  gridSize: '2x2' | '3x3'; // Grid 大小
  prompt: string; // 生成提示词
  aspectRatio: string; // 画面比例
  assignments?: Record<string, number>; // 切片分配记录：shotId -> sliceIndex
}

// 对话消息类型（用于新的独立 chat_messages 表）
export type ChatScope = 'project' | 'scene' | 'shot';
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  userId: string;

  // 关联关系（三级层级）
  projectId: string;
  sceneId?: string;   // 场景级对话
  shotId?: string;    // 分镜级对话

  // 对话范围标识
  scope: ChatScope;   // 'project' | 'scene' | 'shot'

  // 消息内容
  role: ChatRole;
  content: string;

  // AI 推理过程（仅 assistant 消息）
  thought?: string;

  // 扩展数据（存储到 metadata JSONB 字段）
  metadata?: {
    gridData?: GridData;
    images?: string[];
    model?: string;
    toolResults?: Array<{
      tool: string;
      result: any;
      error?: string;
    }>;
    [key: string]: any;
  };

  // 时间戳
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 旧版 ChatMessage 类型（保留用于兼容性，待迁移）
export interface LegacyChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  thought?: string; // AI reasoning process
  toolResults?: Array<{
    tool: string;
    result: any;
    error?: string;
  }>; // Tool execution results
  shotId?: string; // 标识消息属于哪个镜头
  sceneId?: string; // 标识消息属于哪个场景
  gridData?: GridData; // Grid 生成数据（用于持久化和重新分配）
  images?: string[]; // 消息附带的图片
  model?: string; // 使用的模型
}

export interface GenerationHistoryItem {
  id: string;
  type: 'image' | 'video';
  timestamp: Date;
  result: string; // Image URL or Video URL
  prompt: string;
  parameters: {
    model?: string;
    aspectRatio?: AspectRatio;
    gridSize?: '2x2' | '3x3';
    referenceImages?: string[];
    [key: string]: unknown;
  };
  status: 'success' | 'failed' | 'replaced';
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
  mainCharacters?: string[]; // 该镜头中出现的主要角色
  mainScenes?: string[]; // 该镜头涉及的场景地点

  // 生成的素材
  referenceImage?: string;
  gridImages?: string[];
  fullGridUrl?: string;
  videoClip?: string;
  audioTrack?: string;

  // 生成配置
  generationConfig?: GenerationConfig;

  // Sora 视频生成专用提示词 (由 SoraPromptService 动态生成)
  videoPrompt?: string;

  // 生成历史记录
  generationHistory?: GenerationHistoryItem[];

  // 状态
  status: ShotStatus;
  error?: string;
  created?: Date;
  modified?: Date;
  globalOrder?: number; // 项目内的全局序号（供排序/跟踪），显示使用局部 order
}

export interface GridHistoryItem {
  id: string;
  timestamp: Date;
  fullGridUrl: string;
  slices: string[];
  gridSize: '2x2' | '3x3';
  prompt: string;
  aspectRatio: AspectRatio;
  assignments?: Record<string, string>; // shotId -> sliceUrl mapping
}

export interface Scene {
  id: string;
  name: string;
  location: string;
  description: string;
  shotIds: string[];
  position: { x: number; y: number };
  order: number;
  status: 'draft' | 'done';
  created?: Date;
  modified?: Date;
  gridHistory?: GridHistoryItem[]; // Grid generation history
  savedGridSlices?: string[]; // Favorited/unused Grid slices

  // Sora 长视频生成状态 (可选)
  soraGeneration?: {
    taskId: string;
    status: 'pending' | 'processing' | 'success' | 'failed';
    videoUrl?: string; // 最终合并长视频或切片视频
    progress?: number;
    tasks?: string[];  // 如果包含多个切片任务
  };
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
  aspectRatio: AspectRatio; // 全局画面比例
  fps: number;
  audioSampleRate: number;
  defaultShotDuration: number;
}

export interface Project {
  id: string;
  seriesId?: string; // 所属剧集 ID
  episodeOrder?: number; // 集数顺序
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

  // ⚠️ 已废弃：旧版 AI Agent 对话历史（项目级别）
  // 请使用独立的 chat_messages 表
  // 保留此字段仅用于向后兼容，新数据不应存储到这里
  chatHistory?: LegacyChatMessage[];
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

// Sora 异步任务类型 (用于数据库 sora_tasks 表)
export interface SoraTask {
  id: string; // Sora Task ID (例如 video_...)
  userId: string;
  projectId: string;
  sceneId?: string;
  shotId?: string;
  shotIds?: string[];
  shotRanges?: Array<{ shotId: string; start: number; end: number }>;
  characterId?: string; // 关联的角色 ID
  type?: 'shot_generation' | 'character_reference'; // 任务类型
  status: 'queued' | 'processing' | 'generating' | 'completed' | 'failed';
  progress: number;
  model: string;
  prompt: string;
  targetDuration: number;
  targetSize: string;
  kaponaiUrl?: string;
  r2Url?: string;
  pointCost: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
