/**
 * Cloudflare R2 上传 API Route
 *
 * 处理文件上传到 R2，保护 R2 凭证不暴露给前端
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// 初始化 R2 客户端（兼容 S3 API）
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!, // 例如: https://xxx.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;

/**
 * 获取当前用户（服务端）
 */
async function getServerUser() {
  const cookieStore = await cookies();

  // 获取所有 Supabase 相关的 cookies
  const allCookies = cookieStore.getAll();
  const accessToken = allCookies.find(c => c.name.includes('auth-token'))?.value;

  if (!accessToken) {
    return null;
  }

  // 使用 admin client 验证 token 并获取用户
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * POST - 上传文件到 R2
 */
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

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
    });
  } catch (error: any) {
    console.error('R2 upload error:', error);
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
  try {
    // 验证用户身份
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: '缺少文件 key' }, { status: 400 });
    }

    // 确保只能删除自己的文件
    if (!key.startsWith(user.id + '/')) {
      return NextResponse.json({ error: '无权删除此文件' }, { status: 403 });
    }

    // 从 R2 删除
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('R2 delete error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
