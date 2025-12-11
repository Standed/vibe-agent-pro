/**
 * 统一数据服务层 - 仅使用 Supabase 云端存储
 */

import type { Project, Scene, Shot, Character, AudioAsset } from '@/types/project';
import { supabase } from './supabase/client';
import { getCurrentUser } from './supabase/auth';

interface DataBackend {
  saveProject(project: Project): Promise<void>;
  loadProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
  saveScene(projectId: string, scene: Scene): Promise<void>;
  deleteScene(sceneId: string): Promise<void>;
  saveShot(sceneId: string, shot: Shot): Promise<void>;
  deleteShot(shotId: string): Promise<void>;
  saveCharacter(projectId: string, character: Character): Promise<void>;
  deleteCharacter(characterId: string): Promise<void>;
  saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void>;
  deleteAudioAsset(audioId: string): Promise<void>;
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
    console.log('[SupabaseBackend] 💾 保存项目:', project.id, project.metadata.title);

    // 将 Project 数据分解为 Supabase 表结构
    const { data: projectData, error: projectError } = await (supabase as any)
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
      .select();

    if (projectError) throw projectError;

    // 保存场景
    if (project.scenes.length > 0) {
      const { error: scenesError } = await (supabase as any)
        .from('scenes')
        .upsert(
          project.scenes.map((scene) => ({
            id: scene.id,
            project_id: project.id,
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
          }))
        );

      if (scenesError) throw scenesError;
    }

    // 保存镜头
    if (project.shots.length > 0) {
      const { error: shotsError } = await (supabase as any)
        .from('shots')
        .upsert(
          project.shots.map((shot) => ({
            id: shot.id,
            scene_id: shot.sceneId,
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
          }))
        );

      if (shotsError) throw shotsError;
    }

    // 保存角色
    if (project.characters.length > 0) {
      const { error: charactersError } = await (supabase as any)
        .from('characters')
        .upsert(
          project.characters.map((character) => ({
            id: character.id,
            project_id: project.id,
            name: character.name,
            description: character.description,
            appearance: character.appearance,
            reference_images: character.referenceImages as any,
          }))
        );

      if (charactersError) throw charactersError;
    }

    // 保存音频资源
    if (project.audioAssets.length > 0) {
      const { error: audioError } = await (supabase as any)
        .from('audio_assets')
        .upsert(
          project.audioAssets.map((audio) => ({
            id: audio.id,
            project_id: project.id,
            name: audio.name,
            category: audio.type,
            file_url: audio.url,
            duration: audio.duration,
          }))
        );

      if (audioError) throw audioError;
    }

