import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth-middleware';
import type { Database } from '@/lib/supabase/database.types';
import { constructBaseShotPrompt } from '@/utils/promptConstruction';

export const maxDuration = 120;
export const runtime = 'nodejs';

type RegenItem = {
  table: string;
  id: string;
  field: string;
  url?: string;
};

const buildBaseUrl = (req: NextRequest) => {
  const host = req.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (envUrl) {
    const prefix = envUrl.startsWith('http') ? '' : 'https://';
    return `${prefix}${envUrl}`;
  }
  return '';
};

const mapSeedreamSize = (aspectRatio?: string) => {
  const sizeMap: Record<string, string> = {
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '1:1': '2048x2048',
    '4:3': '2240x1680',
    '3:4': '1680x2240',
    '21:9': '2940x1260',
  };
  return aspectRatio && sizeMap[aspectRatio] ? sizeMap[aspectRatio] : '2048x2048';
};

const ensureNumberedPrompt = (prompt: string, count: number) => {
  const hasNumberedLine = prompt.split('\n').some((line) => /^\s*\d+[\.\、]/.test(line));
  if (hasNumberedLine) return prompt;
  return Array.from({ length: count }, (_, idx) => `${idx + 1}. ${prompt}`).join('\n');
};

const normalizeMode = (modeOverride: string | undefined, historyModel: string | undefined, field: string) => {
  const normalizedOverride = modeOverride?.toLowerCase();
  if (normalizedOverride && normalizedOverride !== 'auto') {
    if (normalizedOverride === 'gemini') return 'gemini-direct';
    return normalizedOverride;
  }

  const model = historyModel?.toLowerCase() || '';
  if (model.includes('seedream')) return 'seedream';
  if (model.includes('jimeng')) return 'jimeng';
  if (model.includes('grid')) return 'gemini-grid';
  if (model.includes('gemini')) return 'gemini-direct';

  const fieldHint = field.toLowerCase();
  if (fieldHint.includes('grid') || fieldHint.includes('slice')) return 'gemini-grid';

  return 'gemini-direct';
};

