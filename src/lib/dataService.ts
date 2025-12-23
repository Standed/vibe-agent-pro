/**
 * 统一数据服务层 - 使用统一 API Gateway 访问 Supabase
 */

import type {
  Project,
  Scene,
  Shot,
  Character,
  AudioAsset,
  ChatMessage,
  ChatScope,
  SoraTask,
  Series,
  ProjectSettings,
} from '@/types/project';
import { AspectRatio } from '@/types/project';
import { getCurrentUser } from './supabase/auth';
import { authenticatedFetch } from './api-client';
import { supabase } from './supabase/client';

interface DataBackend {
  saveProject(project: Project): Promise<void>;
  loadProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
  saveScene(projectId: string, scene: Scene): Promise<void>;
  deleteScene(sceneId: string): Promise<void>;
  saveShot(sceneId: string, shot: Shot): Promise<void>;
  deleteShot(shotId: string): Promise<void>;
  saveCharacter(projectId: string | null, character: Character): Promise<void>;
  deleteCharacter(characterId: string): Promise<void>;
  saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void>;
  deleteAudioAsset(audioId: string): Promise<void>;

  // 聊天消息 CRUD
  saveChatMessage(message: ChatMessage): Promise<void>;
  getChatMessages(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
    scope?: ChatScope;
    limit?: number;
    offset?: number;
  }): Promise<ChatMessage[]>;
  deleteChatMessage(messageId: string): Promise<void>;
  clearChatHistory(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
  }): Promise<void>;
  subscribeToChatMessages(
    projectId: string,
    callback: (message: ChatMessage) => void
  ): () => void;
  saveSoraTask(task: SoraTask): Promise<void>;
  getSoraTasks(projectId: string): Promise<SoraTask[]>;
  subscribeToSoraTasks(
    projectId: string,
    callback: (task: SoraTask) => void
  ): () => void;
  // Series (剧集) CRUD
  saveSeries(series: Series): Promise<void>;
  getAllSeries(): Promise<Series[]>;
  getSeries(id: string): Promise<Series | undefined>;
  deleteSeries(id: string): Promise<void>;
  // Global Characters (asset library)
  getGlobalCharacters(): Promise<Character[]>;
}

const DEFAULT_SETTINGS: ProjectSettings = {
  videoResolution: { width: 1080, height: 1920 },
  aspectRatio: AspectRatio.MOBILE,
  fps: 30,
  audioSampleRate: 48000,
  defaultShotDuration: 5,
};

// ========================
// Supabase 后端实现
// ========================