    console.log('[SupabaseBackend] ✅ 项目保存成功');
  }

  async loadProject(id: string): Promise<Project | undefined> {
    console.log('[SupabaseBackend] 📖 加载项目:', id);

    // 加载项目基本信息
    const { data: project, error: projectError } = await (supabase as any)
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .single();

    if (projectError || !project) {
      console.warn('[SupabaseBackend] 项目不存在或无权限:', projectError);
      return undefined;
    }

    // 加载场景
    const { data: scenes = [], error: scenesError } = await (supabase as any)
      .from('scenes')
      .select('*')
      .eq('project_id', id)
      .order('order_index', { ascending: true });

    if (scenesError) throw scenesError;

    // 加载镜头
    const { data: shots = [], error: shotsError } = await (supabase as any)
      .from('shots')
      .select('*')
      .in('scene_id', scenes.map((s: any) => s.id))
      .order('order_index', { ascending: true });

    if (shotsError) throw shotsError;

    // 加载角色
    const { data: characters = [], error: charactersError } = await (supabase as any)
      .from('characters')
      .select('*')
      .eq('project_id', id);

    if (charactersError) throw charactersError;

    // 加载音频资源
    const { data: audioAssets = [], error: audioError } = await (supabase as any)
      .from('audio_assets')
      .select('*')
      .eq('project_id', id);

    if (audioError) throw audioError;

    // 组装 Project 对象
    const result: Project = {
      id: project.id,
      metadata: {
        title: project.title,
        description: project.description || '',
        artStyle: project.art_style || '',
        created: new Date(project.created_at),
        modified: new Date(project.updated_at),
      },
      settings: project.settings || {},
      script: project.metadata?.script || '',
      chatHistory: project.metadata?.chatHistory || [],
      timeline: project.metadata?.timeline || [],
      scenes: scenes.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        order: s.order_index,
        location: s.metadata?.location || '',
        position: s.metadata?.position || { x: 0, y: 0 },
        status: s.metadata?.status || 'draft',
        gridHistory: s.grid_history || [],
        savedGridSlices: s.saved_grid_slices || [],
      })),
      shots: shots.map((sh: any) => ({
        id: sh.id,
        sceneId: sh.scene_id,
        order: sh.order_index,
        shotSize: sh.shot_size || 'medium',
        cameraMovement: sh.camera_movement || 'static',
        duration: sh.duration || 3,
        description: sh.description || '',
        dialogue: sh.dialogue || undefined,
        narration: sh.narration || undefined,
        referenceImage: sh.reference_image || undefined,
        videoClip: sh.video_clip || undefined,
        gridImages: sh.grid_images || [],
        generationHistory: sh.generation_history || [],
        status: sh.status || 'draft',
        mainCharacters: sh.metadata?.mainCharacters || [],
        mainScenes: sh.metadata?.mainScenes || [],
        generationConfig: sh.metadata?.generationConfig || undefined,
        error: sh.metadata?.error || undefined,
      })),
      characters: characters.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        appearance: c.appearance || '',
        referenceImages: c.reference_images || [],
      })),
      audioAssets: audioAssets.map((a: any) => ({
        id: a.id,
        type: a.category,
        name: a.name,
        url: a.file_url,
        duration: a.duration || 0,
      })),
    };

    console.log('[SupabaseBackend] ✅ 项目加载成功');
    return result;
  }

  async getAllProjects(): Promise<Project[]> {
    console.log('[SupabaseBackend] 📋 获取所有项目');

    const { data: projects = [], error } = await (supabase as any)
      .from('projects')
      .select('id, title, description, art_style, created_at, updated_at, scene_count, shot_count, metadata')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // 简化版项目列表，不加载完整的 scenes/shots/characters
    const result = projects.map((p: any) => ({
      id: p.id,
      metadata: {
        title: p.title,
        description: p.description || '',
        artStyle: p.art_style || '',
        created: new Date(p.created_at),
        modified: new Date(p.updated_at),
      },
      settings: {},
      script: '',
      chatHistory: [],
      timeline: [],
      scenes: [],
      shots: [],
      characters: [],
      audioAssets: [],
    }));

    console.log('[SupabaseBackend] ✅ 获取到', result.length, '个项目');
    return result;
  }

  async deleteProject(id: string): Promise<void> {
    console.log('[SupabaseBackend] 🗑️ 删除项目:', id);

    // Supabase RLS + CASCADE 会自动删除关联的 scenes, shots, characters, audio_assets
    const { error } = await (supabase as any)
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw error;

    console.log('[SupabaseBackend] ✅ 项目删除成功');
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    const { error } = await (supabase as any)
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
    const { error } = await (supabase as any)
      .from('scenes')
      .delete()
      .eq('id', sceneId);

    if (error) throw error;
  }

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    const { error } = await (supabase as any)
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
    const { error } = await (supabase as any)
      .from('shots')
      .delete()
      .eq('id', shotId);

    if (error) throw error;
  }

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    const { error } = await (supabase as any)
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
    const { error } = await (supabase as any)
      .from('characters')
      .delete()
      .eq('id', characterId);

    if (error) throw error;
  }

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    const { error } = await (supabase as any)
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
    const { error } = await (supabase as any)
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
   * 初始化数据服务（仅使用 Supabase）
   * @param userId 可选：直接提供用户ID，避免重新获取
   */
  async initialize(userId?: string): Promise<void> {
    console.log('[DataService] 🔄 正在初始化...');

    let user = null;

    // 如果提供了 userId，直接使用
    if (userId) {
      console.log('[DataService] ✅ 使用提供的用户ID:', userId);
      this.currentUserId = userId;
      this.backend = new SupabaseBackend(userId);
      console.log('[DataService] ☁️ 使用 Supabase 后端');
      return;
    }

    // 否则尝试多次获取用户（应对内存存储延迟问题）
    const maxRetries = 5;
    const retryDelay = 1000; // 1秒

    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`[DataService] 尝试获取用户 (${i + 1}/${maxRetries})...`);

        // 每次尝试设置较短的超时（5秒）
        const getUserPromise = getCurrentUser();
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('超时')), 5000)
        );

        user = await Promise.race([getUserPromise, timeoutPromise]);

        if (user) {
          console.log('[DataService] ✅ 成功获取用户:', user.email);
          break;
        }

        // 如果返回 null（未登录），直接抛出错误
        throw new Error('用户未登录');

      } catch (err) {
        const isLastRetry = i === maxRetries - 1;

        if (isLastRetry) {
          console.error('[DataService] ❌ 所有重试均失败:', err);
          throw new Error('获取用户失败，请重新登录');
        }

        // 非最后一次重试，等待后继续
        console.warn(`[DataService] ⚠️ 第 ${i + 1} 次尝试失败，${retryDelay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!user) {
      console.error('[DataService] ❌ 用户未登录');
      throw new Error('用户未登录，请先登录');
    }

    // 已登录：使用 Supabase
    this.currentUserId = user.id;
    this.backend = new SupabaseBackend(user.id);
    console.log('[DataService] ☁️ 使用 Supabase 后端');
  }

  private async ensureInitialized(userId?: string): Promise<void> {
    if (!this.backend) {
      await this.initialize(userId);
    }
  }

  async saveProject(project: Project, userId?: string): Promise<void> {
    await this.ensureInitialized(userId);
    return this.backend!.saveProject(project);
  }

  async loadProject(id: string, userId?: string): Promise<Project | undefined> {
    await this.ensureInitialized(userId);
    return this.backend!.loadProject(id);
  }

  async getAllProjects(userId?: string): Promise<Project[]> {
    await this.ensureInitialized(userId);
    return this.backend!.getAllProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteProject(id);
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveScene(projectId, scene);
  }

  async deleteScene(sceneId: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteScene(sceneId);
  }

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveShot(sceneId, shot);
  }

  async deleteShot(shotId: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteShot(shotId);
  }

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveCharacter(projectId, character);
  }

  async deleteCharacter(characterId: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteCharacter(characterId);
  }

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveAudioAsset(projectId, audio);
  }

  async deleteAudioAsset(audioId: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteAudioAsset(audioId);
  }
}

// 导出单例
export const dataService = new UnifiedDataService();
