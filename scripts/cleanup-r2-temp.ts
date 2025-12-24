
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'vibe-agent-pro';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('❌ 缺少 R2 配置信息，请检查 .env.local');
    process.exit(1);
}

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

async function cleanupTempFiles() {
    console.log('🧹 开始清理 R2 临时文件...');

    // 定义临时文件夹前缀
    // 假设我们将所有生成的草稿都放在 projects/temp/ 下
    const prefix = 'projects/temp/';

    // 定义过期时间：24小时前
    const expirationTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`⏱️  过期时间阈值: ${expirationTime.toISOString()}`);

    let continuationToken: string | undefined = undefined;
    let deletedCount = 0;
    let totalSizeFreed = 0;

    try {
        do {
            const listCommand = new ListObjectsV2Command({
                Bucket: R2_BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });

            const response = await s3Client.send(listCommand);

            if (!response.Contents || response.Contents.length === 0) {
                break;
            }

            const objectsToDelete: { Key: string }[] = [];

            for (const obj of response.Contents) {
                // 检查最后修改时间
                if (obj.LastModified && obj.LastModified < expirationTime) {
                    if (obj.Key) {
                        objectsToDelete.push({ Key: obj.Key });
                        totalSizeFreed += obj.Size || 0;
                        console.log(`🗑️  标记删除: ${obj.Key} (Time: ${obj.LastModified.toISOString()})`);
                    }
                }
            }

            if (objectsToDelete.length > 0) {
                // 批量删除 (每批最多 1000 个，S3 限制)
                // 这里简单实现，如果超过1000个需要分片，但 ListObjectsV2 默认也是 1000 个分页
                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: R2_BUCKET_NAME,
                    Delete: {
                        Objects: objectsToDelete,
                        Quiet: true,
                    },
                });

                await s3Client.send(deleteCommand);
                deletedCount += objectsToDelete.length;
            }

            continuationToken = response.NextContinuationToken;

        } while (continuationToken);

        console.log('✅ 清理完成!');
        console.log(`📊 共删除了 ${deletedCount} 个文件`);
        console.log(`💾 释放空间: ${(totalSizeFreed / 1024 / 1024).toFixed(2)} MB`);

    } catch (error) {
        console.error('❌ 清理过程中出错:', error);
    }
}

// 执行
cleanupTempFiles();