const replaceUrlInHistory = (history: any[], oldUrl: string | undefined, newUrl: string) => {
  if (!oldUrl) return history;
  return history.map((item) => {
    if (!item) return item;
    const next = { ...item };
    if (typeof item.result === 'string' && item.result === oldUrl) {
      next.result = newUrl;
      next.status = 'replaced';
    }
    if (Array.isArray(item.images)) {
      const nextImages = item.images.map((img: string) => (img === oldUrl ? newUrl : img));
      if (nextImages.some((img: string, idx: number) => img !== item.images[idx])) {
        next.images = nextImages;
        next.status = 'replaced';
      }
    }
    return next;
  });
};

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if ('error' in authResult) return authResult.error;
  if (authResult.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? (body.items as RegenItem[]) : [];
  const limit = Math.min(Math.max(Number(body?.limit || items.length || 0), 1), 200);
  const dryRun = !!body?.dryRun;
  const modeOverride = typeof body?.mode === 'string' ? body.mode : undefined;
  const jimengModel = typeof body?.jimengModel === 'string' ? body.jimengModel : 'jimeng-4.0';
  const jimengSessionId = body?.jimengSessionId || process.env.JIMENG_SESSION_ID;

  if (!items.length) {
    return NextResponse.json({ error: 'missing items' }, { status: 400 });
  }

  const baseUrl = buildBaseUrl(req);
  if (!baseUrl) {
    return NextResponse.json({ error: 'missing base url' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'missing authorization header' }, { status: 401 });
  }

  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const results: any[] = [];
  const batch = items.slice(0, limit);

  for (const item of batch) {
    if (item.table !== 'shots') {
      results.push({ item, status: 'unsupported', reason: 'only shots supported for now' });
      continue;
    }

    try {
      const { data: shot } = await supabaseAdmin
        .from('shots')
        .select('id, scene_id, description, shot_size, generation_history, reference_image, grid_images')
        .eq('id', item.id)
        .single();

      if (!shot) {
        results.push({ item, status: 'failed', reason: 'shot not found' });
        continue;
      }

      const { data: scene } = await supabaseAdmin
        .from('scenes')
        .select('id, project_id, name, description, location')
        .eq('id', shot.scene_id)
        .single();

      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id, metadata, settings')
        .eq('id', scene?.project_id || '')
        .single();

      const history = Array.isArray(shot.generation_history) ? shot.generation_history : [];
      const matchedHistory = history.find((h: any) => h?.result === item.url || (Array.isArray(h?.images) && h.images.includes(item.url)));

      const promptFromHistory = typeof matchedHistory?.prompt === 'string' ? matchedHistory.prompt : '';
      const projectStub = {
        metadata: project?.metadata || {},
        settings: project?.settings || {},
        scenes: scene ? [{ id: scene.id, name: scene.name, description: scene.description, location: scene.location }] : []
      } as any;
      const shotStub = {
        id: shot.id,
        sceneId: shot.scene_id,
        shotSize: shot.shot_size,
        description: shot.description
      } as any;
      const basePromptParts = constructBaseShotPrompt(projectStub, shotStub);
      const basePrompt = basePromptParts.filter(Boolean).join('\n') || shot.description || 'Cinematic shot';
      const finalPrompt = promptFromHistory || basePrompt;

      const referenceImages = Array.isArray(matchedHistory?.parameters?.referenceImages)
        ? matchedHistory.parameters.referenceImages.filter(Boolean)
        : [];
      const aspectRatio = matchedHistory?.parameters?.aspectRatio || project?.settings?.aspectRatio || '16:9';
      const gridSize = matchedHistory?.parameters?.gridSize || (item.field.includes('grid') ? '2x2' : '2x2');
      const mode = normalizeMode(modeOverride, matchedHistory?.parameters?.model, item.field);

      if (dryRun) {
        results.push({
          item,
          status: 'planned',
          plan: {
            mode,
            prompt: finalPrompt,
            aspectRatio,
            gridSize,
            referenceImages: referenceImages.length
          }
        });
        continue;
      }

      const uploadContext = {
        projectId: project?.id,
        scope: 'shots',
        entityId: shot.id,
        assetType: mode === 'gemini-grid' ? 'grid' : 'image',
        model: mode
      };

      let newUrl = '';
      let gridImages: string[] | undefined;

      if (mode === 'gemini-grid') {
        const gridRows = gridSize === '3x3' ? 3 : 2;
        const gridCols = gridSize === '3x3' ? 3 : 2;
        const gridPrompt = ensureNumberedPrompt(finalPrompt, gridRows * gridCols);

        const resp = await fetch(`${baseUrl}/api/gemini-grid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            prompt: gridPrompt,
            gridRows,
            gridCols,
            aspectRatio,
            referenceImages: referenceImages.map((url: string) => ({ url })),
            uploadContext
          })
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`gemini-grid failed: ${errorText}`);
        }

        const data = await resp.json();
        gridImages = Array.isArray(data.slices) ? data.slices.filter(Boolean) : [];
        newUrl = (gridImages && gridImages.length > 0 ? gridImages[0] : data.fullImage) || '';
      } else if (mode === 'seedream') {
        const resp = await fetch(`${baseUrl}/api/seedream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            prompt: finalPrompt,
            size: mapSeedreamSize(aspectRatio),
            imageUrls: referenceImages,
            uploadContext
          })
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`seedream failed: ${errorText}`);
        }

        const data = await resp.json();
        newUrl = data.url;
      } else if (mode === 'jimeng') {
        if (!jimengSessionId) {
          throw new Error('missing jimeng session id');
        }

        const genResp = await fetch(`${baseUrl}/api/jimeng`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            action: 'generate-image',
            sessionid: jimengSessionId,
            payload: {
              prompt: finalPrompt,
              model: jimengModel,
              aspectRatio,
              imageUrls: referenceImages,
              uploadContext
            }
          })
        });

        if (!genResp.ok) {
          const errorText = await genResp.text();
          throw new Error(`jimeng generate failed: ${errorText}`);
        }

        const genData = await genResp.json();
        const historyId = genData?.historyId || genData?.data?.aigc_data?.history_record_id;
        if (!historyId) {
          throw new Error('jimeng missing historyId');
        }

        let attempts = 0;
        const maxAttempts = Math.min(Math.max(Number(body?.jimengMaxAttempts || 30), 1), 60);
        while (attempts < maxAttempts) {
          attempts += 1;
          const pollResp = await fetch(`${baseUrl}/api/jimeng`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({
              action: 'check-status-once',
              sessionid: jimengSessionId,
              payload: { historyId, uploadContext }
            })
          });

          if (!pollResp.ok) {
            const errorText = await pollResp.text();
            throw new Error(`jimeng poll failed: ${errorText}`);
          }

          const pollData = await pollResp.json();
          const urls = [
            ...(pollData?.imageUrls || []),
            ...(pollData?.url ? [pollData.url] : [])
          ].filter(Boolean);

          if (pollData?.success && urls.length > 0) {
            newUrl = urls[0];
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (!newUrl) {
          throw new Error('jimeng poll timeout');
        }
      } else {
        const resp = await fetch(`${baseUrl}/api/gemini-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            prompt: finalPrompt,
            aspectRatio,
            imageSize: '2K',
            referenceImages: referenceImages.map((url: string) => ({ url })),
            uploadContext
          })
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`gemini-image failed: ${errorText}`);
        }

        const data = await resp.json();
        newUrl = data.url;
      }

      if (!newUrl) {
        throw new Error('missing regenerated url');
      }

      let nextHistory = replaceUrlInHistory(history, item.url, newUrl);
      const historyEntry = {
        id: `regen_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: 'image',
        timestamp: new Date(),
        result: newUrl,
        prompt: finalPrompt,
        status: 'success',
        parameters: {
          model: mode,
          aspectRatio,
          gridSize: mode === 'gemini-grid' ? gridSize : undefined,
          referenceImages,
          source: 'admin-regenerate'
        }
      };
      nextHistory = [historyEntry, ...nextHistory].slice(0, 20);

      const updates: Record<string, any> = {
        generation_history: nextHistory
      };

      if (mode === 'gemini-grid' && gridImages && gridImages.length > 0) {
        updates.reference_image = gridImages[0];
        updates.grid_images = gridImages;
      } else {
        updates.reference_image = newUrl;
      }

      await supabaseAdmin.from('shots').update(updates).eq('id', shot.id);

      results.push({
        item,
        status: 'regenerated',
        mode,
        url: newUrl,
        gridCount: gridImages?.length || 0
      });
    } catch (err: any) {
      results.push({ item, status: 'failed', reason: err?.message || 'unknown error' });
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    total: batch.length,
    results
  });
}
