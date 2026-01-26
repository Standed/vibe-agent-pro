/**
 * Cloudflare R2 上传 API Route
 *
 * 处理文件上传到 R2，保护 R2 凭证不暴露给前端
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const runtime = 'nodejs';

// 初始化 R2 客户端（兼容 S3 API）
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!, // 例如: https://xxx.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // 必须开启，否则 SDK 会尝试 bucket.endpoint 导致 DNS 解析失败
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const extractCharacterId = (key: string) => {
  const parts = key.split('/');
  const index = parts.indexOf('characters');
  if (index === -1 || index + 1 >= parts.length) return null;
  const candidate = parts[index + 1];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(candidate) ? candidate : null;
};

/**
 * POST - 上传文件到 R2
 * 支持两种模式：
 * 1. 直接上传 (默认): 适用于小文件 (<4.5MB)，由 Serverless Function 中转
 * 2. 预签名 URL (mode=presigned): 适用于大文件，返回 PUT URL，前端直接上传
 */
export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  // 🔒 白名单检查
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) return whitelistCheck.error;

  const operationDesc = getOperationDescription('UPLOAD_PROCESS');
  const requestId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // 检查请求模式
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  if (mode === 'presigned') {
    // === 预签名模式 ===
    try {
      const { filename, contentType, folder } = await request.json();

      if (!filename || !folder) {
        return NextResponse.json({ error: '缺少 filename 或 folder' }, { status: 400 });
      }

      console.log(`[${requestId}] 📝 获取预签名 URL: ${filename} (${contentType})`);

      const timestamp = Date.now();
      const extension = filename.split('.').pop() || 'bin';
      const key = `${user.id}/${folder}/${timestamp}.${extension}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000',
      });

      // 生成签名 URL，有效期 5 分钟
      const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });

      return NextResponse.json({
        uploadUrl: signedUrl,
        publicUrl: `${PUBLIC_URL}/${key}`,
        key,
      });

    } catch (error: any) {
      console.error(`[${requestId}] ❌ 获取预签名 URL 失败:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // === 直接上传模式 ===
  console.log(`[${requestId}] 🔐 ${operationDesc} request from ${user.role} user: ${user.email}`);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string;

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const key = `${user.id}/${folder}/${timestamp}.${extension}`;

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到 R2
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      // 设置缓存策略
      CacheControl: 'public, max-age=31536000', // 1年
    });

    await r2Client.send(command);

    // 返回公开 URL
    const url = `${PUBLIC_URL}/${key}`;

    return NextResponse.json({
      url,
      key,
      bucket: BUCKET_NAME,
      requestId,
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ R2 upload error:`, error);
    return NextResponse.json(
      { error: error.message || '上传失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 从 R2 删除文件
 */
export async function DELETE(request: NextRequest) {
  // 删除操作不需要验证用户身份和积分,使用简化的认证
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: '缺少文件 key' }, { status: 400 });
    }

    // 确保只能删除自己的文件，或拥有对应角色
    if (!key.startsWith(user.id + '/') && user.role !== 'admin') {
      const characterId = extractCharacterId(key);
      if (!characterId) {
        return NextResponse.json({ error: '无权删除此文件' }, { status: 403 });
      }
      const { data: character } = await supabase
        .from('characters')
        .select('id,user_id')
        .eq('id', characterId)
        .single();
      if (!character || character.user_id !== user.id) {
        return NextResponse.json({ error: '无权删除此文件' }, { status: 403 });
      }
    }

    // 从 R2 删除
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);

    const characterId = extractCharacterId(key);
    if (characterId) {
      const { data: character } = await supabase
        .from('characters')
        .select('metadata')
        .eq('id', characterId)
        .single();

      const existingMetadata = character?.metadata || {};
      const existingIdentity = existingMetadata.soraIdentity || {};
      const existingUsername = (existingIdentity.username || '').trim();

      const nextIdentity = existingUsername
        ? {
          ...existingIdentity,
          referenceVideoUrl: '',
          status: 'registered',
          taskId: null
        }
        : {
          username: '',
          referenceVideoUrl: '',
          status: 'failed',
          taskId: null
        };

      await supabase.from('characters').update({
        metadata: {
          ...existingMetadata,
          soraReferenceVideoUrl: null,
          soraIdentity: nextIdentity
        }
      }).eq('id', characterId);

      await supabase.from('sora_tasks').update({
        status: 'failed',
        r2_url: null,
        kaponai_url: null,
        error_message: 'user_deleted',
        updated_at: new Date().toISOString()
      }).eq('character_id', characterId).eq('type', 'character_reference');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('R2 delete error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
