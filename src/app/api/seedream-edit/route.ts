import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { uploadBufferToR2 } from '@/lib/cloudflare-r2';
import { assetLogService } from '@/lib/assetLogService';
import { buildR2Folder, buildR2Key, inferExtFromMime } from '@/lib/r2-path';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  // 白名单检查
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) return whitelistCheck.error;

  // 2. 计算所需积分
  const requiredCredits = calculateCredits('SEEDREAM_EDIT', user.role);
  const operationDesc = getOperationDescription('SEEDREAM_EDIT');

  // 3. 检查积分
  const creditsCheck = checkCredits(user, requiredCredits);
  if ('error' in creditsCheck) {
    return creditsCheck.error;
  }

  const requestId = `seedream-edit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}, credits: ${user.credits}, cost: ${requiredCredits}`);

  try {
    const body = await request.json();
    const { imageUrl, prompt, size = '2048x2048', model, uploadContext } = body || {};

    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: 'missing imageUrl or prompt' }, { status: 400 });
    }

    const apiKey =
      process.env.VOLCANO_API_KEY ||
      process.env.NEXT_VOLCANO_API_KEY ||
      process.env.NEXT_PUBLIC_VOLCANO_API_KEY; // ⚠️ 向后兼容，应移除
    const baseUrl = process.env.VOLCANO_BASE_URL || process.env.NEXT_VOLCANO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const seedreamModelId =
      model ||
      process.env.SEEDREAM_MODEL_ID ||
      process.env.NEXT_SEEDREAM_MODEL_ID ||
      process.env.NEXT_PUBLIC_SEEDREAM_MODEL_ID || // ⚠️ 向后兼容，应移除
      'doubao-seedream-4-5-251128';

    if (!apiKey || !seedreamModelId) {
      return NextResponse.json({ error: 'seedream api not configured' }, { status: 500 });
    }

    // Call Volcano Engine image variations API
    const resp = await fetch(`${baseUrl}/images/variations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: seedreamModelId,
        prompt,
        image: imageUrl,
        size,
        n: 1,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();
    const url = data?.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'missing image url' }, { status: 500 });
    }

    const logId = await assetLogService.logStart({
      userId: user.id,
      operationType: 'seedream',
      originalUrl: url,
      status: 'PENDING',
      metadata: {
        prompt,
        model: seedreamModelId,
        size,
        editSource: imageUrl,
        uploadContext: uploadContext || null
      }
    });

    try {
      const imageResp = await fetch(url);
      if (!imageResp.ok) {
        throw new Error(`Failed to download edited image: ${imageResp.statusText}`);
      }

      const arrayBuffer = await imageResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = imageResp.headers.get('content-type') || 'image/png';
      const ext = inferExtFromMime(mimeType);
      const folder = buildR2Folder(uploadContext, `generated/seedream`);
      const key = buildR2Key({
        userId: user.id,
        folder,
        ext,
        prefix: 'seedream_edit'
      });

      const r2Url = await uploadBufferToR2({
        buffer,
        key,
        contentType: mimeType
      });

      if (logId) {
        await assetLogService.logUpdate(logId, { r2Url, status: 'SUCCESS' });
      }

      // 4. 消耗积分
      const consumeResult = await consumeCredits(
        user.id,
        requiredCredits,
        'edit-image',
        `${operationDesc}`
      );

      if (!consumeResult.success) {
        console.error(`[${requestId}] 💳 Failed to consume credits:`, consumeResult.error);
        return NextResponse.json(
          { error: '积分扣除失败: ' + consumeResult.error },
          { status: 500 }
        );
      }

      console.log(`[${requestId}] 💳 Credits consumed: ${requiredCredits} (${user.role}), remaining: ${user.credits - requiredCredits}`);

      return NextResponse.json({ url: r2Url, requestId, uploadedToR2: true });
    } catch (downloadError: any) {
      if (logId) {
        await assetLogService.logUpdate(logId, { status: 'FAILED', error: downloadError.message });
      }
      console.error('[Seedream Edit] ❌ R2 upload failed:', downloadError);
      return NextResponse.json({ error: '图片持久化失败，请稍后重试', requestId }, { status: 500 });
    }
  } catch (error: any) {
    console.error(`[${requestId}] ❌ SeeDream Edit failed:`, error);
    return NextResponse.json({ error: error?.message || 'unknown error' }, { status: 500 });
  }
}
