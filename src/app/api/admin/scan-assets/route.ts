import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';
import type { Database } from '@/lib/supabase/database.types';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';
import { assetLogService } from '@/lib/assetLogService';
import { buildR2Folder, buildR2Key, inferExtFromMime } from '@/lib/r2-path';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
const isR2Url = (url?: string) => !!url && !!R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL);

const normalizeUrl = (url: string): { url: string; protocolFixed: boolean } => {
  if (url.startsWith('//')) return { url: `https:${url}`, protocolFixed: true };
  if (url.startsWith('pub-') || url.startsWith('r2.dev') || url.startsWith('r2.cloudflarestorage.com')) {
    return { url: `https://${url}`, protocolFixed: true };
  }
  return { url, protocolFixed: false };
};

const parseDataUrl = (dataUrl: string): { buffer: Buffer; contentType: string } => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { buffer, contentType };
};

const fetchBufferWithTimeout = async (url: string, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
};

const rescueUrl = async (
  url: string,
  context: { userId: string; uploadContext?: any },
  stats: any,
  info?: { table: string; id: string; field: string }
): Promise<{ url: string; changed: boolean }> => {
  if (!url) return { url, changed: false };

  const { url: normalizedUrl, protocolFixed } = normalizeUrl(url);
  if (protocolFixed) stats.recovered_protocol++;

  if (isR2Url(normalizedUrl)) {
    stats.skipped++;
    return { url: normalizedUrl, changed: protocolFixed };
  }

  try {
    let buffer: Buffer;
    let contentType = 'image/png';

    if (normalizedUrl.startsWith('data:')) {
      const parsed = parseDataUrl(normalizedUrl);
      buffer = parsed.buffer;
      contentType = parsed.contentType;
      stats.recovered_base64++;
    } else {
      const fetched = await fetchBufferWithTimeout(normalizedUrl);
      buffer = fetched.buffer;
      contentType = fetched.contentType;
      stats.recovered_external++;
    }

    const folder = buildR2Folder(context.uploadContext, 'legacy');
    const key = buildR2Key({
      userId: context.userId,
      folder,
      ext: inferExtFromMime(contentType),
      prefix: 'rescued'
    });

    const r2Url = await uploadBufferToR2({
      buffer,
      key,
      contentType
    });

    return { url: r2Url, changed: true };
  } catch (err: any) {
    stats.lost_external++;
    if (stats.lost_items && info) {
      if (stats.lost_items.length < stats.lost_items_limit) {
        stats.lost_items.push({
          ...info,
          url,
          error: err?.message || 'unknown'
        });
      }
    }
    return { url: normalizedUrl, changed: protocolFixed };
  }
};

const requireAdminOrCron = async (req: NextRequest) => {
  const mode = req.nextUrl.searchParams.get('mode');
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: true, mode: 'cron' as const };
  }
  if (mode === 'cron' && !process.env.CRON_SECRET) {
    return { ok: true, mode: 'cron' as const };
  }

  const authResult = await authenticateRequest(req);
  if ('error' in authResult) {
    return { ok: false, response: authResult.error };
  }

  if (authResult.user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true, mode: 'admin' as const };
};

