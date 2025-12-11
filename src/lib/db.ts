import Dexie, { type EntityTable } from 'dexie';
import type { Project, Asset } from '@/types/project';

class VideoAgentDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  assets!: EntityTable<Asset, 'id'>;

  constructor() {
    super('VideoAgentDB');

    this.version(1).stores({
      projects: 'id, metadata.modified, metadata.title',
      assets: 'id, projectId, type, created',
    });
  }
}

// 懒加载数据库实例，避免浏览器阻止storage时出错
let dbInstance: VideoAgentDatabase | null = null;

function getDB(): VideoAgentDatabase {
  if (!dbInstance) {
    try {
      dbInstance = new VideoAgentDatabase();
    } catch (err) {
      console.warn('[DB] 无法创建 IndexedDB 实例，存储可能被阻止:', err);
      throw new Error('IndexedDB 不可用');
    }
  }
  return dbInstance;
}

export const db = new Proxy({} as VideoAgentDatabase, {
  get(target, prop) {
    const instance = getDB();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

// 辅助函数
export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return await db.projects.get(id);
}

export async function getAllProjects(): Promise<Project[]> {
  return await db.projects.orderBy('metadata.modified').reverse().toArray();
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.assets], async () => {
    await db.projects.delete(id);
    await db.assets.where('projectId').equals(id).delete();
  });
}

export async function saveAsset(asset: Asset): Promise<void> {
  await db.assets.put(asset);
}

export async function getAssetsByProject(projectId: string): Promise<Asset[]> {
  return await db.assets.where('projectId').equals(projectId).toArray();
}
