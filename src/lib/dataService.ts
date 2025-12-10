/**
 * 统一数据服务层
 *
 * 根据用户登录状态自动切换存储后端：
 * - 已登录：使用 Supabase (云端同步)
 * - 未登录：使用 IndexedDB (本地存储)
 */

import type { Project, Scene, Shot, Character, AudioAsset } from '@/types/project';
import { supabase } from './supabase/client';
import { getCurrentUser } from './supabase/auth';
import * as indexedDB from './db';

// ========================
// 存储后端接口
// ========================

interface DataBackend {
  // 项目操作
  saveProject(project: Project): Promise<void>;
  loadProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;

  // 场景操作
  saveScene(projectId: string, scene: Scene): Promise<void>;
  deleteScene(sceneId: string): Promise<void>;

  // 镜头操作
  saveShot(sceneId: string, shot: Shot): Promise<void>;
  deleteShot(shotId: string): Promise<void>;

  // 角色操作
  saveCharacter(projectId: string, character: Character): Promise<void>;
  deleteCharacter(characterId: string): Promise<void>;

  // 音频资源操作
  saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void>;
  deleteAudioAsset(audioId: string): Promise<void>;
}

// ========================
// IndexedDB 后端实现
// ========================

class IndexedDBBackend implements DataBackend {
  async saveProject(project: Project): Promise<void> {
    await indexedDB.saveProject(project);
  }

  async loadProject(id: string): Promise<Project | undefined> {
    return await indexedDB.loadProject(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return await indexedDB.getAllProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await indexedDB.deleteProject(id);
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    const project = await this.loadProject(projectId);
    if (project) {
      const sceneIndex = project.scenes.findIndex(s => s.id === scene.id);
      if (sceneIndex >= 0) {
        project.scenes[sceneIndex] = scene;
      } else {
        project.scenes.push(scene);
      }
      await this.saveProject(project);
    }
  }

  async deleteScene(sceneId: string): Promise<void> {
    // 需要找到包含这个场景的项目
    const projects = await this.getAllProjects();
    for (const project of projects) {
      const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
      if (sceneIndex >= 0) {
        project.scenes.splice(sceneIndex, 1);
        // 同时删除该场景的所有镜头
        project.shots = project.shots.filter(shot => shot.sceneId !== sceneId);
        await this.saveProject(project);
        break;
      }
    }
  }

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    const projects = await this.getAllProjects();
    for (const project of projects) {
      if (project.scenes.some(s => s.id === sceneId)) {
        const shotIndex = project.shots.findIndex(s => s.id === shot.id);
        if (shotIndex >= 0) {
          project.shots[shotIndex] = shot;
        } else {
          project.shots.push(shot);
        }
        await this.saveProject(project);
        break;
      }
    }
  }

  async deleteShot(shotId: string): Promise<void> {
    const projects = await this.getAllProjects();
    for (const project of projects) {
      const shotIndex = project.shots.findIndex(s => s.id === shotId);
      if (shotIndex >= 0) {
        project.shots.splice(shotIndex, 1);
        await this.saveProject(project);
        break;
      }
    }
  }

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    const project = await this.loadProject(projectId);
    if (project) {
      const charIndex = project.characters.findIndex(c => c.id === character.id);
      if (charIndex >= 0) {
        project.characters[charIndex] = character;
      } else {
        project.characters.push(character);
      }
      await this.saveProject(project);
    }
  }

  async deleteCharacter(characterId: string): Promise<void> {
    const projects = await this.getAllProjects();
    for (const project of projects) {
      const charIndex = project.characters.findIndex(c => c.id === characterId);
      if (charIndex >= 0) {
        project.characters.splice(charIndex, 1);
        await this.saveProject(project);
        break;
      }
    }
  }

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    const project = await this.loadProject(projectId);
    if (project) {
      const audioIndex = project.audioAssets.findIndex(a => a.id === audio.id);
      if (audioIndex >= 0) {
        project.audioAssets[audioIndex] = audio;
      } else {
        project.audioAssets.push(audio);
      }
      await this.saveProject(project);
    }
  }

  async deleteAudioAsset(audioId: string): Promise<void> {
    const projects = await this.getAllProjects();
    for (const project of projects) {
      const audioIndex = project.audioAssets.findIndex(a => a.id === audioId);
      if (audioIndex >= 0) {
        project.audioAssets.splice(audioIndex, 1);
        await this.saveProject(project);
        break;
      }
    }
  }
}

// ========================
// Supabase 后端实现
// ========================

class SupabaseBackend implements DataBackend {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async saveProject(project: Project): Promise<void> {
    // 将 Project 数据分解为 Supabase 表结构
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .upsert({
        id: project.id,
        user_id: this.userId,
        title: project.metadata.title,
        description: project.metadata.description,
        art_style: project.metadata.artStyle,
        settings: project.settings as any,
        metadata: {
          created: project.metadata.created,
          modified: project.metadata.modified,
          script: project.script,
          chatHistory: project.chatHistory || [],
          timeline: project.timeline || [],
        } as any,
        scene_count: project.scenes.length,
        shot_count: project.shots.length,
      })
      .select()
      .single();