class SupabaseBackend implements DataBackend {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * 递归剥离对象中的巨大 Base64 字符串，防止 Supabase 负载过大报错
   */
  private stripBase64(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      // 如果是 Base64 图片且长度超过 10KB，则剥离
      if (obj.startsWith('data:image') && obj.length > 10240) {
        return null;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripBase64(item));
    }
    if (typeof obj === 'object') {
      // 不要递归处理特殊对象
      if (obj instanceof Date || (typeof Blob !== 'undefined' && obj instanceof Blob)) {
        return obj;
      }
      const newObj: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = this.stripBase64(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  }

  /**
   * 调用统一的 Supabase API Gateway
   */
  private async callSupabaseAPI(request: {
    table: string;
    operation: string;
    data?: any;
    filters?: {
      eq?: Record<string, any>;
      in?: Record<string, any[]>;
      neq?: Record<string, any>;
    };
    select?: string;
    order?: {
      column: string;
      ascending?: boolean;
    };
    single?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const maxRetries = 3;
    let lastError: any;

    // 自动剥离 data 中的 Base64
    if (request.data) {
      request.data = this.stripBase64(request.data);
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await authenticatedFetch('/api/supabase', {
          method: 'POST',
          body: JSON.stringify({
            ...request,
            userId: this.userId,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`[SupabaseBackend] API 请求失败 (${response.status}):`, text.substring(0, 200));
          throw new Error(`API 响应错误 (${response.status}): ${text.substring(0, 100)}...`);
        }

        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        return result.data;
      } catch (err: any) {
        console.warn(`[SupabaseBackend] ⚠️ API 调用失败 (尝试 ${i + 1}/${maxRetries}):`, err.message);
        lastError = err;

        if (i < maxRetries - 1) {
          const delay = 1000 * (i + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('[SupabaseBackend] ❌ API 错误 (重试失败):', lastError);
    throw lastError;
  }

  async saveProject(project: Project): Promise<void> {
    console.log('[SupabaseBackend] 💾 保存项目 (通过统一 API):', project.id, project.metadata.title);

    try {
      // 保存项目基本信息
      await this.callSupabaseAPI({
        table: 'projects',
        operation: 'upsert',
        data: {
          id: project.id,
          user_id: this.userId,
          title: project.metadata.title,
          description: project.metadata.description,
          art_style: project.metadata.artStyle,
          settings: project.settings || {},
          metadata: {
            created: project.metadata.created,
            modified: project.metadata.modified,
            script: project.script || '',
            chatHistory: project.chatHistory || [],
            timeline: project.timeline || [],
          },
          scene_count: project.scenes?.length || 0,
          shot_count: project.shots?.length || 0,
          series_id: project.seriesId || null, // 支持剧集 ID
          episode_order: project.episodeOrder || 1, // 支持集数
        },
      });

      console.log('[SupabaseBackend] ✅ 项目基本信息保存成功');

      // 保存场景（如果有）
      if (project.scenes.length > 0) {
        await this.callSupabaseAPI({
          table: 'scenes',
          operation: 'upsert',
          data: project.scenes.map((scene) => ({
            id: scene.id,
            project_id: project.id,
            name: scene.name,
            description: scene.description,
            order_index: scene.order,
            grid_history: scene.gridHistory,
            saved_grid_slices: scene.savedGridSlices,
            metadata: {
              location: scene.location,
              position: scene.position,
              status: scene.status,
            },
          })),
        });
      }

      // 保存镜头（如果有）
      if (project.shots.length > 0) {
        await this.callSupabaseAPI({
          table: 'shots',
          operation: 'upsert',
          data: project.shots.map((shot) => ({
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
            grid_images: shot.gridImages,
            generation_history: shot.generationHistory,
            status: shot.status,
            metadata: {
              mainCharacters: shot.mainCharacters,
              mainScenes: shot.mainScenes,
              generationConfig: shot.generationConfig,
              error: shot.error,
            },
          })),
        });
      }

      // 保存角色（如果有）
      if (project.characters.length > 0) {
        await this.callSupabaseAPI({
          table: 'characters',
          operation: 'upsert',
          data: project.characters.map((character) => ({
            id: character.id,
            project_id: project.id,
            name: character.name,
            description: character.description,
            appearance: character.appearance,
            reference_images: character.referenceImages,
            metadata: {
              soraIdentity: character.soraIdentity
            },
            user_id: this.userId, // 强制绑定用户
          })),
        });
      }

      // 保存音频资源（如果有）
      if (project.audioAssets.length > 0) {
        await this.callSupabaseAPI({
          table: 'audio_assets',
          operation: 'upsert',
          data: project.audioAssets.map((audio) => ({
            id: audio.id,
            project_id: project.id,
            name: audio.name,
            category: audio.type,
            file_url: audio.url,
            duration: audio.duration,
          })),
        });
      }

      console.log('[SupabaseBackend] ✅ 项目保存成功');
    } catch (err) {
      console.error('[SupabaseBackend] ❌ saveProject 失败:', err);
      throw err;
    }
  }

  async loadProject(id: string): Promise<Project | undefined> {
    console.log('[SupabaseBackend] 📖 加载项目 (通过统一 API):', id);

    try {
      // 加载项目基本信息
      const projects = await this.callSupabaseAPI({
        table: 'projects',
        operation: 'select',
        filters: {
          eq: { id, user_id: this.userId },
        },
        select: 'id, user_id, title, description, art_style, created_at, updated_at, settings, metadata, series_id, episode_order',
        single: true,
      });

      const project = Array.isArray(projects) ? projects[0] : projects;

      if (!project) {
        console.warn('[SupabaseBackend] 项目不存在或无权限');
        return undefined;
      }

      // 加载关联数据
      const scenesPromise = this.callSupabaseAPI({
        table: 'scenes',
        operation: 'select',
        filters: {
          eq: { project_id: id },
        },
        select: 'id, project_id, name, description, order_index, grid_history, saved_grid_slices, metadata',
        order: { column: 'order_index', ascending: true },
      });

      const shotsPromise = scenesPromise.then((sceneList) => {
        if (sceneList && sceneList.length > 0) {
          return this.callSupabaseAPI({
            table: 'shots',
            operation: 'select',
            filters: {
              in: { scene_id: sceneList.map((s: any) => s.id) },
            },
            select: 'id, scene_id, order_index, shot_size, camera_movement, duration, description, dialogue, narration, reference_image, video_clip, grid_images, generation_history, status, metadata',
            order: { column: 'order_index', ascending: true },
          });
        }
        return [];
      });

      const charactersPromise = this.callSupabaseAPI({
        table: 'characters',
        operation: 'select',
        filters: { eq: { project_id: id } },
        select: 'id, project_id, name, description, appearance, reference_images, metadata',
      });

      const audioAssetsPromise = this.callSupabaseAPI({
        table: 'audio_assets',
        operation: 'select',
        filters: { eq: { project_id: id } },
        select: 'id, project_id, name, category, file_url, duration',
      });

      const [scenes, shots, characters, audioAssets] = await Promise.all([
        scenesPromise,
        shotsPromise,
        charactersPromise,
        audioAssetsPromise,
      ]);

      return {
        id: project.id,
        seriesId: project.series_id || undefined,
        episodeOrder: project.episode_order || undefined,
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
        scenes: (scenes || []).map((s: any) => ({
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
        shots: (shots || []).map((sh: any) => ({
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
        characters: (characters || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          appearance: c.appearance || '',
          referenceImages: c.reference_images || [],
          soraIdentity: c.metadata?.soraIdentity || undefined,
        })),
        audioAssets: (audioAssets || []).map((a: any) => ({
          id: a.id,
          type: a.category,
          name: a.name,
          url: a.file_url,
          duration: a.duration || 0,
        })),
        locations: [],
      };
    } catch (err) {
      console.error('[SupabaseBackend] ❌ loadProject 失败:', err);
      throw err;
    }
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      const projects = await this.callSupabaseAPI({
        table: 'projects',
        operation: 'select',
        filters: { eq: { user_id: this.userId } },
        select: 'id, title, description, art_style, created_at, updated_at, scene_count, shot_count, series_id, episode_order',
        order: { column: 'updated_at', ascending: false },
      });

      return (projects || []).map((p: any) => ({
        id: p.id,
        seriesId: p.series_id || undefined,
        episodeOrder: p.episode_order || undefined,
        metadata: {
          title: p.title,
          description: p.description || '',
          artStyle: p.art_style || '',
          created: new Date(p.created_at),
          modified: new Date(p.updated_at),
        },
        settings: { ...DEFAULT_SETTINGS },
        script: '',
        chatHistory: [],
        timeline: [],
        scenes: Array.from({ length: p.scene_count || 0 }, () => ({})),
        shots: Array.from({ length: p.shot_count || 0 }, () => ({})),
        characters: [],
        locations: [],
        audioAssets: [],
      })) as any;
    } catch (err) {
      console.error('[SupabaseBackend] ❌ getAllProjects 失败:', err);
      return [];
    }
  }

  async deleteProject(id: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'projects',
      operation: 'delete',
      filters: { eq: { id, user_id: this.userId } },
    });
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    await this.callSupabaseAPI({
      table: 'scenes',
      operation: 'upsert',
      data: {
        id: scene.id,
        project_id: projectId,
        name: scene.name,
        description: scene.description,
        order_index: scene.order,
        grid_history: scene.gridHistory,
        saved_grid_slices: scene.savedGridSlices,
        metadata: {
          location: scene.location,
          position: scene.position,
          status: scene.status,
        },
      },
    });
  }

  async deleteScene(sceneId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'scenes',
      operation: 'delete',
      filters: { eq: { id: sceneId } },
    });
  }

  async saveShot(sceneId: string, shot: Shot): Promise<void> {
    await this.callSupabaseAPI({
      table: 'shots',
      operation: 'upsert',
      data: {
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
        grid_images: shot.gridImages,
        generation_history: shot.generationHistory,
        status: shot.status,
        metadata: {
          mainCharacters: shot.mainCharacters,
          mainScenes: shot.mainScenes,
          generationConfig: shot.generationConfig,
          error: shot.error,
        },
      },
    });
  }

  async deleteShot(shotId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'shots',
      operation: 'delete',
      filters: { eq: { id: shotId } },
    });
  }

  async saveCharacter(projectId: string | null, character: Character): Promise<void> {
    const data: any = {
      id: character.id,
      name: character.name,
      description: character.description,
      appearance: character.appearance,
      reference_images: character.referenceImages,
      metadata: {
        soraIdentity: character.soraIdentity
      },
      user_id: this.userId, // 强制绑定用户
    };

    if (projectId) {
      data.project_id = projectId;
    } else {
      data.project_id = null;
    }

    await this.callSupabaseAPI({
      table: 'characters',
      operation: 'upsert',
      data: data
    });
  }

  async deleteCharacter(characterId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'characters',
      operation: 'delete',
      filters: { eq: { id: characterId } },
    });
  }

  async saveAudioAsset(projectId: string, audio: AudioAsset): Promise<void> {
    await this.callSupabaseAPI({
      table: 'audio_assets',
      operation: 'upsert',
      data: {
        id: audio.id,
        project_id: projectId,
        name: audio.name,
        category: audio.type,
        file_url: audio.url,
        duration: audio.duration,
      },
    });
  }

  async deleteAudioAsset(audioId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'audio_assets',
      operation: 'delete',
      filters: { eq: { id: audioId } },
    });
  }

