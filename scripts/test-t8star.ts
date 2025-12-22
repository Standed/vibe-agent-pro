import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { T8StarService } from '../src/services/T8StarService';

/**
 * T8Star API 测试：生成 15s 横屏高清视频
 * 类似之前 RunningHub 的工作流程
 */

async function main() {
    console.log('🚀 T8Star Sora2 Pro 视频生成测试\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.T8STAR_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-')) {
        console.error('❌ 错误: T8STAR_API_KEY 未正确配置');
        console.error('   请在 .env.local 中设置 T8STAR_API_KEY=sk-xxx');
        process.exit(1);
    }

    const service = new T8StarService();

    try {
        // 步骤 1: 准备 T8Star 格式的 Storyboard
        console.log('📝 步骤 1/2: 准备 Storyboard（T8Star 文本格式）\n');

        // T8Star 使用文本格式的 storyboard，不是 JSON
        const storyboard = `Shot 1:
duration: 5sec
Scene: 在阳光明媚的森林空地中，一只可爱的黄色皮卡丘站在中央。它有着红色的圆脸颊，尖尖的耳朵，闪电形状的尾巴。皮卡丘面带笑容，抬起小手对着镜头欢快地挥手打招呼。周围是绿色的草地和高大的树木，阳光透过树叶洒下斑驳的光影。

Shot 2:
duration: 5sec
Scene: 皮卡丘转过身，开始在森林小路上欢快地蹦跳前进。它的动作轻盈活泼，尾巴随着跳跃摇摆。镜头跟随着皮卡丘的移动，捕捉它充满活力的身影。背景是郁郁葱葱的森林，树木两旁的小路延伸向远方。

Shot 3:
duration: 5sec
Scene: 走到森林深处，皮卡丘停下脚步，回头看向镜头。它的大眼睛闪烁着期待的光芒，嘴角上扬露出温暖的笑容。这是一个温馨的互动时刻，仿佛在邀请观众一起探索森林的奥秘。镜头采用侧面中景，突出皮卡丘可爱的表情和周围的自然环境。`;

        console.log('✅ Storyboard 准备完成\n');
        console.log('故事板内容:');
        console.log('─'.repeat(60));
        console.log(storyboard);
        console.log('─'.repeat(60));
        console.log();

        // 步骤 2: 提交视频生成任务
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📤 步骤 2/2: 提交 Sora2 Pro 视频生成任务\n');
        console.log('参数配置:');
        console.log('  • 模型: sora-2-pro');
        console.log('  • 分辨率: 16:9 (横屏)');
        console.log('  • 时长: 15s');
        console.log('  • 高清: 是 (HD)');
        console.log();

        const result = await service.createStoryboardVideo(storyboard, {
            model: 'sora-2-pro',
            aspect_ratio: '16:9',
            duration: '15',
            hd: true,
            watermark: false,
            private: false
        });

        console.log(`✅ 任务提交成功！`);
        console.log(`   Task ID: ${result.task_id}\n`);

        // 步骤 3: 等待视频生成完成
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⏳ 等待视频生成完成（最多 10 分钟）\n');

        const completedTask = await service.waitForCompletion(
            result.task_id,
            120,  // 最多 120 次轮询
            5000  // 每 5 秒轮询一次
        );

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 视频生成完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('任务信息:');
        console.log(`  • Task ID: ${completedTask.task_id}`);
        console.log(`  • 状态: ${completedTask.status}`);

        if (completedTask.data?.output) {
            console.log(`  • 视频 URL: ${completedTask.data.output}\n`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`\n🎬 下载视频: ${completedTask.data.output}\n`);
        } else {
            console.log('  • 视频 URL: 未找到\n');
            console.log('完整响应数据:');
            console.log(JSON.stringify(completedTask, null, 2));
            console.log();
        }

        console.log('✅ 测试成功完成！\n');

    } catch (error: any) {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ 测试失败');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('错误信息:', error.message || error);
        if (error.stack) {
            console.error('堆栈跟踪:', error.stack);
        }
        process.exit(1);
    }
}

main();