    if (projectError) throw projectError;

    // 保存场景
    for (const scene of project.scenes) {
      await this.saveScene(project.id, scene);
    }

    // 保存镜头
    for (const shot of project.shots) {
      await this.saveShot(shot.sceneId, shot);
    }

    // 保存角色
    for (const character of project.characters) {
      await this.saveCharacter(project.id, character);
    }

    // 保存音频资源
    for (const audio of project.audioAssets) {
      await this.saveAudioAsset(project.id, audio);
    }
  }

  async loadProject(id: string): Promise<Project | undefined> {
    // 加载项目基本信息
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !projectData) return undefined;

    // 加载场景
    const { data: scenesData } = await supabase
      .from('scenes')
      .select('*')
      .eq('project_id', id)
      .order('order_index');

    // 加载镜头
    const { data: shotsData } = await supabase
      .from('shots')
      .select('*')
      .order('order_index');

    const scenes: Scene[] = (scenesData || []).map(s => ({
      id: s.id,
      name: s.name,
      location: s.description || '',
      description: s.description || '',
      shotIds: [], // 稍后填充
      position: (s.metadata as any)?.position || { x: 0, y: 0 },
      order: s.order_index,
      status: 'draft' as const,
      created: new Date(s.created_at),
      modified: new Date(s.updated_at),
      gridHistory: (s.grid_history as any) || [],
      savedGridSlices: (s.saved_grid_slices as any) || [],
    }));

    // 过滤属于当前项目场景的镜头
    const sceneIds = scenes.map(s => s.id);
    const shots: Shot[] = (shotsData || [])
      .filter(shot => sceneIds.includes(shot.scene_id))
      .map(s => ({
        id: s.id,
        sceneId: s.scene_id,
        order: s.order_index,
        shotSize: s.shot_size as any,
        cameraMovement: s.camera_movement as any,
        duration: Number(s.duration) || 5,
        description: s.description || '',
        narration: s.narration || undefined,
        dialogue: s.dialogue || undefined,
        referenceImage: s.reference_image || undefined,
        videoClip: s.video_clip || undefined,
        gridImages: (s.grid_images as any) || undefined,
        generationHistory: (s.generation_history as any) || undefined,
        status: s.status as any,
        created: new Date(s.created_at),
        modified: new Date(s.updated_at),
      }));

    // 填充 shotIds
    scenes.forEach(scene => {
      scene.shotIds = shots.filter(shot => shot.sceneId === scene.id).map(shot => shot.id);
    });

    // 加载角色
    const { data: charactersData } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', id);