  async saveChatMessage(message: ChatMessage): Promise<void> {
    await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'upsert',
      data: {
        id: message.id,
        user_id: this.userId,
        project_id: message.projectId,
        scene_id: message.sceneId || null,
        shot_id: message.shotId || null,
        scope: message.scope,
        role: message.role,
        content: message.content,
        thought: message.thought || null,
        metadata: message.metadata || {},
      },
    });
  }

  async getChatMessages(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
    scope?: ChatScope;
    limit?: number;
    offset?: number;
  }): Promise<ChatMessage[]> {
    const apiFilters: any = { eq: { project_id: filters.projectId } };
    if (filters.scope) apiFilters.eq.scope = filters.scope;
    if (filters.sceneId) apiFilters.eq.scene_id = filters.sceneId;
    if (filters.shotId) apiFilters.eq.shot_id = filters.shotId;

    const messages = await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'select',
      filters: apiFilters,
      select: '*',
      order: { column: 'created_at', ascending: true },
      limit: filters.limit,
      offset: filters.offset,
    });

    return (messages || []).map((msg: any) => ({
      id: msg.id,
      userId: msg.user_id,
      projectId: msg.project_id,
      sceneId: msg.scene_id || undefined,
      shotId: msg.shot_id || undefined,
      scope: msg.scope,
      role: msg.role,
      content: msg.content,
      thought: msg.thought || undefined,
      metadata: msg.metadata || {},
      timestamp: new Date(msg.created_at),
      createdAt: new Date(msg.created_at),
      updatedAt: new Date(msg.updated_at),
    }));
  }

  async deleteChatMessage(messageId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'delete',
      filters: { eq: { id: messageId } },
    });
  }

  async clearChatHistory(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
  }): Promise<void> {
    const apiFilters: any = { eq: { project_id: filters.projectId } };
    if (filters.sceneId) apiFilters.eq.scene_id = filters.sceneId;
    if (filters.shotId) apiFilters.eq.shot_id = filters.shotId;

    await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'delete',
      filters: apiFilters,
    });
  }

  subscribeToChatMessages(
    projectId: string,
    callback: (message: ChatMessage) => void
  ): () => void {
    const channel = supabase
      .channel(`chat_messages:project_id=eq.${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          callback({
            id: msg.id,
            userId: msg.user_id,
            projectId: msg.project_id,
            sceneId: msg.scene_id || undefined,
            shotId: msg.shot_id || undefined,
            scope: msg.scope,
            role: msg.role,
            content: msg.content,
            thought: msg.thought || undefined,
            metadata: msg.metadata || {},
            timestamp: new Date(msg.created_at),
            createdAt: new Date(msg.created_at),
            updatedAt: new Date(msg.updated_at),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async saveSoraTask(task: SoraTask): Promise<void> {
    const { error } = await (supabase as any)
      .from('sora_tasks')
      .upsert({
        id: task.id,
        user_id: this.userId,
        project_id: task.projectId,
        scene_id: task.sceneId,
        shot_id: task.shotId,
        status: task.status,
        progress: task.progress,
        model: task.model,
        prompt: task.prompt,
        target_duration: task.targetDuration,
        target_size: task.targetSize,
        kaponai_url: task.kaponaiUrl,
        r2_url: task.r2Url,
        point_cost: task.pointCost,
        error_message: task.errorMessage,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error saving sora task:', error);
      throw error;
    }
  }

  async getSoraTasks(projectId: string): Promise<SoraTask[]> {
    const { data, error } = await (supabase as any)
      .from('sora_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading sora tasks:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      sceneId: row.scene_id,
      shotId: row.shot_id,
      status: row.status,
      progress: row.progress,
      model: row.model,
      prompt: row.prompt,
      targetDuration: row.target_duration,
      targetSize: row.target_size,
      kaponaiUrl: row.kaponai_url,
      r2Url: row.r2_url,
      pointCost: row.point_cost,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }


  subscribeToSoraTasks(
    projectId: string,
    callback: (task: SoraTask) => void
  ): () => void {
    const channel = supabase
      .channel(`sora_tasks_project_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sora_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        (payload: any) => {
          const row = payload.new as any;
          if (row) {
            callback({
              id: row.id,
              userId: row.user_id,
              projectId: row.project_id,
              sceneId: row.scene_id,
              shotId: row.shot_id,
              status: row.status,
              progress: row.progress,
              model: row.model,
              prompt: row.prompt,
              targetDuration: row.target_duration,
              targetSize: row.target_size,
              kaponaiUrl: row.kaponai_url,
              r2Url: row.r2_url,
              pointCost: row.point_cost,
              errorMessage: row.error_message,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  // ========================
  // Series & Global Character Implementation
  // ========================

  async saveSeries(series: Series): Promise<void> {
    const data: any = {
      id: series.id,
      user_id: this.userId,
      title: series.title,
      description: series.description,
      cover_image: series.coverImage,
      updated_at: new Date().toISOString(),
    };
    if (series.created) data.created_at = series.created.toISOString();

    await this.callSupabaseAPI({
      table: 'series',
      operation: 'upsert',
      data,
    });
  }

  async getAllSeries(): Promise<Series[]> {
    try {
      const rows = await this.callSupabaseAPI({
        table: 'series',
        operation: 'select',
        filters: { eq: { user_id: this.userId } },
        order: { column: 'updated_at', ascending: false },
      });
      return (rows || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        userId: r.user_id,
        coverImage: r.cover_image,
        created: new Date(r.created_at),
        updated: new Date(r.updated_at),
      }));
    } catch (err) {
      console.error('Error fetching series:', err);
      return [];
    }
  }

  async getSeries(id: string): Promise<Series | undefined> {
    const rows = await this.callSupabaseAPI({
      table: 'series',
      operation: 'select',
      filters: { eq: { id, user_id: this.userId } },
      single: true,
    });
    if (!rows) return undefined;
    const r = Array.isArray(rows) ? rows[0] : rows;

    // Fetch project IDs
    const projects = await this.callSupabaseAPI({
      table: 'projects',
      operation: 'select',
      filters: { eq: { series_id: id } },
      select: 'id'
    });

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      userId: r.user_id,
      coverImage: r.cover_image,
      created: new Date(r.created_at),
      updated: new Date(r.updated_at),
      projectIds: (projects || []).map((p: any) => p.id),
    };
  }

  async deleteSeries(id: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'series',
      operation: 'delete',
      filters: { eq: { id, user_id: this.userId } },
    });
  }

  async getGlobalCharacters(): Promise<Character[]> {
    const rows = await this.callSupabaseAPI({
      table: 'characters',
      operation: 'select',
      filters: {
        eq: { user_id: this.userId, project_id: null }
      },
      order: { column: 'created_at', ascending: false }
    });

    return (rows || []).map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      projectId: null,
      name: c.name,
      description: c.description || '',
      appearance: c.appearance || '',
      referenceImages: c.reference_images || [],
      soraIdentity: c.metadata?.soraIdentity || undefined,
    }));
  }
}

