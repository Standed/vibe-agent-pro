import Dexie, { type EntityTable } from 'dexie';
import type { Project, Asset } from '@/types/project';

class VibeAgentDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  assets!: EntityTable<Asset, 'id'>;

  constructor() {
    super('VibeAgentDB');

    this.version(1).stores({
      projects: 'id, metadata.modified, metadata.title',
      assets: 'id, projectId, type, created',
    });
  }
}

export const db = new VibeAgentDatabase();

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
