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
} from '@/types/project';
import { db, saveProject as saveProjectToDB } from '@/lib/db';
import { recalcShotOrders, normalizeSceneOrder } from '@/utils/shotOrder';

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

  // Project Actions
  loadProject: (project: Project) => void;
  saveProject: () => Promise<void>;
  createNewProject: (
    title: string,
    description: string,
    artStyle?: string,
    aspectRatio?: string
  ) => void;
  updateScript: (script: string) => void;

  // Scene Actions
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  selectScene: (id: string) => void;
  addGridHistory: (sceneId: string, gridHistory: GridHistoryItem) => void;
  saveFavoriteSlices: (sceneId: string, slices: string[]) => void;
  renumberScenesAndShots: () => void;

  // Shot Actions
  addShot: (shot: Shot) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  selectShot: (id: string) => void;
  reorderShots: (sceneId: string, shotIds: string[]) => void;
  addGenerationHistory: (shotId: string, historyItem: GenerationHistoryItem) => void;

  // Character Actions
  addCharacter: (character: Character) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;

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
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
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
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,

    // Project Actions
    loadProject: (project) =>
      set(() => {
        normalizeSceneOrder(project);
        recalcShotOrders(project);
        return { project };
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
      await saveProjectToDB(updatedProject);
    },

    createNewProject: (title, description, artStyle = '', aspectRatio = '9:16') => {
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
          id: `project_${Date.now()}`,
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
          script: '',
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

    updateScript: (script) => {
      set((state) => {
        if (state.project) {
          state.project.script = script;
        }
      });
      // 自动保存
      get().saveProject();
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
      get().saveProject();
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
      get().saveProject();
    },

    deleteScene: (id) => {
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
      // 自动保存
      get().saveProject();
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
      get().saveProject();
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
      get().saveProject();
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
      get().saveProject();
    },

    updateShot: (id, updates) => {
      set((state) => {
        const shot = state.project?.shots.find((s) => s.id === id);
        if (shot) {
          Object.assign(shot, updates);
        }
      });
      // 自动保存
      get().saveProject();
    },

    deleteShot: (id) => {
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
      // 自动保存
      get().saveProject();
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
      get().saveProject();
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
      get().saveProject();
    },

    // Character Actions
    addCharacter: (character) => {
      set((state) => {
        state.project?.characters.push(character);
      });
      get().saveProject();
    },

    updateCharacter: (id, updates) => {
      set((state) => {
        const character = state.project?.characters.find((c) => c.id === id);
        if (character) {
          Object.assign(character, updates);
        }
      });
      get().saveProject();
    },

    deleteCharacter: (id) => {
      set((state) => {
        if (!state.project) return;
        state.project.characters = state.project.characters.filter(
          (c) => c.id !== id
        );
      });
      get().saveProject();
    },

    // Location Actions
    addLocation: (location) => {
      set((state) => {
        state.project?.locations.push(location);
      });
      get().saveProject();
    },

    updateLocation: (id, updates) => {
      set((state) => {
        const location = state.project?.locations.find((l) => l.id === id);
        if (location) {
          Object.assign(location, updates);
        }
      });
      get().saveProject();
    },

    deleteLocation: (id) => {
      set((state) => {
        if (!state.project) return;
        state.project.locations = state.project.locations.filter(
          (l) => l.id !== id
        );
      });
      get().saveProject();
    },

    // Audio Actions
    addAudioAsset: (audio) => {
      set((state) => {
        state.project?.audioAssets.push(audio);
      });
      get().saveProject();
    },

    deleteAudioAsset: (id) => {
      set((state) => {
        if (!state.project) return;
        state.project.audioAssets = state.project.audioAssets.filter(
          (a) => a.id !== id
        );
      });
      get().saveProject();
    },

    // Chat Actions
    addChatMessage: (message) => {
      set((state) => {
        if (!state.project) return;
        if (!state.project.chatHistory) {
          state.project.chatHistory = [];
        }

        // 添加新消息
        state.project.chatHistory.push(message);

        // 限制历史记录数量（保留最近50条）
        const MAX_HISTORY = 50;
        if (state.project.chatHistory.length > MAX_HISTORY) {
          state.project.chatHistory = state.project.chatHistory.slice(-MAX_HISTORY);
        }
      }, false);

      // 自动保存到 IndexedDB
      get().saveProject();
    },

    clearChatHistory: () => {
      set((state) => {
        if (!state.project) return;
        state.project.chatHistory = [];
      });
      // 自动保存到 IndexedDB
      get().saveProject();
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
    toggleLeftSidebar: () => set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
    toggleRightSidebar: () => set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  }))
);