// ========================
// 统一数据服务
// ========================

export class UnifiedDataService {
  private backend: DataBackend | null = null;
  private currentUserId: string | null = null;

  async initialize(userId?: string): Promise<void> {
    if (userId) {
      this.currentUserId = userId;
      this.backend = new SupabaseBackend(userId);
      return;
    }
    try {
      const user = await getCurrentUser();
      if (user) {
        this.currentUserId = user.id;
        this.backend = new SupabaseBackend(user.id);
      } else {
        throw new Error('用户未登录');
      }
    } catch (err) {
      throw new Error('用户未登录或会话已过期');
    }
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

  async saveCharacter(projectId: string | null, character: Character): Promise<void> {
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

  async saveChatMessage(message: ChatMessage, userId?: string): Promise<void> {
    await this.ensureInitialized(userId);
    return this.backend!.saveChatMessage(message);
  }

  async getChatMessages(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
    scope?: ChatScope;
    limit?: number;
    offset?: number;
  }, userId?: string): Promise<ChatMessage[]> {
    await this.ensureInitialized(userId);
    return this.backend!.getChatMessages(filters);
  }

  async deleteChatMessage(messageId: string, userId?: string): Promise<void> {
    await this.ensureInitialized(userId);
    return this.backend!.deleteChatMessage(messageId);
  }

  async clearChatHistory(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
  }, userId?: string): Promise<void> {
    await this.ensureInitialized(userId);
    return this.backend!.clearChatHistory(filters);
  }

