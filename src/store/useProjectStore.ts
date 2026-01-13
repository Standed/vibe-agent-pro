import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Project,
  Scene,
  Shot,
  TimelineClip,
  TimelineMode,
  ControlMode,
  Character,
  Location,
  AudioAsset,
  GridHistoryItem,
  ChatMessage,
  GenerationHistoryItem,
  GridGenerationResult,
} from '@/types/project';
import { dataService } from '@/lib/dataService';
import { recalcShotOrders, normalizeSceneOrder } from '@/utils/shotOrder';

// 防抖保存计时器
let saveDebounceTimer: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_DELAY = 800; // 800ms 延迟，平衡用户体验和性能

interface ProjectStore {
  // 状态
  project: Project | null;
  currentSceneId: string | null;
  selectedShotId: string | null;

  // UI 状态
  canvasZoom: number;
  canvasPosition: { x: number; y: number };
  timelineMode: TimelineMode;
  controlMode: ControlMode;
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  gridResult: GridGenerationResult | null; // Grid 生成结果（用于显示 Modal）
  isSaving: boolean; // 是否正在保存到云端 (R2 上传或数据库同步)
  generationRequest: {
    prompt: string;
    model: 'jimeng' | 'gemini-grid' | 'gemini-direct' | 'seedream';
    jimengModel?: 'jimeng-4.5' | 'jimeng-4.1' | 'jimeng-4.0';
    jimengResolution?: '2k' | '4k';
  } | null;
  generationProgress: {
    total: number;
    current: number;
    status: 'idle' | 'running' | 'success' | 'error';
    message?: string;
  };

  // Project Actions
  loadProject: (project: Project) => void;
  saveProject: () => Promise<void>;
  debouncedSaveProject: () => void; // 防抖保存，用于频繁的数据变更
  createNewProject: (
    title: string,
    description: string,
    artStyle?: string,
    aspectRatio?: string,
    script?: string
  ) => void;
  updateProjectMetadata: (metadata: Partial<Project['metadata']>) => void;
  updateScript: (script: string) => void;
  setGenerationRequest: (request: ProjectStore['generationRequest']) => void;
  setGenerationProgress: (progress: Partial<ProjectStore['generationProgress']>) => void;

  // Scene Actions
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => Promise<void>;
  selectScene: (id: string) => void;
  addGridHistory: (sceneId: string, gridHistory: GridHistoryItem) => void;
  saveFavoriteSlices: (sceneId: string, slices: string[]) => void;
  renumberScenesAndShots: () => void;
  batchUpdateScenesAndShots: (scenes: Scene[], shots: Shot[]) => void;

  // Shot Actions
  addShot: (shot: Shot) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => Promise<void>;
  selectShot: (id: string) => void;
  reorderShots: (sceneId: string, shotIds: string[]) => void;
  addGenerationHistory: (shotId: string, historyItem: GenerationHistoryItem) => void;
  refreshShot: (shotId: string) => Promise<void>;

  // Character Actions
  addCharacter: (character: Character, options?: { keepOpen?: boolean }) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => Promise<void>;

  // Location Actions
  addLocation: (location: Location) => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  deleteLocation: (id: string) => void;

  // Audio Actions
  addAudioAsset: (audio: AudioAsset) => void;
  deleteAudioAsset: (id: string) => void;

  // Chat Actions
  addChatMessage: (message: ChatMessage) => void;
  clearChatHistory: () => void;

  // Timeline Actions
  addToTimeline: (clip: TimelineClip, trackIndex: number) => void;
  updateTimelineClip: (
    trackId: string,
    clipId: string,
    updates: Partial<TimelineClip>
  ) => void;
  removeFromTimeline: (trackId: string, clipId: string) => void;

