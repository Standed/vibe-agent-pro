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
   * 通过 API Route 代理上传（保护 R2 凭证安全）
   */
  async uploadFile(
    file: File,
    folder: string,
    userId: string
  ): Promise<R2UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    formData.append('userId', userId);

    const response = await authenticatedFetch('/api/upload-r2', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`R2 上传失败: ${error}`);
    }

    const result = await response.json();
    return result;
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
