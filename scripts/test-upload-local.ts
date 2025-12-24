import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { RunningHubService } from '../src/services/RunningHubService';

async function main() {
    console.log('🖼️  测试上传本地图片到 RunningHub\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.RUNNINGHUB_API_KEY;
    if (!apiKey || apiKey.includes('your_api_key')) {
        console.error('❌ 错误: 未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    const service = new RunningHubService();

    try {
        // 本地图片路径
        const localImagePath = path.resolve(process.cwd(), 'scripts/test/花妖状态.png');
        console.log(`📁 图片路径: ${localImagePath}`);

        // 上传图片
        console.log('\n📤 开始上传图片...');
        const fileName = await service.uploadImage(localImagePath);

        console.log('\n✅ 上传成功！');
        console.log(`   fileName: ${fileName}`);

        // 测试使用这个 fileName 提交角色任务
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🎭 测试使用上传的图片创建角色...');

        const charResult = await service.uploadCharacter(fileName, "花妖站在花园中，对着镜头微笑挥手");

        console.log('\n✅ 角色任务提交成功！');
        console.log(`   Task ID: ${charResult.taskId}`);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 测试完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📝 后续步骤:');
        console.log('  1. 访问 RunningHub 控制台查看角色生成进度');
        console.log('  2. 等待角色生成完成后，可使用返回的角色编码生成视频');
        console.log(`  3. Task ID: ${charResult.taskId}\n`);

    } catch (error: any) {
        console.error('\n❌ 测试失败:', error.message);
        console.error('堆栈跟踪:', error.stack);
        process.exit(1);
    }
}

main();