  // UI Actions
  setCanvasZoom: (zoom: number) => void;
  setCanvasPosition: (position: { x: number; y: number }) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  setControlMode: (mode: ControlMode) => void;
  setIsSaving: (isSaving: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setGridResult: (result: GridGenerationResult | null) => void;
  clearGridResult: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    // 初始状态
    project: null,
    currentSceneId: null,
    selectedShotId: null,
    canvasZoom: 1,
    canvasPosition: { x: 0, y: 0 },
    timelineMode: 'default',
    controlMode: 'agent',
    leftSidebarCollapsed: true,
    rightSidebarCollapsed: false,
    gridResult: null,
    isSaving: false,
    generationRequest: null,
    generationProgress: {
      total: 0,
      current: 0,
      status: 'idle',
    },

    // Project Actions
    loadProject: (project) =>
      set(() => {
        normalizeSceneOrder(project);
        recalcShotOrders(project);
        return { project };
      }),

    setGenerationRequest: (request) => set({ generationRequest: request }),

    setGenerationProgress: (progress) =>
      set((state) => {
        state.generationProgress = { ...state.generationProgress, ...progress };
      }),

    renumberScenesAndShots: () =>
      set((state) => {
        if (!state.project) return;
        normalizeSceneOrder(state.project);
        recalcShotOrders(state.project);
        // 触发深度更新
        state.project.scenes = [...state.project.scenes];
        state.project.shots = [...state.project.shots];
      }),

    saveProject: async () => {
      const { project } = get();
      if (!project) return;

      const updatedProject = {
        ...project,
        metadata: {
          ...project.metadata,
          modified: new Date(),
        },
      };

      set({ project: updatedProject });
      await dataService.saveProject(updatedProject);
    },

    debouncedSaveProject: () => {
      // 清除之前的计时器
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }

      // 设置新的计时器
      saveDebounceTimer = setTimeout(() => {
        const { saveProject } = get();
        saveProject().catch((error) => {
          console.error('[Store] 自动保存失败:', error);
        });
      }, SAVE_DEBOUNCE_DELAY);
    },

    createNewProject: (title, description, artStyle = '', aspectRatio = '9:16', script = '') => {
      // 根据画面比例设置分辨率
      const resolutionMap: Record<string, { width: number; height: number }> = {
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '1:1': { width: 1080, height: 1080 },
        '4:3': { width: 1440, height: 1080 },
        '3:4': { width: 1080, height: 1440 },
        '21:9': { width: 2560, height: 1080 },
      };

      const resolution = resolutionMap[aspectRatio] || { width: 1080, height: 1920 };

      set({
        project: {
          id: crypto.randomUUID(),
          metadata: {
            title,
            description,
            artStyle,
            created: new Date(),
            modified: new Date(),
          },
          characters: [],
          locations: [],
          audioAssets: [],
          script: script || '',
          scenes: [],
          shots: [],
          timeline: [
            { id: 'video-track', type: 'video', clips: [] },
            { id: 'audio-track', type: 'audio', clips: [] },
          ],
          settings: {
            videoResolution: resolution,
            aspectRatio: aspectRatio as any,
            fps: 30,
            audioSampleRate: 48000,
            defaultShotDuration: 5,
          },
        },
      });
    },

    updateProjectMetadata: (metadata) => {
      set((state) => {
        if (state.project) {
          state.project.metadata = { ...state.project.metadata, ...metadata };
        }
      });
      get().debouncedSaveProject();
    },

