import { uploadBufferToR2 } from '@/lib/cloudflare-r2';
import { buildR2Folder, buildR2Key, type R2PathContext } from '@/lib/r2-path';

export type VideoTransferTask = {
  id: string;
  user_id?: string | null;
  project_id?: string | null;
  scene_id?: string | null;
  shot_id?: string | null;
  provider?: string | null;
  model?: string | null;
};

export async function transferVideoToR2(params: {
  providerUrl: string;
  task: VideoTransferTask;
  model?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<{ r2Url: string; key: string }> {
  const { providerUrl, task, model, maxRetries = 3, retryDelayMs = 1500 } = params;

  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt++) {
    try {
      const response = await fetch(providerUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const resolvedModel = model || task.provider || task.model || 'video';

      const context: R2PathContext = {
        projectId: task.project_id || undefined,
        scope: task.shot_id ? 'shots' : task.scene_id ? 'scenes' : 'project',
        entityId: task.shot_id || task.scene_id || task.project_id || undefined,
        assetType: 'video',
        model: resolvedModel,
      };

      const folder = buildR2Folder(context, 'generated');
      const key = buildR2Key({
        userId: task.user_id || 'anonymous',
        folder,
        ext: 'mp4',
        prefix: resolvedModel,
      });

      const r2Url = await uploadBufferToR2({
        buffer,
        key,
        contentType: 'video/mp4',
      });

      return { r2Url, key };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to transfer video to R2');
}