    const characters: Character[] = (charactersData || []).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      appearance: c.appearance || '',
      referenceImages: (c.reference_images as any) || [],
    }));

    // 加载音频资源
    const { data: audioData } = await supabase
      .from('audio_assets')
      .select('*')
      .eq('project_id', id);

    const audioAssets: AudioAsset[] = (audioData || []).map(a => ({
      id: a.id,
      name: a.name,
      type: a.category as any,
      url: a.file_url,
      duration: Number(a.duration) || 0,
    }));

    // 组装完整的 Project 对象
    const metadata = projectData.metadata as any;
    const project: Project = {
      id: projectData.id,
      metadata: {
        title: projectData.title,
        description: projectData.description || '',
        artStyle: projectData.art_style || '',
        created: new Date(metadata?.created || projectData.created_at),
        modified: new Date(metadata?.modified || projectData.updated_at),
      },
      characters,
      locations: [], // TODO: 如果需要单独的 locations 表
      audioAssets,
      script: metadata?.script || '',
      scenes,
      shots,
      timeline: metadata?.timeline || [],
      settings: projectData.settings as any,
      chatHistory: metadata?.chatHistory || [],
    };

    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // 只返回项目列表的基本信息，不加载完整数据
    // 完整数据通过 loadProject 按需加载
    const projects: Project[] = (data || []).map(p => ({
      id: p.id,
      metadata: {
        title: p.title,
        description: p.description || '',
        artStyle: p.art_style || '',
        created: new Date(p.created_at),
        modified: new Date(p.updated_at),
      },
      characters: [],
      locations: [],
      audioAssets: [],
      script: '',
      scenes: [],
      shots: [],
      timeline: [],
      settings: p.settings as any,
      chatHistory: [],
    }));

    return projects;
  }

  async deleteProject(id: string): Promise<void> {
    // Supabase 的级联删除会自动删除相关的 scenes, shots 等
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw error;
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    const { error } = await supabase
      .from('scenes')
      .upsert({
        id: scene.id,
        project_id: projectId,
        name: scene.name,
        description: scene.description,
        order_index: scene.order,
        grid_history: scene.gridHistory as any,
        saved_grid_slices: scene.savedGridSlices as any,
        metadata: {
          location: scene.location,
          position: scene.position,
          status: scene.status,
        } as any,
      });

    if (error) throw error;
  }

  async deleteScene(sceneId: string): Promise<void> {
    const { error } = await supabase
      .from('scenes')
      .delete()
      .eq('id', sceneId);

    if (error) throw error;
  }

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    const { error } = await supabase
      .from('shots')
      .upsert({
        id: shot.id,
        scene_id: sceneId,
        order_index: shot.order,
        shot_size: shot.shotSize,
        camera_movement: shot.cameraMovement,
        duration: shot.duration,
        description: shot.description,
        dialogue: shot.dialogue || null,
        narration: shot.narration || null,
        reference_image: shot.referenceImage || null,
        video_clip: shot.videoClip || null,
        grid_images: shot.gridImages as any,
        generation_history: shot.generationHistory as any,
        status: shot.status,
        metadata: {
          mainCharacters: shot.mainCharacters,
          mainScenes: shot.mainScenes,
          generationConfig: shot.generationConfig,
          error: shot.error,
        } as any,
      });

    if (error) throw error;
  }

  async deleteShot(shotId: string): Promise<void> {
    const { error } = await supabase
      .from('shots')
      .delete()
      .eq('id', shotId);

    if (error) throw error;
  }

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    const { error } = await supabase
      .from('characters')
      .upsert({
        id: character.id,
        project_id: projectId,
        name: character.name,
        description: character.description,
        appearance: character.appearance,
        reference_images: character.referenceImages as any,
      });

    if (error) throw error;
  }

  async deleteCharacter(characterId: string): Promise<void> {
    const { error } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId);

    if (error) throw error;
  }

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    const { error } = await supabase
      .from('audio_assets')
      .upsert({
        id: audio.id,
        project_id: projectId,
        name: audio.name,
        category: audio.type,
        file_url: audio.url,
        duration: audio.duration,
      });

    if (error) throw error;
  }

  async deleteAudioAsset(audioId: string): Promise<void> {
    const { error } = await supabase
      .from('audio_assets')
      .delete()
      .eq('id', audioId);

    if (error) throw error;
  }
}

// ========================
// 统一数据服务
// ========================

class UnifiedDataService {
  private backend: DataBackend | null = null;
  private currentUserId: string | null = null;

  /**
   * 初始化数据服务（根据用户登录状态选择后端）
   */
  async initialize(): Promise<void> {
    const user = await getCurrentUser();

    if (user) {
      // 已登录：使用 Supabase
      this.currentUserId = user.id;
      this.backend = new SupabaseBackend(user.id);
    } else {
      // 未登录：使用 IndexedDB
      this.currentUserId = null;
      this.backend = new IndexedDBBackend();
    }
  }

  /**
   * 获取当前后端（自动初始化）
   */
  private async getBackend(): Promise<DataBackend> {
    if (!this.backend) {
      await this.initialize();
    }
    return this.backend!;
  }

  /**
   * 检查是否使用云端存储
   */
  async isCloudMode(): Promise<boolean> {
    if (!this.backend) {
      await this.initialize();
    }
    return this.backend instanceof SupabaseBackend;
  }

  // ===== 项目操作 =====

  async saveProject(project: Project): Promise<void> {
    const backend = await this.getBackend();
    return backend.saveProject(project);
  }

  async loadProject(id: string): Promise<Project | undefined> {
    const backend = await this.getBackend();
    return backend.loadProject(id);
  }

  async getAllProjects(): Promise<Project[]> {
    const backend = await this.getBackend();
    return backend.getAllProjects();
  }

  async deleteProject(id: string): Promise<void> {
    const backend = await this.getBackend();
    return backend.deleteProject(id);
  }

  // ===== 场景操作 =====

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    const backend = await this.getBackend();
    return backend.saveScene(projectId, scene);
  }

  async deleteScene(sceneId: string): Promise<void> {
    const backend = await this.getBackend();
    return backend.deleteScene(sceneId);
  }

  // ===== 镜头操作 =====

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    const backend = await this.getBackend();
    return backend.saveShot(sceneId, shot);
  }

  async deleteShot(shotId: string): Promise<void> {
    const backend = await this.getBackend();
    return backend.deleteShot(shotId);
  }

  // ===== 角色操作 =====

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    const backend = await this.getBackend();
    return backend.saveCharacter(projectId, character);
  }

  async deleteCharacter(characterId: string): Promise<void> {
    const backend = await this.getBackend();
    return backend.deleteCharacter(characterId);
  }

  // ===== 音频资源操作 =====

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    const backend = await this.getBackend();
    return backend.saveAudioAsset(projectId, audio);
  }

  async deleteAudioAsset(audioId: string): Promise<void> {
    const backend = await this.getBackend();
    return backend.deleteAudioAsset(audioId);
  }
}

// 导出单例
export const dataService = new UnifiedDataService();