export async function GET(req: NextRequest) {
  const access = await requireAdminOrCron(req);
  if (!access.ok) return access.response!;

  const search = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(search.get('limit') || 200), 1), 1000);
  const retryAfterMinutes = Math.min(Math.max(Number(search.get('retryAfterMinutes') || 10), 1), 1440);
  const lostItemsLimit = Math.min(Math.max(Number(search.get('lostLimit') || 500), 1), 5000);

  const output = {
    scanned: 0,
    recovered_protocol: 0,
    recovered_external: 0,
    recovered_base64: 0,
    lost_external: 0,
    skipped: 0,
    updated_records: 0,
    errors: [] as string[],
    lost_items_limit: lostItemsLimit,
    lost_items: [] as Array<{ table: string; id: string; field: string; url: string; error?: string }>
  };

  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, metadata')
      .limit(limit);

    const projectUserMap = new Map<string, string>();
    projects?.forEach((p: any) => {
      if (p?.id && p?.user_id) projectUserMap.set(p.id, p.user_id);
    });

    const { data: scenes } = await supabaseAdmin
      .from('scenes')
      .select('id, project_id, grid_history, saved_grid_slices')
      .limit(limit);

    const sceneProjectMap = new Map<string, string>();
    scenes?.forEach((s: any) => {
      if (s?.id && s?.project_id) sceneProjectMap.set(s.id, s.project_id);
    });

    const { data: shots } = await supabaseAdmin
      .from('shots')
      .select('id, scene_id, reference_image, grid_images, generation_history')
      .limit(limit);

    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, project_id, reference_images')
      .limit(limit);

    const { data: chatMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('id, project_id, scene_id, shot_id, content, metadata')
      .order('created_at', { ascending: false })
      .limit(limit);

    const updateIfChanged = async (table: string, id: string, updates: Record<string, any>) => {
      output.updated_records++;
      await supabaseAdmin.from(table).update(updates).eq('id', id);
    };

    if (shots) {
      for (const shot of shots) {
        const projectId = sceneProjectMap.get(shot.scene_id) || '';
        const userId = projectUserMap.get(projectId) || 'system_rescue';
        const uploadContext = {
          projectId,
          scope: 'shots',
          entityId: shot.id,
          assetType: 'image',
          model: 'rescue'
        };

        let changed = false;
        let referenceImage = shot.reference_image as string | null;
        if (referenceImage) {
          output.scanned++;
          const rescue = await rescueUrl(referenceImage, { userId, uploadContext }, output, {
            table: 'shots',
            id: shot.id,
            field: 'reference_image'
          });
          referenceImage = rescue.url;
          changed = changed || rescue.changed;
        }

        let gridImages = Array.isArray(shot.grid_images) ? shot.grid_images : [];
        if (gridImages.length > 0) {
          const nextGridImages = [];
          for (const url of gridImages) {
            if (!url) continue;
            output.scanned++;
            const rescue = await rescueUrl(url, { userId, uploadContext: { ...uploadContext, assetType: 'grid' } }, output, {
              table: 'shots',
              id: shot.id,
              field: 'grid_images'
            });
            nextGridImages.push(rescue.url);
            changed = changed || rescue.changed;
          }
          gridImages = nextGridImages;
        }

        let generationHistory = Array.isArray(shot.generation_history) ? shot.generation_history : [];
        if (generationHistory.length > 0) {
          const nextHistory = [];
          for (const item of generationHistory) {
            if (!item) continue;
            let nextItem = { ...item };
            if (typeof item.result === 'string') {
              output.scanned++;
              const rescue = await rescueUrl(item.result, { userId, uploadContext }, output, {
                table: 'shots',
                id: shot.id,
                field: 'generation_history.result'
              });
              nextItem.result = rescue.url;
              changed = changed || rescue.changed;
            }
            if (Array.isArray(item.images)) {
              const nextImages = [];
              for (const img of item.images) {
                if (!img) continue;
                output.scanned++;
                const rescue = await rescueUrl(img, { userId, uploadContext }, output, {
                  table: 'shots',
                  id: shot.id,
                  field: 'generation_history.images'
                });
                nextImages.push(rescue.url);
                changed = changed || rescue.changed;
              }
              nextItem.images = nextImages;
            }
            nextHistory.push(nextItem);
          }
          generationHistory = nextHistory;
        }

        if (changed) {
          await updateIfChanged('shots', shot.id, {
            reference_image: referenceImage || null,
            grid_images: gridImages,
            generation_history: generationHistory
          });
        }
      }
    }

    if (scenes) {
      for (const scene of scenes) {
        const projectId = scene.project_id || '';
        const userId = projectUserMap.get(projectId) || 'system_rescue';
        const uploadContext = {
          projectId,
          scope: 'scenes',
          entityId: scene.id,
          assetType: 'grid',
          model: 'rescue'
        };

        let changed = false;
        let gridHistory = Array.isArray(scene.grid_history) ? scene.grid_history : [];
        if (gridHistory.length > 0) {
          const nextGridHistory = [];
          for (const item of gridHistory) {
            if (!item) continue;
            const nextItem = { ...item };
            if (typeof item.fullGridUrl === 'string') {
              output.scanned++;
              const rescue = await rescueUrl(item.fullGridUrl, { userId, uploadContext }, output, {
                table: 'scenes',
                id: scene.id,
                field: 'grid_history.fullGridUrl'
              });
              nextItem.fullGridUrl = rescue.url;
              changed = changed || rescue.changed;
            }
            if (typeof item.fullImage === 'string') {
              output.scanned++;
              const rescue = await rescueUrl(item.fullImage, { userId, uploadContext }, output, {
                table: 'scenes',
                id: scene.id,
                field: 'grid_history.fullImage'
              });
              nextItem.fullImage = rescue.url;
              changed = changed || rescue.changed;
            }
            if (Array.isArray(item.slices)) {
              const nextSlices = [];
              for (const slice of item.slices) {
                output.scanned++;
                const rescue = await rescueUrl(slice, { userId, uploadContext: { ...uploadContext, assetType: 'slice' } }, output, {
                  table: 'scenes',
                  id: scene.id,
                  field: 'grid_history.slices'
                });
                nextSlices.push(rescue.url);
                changed = changed || rescue.changed;
              }
              nextItem.slices = nextSlices;
            }
            nextGridHistory.push(nextItem);
          }
          gridHistory = nextGridHistory;
        }

        let savedGridSlices = Array.isArray(scene.saved_grid_slices) ? scene.saved_grid_slices : [];
        if (savedGridSlices.length > 0) {
          const nextSlices = [];
          for (const slice of savedGridSlices) {
            output.scanned++;
            const rescue = await rescueUrl(slice, { userId, uploadContext: { ...uploadContext, assetType: 'slice' } }, output, {
              table: 'scenes',
              id: scene.id,
              field: 'saved_grid_slices'
            });
            nextSlices.push(rescue.url);
            changed = changed || rescue.changed;
          }
          savedGridSlices = nextSlices;
        }

        if (changed) {
          await updateIfChanged('scenes', scene.id, {
            grid_history: gridHistory,
            saved_grid_slices: savedGridSlices
          });
        }
      }
    }

    if (characters) {
      for (const character of characters) {
        const projectId = character.project_id || '';
        const userId = projectUserMap.get(projectId) || 'system_rescue';
        const uploadContext = {
          projectId,
          scope: 'characters',
          entityId: character.id,
          assetType: 'reference',
          model: 'rescue'
        };

        if (Array.isArray(character.reference_images) && character.reference_images.length > 0) {
          let changed = false;
          const nextRefs = [];
          for (const url of character.reference_images) {
            if (!url) continue;
            output.scanned++;
            const rescue = await rescueUrl(url, { userId, uploadContext }, output, {
              table: 'characters',
              id: character.id,
              field: 'reference_images'
            });
            nextRefs.push(rescue.url);
            changed = changed || rescue.changed;
          }
          if (changed) {
            await updateIfChanged('characters', character.id, { reference_images: nextRefs });
          }
        }
      }
    }

    if (projects) {
      for (const project of projects) {
        const userId = project.user_id || 'system_rescue';
        let changed = false;
        const metadata = project.metadata || {};

        if (metadata.coverImage && typeof metadata.coverImage === 'string') {
          output.scanned++;
          const rescue = await rescueUrl(metadata.coverImage, { userId, uploadContext: { projectId: project.id, scope: 'project', entityId: project.id, assetType: 'cover', model: 'rescue' } }, output, {
            table: 'projects',
            id: project.id,
            field: 'metadata.coverImage'
          });
          metadata.coverImage = rescue.url;
          changed = changed || rescue.changed;
        }

        if (Array.isArray(metadata.locations)) {
          const nextLocations = [];
          for (const loc of metadata.locations) {
            if (!loc) continue;
            const nextLoc = { ...loc };
            if (Array.isArray(loc.referenceImages)) {
              const nextRefs = [];
              for (const url of loc.referenceImages) {
                output.scanned++;
                const rescue = await rescueUrl(url, { userId, uploadContext: { projectId: project.id, scope: 'locations', entityId: loc.id || 'location', assetType: 'reference', model: 'rescue' } }, output, {
                  table: 'projects',
                  id: project.id,
                  field: 'metadata.locations.referenceImages'
                });
                nextRefs.push(rescue.url);
                changed = changed || rescue.changed;
              }
              nextLoc.referenceImages = nextRefs;
            }
            nextLocations.push(nextLoc);
          }
          metadata.locations = nextLocations;
        }

        if (changed) {
          await updateIfChanged('projects', project.id, { metadata });
        }
      }
    }

    if (chatMessages) {
      const markdownRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
      for (const msg of chatMessages) {
        const userId = projectUserMap.get(msg.project_id) || 'system_rescue';
        const uploadContext = {
          projectId: msg.project_id || '',
          scope: msg.shot_id ? 'shots' : msg.scene_id ? 'scenes' : 'project',
          entityId: msg.shot_id || msg.scene_id || msg.project_id || 'chat',
          assetType: 'image',
          model: 'rescue'
        };

        let changed = false;
        let nextContent = msg.content as string;
        const matches = Array.from(nextContent.matchAll(markdownRegex));
        for (const match of matches) {
          const url = match[1];
          output.scanned++;
          const rescue = await rescueUrl(url, { userId, uploadContext }, output, {
            table: 'chat_messages',
            id: msg.id,
            field: 'content'
          });
          if (rescue.changed && rescue.url !== url) {
            nextContent = nextContent.replace(url, rescue.url);
            changed = true;
          }
        }

        let nextMetadata = msg.metadata || {};
        if (Array.isArray(nextMetadata.images)) {
          const nextImages = [];
          for (const url of nextMetadata.images) {
            output.scanned++;
            const rescue = await rescueUrl(url, { userId, uploadContext }, output, {
              table: 'chat_messages',
              id: msg.id,
              field: 'metadata.images'
            });
            nextImages.push(rescue.url);
            changed = changed || rescue.changed;
          }
          nextMetadata.images = nextImages;
        }
        if (Array.isArray(nextMetadata.referenceImages)) {
          const nextRefs = [];
          for (const url of nextMetadata.referenceImages) {
            output.scanned++;
            const rescue = await rescueUrl(url, { userId, uploadContext }, output, {
              table: 'chat_messages',
              id: msg.id,
              field: 'metadata.referenceImages'
            });
            nextRefs.push(rescue.url);
            changed = changed || rescue.changed;
          }
          nextMetadata.referenceImages = nextRefs;
        }
        if (nextMetadata.gridData?.fullImage) {
          output.scanned++;
          const rescue = await rescueUrl(nextMetadata.gridData.fullImage, { userId, uploadContext }, output, {
            table: 'chat_messages',
            id: msg.id,
            field: 'metadata.gridData.fullImage'
          });
          nextMetadata.gridData.fullImage = rescue.url;
          changed = changed || rescue.changed;
        }
        if (Array.isArray(nextMetadata.gridData?.slices)) {
          const nextSlices = [];
          for (const slice of nextMetadata.gridData.slices) {
            output.scanned++;
            const rescue = await rescueUrl(slice, { userId, uploadContext: { ...uploadContext, assetType: 'slice' } }, output, {
              table: 'chat_messages',
              id: msg.id,
              field: 'metadata.gridData.slices'
            });
            nextSlices.push(rescue.url);
            changed = changed || rescue.changed;
          }
          nextMetadata.gridData.slices = nextSlices;
        }

        if (changed) {
          await updateIfChanged('chat_messages', msg.id, {
            content: nextContent,
            metadata: nextMetadata
          });
        }
      }
    }

    const cutoff = new Date(Date.now() - retryAfterMinutes * 60 * 1000).toISOString();
    const { data: retryLogs } = await supabaseAdmin
      .from('asset_logs')
      .select('id, user_id, original_url, metadata')
      .in('status', ['PENDING', 'FAILED'])
      .lt('created_at', cutoff)
      .limit(limit);

    if (retryLogs && retryLogs.length > 0) {
      for (const log of retryLogs) {
        if (!log.original_url) continue;
        const uploadContext = (log.metadata as any)?.uploadContext || undefined;
        const userId = log.user_id || 'system_rescue';
        const tempStats = {
          scanned: 0,
          recovered_protocol: 0,
          recovered_external: 0,
          recovered_base64: 0,
          lost_external: 0,
          skipped: 0
        };
        const rescue = await rescueUrl(log.original_url, { userId, uploadContext }, tempStats);
        if (rescue.url && rescue.url !== log.original_url) {
          await assetLogService.logUpdate(log.id, { r2Url: rescue.url, status: 'SUCCESS' });
        }
      }
    }

    return NextResponse.json({ success: true, ...output });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
