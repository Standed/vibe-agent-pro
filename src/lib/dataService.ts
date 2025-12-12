/**
 * 统一数据服务层 - 使用统一 API Gateway 访问 Supabase
 */

import type {
  Project,
  Scene,
  Shot,
  Character,
  AudioAsset,
  ProjectSettings,
  ChatMessage,
  ChatScope,
} from '@/types/project';
import { AspectRatio } from '@/types/project';
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

  // 注意：不再需要 ensureSession()
  // AuthProvider 已经在应用启动时恢复了会话
  // 多次调用 setSession() 会导致冲突和挂起

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
  }): Promise<any> {
    const maxRetries = 3;
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch('/api/supabase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...request,
            userId: this.userId,
          }),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          // 如果是特定的网络错误，抛出异常以触发重试
          // 这里的 result.error 可能是服务端返回的 "TypeError: fetch failed"
          throw new Error(result.error || 'API 调用失败');
        }

        return result.data;
      } catch (err: any) {
        console.warn(`[SupabaseBackend] ⚠️ API 调用失败 (尝试 ${i + 1}/${maxRetries}):`, err.message);
        lastError = err;

        // 如果不是最后一次尝试，等待后重试
        if (i < maxRetries - 1) {
          const delay = 1000 * (i + 1); // 1s, 2s, 3s
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
      // 加载项目基本信息（限制字段，避免大字段）
      const projects = await this.callSupabaseAPI({
        table: 'projects',
        operation: 'select',
        filters: {
          eq: { id, user_id: this.userId },
        },
        select:
          'id, user_id, title, description, art_style, created_at, updated_at, settings, metadata',
        single: true,
      });

      const project = Array.isArray(projects) ? projects[0] : projects;

      if (!project) {
        console.warn('[SupabaseBackend] 项目不存在或无权限');
        return undefined;
      }

      // 并行加载关联数据，镜头依赖场景列表
      const scenesPromise = this.callSupabaseAPI({
        table: 'scenes',
        operation: 'select',
        filters: {
          eq: { project_id: id },
        },
        select:
          'id, project_id, name, description, order_index, grid_history, saved_grid_slices, metadata',
        order: {
          column: 'order_index',
          ascending: true,
        },
      });

      const shotsPromise = scenesPromise.then((sceneList) => {
        if (sceneList && sceneList.length > 0) {
          return this.callSupabaseAPI({
            table: 'shots',
            operation: 'select',
            filters: {
              in: { scene_id: sceneList.map((s: any) => s.id) },
            },
            // 延迟加载大字段，减少传输体积
            select:
              'id, scene_id, order_index, shot_size, camera_movement, duration, description, dialogue, narration, reference_image, video_clip, status, metadata',
            order: {
              column: 'order_index',
              ascending: true,
            },
          });
        }
        return [];
      });

      const charactersPromise = this.callSupabaseAPI({
        table: 'characters',
        operation: 'select',
        filters: {
          eq: { project_id: id },
        },
        select: 'id, project_id, name, description, appearance, reference_images',
      });

      const audioAssetsPromise = this.callSupabaseAPI({
        table: 'audio_assets',
        operation: 'select',
        filters: {
          eq: { project_id: id },
        },
        select: 'id, project_id, name, category, file_url, duration',
      });

      // 并行执行所有查询
      const [scenes, shots, characters, audioAssets] = await Promise.all([
        scenesPromise,
        shotsPromise,
        charactersPromise,
        audioAssetsPromise,
      ]);

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

      console.log('[SupabaseBackend] ✅ 项目加载成功');
      return result;
    } catch (err) {
      console.error('[SupabaseBackend] ❌ loadProject 失败:', err);
      throw err;
    }
  }

  async getAllProjects(): Promise<Project[]> {
    console.log('[SupabaseBackend] 📋 获取所有项目 (通过统一 API), userId:', this.userId);

    try {
      const projects = await this.callSupabaseAPI({
        table: 'projects',
        operation: 'select',
        filters: {
          eq: { user_id: this.userId },
        },
        select: 'id, title, description, art_style, created_at, updated_at, scene_count, shot_count',
        order: {
          column: 'updated_at',
          ascending: false,
        },
      });

      // 简化版项目列表，不加载完整的 scenes/shots/characters
      // 但需要创建对应长度的空数组，以便首页显示计数
      const formattedProjects = (projects || []).map((p: any) => ({
        id: p.id,
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
        // 创建对应长度的空数组（用于显示计数）
        scenes: Array.from({ length: p.scene_count || 0 }, () => ({})),
        shots: Array.from({ length: p.shot_count || 0 }, () => ({})),
        characters: [],
        locations: [],
        audioAssets: [],
      }));

      console.log('[SupabaseBackend] ✅ 获取到', formattedProjects.length, '个项目');
      return formattedProjects;
    } catch (err) {
      console.error('[SupabaseBackend] ❌ getAllProjects 失败:', err);
      return [];
    }
  }

  async deleteProject(id: string): Promise<void> {
    console.log('[SupabaseBackend] 🗑️ 删除项目 (通过统一 API), id:', id, 'userId:', this.userId);

    try {
      // Supabase CASCADE 会自动删除关联的 scenes, shots, characters, audio_assets
      await this.callSupabaseAPI({
        table: 'projects',
        operation: 'delete',
        filters: {
          eq: { id, user_id: this.userId },
        },
      });

      console.log('[SupabaseBackend] ✅ 项目删除成功');
    } catch (err) {
      console.error('[SupabaseBackend] ❌ deleteProject 失败:', err);
      throw err;
    }
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
      filters: {
        eq: { id: sceneId },
      },
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
      filters: {
        eq: { id: shotId },
      },
    });
  }

  async saveCharacter(projectId: string, character: Character): Promise<void> {
    await this.callSupabaseAPI({
      table: 'characters',
      operation: 'upsert',
      data: {
        id: character.id,
        project_id: projectId,
        name: character.name,
        description: character.description,
        appearance: character.appearance,
        reference_images: character.referenceImages,
      },
    });
  }

  async deleteCharacter(characterId: string): Promise<void> {
    await this.callSupabaseAPI({
      table: 'characters',
      operation: 'delete',
      filters: {
        eq: { id: characterId },
      },
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
      filters: {
        eq: { id: audioId },
      },
    });
  }

  // ========================
  // 聊天消息 CRUD
  // ========================

  async saveChatMessage(message: ChatMessage): Promise<void> {
    console.log('[SupabaseBackend] 💬 保存聊天消息:', message.id, message.scope);

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
    console.log('[SupabaseBackend] 📖 获取聊天消息:', filters);

    const apiFilters: any = {
      eq: { project_id: filters.projectId },
    };

    // 根据 scope 筛选
    if (filters.scope) {
      apiFilters.eq.scope = filters.scope;
    }

    // 根据 sceneId 筛选
    if (filters.sceneId) {
      apiFilters.eq.scene_id = filters.sceneId;
    }

    // 根据 shotId 筛选
    if (filters.shotId) {
      apiFilters.eq.shot_id = filters.shotId;
    }

    const messages = await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'select',
      filters: apiFilters,
      select: '*',
      order: {
        column: 'created_at',
        ascending: true, // 按时间升序（旧到新）
      },
    });

    // 转换为前端格式
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
    console.log('[SupabaseBackend] 🗑️ 删除聊天消息:', messageId);

    await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'delete',
      filters: {
        eq: { id: messageId },
      },
    });
  }

  async clearChatHistory(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
  }): Promise<void> {
    console.log('[SupabaseBackend] 🧹 清除聊天历史:', filters);

    const apiFilters: any = {
      eq: { project_id: filters.projectId },
    };

    if (filters.sceneId) {
      apiFilters.eq.scene_id = filters.sceneId;
    }

    if (filters.shotId) {
      apiFilters.eq.shot_id = filters.shotId;
    }

    await this.callSupabaseAPI({
      table: 'chat_messages',
      operation: 'delete',
      filters: apiFilters,
    });
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

    // 否则尝试获取用户（不重试，快速失败）
    // 注意：不在这里恢复会话，因为 AuthProvider 已经在应用启动时处理了
    // 多次调用 setSession() 会导致冲突和挂起
    try {
      console.log('[DataService] 尝试获取当前用户...');

      // 设置更宽松的 15 秒超时，避免慢网环境下误判为未登录
      const getUserPromise = getCurrentUser();
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('获取用户超时（15秒）')), 15000)
      );

      user = await Promise.race([getUserPromise, timeoutPromise]);

      if (user) {
        console.log('[DataService] ✅ 成功获取用户:', user.email);
      } else {
        // 如果返回 null（未登录），直接抛出错误，不重试
        console.warn('[DataService] ⚠️ 用户未登录（无会话）');
        throw new Error('用户未登录，请先登录');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取用户失败';
      console.error('[DataService] ❌ 获取用户失败:', errorMsg);
      throw new Error('用户未登录或会话已过期，请重新登录');
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

  // ========================
  // 聊天消息 API
  // ========================

  async saveChatMessage(message: ChatMessage): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.saveChatMessage(message);
  }

  async getChatMessages(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
    scope?: ChatScope;
    limit?: number;
    offset?: number;
  }): Promise<ChatMessage[]> {
    await this.ensureInitialized();
    return this.backend!.getChatMessages(filters);
  }

  async deleteChatMessage(messageId: string): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.deleteChatMessage(messageId);
  }

  async clearChatHistory(filters: {
    projectId: string;
    sceneId?: string;
    shotId?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    return this.backend!.clearChatHistory(filters);
  }
}

// 导出单例
export const dataService = new UnifiedDataService();
