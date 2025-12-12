/**
 * 数据迁移服务
 *
 * 将本地 IndexedDB 数据迁移到 Supabase 云端
 */

import { dataService } from './dataService';
import { storageService } from './storageService';
import * as indexedDB from './db';
import type { Project } from '@/types/project';

export interface MigrationProgress {
  total: number;
  current: number;
  currentProject?: string;
  status: 'idle' | 'migrating' | 'uploading_files' | 'completed' | 'error';
  error?: string;
}

export type MigrationCallback = (progress: MigrationProgress) => void;

export interface MigrationResult {
  success: boolean;
  syncedCount: number;
  skippedCount: number;
  errors: { projectId: string; error: string }[];
  error?: string;
}

class MigrationService {
  /**
   * 检查是否有本地数据需要迁移
   */
  async hasLocalData(): Promise<boolean> {
    try {
      const projects = await indexedDB.getAllProjects();
      return projects.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取本地项目数量
   */
  async getLocalProjectCount(): Promise<number> {
    try {
      const projects = await indexedDB.getAllProjects();
      return projects.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 迁移所有本地数据到云端
   */
  async migrateToCloud(
    onProgress?: MigrationCallback
  ): Promise<MigrationResult> {
    try {
      // 1. 获取所有本地项目
      const localProjects = await indexedDB.getAllProjects();

      if (localProjects.length === 0) {
        return { success: true, syncedCount: 0, skippedCount: 0, errors: [] };
      }

      const totalProjects = localProjects.length;
      let currentProject = 0;
      let syncedCount = 0;
      let skippedCount = 0;
      const errors: { projectId: string; error: string }[] = [];

      // 发送初始进度
      onProgress?.({
        total: totalProjects,
        current: 0,
        status: 'migrating',
      });

      // 2. 逐个迁移项目
      for (const project of localProjects) {
        currentProject++;

        onProgress?.({
          total: totalProjects,
          current: currentProject,
          currentProject: project.metadata.title,
          status: 'migrating',
        });

        try {
          // 迁移项目数据
          await this.migrateProject(project, onProgress);
          syncedCount++;
        } catch (err: any) {
          console.error('Migration error for project', project.id, err);
          errors.push({
            projectId: project.id,
            error: err?.message || '迁移失败',
          });
        }
      }

      // 3. 迁移完成
      onProgress?.({
        total: totalProjects,
        current: totalProjects,
        status: 'completed',
      });

      return {
        success: errors.length === 0,
        syncedCount,
        skippedCount,
        errors,
      };
    } catch (error: any) {
      console.error('Migration error:', error);
      onProgress?.({
        total: 0,
        current: 0,
        status: 'error',
        error: error.message || '迁移失败',
      });

      return {
        success: false,
        syncedCount: 0,
        skippedCount: 0,
        errors: [{ projectId: 'unknown', error: error.message || '迁移失败' }],
        error: error.message || '迁移失败',
      };
    }
  }

  /**
   * 迁移单个项目
   */
  private async migrateProject(
    project: Project,
    onProgress?: MigrationCallback
  ): Promise<void> {
    // 1. 上传文件（将 Data URL 转换为云端 URL）
    const updatedProject = await this.uploadProjectFiles(project, onProgress);

    // 2. 保存到 Supabase（使用统一数据服务）
    // 注意：这会自动使用 Supabase 后端，因为用户已登录
    await dataService.saveProject(updatedProject);
  }

  /**
   * 上传项目中的所有文件
   */
  private async uploadProjectFiles(
    project: Project,
    onProgress?: MigrationCallback
  ): Promise<Project> {
    const updatedProject = { ...project };

    onProgress?.({
      total: 0,
      current: 0,
      currentProject: project.metadata.title,
      status: 'uploading_files',
    });

    // 1. 上传角色参考图
    for (let i = 0; i < updatedProject.characters.length; i++) {
      const character = updatedProject.characters[i];
      const uploadedImages: string[] = [];

      for (const imageUrl of character.referenceImages) {
        if (storageService.isDataURL(imageUrl)) {
          const blob = await storageService.urlToBlob(imageUrl);
          const file = new File([blob], `character_${character.id}.png`, {
            type: blob.type,
          });
          const result = await storageService.uploadFile(
            file,
            `projects/${project.id}/characters`
          );
          uploadedImages.push(result.url);
        } else {
          uploadedImages.push(imageUrl);
        }
      }

      updatedProject.characters[i].referenceImages = uploadedImages;
    }

    // 2. 上传镜头图片和视频
    for (let i = 0; i < updatedProject.shots.length; i++) {
      const shot = updatedProject.shots[i];

      // 参考图
      if (shot.referenceImage && storageService.isDataURL(shot.referenceImage)) {
        const blob = await storageService.urlToBlob(shot.referenceImage);
        const file = new File([blob], `shot_${shot.id}_ref.png`, {
          type: blob.type,
        });
        const result = await storageService.uploadFile(
          file,
          `projects/${project.id}/shots`
        );
        updatedProject.shots[i].referenceImage = result.url;
      }

      // Grid 图片
      if (shot.gridImages) {
        const uploadedGridImages: string[] = [];
        for (const gridUrl of shot.gridImages) {
          if (storageService.isDataURL(gridUrl)) {
            const blob = await storageService.urlToBlob(gridUrl);
            const file = new File([blob], `shot_${shot.id}_grid.png`, {
              type: blob.type,
            });
            const result = await storageService.uploadFile(
              file,
              `projects/${project.id}/grids`
            );
            uploadedGridImages.push(result.url);
          } else {
            uploadedGridImages.push(gridUrl);
          }
        }
        updatedProject.shots[i].gridImages = uploadedGridImages;
      }

      // 视频片段
      if (shot.videoClip && storageService.isDataURL(shot.videoClip)) {
        const blob = await storageService.urlToBlob(shot.videoClip);
        const file = new File([blob], `shot_${shot.id}_video.mp4`, {
          type: blob.type,
        });
        const result = await storageService.uploadFile(
          file,
          `projects/${project.id}/videos`
        );
        updatedProject.shots[i].videoClip = result.url;
      }
    }

    // 3. 上传音频资源
    for (let i = 0; i < updatedProject.audioAssets.length; i++) {
      const audio = updatedProject.audioAssets[i];

      if (storageService.isDataURL(audio.url)) {
        const blob = await storageService.urlToBlob(audio.url);
        const file = new File([blob], `audio_${audio.id}.mp3`, {
          type: blob.type,
        });
        const result = await storageService.uploadFile(
          file,
          `projects/${project.id}/audio`
        );
        updatedProject.audioAssets[i].url = result.url;
      }
    }

    return updatedProject;
  }

  /**
   * 清除本地数据（迁移后可选）
   */
  async clearLocalData(projectId?: string): Promise<void> {
    if (projectId) {
      await indexedDB.deleteProject(projectId);
    } else {
      // 清除所有本地项目
      const projects = await indexedDB.getAllProjects();
      for (const project of projects) {
        await indexedDB.deleteProject(project.id);
      }
    }
  }

  /**
   * 检查项目是否已在云端
   */
  async isProjectInCloud(projectId: string): Promise<boolean> {
    try {
      // 强制使用 Supabase 后端检查
      const cloudProjects = await dataService.getAllProjects();
      return cloudProjects.some((p) => p.id === projectId);
    } catch (error) {
      return false;
    }
  }
}

export const migrationService = new MigrationService();
