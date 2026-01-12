

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

export enum GenerationMode {
  GRID_2x2 = '2x2 分镜 (4视图)',
  GRID_3x3 = '3x3 分镜 (9视图)'
}

export type NodeType = 'prompt' | 'asset_group' | 'render' | 'slice';

export interface GeneratedImage {
  id: string;
  url: string; // For text nodes, this might be empty or a placeholder
  fullGridUrl?: string;
  prompt: string;
  aspectRatio: string;
  timestamp: number;
  
  // Node Graph Properties
  nodeType: NodeType; 
  parentId?: string; // ID of the source image/node
  position?: { x: number; y: number }; // For infinite canvas
  
  // Specific data containers
  assetIds?: string[]; // For asset_group node
  textData?: string; // For prompt node
  cameraDescription?: string; // Generated camera movement for video
  slices?: string[]; // Array of base64/urls for the individual panels (for render nodes)
}

export interface Asset {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
  analysis?: string;
}

export type InspectorTab = 'details' | 'analysis';