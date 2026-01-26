/**
 * Cloudflare R2 存储服务
 *
 * 用于存储图片和音频、视频文件（成本更低，无出站流量费用）
 */

import { authenticatedFetch } from './api-client';

export interface R2UploadResult {
  url: string;
  key: string;
  bucket: string;
}

export type R2ServerUploadOptions = {
  buffer: Buffer;
  key: string;
  contentType: string;
  cacheControl?: string;
};

class CloudflareR2Service {
  private endpoint: string;
  private publicUrl: string;

  constructor() {
    this.endpoint = process.env.NEXT_PUBLIC_R2_ENDPOINT || '';
    this.publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
  }

  /**
   * 上传文件到 Cloudflare R2
   * 采用预签名 URL 直传模式 (Presigned URL)
   * 1. 请求后端获取 PUT 授权地址
   * 2. 前端直接 PUT 文件到 R2 (绕过 Vercel 4.5MB 限制)
   */
  async uploadFile(
    file: File,
    folder: string,
    userId: string
  ): Promise<R2UploadResult> {
    // 1. 获取预签名 URL
    const presignRes = await authenticatedFetch('/api/upload-r2?mode=presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        folder: folder
      }),
    });

    if (!presignRes.ok) {
      const error = await presignRes.text();
      // 尝试降级到旧的 FormData 上传 (作为 fallback)
      if (presignRes.status === 404 || error.includes('mode')) {
        console.warn('Presigned API not supported, falling back to FormData upload...');
        return this.uploadFileFallback(file, folder, userId);
      }
      throw new Error(`获取上传授权失败: ${error}`);
    }

    const { uploadUrl, publicUrl, key } = await presignRes.json();

    // 2. 直传文件到 R2
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (!uploadRes.ok) {
      throw new Error(`R2 直传失败: ${uploadRes.statusText}`);
    }

    return {
      url: publicUrl,
      key: key,
      bucket: '', // bucket name not exposed in client usually
    };
  }

  /**
   * 旧的 FormData 上传方式 (Fallback)
   */
  private async uploadFileFallback(
    file: File,
    folder: string,
    userId: string
  ): Promise<R2UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    // 注意: 这里不需要 userId, 后端会从 token 提取 (auth-middleware)
    // 但旧接口似乎接收 userId 参数? 检查一下服务端代码 -> 服务端从 authResult 获取 user.id, 同时也检查 FormData 里的 folder
    // 为了兼容性，保持原样

    const response = await authenticatedFetch('/api/upload-r2', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`R2 上传失败 (Fallback): ${error}`);
    }

    return response.json();
  }

  /**
   * 批量上传文件
   */
  async uploadFiles(
    files: File[],
    folder: string,
    userId: string
  ): Promise<R2UploadResult[]> {
    const results = await Promise.all(
      files.map((file) => this.uploadFile(file, folder, userId))
    );
    return results;
  }

  /**
   * 删除文件
   */
  async deleteFile(key: string): Promise<void> {
    const response = await authenticatedFetch('/api/upload-r2', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`R2 删除失败: ${error}`);
    }
  }

  /**
   * 获取文件公开 URL
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  /**
   * 上传临时文件到 Cloudflare R2 (temp/ 目录，1天后自动删除)
   * 用于上传大参考图，避免请求载荷过大
   */
  async uploadTempFile(
    file: File,
    userId: string
  ): Promise<R2UploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await authenticatedFetch('/api/upload-temp-r2', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`R2 临时上传失败: ${error}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * 上传 base64 图片为临时文件
   */
  async uploadTempBase64(
    base64Data: string,
    userId: string,
    filename?: string
  ): Promise<string> {
    // 转换 base64 为 File
    let mime = 'image/png';
    let bstr = '';

    if (base64Data.includes(',')) {
      const arr = base64Data.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (mimeMatch) {
        mime = mimeMatch[1];
      }
      bstr = atob(arr[1]);
    } else {
      bstr = atob(base64Data);
    }

    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    const finalFilename = filename || `temp_${Date.now()}.png`;
    const file = new File([u8arr], finalFilename, { type: mime });

    const result = await this.uploadTempFile(file, userId);
    return result.url;
  }
}

export const r2Service = new CloudflareR2Service();

export const uploadBufferToR2 = async (options: R2ServerUploadOptions): Promise<string> => {
  if (typeof window !== 'undefined') {
    throw new Error('uploadBufferToR2 is server-only');
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!bucket || !publicUrl || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 server configuration');
  }

  const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const normalizedKey = options.key.replace(/^\/+/, '');

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: options.buffer,
      ContentType: options.contentType,
      CacheControl: options.cacheControl || 'public, max-age=31536000',
    })
  );

  return `${publicUrl}/${normalizedKey}`;
};