  subscribeToChatMessages(
    projectId: string,
    callback: (message: ChatMessage) => void
  ): () => void {
    // 订阅不需要 ensureInitialized，因为它是通过客户端 supabase 实例直接进行的
    return new SupabaseBackend('browser-only').subscribeToChatMessages(projectId, callback);
  }

  async saveSoraTask(task: SoraTask): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveSoraTask(task);
  }

  async getSoraTasks(projectId: string, userId?: string): Promise<SoraTask[]> {
    await this.ensureInitialized(userId);
    return this.backend!.getSoraTasks(projectId);
  }

  subscribeToSoraTasks(
    projectId: string,
    callback: (task: SoraTask) => void
  ): () => void {
    return new SupabaseBackend('browser-only').subscribeToSoraTasks(projectId, callback);
  }

  async saveSeries(series: Series): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveSeries(series);
  }

  async getAllSeries(): Promise<Series[]> {
    await this.ensureInitialized();
    return this.backend!.getAllSeries();
  }

  async getSeries(id: string): Promise<Series | undefined> {
    await this.ensureInitialized();
    return this.backend!.getSeries(id);
  }

  async deleteSeries(id: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteSeries(id);
  }

  async getGlobalCharacters(): Promise<Character[]> {
    await this.ensureInitialized();
    return this.backend!.getGlobalCharacters();
  }



}

export const dataService = new UnifiedDataService();
