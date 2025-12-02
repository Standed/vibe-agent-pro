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
} from '@/types/project';
import { db, saveProject as saveProjectToDB } from '@/lib/db';

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

  // Project Actions
  loadProject: (project: Project) => void;
  saveProject: () => Promise<void>;
  createNewProject: (title: string, description: string) => void;

  // Scene Actions
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  selectScene: (id: string) => void;

  // Shot Actions
  addShot: (shot: Shot) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  selectShot: (id: string) => void;

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

    // Project Actions
    loadProject: (project) => set({ project }),

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

    createNewProject: (title, description) =>
      set({
        project: {
          id: `project_${Date.now()}`,
          metadata: {
            title,
            description,
            artStyle: '',
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
            videoResolution: { width: 1920, height: 1080 },
            fps: 30,
            audioSampleRate: 48000,
            defaultShotDuration: 5,
          },
        },
      }),

    // Scene Actions
    addScene: (scene) =>
      set((state) => {
        state.project?.scenes.push(scene);
      }),

    updateScene: (id, updates) =>
      set((state) => {
        const scene = state.project?.scenes.find((s) => s.id === id);
        if (scene) {
          Object.assign(scene, updates);
        }
      }),

    deleteScene: (id) =>
      set((state) => {
        if (!state.project) return;
        state.project.scenes = state.project.scenes.filter((s) => s.id !== id);
        // 同时删除场景下的所有镜头
        state.project.shots = state.project.shots.filter(
          (shot) => shot.sceneId !== id
        );
      }),

    selectScene: (id) => set({ currentSceneId: id }),

    // Shot Actions
    addShot: (shot) =>
      set((state) => {
        state.project?.shots.push(shot);
      }),

    updateShot: (id, updates) =>
      set((state) => {
        const shot = state.project?.shots.find((s) => s.id === id);
        if (shot) {
          Object.assign(shot, updates);
        }
      }),

    deleteShot: (id) =>
      set((state) => {
        if (!state.project) return;
        state.project.shots = state.project.shots.filter((s) => s.id !== id);
        // 从时间轴移除
        state.project.timeline.forEach((track) => {
          track.clips = track.clips.filter((clip) => clip.shotId !== id);
        });
      }),

    selectShot: (id) => set({ selectedShotId: id }),

    // Character Actions
    addCharacter: (character) =>
      set((state) => {
        state.project?.characters.push(character);
      }),

    updateCharacter: (id, updates) =>
      set((state) => {
        const character = state.project?.characters.find((c) => c.id === id);
        if (character) {
          Object.assign(character, updates);
        }
      }),

    deleteCharacter: (id) =>
      set((state) => {
        if (!state.project) return;
        state.project.characters = state.project.characters.filter(
          (c) => c.id !== id
        );
      }),

    // Location Actions
    addLocation: (location) =>
      set((state) => {
        state.project?.locations.push(location);
      }),

    updateLocation: (id, updates) =>
      set((state) => {
        const location = state.project?.locations.find((l) => l.id === id);
        if (location) {
          Object.assign(location, updates);
        }
      }),

    deleteLocation: (id) =>
      set((state) => {
        if (!state.project) return;
        state.project.locations = state.project.locations.filter(
          (l) => l.id !== id
        );
      }),

    // Audio Actions
    addAudioAsset: (audio) =>
      set((state) => {
        state.project?.audioAssets.push(audio);
      }),

    deleteAudioAsset: (id) =>
      set((state) => {
        if (!state.project) return;
        state.project.audioAssets = state.project.audioAssets.filter(
          (a) => a.id !== id
        );
      }),

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
  }))
);
