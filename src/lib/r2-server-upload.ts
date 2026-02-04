/**
 * R2 Server-Side Upload Utilities
 * 
 * 共享的服务端 R2 上传逻辑，用于 Gemini Grid、Gemini Image 等 API 路由
 * 优势：数据不经过用户浏览器，上传速度快 3-10 倍
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { buildR2Folder, type R2PathContext } from './r2-path';

// R2 配置
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

// S3 客户端单例
let r2ClientInstance: S3Client | null = null;

/**
 * 获取 R2 S3 客户端（懒加载单例）
 */
export const getR2Client = (): S3Client | null => {
    if (r2ClientInstance) return r2ClientInstance;

    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        console.warn('[R2 Upload] ⚠️ R2 环境变量未配置');
        return null;
    }

    r2ClientInstance = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
    });

    return r2ClientInstance;
};

/**
 * 检查 R2 是否已配置
 */
export const isR2Configured = (): boolean => {
    return !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);
};

/**
 * 生成唯一的 R2 Key
 */
export const generateR2Key = (userId: string, folder: string, suffix: string = ''): string => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const safeSuffix = suffix ? `_${suffix}` : '';
    return `${userId}/${folder}/${timestamp}_${randomStr}${safeSuffix}.png`;
};

/**
 * 生成预签名 URL (用于 Gemini 等外部服务直接访问私有/公共资源)
 * 
 * @param publicUrl - 原始 R2 公共链接
 * @param expiresIn - 有效期 (秒), 默认 300s (5分钟)
 * @returns 预签名 URL 或 null
 */
export const generatePresignedUrl = async (publicUrl: string, expiresIn: number = 300): Promise<string | null> => {
    const client = getR2Client();
    if (!client || !R2_BUCKET_NAME || !publicUrl) return null;

    try {
        // 从公共 URL 解析 Key
        // 假设 publicUrl 格式: https://pub-xxx.r2.dev/USER/FOLDER/FILE.png
        // 或者自定义域名: https://assets.example.com/USER/FOLDER/FILE.png
        // 我们只关心 path 部分去除开头的 /
        let key = '';
        try {
            const urlObj = new URL(publicUrl);
            key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
            // 对于 R2/S3，Key 是 decode 后的
            key = decodeURIComponent(key);
        } catch (e) {
            console.warn('[R2 Presign] Invalid URL:', publicUrl);
            return null;
        }

        if (!key) return null;

        const command = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        });

        // 生成签名 URL
        const signedUrl = await getSignedUrl(client, command, { expiresIn });
        console.log(`[R2 Presign] Generated for ${key.slice(0, 20)}...`);
        return signedUrl;
    } catch (error: any) {
        console.error('[R2 Presign] ❌ Failed:', error.message);
        return null;
    }
};

/**
 * 上传 Buffer 到 R2
 * 
 * @param buffer - 图片数据
 * @param userId - 用户 ID
 * @param folder - 存储文件夹 (例如 "generated")
 * @param suffix - 文件名后缀 (例如 "full", "slice_0")
 * @returns R2 公开 URL，失败返回 null
 */
export const uploadBufferToR2 = async (
    buffer: Buffer,
    userId: string,
    folder: string = 'generated',
    suffix: string = '',
    context?: R2PathContext
): Promise<string | null> => {
    const client = getR2Client();
    if (!client || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
        return null;
    }

    try {
        const resolvedFolder = context ? buildR2Folder(context, folder) : folder;
        const key = generateR2Key(userId, resolvedFolder, suffix);

        await client.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000',
        }));

        return `${R2_PUBLIC_URL}/${key}`;
    } catch (error: any) {
        console.error(`[R2 Upload] ❌ 上传失败 (${suffix}):`, error.message);
        return null;
    }
};

