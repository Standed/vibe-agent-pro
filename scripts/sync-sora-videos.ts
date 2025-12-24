/**
 * Sora 视频同步脚本
 * 功能：
 * 1. 查询之前提交的 Sora 视频任务状态
 * 2. 对于已完成的任务，下载视频并上传到 Cloudflare R2
 * 3. 更新数据库中的 shot.videoClip 字段
 * 
 * 使用方法：
 * npx tsx scripts/sync-sora-videos.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

// 加载 .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { KaponaiService } from '../src/services/KaponaiService';
import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// R2 配置 - 使用 .env.local 中的正确变量
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'video-agent-media';
const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-522ca521cf3a4baab54032e3dfddbd2d.r2.dev';


// 之前提交的任务 ID 列表
const VIDEO_TASKS = [
    // Scene 1
    { taskId: 'video_01KD2R24HC2ZQ64FP2RR6ZJ38T', sceneId: 'e35c7d3a-55ae-493f-9a93-51da3ef93301', shotIndex: 0 },
    { taskId: 'video_01KD2R25G9XPKJHTXYN76HC29A', sceneId: 'e35c7d3a-55ae-493f-9a93-51da3ef93301', shotIndex: 1 },
    { taskId: 'video_01KD2R26B6ZA8JJ12KCZQ7ZSYD', sceneId: 'e35c7d3a-55ae-493f-9a93-51da3ef93301', shotIndex: 2 },
    // Scene 2
    { taskId: 'video_01KD2R97230WZ4HJFS2ED0KXGJ', sceneId: 'cf825094-1574-4393-872a-ecf01ae2b26e', shotIndex: 0 },
    { taskId: 'video_01KD2R97Q80PGGT4DBYWWAMF09', sceneId: 'cf825094-1574-4393-872a-ecf01ae2b26e', shotIndex: 1 },
    // Scene 3
    { taskId: 'video_01KD2RFT13V7YEQ6X0SN715S3F', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 0 },
    { taskId: 'video_01KD2RFWHSD6TGKGSZ7RM2KVDP', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 1 },
    { taskId: 'video_01KD2RFXSX879KWHM45090135K', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 2 },
    { taskId: 'video_01KD2RFYHXBHQY84AK4B32DP48', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 3 },
    { taskId: 'video_01KD2RFZMBP426TMVPSZZ47HME', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 4 },
    { taskId: 'video_01KD2RG0Q1P6XY09VPN4MCFPA4', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 5 },
    { taskId: 'video_01KD2RG196N72SHBRKTJHNDS1Q', sceneId: '648f3509-e17b-49ab-a881-36e00fba7fb0', shotIndex: 6 },
];

async function uploadToR2(localPath: string, remotePath: string): Promise<string> {
    // 使用 AWS S3 兼容 API 上传到 R2
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const s3 = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });

    const fileBuffer = fs.readFileSync(localPath);

    await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: remotePath,
        Body: fileBuffer,
        ContentType: 'video/mp4',
    }));

    return `${R2_PUBLIC_URL}/${remotePath}`;
}


async function main() {
    console.log('🎬 Sora 视频同步脚本开始运行...\n');

    const kaponai = new KaponaiService();
    const tempDir = path.join(os.tmpdir(), 'sora-videos');

    // 创建临时目录
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const task of VIDEO_TASKS) {
        console.log(`\n📹 处理任务: ${task.taskId}`);
        console.log(`   场景: ${task.sceneId}, 分镜索引: ${task.shotIndex}`);

        try {
            // 1. 查询任务状态
            const status = await kaponai.getVideoStatus(task.taskId);
            console.log(`   状态: ${status.status}`);

            if (status.status === 'completed') {
                // 2. 获取该场景的分镜列表
                const { data: shots, error: shotsError } = await supabase
                    .from('shots')
                    .select('id, order_index, video_clip')
                    .eq('scene_id', task.sceneId)
                    .order('order_index', { ascending: true });

                if (shotsError) {
                    console.error(`   ❌ 查询分镜失败:`, shotsError);
                    failedCount++;
                    continue;
                }

                const shot = shots?.[task.shotIndex];
                if (!shot) {
                    console.error(`   ❌ 未找到分镜 (索引: ${task.shotIndex})`);
                    failedCount++;
                    continue;
                }

                // 检查是否已经有视频
                if (shot.video_clip && shot.video_clip.includes('r2.')) {
                    console.log(`   ⏭️ 已有 R2 视频，跳过`);
                    successCount++;
                    continue;
                }

                // 3. 下载视频
                const localPath = path.join(tempDir, `${task.taskId}.mp4`);
                console.log(`   ⬇️ 下载视频到本地...`);
                await kaponai.downloadVideo(task.taskId, localPath);

                // 4. 上传到 R2
                const remotePath = `sora-videos/${task.sceneId}/${shot.id}.mp4`;
                console.log(`   ⬆️ 上传到 R2: ${remotePath}`);
                const r2Url = await uploadToR2(localPath, remotePath);
                console.log(`   ✅ R2 URL: ${r2Url}`);

                // 5. 获取视频时长（从 API 响应或默认值）
                const videoDuration = (status as any).duration || 15; // 默认 15s
                console.log(`   📏 视频时长: ${videoDuration}s`);

                // 6. 更新数据库（同时更新 video_clip 和 duration）
                const { error: updateError } = await supabase
                    .from('shots')
                    .update({
                        video_clip: r2Url,
                        duration: videoDuration // 同步视频实际时长
                    })
                    .eq('id', shot.id);

                if (updateError) {
                    console.error(`   ❌ 更新数据库失败:`, updateError);
                    failedCount++;
                } else {
                    console.log(`   ✅ 数据库已更新 (视频+时长)`);
                    successCount++;
                }


                // 清理临时文件
                fs.unlinkSync(localPath);

            } else if (status.status === 'failed') {
                console.log(`   ❌ 任务失败: ${status.error || '未知错误'}`);
                failedCount++;
            } else {
                console.log(`   ⏳ 任务仍在处理中 (进度: ${status.progress || 0}%)`);
                pendingCount++;
            }

        } catch (error: any) {
            console.error(`   ❌ 处理失败:`, error.message);
            failedCount++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 同步结果汇总:');
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ⏳ 进行中: ${pendingCount}`);
    console.log(`   ❌ 失败: ${failedCount}`);
    console.log('='.repeat(50));
}

main().catch(console.error);
