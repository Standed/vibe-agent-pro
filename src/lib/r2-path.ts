export type R2AssetScope =
  | 'project'
  | 'scenes'
  | 'shots'
  | 'characters'
  | 'locations'
  | 'chat'
  | 'assets'
  | 'unknown';

export type R2AssetType =
  | 'image'
  | 'grid'
  | 'slice'
  | 'video'
  | 'reference'
  | 'cover'
  | 'avatar'
  | 'audio'
  | 'other';

export interface R2PathContext {
  projectId?: string;
  scope?: R2AssetScope;
  entityId?: string;
  assetType?: R2AssetType;
  model?: string;
  variant?: string;
  date?: Date;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const formatDatePath = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}/${month}/${day}`;
};

export const buildR2Folder = (
  context?: R2PathContext,
  fallbackFolder: string = 'legacy'
): string => {
  if (!context?.projectId || !context.scope) return fallbackFolder;

  const datePath = formatDatePath(context.date ?? new Date());
  const entity = context.entityId || 'unknown';
  const assetType = context.assetType || 'asset';
  const model = context.model || 'unknown';
  const variant = context.variant ? `/${context.variant}` : '';

  return `projects/${context.projectId}/${context.scope}/${entity}/${assetType}/${model}${variant}/${datePath}`;
};

export const buildR2Key = (options: {
  userId: string;
  folder: string;
  filename?: string;
  ext?: string;
  prefix?: string;
}): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = (options.ext || 'png').replace('.', '');
  const prefix = options.prefix || 'asset';
  const filename = options.filename || `${prefix}_${timestamp}_${randomStr}.${ext}`;
  const normalizedFolder = options.folder.replace(/^\/+|\/+$/g, '');
  return `${options.userId}/${normalizedFolder}/${filename}`;
};

export const inferExtFromMime = (mimeType?: string): string => {
  if (!mimeType) return 'png';
  const lower = mimeType.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('bmp')) return 'bmp';
  if (lower.includes('svg')) return 'svg';
  return 'png';
};
