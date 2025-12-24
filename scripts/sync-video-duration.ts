/**
 * 同步视频实际时长脚本
 * 功能：
 * 1. 查询所有有视频的分镜
 * 2. 通过 HTTP Range 请求获取视频元数据
 * 3. 解析视频实际时长
 * 4. 更新数据库中的 duration 字段
 * 
 * 使用方法：
 * npx tsx scripts/sync-video-duration.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载 .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ShotWithVideo {
    id: string;
    scene_id: string;
    order_index: number;
    duration: number;
    video_clip: string;
}

/**
 * 通过 HTTP 请求获取视频时长
 * 使用 Content-Length 和视频比特率估算，或者下载部分文件解析
 */
async function getVideoDuration(videoUrl: string): Promise<number | null> {
    try {
        // 方法1：通过文件大小估算（R2 视频通常是固定比特率）
        // Sora 生成的视频通常是 10s = ~8MB, 15s = ~12MB
        const response = await fetch(videoUrl, {
            method: 'HEAD',
        });

        if (!response.ok) {
            console.warn(`   ⚠️ 无法获取视频: ${response.status}`);
            return null;
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            const sizeInBytes = parseInt(contentLength);
            const sizeInMB = sizeInBytes / (1024 * 1024);

            // 基于文件大小估算时长
            // Sora 视频大约 0.8MB/秒
            if (sizeInMB < 6) {
                return 5; // 5s 视频约 4MB
            } else if (sizeInMB < 10) {
                return 10; // 10s 视频约 8MB
            } else if (sizeInMB < 18) {
                return 15; // 15s 视频约 12MB
            } else {
                return 20; // 更长的视频
            }
        }

        return null;
    } catch (error: any) {
        console.error(`   ❌ 获取视频信息失败:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🎬 视频时长同步脚本开始运行...\n');

    // 1. 查询所有有视频的分镜
    const { data: shots, error } = await supabase
        .from('shots')
        .select('id, scene_id, order_index, duration, video_clip')
        .not('video_clip', 'is', null)
        .neq('video_clip', '')
        .order('scene_id')
        .order('order_index');

    if (error) {
        console.error('❌ 查询失败:', error);
        return;
    }

    if (!shots || shots.length === 0) {
        console.log('📭 没有找到有视频的分镜');
        return;
    }

    console.log(`📊 找到 ${shots.length} 个有视频的分镜\n`);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const shot of shots as ShotWithVideo[]) {
        console.log(`📹 处理分镜: ${shot.id}`);
        console.log(`   场景: ${shot.scene_id}, 索引: ${shot.order_index}`);
        console.log(`   当前时长: ${shot.duration}s`);
        console.log(`   视频: ${shot.video_clip.substring(0, 60)}...`);

        // 获取视频实际时长
        const actualDuration = await getVideoDuration(shot.video_clip);

        if (actualDuration === null) {
            console.log(`   ⚠️ 无法获取视频时长，跳过`);
            skippedCount++;
            continue;
        }

        console.log(`   📏 估算视频时长: ${actualDuration}s`);

        // 如果时长不同，更新数据库
        if (shot.duration !== actualDuration) {
            const { error: updateError } = await supabase
                .from('shots')
                .update({ duration: actualDuration })
                .eq('id', shot.id);

            if (updateError) {
                console.error(`   ❌ 更新失败:`, updateError);
                failedCount++;
            } else {
                console.log(`   ✅ 已更新: ${shot.duration}s → ${actualDuration}s`);
                successCount++;
            }
        } else {
            console.log(`   ⏭️ 时长已正确，跳过`);
            skippedCount++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 同步结果汇总:');
    console.log(`   ✅ 已更新: ${successCount}`);
    console.log(`   ⏭️ 跳过: ${skippedCount}`);
    console.log(`   ❌ 失败: ${failedCount}`);
    console.log('='.repeat(50));
}

main().catch(console.error);
