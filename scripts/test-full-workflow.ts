import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { RunningHubService } from '../src/services/RunningHubService';

async function main() {
    console.log('🎬 RunningHub Sora2 Pro 完整工作流程测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.RUNNINGHUB_API_KEY;
    if (!apiKey || apiKey.includes('your_api_key')) {
        console.error('❌ 错误: 未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    const service = new RunningHubService();

    try {
        // ============================================
        // 步骤 1: 上传图片到 RunningHub
        // ============================================
        console.log('📤 [步骤 1/5] 上传基础素材图片...');

        // 使用在线测试图片
        const imageUrl = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";
        console.log(`   源图片: ${imageUrl}`);

        // 调用 uploadImage 获取 RunningHub 内部 fileName (Hash)
        const uploadedImageHash = await service.uploadImage(imageUrl);
        console.log(`   ✅ 图片上传成功!`);
        console.log(`   Internal Reference (Hash): ${uploadedImageHash}\n`);

        // ============================================
        // 步骤 2: 创建 Sora 角色 (Character Consistency)
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎭 [步骤 2/5] 创建 Sora 角色 (获取角色编码)...');

        // 使用步骤 1 得到的 Hash 作为输入
        const charResult = await service.uploadCharacter(
            uploadedImageHash,
            "皮卡丘在森林中，面带笑容" // 简单的角色描述
        );

        console.log(`   ✅ 角色生成任务提交成功! Task ID: ${charResult.taskId}\n`);

        // ============================================
        // 步骤 3: 等待角色任务完成并提取角色编码
        // ============================================
        console.log('⏳ [步骤 3/5] 等待角色生成完成 (以获取角色编码)...');

        let charOutputHash = "";
        let charStatus = 'QUEUED';
        let pollCount = 0;
        const maxPolls = 60; // 5分钟

        while (charStatus !== 'SUCCESS' && charStatus !== 'FAILED' && pollCount < maxPolls) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;

            const s = await service.getTaskStatus(charResult.taskId);
            charStatus = s.status;
            process.stdout.write(`   [轮询 ${pollCount}/${maxPolls}] 状态: ${charStatus} | 进度: ${s.progress}%\r`);

            if (charStatus === 'SUCCESS') {
                console.log('\n   ✅ 任务成功，正在提取输出...');

                // 获取输出文件
                const outputs = await service.getTaskOutputs(charResult.taskId);

                if (outputs && outputs.length > 0) {
                    // 通常输出的第一个文件就是结果图
                    const firstOutput = outputs[0];
                    // 使用 output 的 fileName 或从 URL 提取文件名
                    // RunningHub 的 outputs 结构通常包含 fileUrl, fileName, 等
                    // 我们优先使用 fileName，如果没有则从 fileUrl 提取
                    if (firstOutput.fileName) {
                        charOutputHash = firstOutput.fileName;
                    } else if (firstOutput.fileUrl) {
                        const parts = firstOutput.fileUrl.split('/');
                        charOutputHash = parts[parts.length - 1];
                    }

                    // 修正: 有时 fileName 带有路径前缀 'api/'，Sora 剧本中可能只需要文件名部分?
                    // 但通常作为 file reference 引用时需要完整 fileName。
                    // 但是作为 "角色名称" (Character Name) 在 JSON 中使用时，
                    // 用户说: "角色编码要替换上去... 这样 sora 才知道是哪个角色"
                    // 我们保留完整文件名作为 ID，如果它是 'api/xyz.png' 这种格式。
                    // 或者我们只取 hash 部分？
                    // 让我们稍微清洗一下：如果包含 'api/'，可能 prompt 里用纯 hash 会更好，
                    // 但也就是文件名。让我们暂且使用文件名部分 (basename)。
                    // 比如 'api/123.png' -> '123.png'
                    if (charOutputHash.includes('/')) {
                        charOutputHash = charOutputHash.split('/').pop() || charOutputHash;
                    }

                    console.log(`   ✅ 提取到角色编码 (Hash): ${charOutputHash}`);
                    console.log(`   (原始输出 URL: ${firstOutput.fileUrl || firstOutput.url})`);

                } else {
                    console.warn('   ⚠️ 任务成功但未找到输出文件！');
                }
                break;
            } else if (charStatus === 'FAILED') {
                throw new Error(`角色生成失败: ${s.error_msg}`);
            }
        }

        if (!charOutputHash) {
            console.warn('   ⚠️ 未能获取角色编码，将使用原始上传图片 Hash 作为替补 (可能影响一致性)');
            charOutputHash = uploadedImageHash.split('/').pop() || uploadedImageHash;
        }
        console.log(`   👉 最终使用的角色编码: ${charOutputHash}\n`);


        // ============================================
        // 步骤 4: 生成视频剧本 (并替换角色名为编码)
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 [步骤 4/5] 生成视频剧本 & 注入角色编码...');

        let script: any;
        const charNameInScript = charOutputHash; // 使用提取的 hash 作为角色名

        // 构造剧本
        script = {
            "character_setting": {
                [charNameInScript]: {
                    "age": 5,
                    "appearance": "黄色电气鼠，红脸颊，尖耳朵",
                    "name": charNameInScript, // 必须是这个 hash
                    "voice": "Cute"
                }
            },
            "shots": [
                {
                    "action": "对着镜头微笑挥手",
                    "camera": "正面中景",
                    "dialogue": {
                        "role": charNameInScript,
                        "text": "今天天气真不错！"
                    },
                    "duration": 5,
                    "location": "森林",
                    "style_tags": "明亮, 动漫风格",
                    "time": "白天",
                    "visual": `${charNameInScript} 站在森林里，阳光透过树叶洒下，对着镜头开心地挥手`,
                    "weather": "晴朗"
                },
                {
                    "action": "转身跑向深处",
                    "camera": "跟随镜头",
                    "duration": 5,
                    "location": "森林小路",
                    "style_tags": "动感",
                    "time": "白天",
                    "visual": `${charNameInScript} 转身沿着小路向森林深处跑去，尾巴摇摆`,
                    "weather": "晴朗"
                }
            ]
        };

        console.log('   ✅ 剧本已构建 (预览):');
        console.log(JSON.stringify(script, null, 2).substring(0, 300) + '...\n');


        // ============================================
        // 步骤 5: 提交视频生成任务
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎬 [步骤 5/5] 提交 Sora 视频生成任务...');

        // 注意：这里 Node 2 (image) 我们传入原始上传的图片 (uploadedImageHash) 作为 reference，
        // 而 Prompt 中使用 charOutputHash (作为角色 ID)。
        const videoResult = await service.submitTask(script, {
            duration: 10, // 对应剧本时长
            aspect_ratio: 'landscape',
            image_url: uploadedImageHash // 传入原始图片的 hash
        });

        console.log(`   ✅ 视频任务提交成功! Task ID: ${videoResult.taskId}\n`);

        // ============================================
        // 步骤 6: 轮询视频结果
        // ============================================
        console.log('⏳ 正在轮询视频生成状态...');

        let videoStatus = 'QUEUED';
        let videoPollCount = 0;
        const maxVideoPolls = 120; // 10分钟

        while (videoStatus !== 'SUCCESS' && videoStatus !== 'FAILED' && videoPollCount < maxVideoPolls) {
            await new Promise(r => setTimeout(r, 5000));
            videoPollCount++;

            const s = await service.getTaskStatus(videoResult.taskId);
            videoStatus = s.status;
            process.stdout.write(`   [轮询 ${videoPollCount}/${maxVideoPolls}] 状态: ${videoStatus} | 进度: ${s.progress}%\r`);

            if (videoStatus === 'SUCCESS') {
                console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('🎉 视频生成成功!');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`� 视频链接: ${s.result_url}`);
                console.log(`\n任务详情:`);
                console.log(`  • 原始图Hash: ${uploadedImageHash}`);
                console.log(`  • 角色Hash:   ${charOutputHash}`);
                console.log(`  • 视频TaskID: ${videoResult.taskId}`);
                break;
            } else if (videoStatus === 'FAILED') {
                throw new Error(`视频生成失败: ${s.error_msg}`);
            }
        }

        if (videoPollCount >= maxVideoPolls) {
            throw new Error('视频生成超时');
        }

    } catch (error: any) {
        console.error('\n❌ 流程失败:', error.message);
        // console.error(error.stack);
    }
}

main();