    updateScript: (script) => {
      set((state) => {
        if (state.project) {
          state.project.script = script;
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    // Scene Actions
    addScene: (scene) => {
      set((state) => {
        state.project?.scenes.push(scene);
        normalizeSceneOrder(state.project);
        recalcShotOrders(state.project);
        // 触发深度更新
        if (state.project) {
          state.project.scenes = [...state.project.scenes];
          state.project.shots = [...state.project.shots];
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    updateScene: (id, updates) => {
      set((state) => {
        const scene = state.project?.scenes.find((s) => s.id === id);
        if (scene) {
          Object.assign(scene, updates);
          normalizeSceneOrder(state.project);
          recalcShotOrders(state.project);
          // 触发深度更新
          if (state.project) {
            state.project.scenes = [...state.project.scenes];
            state.project.shots = [...state.project.shots];
          }
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    deleteScene: async (id) => {
      // 先从数据库中删除（立即执行，不等防抖）
      // Supabase CASCADE 会自动删除关联的 shots
      try {
        await dataService.deleteScene(id);
        console.log('[Store] ✅ 场景已从数据库删除:', id);
      } catch (error) {
        console.error('[Store] ❌ 删除场景失败:', error);
        // 即使数据库删除失败，也继续更新本地状态
      }

      // 更新本地状态
      set((state) => {
        if (!state.project) return;
        state.project.scenes = state.project.scenes.filter((s) => s.id !== id);
        // 同时删除场景下的所有镜头
        state.project.shots = state.project.shots.filter(
          (shot) => shot.sceneId !== id
        );
        normalizeSceneOrder(state.project);
        recalcShotOrders(state.project);
        // 触发深度更新
        state.project.scenes = [...state.project.scenes];
        state.project.shots = [...state.project.shots];
      });
    },

    selectScene: (id) => set({ currentSceneId: id, selectedShotId: null }),

    addGridHistory: (sceneId, gridHistory) => {
      set((state) => {
        const scene = state.project?.scenes.find((s) => s.id === sceneId);
        if (scene) {
          if (!scene.gridHistory) {
            scene.gridHistory = [];
          }
          scene.gridHistory.unshift(gridHistory); // Add to beginning
          // Keep only last 10 history items
          if (scene.gridHistory.length > 10) {
            scene.gridHistory = scene.gridHistory.slice(0, 10);
          }
        }
      });
      // 自动保存到 IndexedDB
      get().debouncedSaveProject();
    },

    saveFavoriteSlices: (sceneId, slices) => {
      set((state) => {
        const scene = state.project?.scenes.find((s) => s.id === sceneId);
        if (scene) {
          if (!scene.savedGridSlices) {
            scene.savedGridSlices = [];
          }
          scene.savedGridSlices.push(...slices);
        }
      });
      // 自动保存到 IndexedDB
      get().debouncedSaveProject();
    },

    batchUpdateScenesAndShots: (scenes, shots) => {
      set((state) => {
        if (!state.project) return;
        state.project.scenes = scenes;
        state.project.shots = shots;
        normalizeSceneOrder(state.project);
        recalcShotOrders(state.project);
      });
      get().debouncedSaveProject();
    },

    // Shot Actions
    addShot: (shot) => {
      set((state) => {
        state.project?.shots.push(shot);
        recalcShotOrders(state.project);
        // 触发深度更新
        if (state.project) {
          state.project.shots = [...state.project.shots];
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    updateShot: (id, updates) => {
      set((state) => {
        const shot = state.project?.shots.find((s) => s.id === id);
        if (shot) {
          Object.assign(shot, updates);
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    deleteShot: async (id) => {
      // 先从数据库中删除（立即执行，不等防抖）
      try {
        await dataService.deleteShot(id);
        console.log('[Store] ✅ 镜头已从数据库删除:', id);
      } catch (error) {
        console.error('[Store] ❌ 删除镜头失败:', error);
        // 即使数据库删除失败，也继续更新本地状态（用户可以看到变化）
      }

      // 更新本地状态
      set((state) => {
        if (!state.project) return;
        state.project.shots = state.project.shots.filter((s) => s.id !== id);
        // 从时间轴移除
        state.project.timeline.forEach((track) => {
          track.clips = track.clips.filter((clip) => clip.shotId !== id);
        });
        recalcShotOrders(state.project);
        // 触发深度更新
        state.project.shots = [...state.project.shots];
      });
    },

    selectShot: (id) =>
      set((state) => {
        const shot = state.project?.shots.find((s) => s.id === id);
        const scene = state.project?.scenes.find((scene) =>
          scene.shotIds.includes(id)
        );
        return {
          selectedShotId: id,
          currentSceneId: scene?.id || null,
        };
      }),

    reorderShots: (sceneId, shotIds) => {
      set((state) => {
        const scene = state.project?.scenes.find((s) => s.id === sceneId);
        if (scene) {
          scene.shotIds = shotIds;
          recalcShotOrders(state.project);
          // 触发深度更新
          if (state.project) {
            state.project.shots = [...state.project.shots];
          }
        }
      });
      // 自动保存
      get().debouncedSaveProject();
    },

    addGenerationHistory: (shotId, historyItem) => {
      set((state) => {
        const shot = state.project?.shots.find((s) => s.id === shotId);
        if (shot) {
          if (!shot.generationHistory) {
            shot.generationHistory = [];
          }
          shot.generationHistory.unshift(historyItem); // Add to beginning
          // Keep only last 20 history items
          if (shot.generationHistory.length > 20) {
            shot.generationHistory = shot.generationHistory.slice(0, 20);
          }
        }
      });
      // 自动保存到 IndexedDB
      get().debouncedSaveProject();
    },

    refreshShot: async (shotId) => {
      try {
        const remoteShot = await dataService.getShot(shotId);
        if (remoteShot) {
          set((state) => {
            const shot = state.project?.shots.find((s) => s.id === shotId);
            if (shot) {
              // Merge remote data, prioritizing remote for video/history
              shot.videoClip = remoteShot.videoClip || shot.videoClip;
              shot.referenceImage = remoteShot.referenceImage || shot.referenceImage;
              shot.generationHistory = remoteShot.generationHistory || shot.generationHistory;
              shot.status = remoteShot.status || shot.status;
              console.log('[Store] refreshShot: merged remote data for', shotId);
            }
          });
        }
      } catch (error) {
        console.error('[Store] refreshShot error:', error);
      }
    },

    // Character Actions
    addCharacter: (character, _options) => {
      set((state) => {
        const project = state.project;
        if (!project) return;
        const incomingName = character.name.trim();
        const existing = project.characters.find(
          (c) => c.name.trim().toLowerCase() === incomingName.toLowerCase()
        );
        if (existing) {
          // 仅补充缺失字段，避免重复条目
          existing.description = existing.description || character.description;
          existing.appearance = existing.appearance || character.appearance;
          existing.referenceImages = existing.referenceImages?.length
            ? existing.referenceImages
            : character.referenceImages || [];
        } else {
          project.characters.push({ ...character, name: incomingName });
        }
      });
      get().debouncedSaveProject();
    },

    updateCharacter: (id, updates) => {
      set((state) => {
        const character = state.project?.characters.find((c) => c.id === id);
        if (character) {
          Object.assign(character, updates);
        }
      });
      get().debouncedSaveProject();
    },

    deleteCharacter: async (id) => {
      // 先从数据库中删除（立即执行，不等防抖）
      try {
        await dataService.deleteCharacter(id);
        // console.log('[Store] 角色已从数据库删除:', id);
      } catch (error) {
        // console.error('[Store] 删除角色失败:', error);
        // 即使数据库删除失败，也继续更新本地状态
      }

      // 更新本地状态
      set((state) => {
        if (!state.project) return;
        state.project.characters = state.project.characters.filter(
          (c) => c.id !== id
        );
      });
    },

    // Location Actions
    addLocation: (location) => {
      set((state) => {
        const project = state.project;
        if (!project) return;
        const incomingName = location.name.trim();
        const existing = project.locations.find(
          (l) => l.name.trim().toLowerCase() === incomingName.toLowerCase()
        );
        if (existing) {
          existing.description = existing.description || location.description;
          existing.type = existing.type || location.type;
          existing.referenceImages = existing.referenceImages?.length
            ? existing.referenceImages
            : location.referenceImages || [];
        } else {
          project.locations.push({ ...location, name: incomingName });
        }
      });
      get().debouncedSaveProject();
    },

    updateLocation: (id, updates) => {
      set((state) => {
        const location = state.project?.locations.find((l) => l.id === id);
        if (location) {
          Object.assign(location, updates);
        }
      });
      get().debouncedSaveProject();
    },

    deleteLocation: (id) => {
      set((state) => {
        if (!state.project) return;
        state.project.locations = state.project.locations.filter(
          (l) => l.id !== id
        );
      });
      get().debouncedSaveProject();
    },

    // Audio Actions
    addAudioAsset: (audio) => {
      set((state) => {
        state.project?.audioAssets.push(audio);
      });
      get().debouncedSaveProject();
    },

    deleteAudioAsset: (id) => {
      set((state) => {
        if (!state.project) return;
        state.project.audioAssets = state.project.audioAssets.filter(
          (a) => a.id !== id
        );
      });
      get().debouncedSaveProject();
    },

    // Chat Actions (DEPRECATED - 已迁移到 dataService + chat_messages 表)
    /**
     * @deprecated 请使用 dataService.saveChatMessage() 代替
     * 此方法保留仅用于向后兼容，不再实际执行操作
     */
    addChatMessage: (message) => {
      // DEPRECATED: 聊天历史已迁移到独立的 chat_messages 表
      // 不再使用 project.chatHistory 字段
      console.warn('[useProjectStore] addChatMessage is deprecated, use dataService.saveChatMessage() instead');
    },

    /**
     * @deprecated 请使用 dataService.clearChatHistory() 代替
     * 此方法保留仅用于向后兼容，不再实际执行操作
     */
    clearChatHistory: () => {
      // DEPRECATED: 聊天历史已迁移到独立的 chat_messages 表
      console.warn('[useProjectStore] clearChatHistory is deprecated, use dataService.clearChatHistory() instead');
    },

    // Timeline Actions
    addToTimeline: (clip, trackIndex) =>
      set((state) => {
        const track = state.project?.timeline[trackIndex];
        if (track) {
          track.clips.push(clip);
          // 按开始时间排序
          track.clips.sort((a, b) => a.startTime - b.startTime);
        }
      }),

    updateTimelineClip: (trackId, clipId, updates) =>
      set((state) => {
        const track = state.project?.timeline.find((t) => t.id === trackId);
        if (track) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            Object.assign(clip, updates);
          }
        }
      }),

    removeFromTimeline: (trackId, clipId) =>
      set((state) => {
        const track = state.project?.timeline.find((t) => t.id === trackId);
        if (track) {
          track.clips = track.clips.filter((c) => c.id !== clipId);
        }
      }),

    // UI Actions
    setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),
    setCanvasPosition: (position) => set({ canvasPosition: position }),
    setTimelineMode: (mode) => set({ timelineMode: mode }),
    setControlMode: (mode) => set({ controlMode: mode }),
    setIsSaving: (isSaving) => set({ isSaving }),
    toggleLeftSidebar: () => set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
    toggleRightSidebar: () => set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),

    // Grid Result Actions
    setGridResult: (result) => {
      console.log('[Store] setGridResult 被调用:', result ? '有数据' : 'null');
      set({ gridResult: result });
    },
    clearGridResult: () => {
      console.log('[Store] clearGridResult 被调用');
      set({ gridResult: null });
    },
  }))
);