/**
 * 上传 Base64 字符串到 R2
 * 
 * @param base64Data - 纯 Base64 字符串（不含 data:image/png;base64, 前缀）
 * @param userId - 用户 ID
 * @param folder - 存储文件夹
 * @param suffix - 文件名后缀
 * @returns R2 公开 URL，失败返回 null
 */
export const uploadBase64ToR2 = async (
    base64Data: string,
    userId: string,
    folder: string = 'generated',
    suffix: string = '',
    context?: R2PathContext
): Promise<string | null> => {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        return uploadBufferToR2(buffer, userId, folder, suffix, context);
    } catch (error: any) {
        console.error('[R2 Upload] ❌ Base64 解码失败:', error.message);
        return null;
    }
};

/**
 * 使用 Sharp 切片图片并返回 Buffer 数组
 * 
 * @param imageBuffer - 原始图片 Buffer
 * @param rows - 行数
 * @param cols - 列数
 * @returns Buffer 数组，按行优先顺序
 */
export const sliceImageToBuffers = async (
    imageBuffer: Buffer,
    rows: number,
    cols: number
): Promise<Buffer[]> => {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const pieceWidth = Math.floor(width / cols);
    const pieceHeight = Math.floor(height / rows);

    const slicePromises: Promise<Buffer>[] = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const isLastCol = c === cols - 1;
            const isLastRow = r === rows - 1;
            const sliceW = isLastCol ? width - c * pieceWidth : pieceWidth;
            const sliceH = isLastRow ? height - r * pieceHeight : pieceHeight;

            slicePromises.push(
                sharp(imageBuffer)
                    .extract({
                        left: c * pieceWidth,
                        top: r * pieceHeight,
                        width: sliceW,
                        height: sliceH
                    })
                    .png()
                    .toBuffer()
            );
        }
    }

    return Promise.all(slicePromises);
};

/**
 * 批量上传 Buffer 数组到 R2（并行）
 * 
 * @param buffers - Buffer 数组
 * @param userId - 用户 ID
 * @param folder - 存储文件夹
 * @param prefix - 文件名前缀
 * @returns R2 URL 数组，任何失败项为 null
 */
export const uploadBuffersToR2 = async (
    buffers: Buffer[],
    userId: string,
    folder: string = 'generated',
    prefix: string = 'slice',
    context?: R2PathContext
): Promise<(string | null)[]> => {
    return Promise.all(
        buffers.map((buf, idx) => uploadBufferToR2(buf, userId, folder, `${prefix}_${idx}`, context))
    );
};

/**
 * 完整的 Grid 处理流程：切片 + 并行上传
 * 
 * @param base64Data - 原始图片 Base64
 * @param userId - 用户 ID
 * @param rows - Grid 行数
 * @param cols - Grid 列数
 * @returns { fullImageUrl, sliceUrls, success }
 */
export const processAndUploadGrid = async (
    base64Data: string,
    userId: string,
    rows: number,
    cols: number,
    context?: R2PathContext
): Promise<{
    fullImageUrl: string | null;
    sliceUrls: (string | null)[];
    success: boolean;
    uploadTime: string;
}> => {
    const startTime = Date.now();

    try {
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 并行：切片 + 上传原图
        const [sliceBuffers, fullImageUrl] = await Promise.all([
            sliceImageToBuffers(imageBuffer, rows, cols),
            uploadBufferToR2(imageBuffer, userId, 'generated', 'full', context)
        ]);

        // 并行上传所有切片
        const sliceUrls = await uploadBuffersToR2(sliceBuffers, userId, 'generated', 'slice', context);

        const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const allSlicesUploaded = sliceUrls.every(url => url !== null);

        return {
            fullImageUrl,
            sliceUrls,
            success: fullImageUrl !== null && allSlicesUploaded,
            uploadTime
        };
    } catch (error: any) {
        console.error('[R2 Upload] ❌ Grid 处理失败:', error.message);
        return {
            fullImageUrl: null,
            sliceUrls: [],
            success: false,
            uploadTime: '0'
        };
    }
};
