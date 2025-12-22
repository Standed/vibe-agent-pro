import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { RunningHubService } from '../src/services/RunningHubService';

/**
 * 简化测试：不等待角色生成完成，直接使用图片 URL
 * 因为 RunningHub 支持直接使用 URL
 */

async function main() {
    console.log('🚀 RunningHub Sora 简化测试（跳过角色生成等待）\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.RUNNINGHUB_API_KEY;
    if (!apiKey || apiKey.includes('your_api_key')) {
        console.error('❌ 错误: 未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    const service = new RunningHubService();
    const testCharImage = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

    try {
        console.log('📝 策略说明:');
        console.log('• RunningHub 支持直接使用图片 URL');
        console.log('• 角色生成需要时间，我们直接使用原始图片 URL');
        console.log('• 提示词中可以包含角色描述\n');

        // 准备剧本（不使用角色编码）
        const script = {
            "character_setting": {
                "皮卡丘": {
                    "age": 5,
                    "appearance": "黄色电气鼠，红脸颊，尖耳朵，闪电尾巴",
                    "name": "皮卡丘",
                    "voice": "可爱童声，音调高，语速中等"
                }
            },
            "shots": [
                {
                    "action": "对着镜头挥手",
                    "camera": "正面特写",
                    "dialogue": {
                        "role": "皮卡丘",
                        "text": "今天天气真不错，我们出去玩吧！"
                    },
                    "duration": 5,
                    "location": "森林空地",
                    "style_tags": "明亮，活泼",
                    "time": "白天",
                    "visual": "皮卡丘站在森林空地中央，面对镜头微笑挥手",
                    "weather": "晴朗"
                },
                {
                    "action": "转身蹦跳",
                    "camera": "跟随镜头",
                    "dialogue": {
                        "role": "皮卡丘",
                        "text": "跟我来！"
                    },
                    "duration": 5,
                    "location": "森林小路",
                    "style_tags": "动感，欢快",
                    "time": "白天",
                    "visual": "皮卡丘欢快地在森林小路上蹦跳前进",
                    "weather": "晴朗"
                },
                {
                    "action": "回头看镜头",
                    "camera": "侧面中景",
                    "duration": 5,
                    "location": "森林深处",
                    "style_tags": "温馨，互动",
                    "time": "白天",
                    "visual": "皮卡丘在树林间回头看向镜头，露出期待的表情",
                    "weather": "晴朗"
                }
            ]
        };

        console.log('✅ 剧本准备完成\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 提交视频生成任务
        console.log('🎬 提交 Sora 视频生成任务...');
        const videoResult = await service.submitTask(script, {
            duration: 15,
            aspect_ratio: 'landscape',
            image_url: testCharImage
        });

        console.log(`✅ 视频任务提交成功！`);
        console.log(`\n任务信息:`);
        console.log(`  • Task ID: ${videoResult.taskId}`);
        console.log(`  • 图片 URL: ${testCharImage}`);
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`\n⏳ 注意：由于缺少任务查询 API，无法自动轮询状态`);
        console.log(`\n建议：`);
        console.log(`  1. 访问 RunningHub 控制台查看任务进度`);
        console.log(`  2. 或者等待 5-10 分钟后手动检查结果`);
        console.log(`\n✅ 测试成功完成！API 调用正常，剩余的是等待视频生成\n`);

    } catch (error: any) {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ 测试失败');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('错误信息:', error.message || error);
        console.error('堆栈跟踪:', error.stack);
        process.exit(1);
    }
}

main();
