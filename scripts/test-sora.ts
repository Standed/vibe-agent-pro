import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { RunningHubService } from '../src/services/RunningHubService';

async function main() {
    console.log('🚀 开始 Sora 集成测试 (完整 3 步流程)...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.RUNNINGHUB_API_KEY;
    if (!apiKey || apiKey.includes('your_api_key')) {
        console.error('❌ 错误: .env.local 中未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    const service = new RunningHubService();

    try {
        // ===============================================
        // 步骤 1：上传角色 / 生成一致性参考
        // ===============================================
        console.log('1️⃣ [步骤 1] 上传角色以保持一致性...');
        const testCharImage = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

        // 直接使用图片 URL（经测试 RunningHub 支持直接使用 URL）
        const charResult = await service.uploadCharacter(testCharImage, "对着镜头说 今天天气真不错 我们出去玩吧，与镜头互动");
        console.log(`   ✅ 角色任务提交成功，Task ID: ${charResult.taskId}`);

        // 轮询角色生成结果
        let charHash = "";
        let charStatus = 'QUEUED';
        let pollCount = 0;
        const maxPolls = 60; // 最多轮询 60 次（5 分钟）

        while (charStatus !== 'SUCCESS' && charStatus !== 'FAILED' && pollCount < maxPolls) {
            await new Promise(r => setTimeout(r, 5000)); // 每 5 秒查询一次
            pollCount++;

            const s = await service.getTaskStatus(charResult.taskId);
            charStatus = s.status;
            process.stdout.write(`   [轮询 ${pollCount}/${maxPolls}] 状态: ${charStatus} | 进度: ${s.progress}%\r`);

            if (charStatus === 'SUCCESS' && s.result_url) {
                // 提取角色 Hash（从结果 URL 中）
                const urlParts = s.result_url.split('/');
                charHash = urlParts[urlParts.length - 1];
                console.log(`\n   ✅ 角色生成完成！角色编码: ${charHash}`);
                console.log(`   结果链接: ${s.result_url}\n`);
            } else if (charStatus === 'FAILED') {
                throw new Error(`角色上传失败: ${s.error_msg}`);
            }
        }

        if (pollCount >= maxPolls) {
            throw new Error('角色生成超时（超过 5 分钟）');
        }

        // ===============================================
        // 步骤 2：优化提示词 (AI 剧本生成)
        // ===============================================
        console.log('2️⃣ [步骤 2] 生成和优化剧本提示词...');

        let script: any;

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== '') {
            console.log('   使用 Gemini AI 生成剧本...');
            const { StoryboardService } = require('../src/services/StoryboardService');
            const storyboard = new StoryboardService();

            // 生成原始剧本
            script = await storyboard.generateScript('皮卡丘在森林里与镜头互动，说"今天天气真不错，我们出去玩吧"');
            console.log('   ✅ 原始剧本已生成');

            // 替换角色名为 Sora 的特殊编码
            if (script.character_setting) {
                const originalName = Object.keys(script.character_setting)[0];
                if (originalName) {
                    console.log(`   🔄 替换角色名: "${originalName}" -> "${charHash}"`);

                    // 1. 替换 character_setting 的 Key 和 Name 字段
                    script.character_setting[charHash] = script.character_setting[originalName];
                    script.character_setting[charHash].name = charHash;
                    delete script.character_setting[originalName];

                    // 2. 替换 shots 中的引用
                    script.shots.forEach((shot: any) => {
                        if (shot.dialogue && shot.dialogue.role === originalName) {
                            shot.dialogue.role = charHash;
                        }
                        if (shot.visual && shot.visual.includes(originalName)) {
                            shot.visual = shot.visual.replace(new RegExp(originalName, 'g'), charHash);
                        }
                    });
                }
            }
        } else {
            console.log('   ⚠️ 未检测到 GEMINI_API_KEY，使用模拟剧本...');
            script = {
                "character_setting": {
                    [charHash]: {
                        "age": 5,
                        "appearance": "黄色电气鼠，红脸颊，尖耳朵，闪电尾巴",
                        "name": charHash,
                        "voice": "可爱童声，音调高，语速中等"
                    }
                },
                "shots": [
                    {
                        "action": "对着镜头挥手",
                        "camera": "正面特写",
                        "dialogue": {
                            "role": charHash,
                            "text": "今天天气真不错，我们出去玩吧！"
                        },
                        "duration": 5,
                        "location": "森林空地",
                        "style_tags": "明亮，活泼",
                        "time": "白天",
                        "visual": `${charHash} 站在森林空地中央，面对镜头微笑挥手`,
                        "weather": "晴朗"
                    },
                    {
                        "action": "转身蹦跳",
                        "camera": "跟随镜头",
                        "dialogue": {
                            "role": charHash,
                            "text": "跟我来！"
                        },
                        "duration": 5,
                        "location": "森林小路",
                        "style_tags": "动感，欢快",
                        "time": "白天",
                        "visual": `${charHash} 欢快地在森林小路上蹦跳前进`,
                        "weather": "晴朗"
                    },
                    {
                        "action": "回头看镜头",
                        "camera": "侧面中景",
                        "duration": 5,
                        "location": "森林深处",
                        "style_tags": "温馨，互动",
                        "time": "白天",
                        "visual": `${charHash} 在树林间回头看向镜头，露出期待的表情`,
                        "weather": "晴朗"
                    }
                ]
            };
        }

        console.log('   ✅ 剧本优化完成');
        console.log('   剧本预览:', JSON.stringify(script, null, 2).substring(0, 200) + '...\n');

        // ===============================================
        // 步骤 3：生成视频 (Sora)
        // ===============================================
        console.log('3️⃣ [步骤 3] 提交 Sora 视频生成任务...');
        const videoResult = await service.submitTask(script, {
            duration: 15,
            aspect_ratio: 'landscape',
            image_url: testCharImage // 使用图片 URL
        });

        console.log(`   ✅ 视频任务提交成功！Task ID: ${videoResult.taskId}`);

        // 轮询视频生成状态
        console.log('   正在轮询视频生成状态...');
        let videoStatus = 'QUEUED';
        let videoPollCount = 0;
        const maxVideoPolls = 120; // 最多轮询 120 次（10 分钟）

        while (videoStatus !== 'SUCCESS' && videoStatus !== 'FAILED' && videoPollCount < maxVideoPolls) {
            await new Promise(r => setTimeout(r, 5000)); // 每 5 秒查询一次
            videoPollCount++;

            const statusResult = await service.getTaskStatus(videoResult.taskId);
            videoStatus = statusResult.status;
            process.stdout.write(`   [轮询 ${videoPollCount}/${maxVideoPolls}] 状态: ${videoStatus} | 进度: ${statusResult.progress}%\r`);

            if (videoStatus === 'SUCCESS') {
                console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('🎉 所有步骤完成！视频生成成功！');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`\n📹 最终视频链接: ${statusResult.result_url}`);
                console.log(`\n总结:`);
                console.log(`  • 图片 URL: ${testCharImage}`);
                console.log(`  • 角色编码: ${charHash}`);
                console.log(`  • 角色任务 ID: ${charResult.taskId}`);
                console.log(`  • 视频任务 ID: ${videoResult.taskId}`);
                console.log(`  • 视频链接: ${statusResult.result_url}\n`);
            } else if (videoStatus === 'FAILED') {
                console.log(`\n\n❌ 视频生成失败: ${statusResult.error_msg}`);
                throw new Error(`Video generation failed: ${statusResult.error_msg}`);
            }
        }

        if (videoPollCount >= maxVideoPolls) {
            throw new Error('视频生成超时（超过 10 分钟）');
        }

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
