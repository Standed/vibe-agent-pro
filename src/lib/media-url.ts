import { storageService } from '@/lib/storageService';
import { inferExtFromMime, type R2PathContext } from '@/lib/r2-path';

const R2_HOST_HINTS = ['r2.dev', 'r2.cloudflarestorage.com'];

const toUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    if (typeof window === 'undefined') return null;
    try {
      return new URL(raw, window.location.origin);
    } catch {
      return null;
    }
  }
};

export const isPersistentMediaUrl = (url: string): boolean => {
  if (!url) return false;
  const value = url.trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return false;

  const r2PublicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').trim();
  if (r2PublicUrl && value.startsWith(r2PublicUrl)) return true;

  const parsed = toUrl(value);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return R2_HOST_HINTS.some((hint) => host.includes(hint));
};

const fetchBlobWithFallback = async (url: string): Promise<Blob> => {
  const candidates = [url];
  if (/^https?:\/\//i.test(url)) {
    candidates.push(`/api/proxy-image?url=${encodeURIComponent(url)}`);
  }

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        throw new Error(`fetch failed (${response.status})`);
      }
      return await response.blob();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('failed to fetch media');
};

export const ensurePersistedImageUrl = async (params: {
  url: string;
  userId: string;
  folder: R2PathContext;
  filenamePrefix?: string;
}): Promise<string> => {
  const { url, userId, folder, filenamePrefix = 'reference' } = params;
  if (!url) throw new Error('empty url');
  if (!userId) throw new Error('missing user id');

  if (isPersistentMediaUrl(url)) return url;

  const blob = await fetchBlobWithFallback(url);
  const mimeType = blob.type || 'image/png';
  const ext = inferExtFromMime(mimeType);
  const file = new File([blob], `${filenamePrefix}_${Date.now()}.${ext}`, { type: mimeType });
  const uploaded = await storageService.uploadFile(file, folder, userId);
  return uploaded.url;
};
