/**
 * 文件存储服务
 *
 * 支持两种存储方式：
 * 1. Supabase Storage（云端存储）
 * 2. Base64 Data URL（本地存储，用于 IndexedDB）
 */

import { supabase } from './supabase/client';
import { getCurrentUser } from './supabase/auth';

export type StorageType = 'supabase' | 'local';

interface UploadResult {
  url: string;
  path?: string;
}

class StorageService {
  /**
   * 上传文件
   * @param file 文件对象
   * @param folder 文件夹路径（例如: 'projects/xxx/images'）
   * @returns 文件 URL
   */
  async uploadFile(file: File, folder: string): Promise<UploadResult> {
    const user = await getCurrentUser();

    if (user) {
      // 已登录：上传到 Supabase Storage
      return await this.uploadToSupabase(file, folder, user.id);
    } else {
      // 未登录：转换为 Base64 Data URL
      return await this.convertToDataURL(file);
    }
  }

  /**
   * 上传图片到 Supabase Storage
   */
  private async uploadToSupabase(
    file: File,
    folder: string,
    userId: string
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const filePath = `${userId}/${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error('文件上传失败: ' + error.message);
    }

    // 获取公开 URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('media').getPublicUrl(data.path);

    return {
      url: publicUrl,
      path: data.path,
    };
  }

  /**
   * 转换为 Base64 Data URL（本地存储）
   */
  private async convertToDataURL(file: File): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({ url: dataUrl });
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * 删除文件
   * @param url 文件 URL 或路径
   */
  async deleteFile(url: string): Promise<void> {
    // 如果是 Data URL，无需删除（存在内存/IndexedDB）
    if (url.startsWith('data:')) {
      return;
    }

    // 如果是 Supabase URL，从 Storage 删除
    if (url.includes('supabase.co/storage')) {
      try {
        // 从 URL 提取文件路径
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)/);

        if (pathMatch && pathMatch[1]) {
          const filePath = pathMatch[1];
          const { error } = await supabase.storage.from('media').remove([filePath]);

          if (error) {
            console.error('Delete error:', error);
          }
        }
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
  }

  /**
   * 批量上传文件
   */
  async uploadFiles(files: File[], folder: string): Promise<UploadResult[]> {
    const results = await Promise.all(
      files.map((file) => this.uploadFile(file, folder))
    );
    return results;
  }

  /**
   * 从 URL 或 Data URL 转换为 Blob
   */
  async urlToBlob(url: string): Promise<Blob> {
    if (url.startsWith('data:')) {
      // Data URL to Blob
      const response = await fetch(url);
      return await response.blob();
    } else {
      // HTTP URL to Blob
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch file');
      }
      return await response.blob();
    }
  }

  /**
   * 检查是否为本地 Data URL
   */
  isDataURL(url: string): boolean {
    return url.startsWith('data:');
  }

  /**
   * 检查是否为 Supabase URL
   */
  isSupabaseURL(url: string): boolean {
    return url.includes('supabase.co/storage');
  }

  /**
   * 获取当前存储类型
   */
  async getStorageType(): Promise<StorageType> {
    const user = await getCurrentUser();
    return user ? 'supabase' : 'local';
  }
}

export const storageService = new StorageService();
