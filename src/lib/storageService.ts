/**
 * 文件存储服务
 *
 * 支持三种存储方式：
 * 1. Cloudflare R2（推荐，图片/视频/音频，成本低，无流量费）
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
  private cachedUserId: string | null = null;
  private cachedUserPromise: Promise<string | null> | null = null;
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
   * - 强制所有文件使用 Cloudflare R2（成本低，无流量费，全球CDN）
   */
  private shouldUseR2(file: File): boolean {
    // 强制使用 R2
    return true;
  }

  /**
   * 上传文件（智能选择存储方式）
   * @param file 文件对象
   * @param folder 文件夹路径（例如: 'projects/xxx/images'）
   * @returns 文件 URL
   */
  async uploadFile(file: File, folder: string, userId?: string): Promise<UploadResult> {
    // 如果提供了 userId，直接使用；否则尝试获取当前用户
    const user = userId ? { id: userId } : await getCurrentUser();

    if (!user) {
      console.warn('[storageService] 用户未登录且未提供 userId，降级为 Data URL');
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
    const MAX_RETRIES = 3;
    let lastError: any;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        // console.log(`[storageService] 尝试上传到 R2 (第 ${i + 1}/${MAX_RETRIES} 次)...`);
        // 添加超时保护，避免长时间阻塞
        // 默认 120秒 (120000ms) 以支持大文件/4k图片上传
        const UPLOAD_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_UPLOAD_TIMEOUT_MS) || 120000;

        // 注意：每次重试都需要新的 promise，因为 r2Service.uploadFile 可能会被之前的 timeout reject 影响（取决于具体实现，但通常重新调用是安全的）
        const uploadPromise = r2Service.uploadFile(file, folder, userId);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`R2 upload timeout (${UPLOAD_TIMEOUT_MS}ms)`)), UPLOAD_TIMEOUT_MS)
        );

        const result = await Promise.race([uploadPromise, timeoutPromise]);
        // console.log('[storageService] ✅ R2 上传成功');
        return {
          url: result.url,
          path: result.key,
        };
      } catch (error: any) {
        console.warn(`[storageService] ⚠️ R2 上传失败 (第 ${i + 1} 次):`, error.message);
        lastError = error;
        // 等待 1s 后重试
        if (i < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    console.error('[storageService] ❌ R2 上传最终失败，回退到 Supabase:', lastError);
    // 如果 R2 失败，回退到 Supabase
    return await this.uploadToSupabase(file, folder, userId);
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
      .from('video-agent-media')
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
    } = supabase.storage.from('video-agent-media').getPublicUrl(data.path);

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
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/video-agent-media\/(.+)/);

        if (pathMatch && pathMatch[1]) {
          const filePath = pathMatch[1];
          const { error } = await supabase.storage.from('video-agent-media').remove([filePath]);

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
   * 将 base64 字符串转换为 File 对象
   */
  private base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
  }

  /**
   * 上传 base64 图片到 R2
   * @param base64 base64 图片数据
   * @param folder 文件夹路径
   * @param filename 文件名（可选，默认使用时间戳）
   * @param userId 用户ID（可选，避免重复调用 getCurrentUser）
   * @returns R2 URL，失败时抛出异常（不再回退到 base64）
   */
  async uploadBase64ToR2(
    base64: string,
    folder: string,
    filename?: string,
    userId?: string
  ): Promise<string> {
    // console.log('[storageService] uploadBase64ToR2 开始...');
    // console.log('[storageService] base64 长度:', base64.length);
    // console.log('[storageService] filename:', filename);
    // console.log('[storageService] userId 参数:', userId ? '已提供' : '未提供');

    try {
      // 如果未提供 userId，优先使用缓存，避免并发重复调用 getCurrentUser
      if (!userId) {
        if (this.cachedUserId) {
          userId = this.cachedUserId;
        } else {
          if (!this.cachedUserPromise) {
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('getCurrentUser 超时（15秒）')), 15000)
            );
            this.cachedUserPromise = Promise.race([getCurrentUser(), timeoutPromise])
              .then(u => {
                this.cachedUserId = u?.id || null;
                return this.cachedUserId;
              })
              .catch(err => {
                this.cachedUserId = null;
                this.cachedUserPromise = null;
                throw err;
              });
          }
          const resolvedId = await this.cachedUserPromise;
          if (!resolvedId) {
            throw new Error('用户未登录，无法上传到 R2');
          }
          userId = resolvedId;
        }
      }

      // console.log('[storageService] 开始转换 base64 为 File 对象...');
      // 转换为 File 对象
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const finalFilename = filename || `grid_${timestamp}_${randomStr}.png`;
      // console.log('[storageService] finalFilename:', finalFilename);

      const file = this.base64ToFile(base64, finalFilename);
      // console.log('[storageService] ✅ File 对象创建完成，大小:', file.size, 'bytes');

      // console.log('[storageService] 开始调用 uploadToR2...');
      // 上传到 R2
      const result = await this.uploadToR2(file, folder, userId);
      // console.log('[storageService] ✅ uploadToR2 完成，URL:', result.url.substring(0, 50) + '...');
      return result.url;
    } catch (error: any) {
      console.error('[storageService] ❌ Upload base64 to R2 failed:', error.message);
      // ⚠️ 不再回退到 base64，而是抛出异常
      throw error;
    }
  }

  /**
   * 批量上传 base64 图片到 R2
   * @param base64Array base64 图片数组
   * @param folder 文件夹路径
   * @param userId 用户ID（可选，避免重复调用 getCurrentUser）
   */
  async uploadBase64ArrayToR2(
    base64Array: string[],
    folder: string,
    userId?: string
  ): Promise<string[]> {
    const results = await Promise.all(
      base64Array.map((base64, index) =>
        this.uploadBase64ToR2(base64, folder, `slice_${index}.png`, userId)
      )
    );
    return results;
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
    return !!r2Domain && url.startsWith(r2Domain);
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
