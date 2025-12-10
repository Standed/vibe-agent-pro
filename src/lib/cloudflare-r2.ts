/**
 * Cloudflare R2 存储服务
 *
 * 用于存储图片和音频、视频文件（成本更低，无出站流量费用）
 */

export interface R2UploadResult {
  url: string;
  key: string;
  bucket: string;
}

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

    const response = await fetch('/api/upload-r2', {
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
    const response = await fetch('/api/upload-r2', {
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
