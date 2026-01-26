/**
 * Cloudflare R2 临时文件上传 API Route
 *
 * 用于上传临时参考图片，保存到 temp/ 目录
 * 需要在 Cloudflare R2 控制台配置生命周期规则：
 * - 前缀: temp/
 * - 过期时间: 1 天
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';

export const maxDuration = 60;
export const runtime = 'nodejs';

// 初始化 R2 客户端（兼容 S3 API）
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;

/**
 * POST - 上传临时文件到 R2 temp/ 目录
 * 这些文件将由 R2 生命周期规则在 1 天后自动删除
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

    const requestId = `temp-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: '缺少文件' }, { status: 400 });
        }

        // 检查文件大小 (最大 10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: '文件大小超过 10MB 限制' }, { status: 400 });
        }

        // 生成唯一文件名，放在 temp/ 目录下
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const extension = file.name.split('.').pop() || 'png';
        // 使用 temp/ 前缀，R2 生命周期规则会自动删除
        const key = `temp/${user.id}/${timestamp}_${randomStr}.${extension}`;

        // 读取文件内容
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 上传到 R2
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: file.type || 'image/png',
            // 临时文件只缓存 1 天
            CacheControl: 'public, max-age=86400',
        });

        await r2Client.send(command);

        // 返回公开 URL
        const url = `${PUBLIC_URL}/${key}`;

        return NextResponse.json({
            url,
            key,
            bucket: BUCKET_NAME,
            requestId,
            temporary: true,
            expiresIn: '24 hours',
        });
    } catch (error: any) {
        console.error(`[${requestId}] ❌ R2 temp upload error:`, error);
        return NextResponse.json(
            { error: error.message || '临时文件上传失败' },
            { status: 500 }
        );
    }
}
