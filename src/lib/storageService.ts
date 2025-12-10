/**
 * 文件存储服务
 *
 * 支持三种存储方式：
 * 1. Cloudflare R2（推荐，图片/视频，成本低，无流量费）
 * 2. Supabase Storage（备选，小文件）
 * 3. Base64 Data URL（本地存储，用于 IndexedDB）
 */

import { supabase } from './supabase/client';
import { getCurrentUser } from './supabase/auth';
import { r2Service } from './cloudflare-r2';

export type StorageType = 'r2' | 'supabase' | 'local';
export type FileCategory = 'image' | 'video' | 'audio' | 'other';

interface UploadResult {
  url: string;
  path?: string;
}

class StorageService {
  /**
   * 根据文件类型判断文件分类
   */
  private getFileCategory(file: File): FileCategory {
    const mimeType = file.type;

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';

    return 'other';
  }

  /**
   * 选择最优存储方式
   * - 所有媒体文件（图片/视频/音频）: Cloudflare R2（成本低，无流量费，全球CDN）
   * - 其他文件: Supabase Storage（备用）
   */
  private shouldUseR2(file: File): boolean {
    const category = this.getFileCategory(file);

    // 所有媒体文件都用 R2（成本最优，性能最好）
    return category === 'image' || category === 'video' || category === 'audio';
  }

  /**
   * 上传文件（智能选择存储方式）
   * @param file 文件对象
   * @param folder 文件夹路径（例如: 'projects/xxx/images'）
   * @returns 文件 URL
   */
  async uploadFile(file: File, folder: string): Promise<UploadResult> {
    const user = await getCurrentUser();

    if (!user) {
      // 未登录：转换为 Base64 Data URL
      return await this.convertToDataURL(file);
    }

    // 已登录：根据文件类型选择存储方式
    if (this.shouldUseR2(file)) {
      // 图片/视频 → Cloudflare R2
      return await this.uploadToR2(file, folder, user.id);
    } else {
      // 音频/其他 → Supabase Storage
      return await this.uploadToSupabase(file, folder, user.id);
    }
  }

  /**
   * 上传到 Cloudflare R2
   */
  private async uploadToR2(
    file: File,
    folder: string,
    userId: string
  ): Promise<UploadResult> {
    try {
      const result = await r2Service.uploadFile(file, folder, userId);
      return {
        url: result.url,
        path: result.key,
      };
    } catch (error: any) {
      console.error('R2 upload failed, fallback to Supabase:', error);
      // 如果 R2 失败，回退到 Supabase
      return await this.uploadToSupabase(file, folder, userId);
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

    // 如果是 R2 URL，从 R2 删除
    if (this.isR2URL(url)) {
      try {
        const urlObj = new URL(url);
        const key = urlObj.pathname.substring(1); // 移除开头的 /
        await r2Service.deleteFile(key);
      } catch (error) {
        console.error('Failed to delete R2 file:', error);
      }
      return;
    }

    // 如果是 Supabase URL，从 Storage 删除
    if (url.includes('supabase.co/storage')) {
      try {
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
   * 检查是否为 R2 URL
   */
  isR2URL(url: string): boolean {
    const r2Domain = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
    return r2Domain && url.startsWith(r2Domain);
  }

  /**
   * 获取当前存储类型
   */
  async getStorageType(): Promise<StorageType> {
    const user = await getCurrentUser();
    return user ? 'r2' : 'local';
  }

  /**
   * 获取存储统计信息
   */
  getStorageInfo() {
    return {
      r2: {
        name: 'Cloudflare R2',
        costPerGB: '$0.015/月',
        egress: '免费',
        useCase: '图片、视频',
      },
      supabase: {
        name: 'Supabase Storage',
        costPerGB: '包含在套餐中',
        egress: '有限制',
        useCase: '音频、小文件',
      },
      local: {
        name: '本地存储',
        cost: '免费',
        useCase: '游客模式',
      },
    };
  }
}

export const storageService = new StorageService();
