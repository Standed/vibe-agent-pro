import dotenv from 'dotenv';
import path from 'path';
import { RunningHubService } from '../src/services/RunningHubService';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    console.log('⚔️  RunningHub Sora2 Pro 战斗场景测试 (骷髅兵 vs 林洛)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.RUNNINGHUB_API_KEY;
    if (!apiKey || apiKey.includes('your_api_key')) {
        console.error('❌ 错误: 未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    const service = new RunningHubService();

    // 图片路径
    const imgPath1 = path.resolve(process.cwd(), 'scripts/test/骷髅兵.png');
    const imgPath2 = path.resolve(process.cwd(), 'scripts/test/林洛-铠甲.png');

    try {
        // ============================================
        // 步骤 1: 上传图片并创建角色 (并发执行)
        // ============================================
        console.log('📤 [步骤 1] 上传图片并创建角色...');

        // 1. 上传图片 1 (骷髅兵)
        console.log(`   上传图片 1: ${path.basename(imgPath1)}`);
        const hashImg1 = await service.uploadImage(imgPath1);
        console.log(`   ✅ 骷髅兵素材Hash: ${hashImg1}`);

        // 2. 上传图片 2 (林洛)
        console.log(`   上传图片 2: ${path.basename(imgPath2)}`);
        const hashImg2 = await service.uploadImage(imgPath2);
        console.log(`   ✅ 林洛素材Hash: ${hashImg2}`);

        console.log('\n🎭 正在提交角色一致性生成任务...');

        // 3. 创建角色 1 任务
        const task1 = await service.uploadCharacter(hashImg1, "骷髅战士，手持锈迹斑斑的骨剑，破旧盔甲，全身骨骼，眼中有蓝火");
        console.log(`   ✅ 骷髅兵任务 ID: ${task1.taskId}`);

        // 4. 创建角色 2 任务
        const task2 = await service.uploadCharacter(hashImg2, "英勇战士，身穿银绿色华丽铠甲，黑色短发，手持长剑，英姿飒爽");
        console.log(`   ✅ 林洛任务 ID: ${task2.taskId}`);


        // ============================================
        // 步骤 2: 等待角色生成 (获取最终 ID)
        // ============================================
        console.log('\n⏳ [步骤 2] 等待角色生成 (获取 Sora 角色 ID)...');

        const [char1Hash, char2Hash] = await Promise.all([
            pollForCharacter(service, task1.taskId, "骷髅兵"),
            pollForCharacter(service, task2.taskId, "林洛")
        ]);

        console.log('\n✅ 角色准备就在绪:');
        console.log(`   💀 骷髅兵 ID: ${char1Hash}`);
        console.log(`   🛡️ 林洛 ID:   ${char2Hash}\n`);


        // ============================================
        // 步骤 3: 构建战斗剧本
        // ============================================
        console.log('📝 [步骤 3] 构建战斗剧本...');

        const battleScript = {
            "character_setting": {
                [char1Hash]: {
                    "age": 100,
                    "appearance": "骷髅战士，破旧盔甲，骨剑，蓝色眼火",
                    "name": char1Hash,
                    "voice": "Monster"
                },
                [char2Hash]: {
                    "age": 25,
                    "appearance": "年轻战士，银绿色铠甲，黑发，英俊",
                    "name": char2Hash,
                    "voice": "Hero"
                }
            },
            "shots": [
                {
                    "action": "对峙",
                    "camera": "侧面平移",
                    "dialogue": { "role": char1Hash, "text": "入侵者...死！" },
                    "duration": 4,
                    "location": "荒凉废墟",
                    "style_tags": "紧张, 电影感, 黑暗风",
                    "time": "黄昏",
                    "visual": `${char1Hash} 和 ${char2Hash} 在废墟中对峙。${char1Hash} 举起骨剑，${char2Hash} 拔出长剑，双方蓄势待发。`,
                    "weather": "阴沉"
                },
                {
                    "action": "激烈交锋",
                    "camera": "跟随镜头，摇晃",
                    "duration": 4,
                    "location": "荒凉废墟",
                    "style_tags": "动作, 火花, 速度线",
                    "time": "黄昏",
                    "visual": `${char1Hash} 猛烈劈砍，${char2Hash} 用剑格挡并侧身闪避，兵器碰撞迸发出火花。`,
                    "weather": "阴沉"
                },
                {
                    "action": "反击",
                    "camera": "低角度仰拍",
                    "duration": 3,
                    "location": "荒凉废墟",
                    "style_tags": "特写, 慢动作",
                    "time": "黄昏",
                    "visual": `${char2Hash} 抓住空隙，一记强力横扫击退 ${char1Hash}。${char1Hash} 后退几步，稳住身形。`,
                    "weather": "阴沉"
                },
                {
                    "action": "决战一击",
                    "camera": "远景拉开",
                    "duration": 4,
                    "location": "荒凉废墟",
                    "style_tags": "史诗感, 广角",
                    "time": "黄昏",
                    "visual": `两人再次冲向对方，身影交错，${char2Hash} 剑光一闪，${char1Hash} 身形定格。画面在决战瞬间定格。`,
                    "weather": "阴沉"
                }
            ]
        };

        console.log('   ✅ 剧本已生成 (使用 Hash ID 替换角色名)');
        // console.log(JSON.stringify(battleScript, null, 2));


        // ============================================
        // 步骤 4: 提交视频任务
        // ============================================
        console.log('\n🎬 [步骤 4] 提交 Sora 视频生成任务 (15s)...');

        // Note: RunningHub usually generates better results if we DON'T provide one random image_url 
        // when multiple characters are in play via character_setting.
        const videoResult = await service.submitTask(battleScript, {
            duration: 15,
            aspect_ratio: 'landscape-hd',
            image_url: undefined
        });

        console.log(`   ✅ 视频任务 ID: ${videoResult.taskId}`);


        // ============================================
        // 步骤 5: 轮询视频结果
        // ============================================
        console.log('\n⏳ [步骤 5] 正在轮询视频生成状态...');

        const videoUrl = await pollForVideo(service, videoResult.taskId);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 战斗视频生成成功！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`📹 视频链接: ${videoUrl}\n`);
        console.log(`📊 任务 ID: ${videoResult.taskId}`);
        console.log(`💀 骷髅 ID: ${char1Hash}`);
        console.log(`🛡️ 林洛 ID: ${char2Hash}`);

    } catch (error: any) {
        console.error('\n❌ 测试失败:', error.message);
        process.exit(1);
    }
}

// 辅助函数：轮询角色
async function pollForCharacter(service: RunningHubService, taskId: string, name: string): Promise<string> {
    let status = 'QUEUED';
    let pollCount = 0;
    while (status !== 'SUCCESS' && status !== 'FAILED' && pollCount < 60) {
        await new Promise(r => setTimeout(r, 5000));
        pollCount++;
        const s = await service.getTaskStatus(taskId);
        status = s.status;
        process.stdout.write(`   [${name}] ${status} ${s.progress}%\r`);

        if (status === 'SUCCESS') {
            const outputs = await service.getTaskOutputs(taskId);
            if (outputs && outputs.length > 0) {
                // 优先使用 fileName
                let hash = outputs[0].fileName;
                // 注意：RunningHub 有时返回完整 path 'api/xxx.png',
                // 有时可能需要清洗。根据之前的 user feedback, 我们先保留完整 fileName
                // 但如果包含 'api/' 前缀，可能要 strip 掉?
                // 用户之前的经验貌似暗示 sora 要的是那个 hash string.
                // 我们之前代码: if (charStatus === 'SUCCESS' && s.result_url) ... split('/').pop();
                // 这里的 outputs[0].fileName 通常是 "api/hash.png". 
                // 我们直接用 fileName 吧。如果 url 存在，再 fallback。
                if (!hash && outputs[0].url) {
                    hash = outputs[0].url.split('/').pop();
                }

                // 去除可能存在的 path 前缀
                if (hash && hash.includes('/')) {
                    hash = hash.split('/').pop();
                }

                return hash || "UNKNOWN_HASH";
            }
        } else if (status === 'FAILED') {
            throw new Error(`${name} 生成失败: ${s.error_msg}`);
        }
    }
    throw new Error(`${name} 生成超时`);
}

// 辅助函数：轮询视频
async function pollForVideo(service: RunningHubService, taskId: string): Promise<string> {
    let status = 'QUEUED';
    let pollCount = 0;
    while (status !== 'SUCCESS' && status !== 'FAILED' && pollCount < 180) { // 15s video might take longer
        await new Promise(r => setTimeout(r, 5000));
        pollCount++;
        const s = await service.getTaskStatus(taskId);
        status = s.status;
        process.stdout.write(`   [Video] ${status} ${s.progress}%\r`);

        if (status === 'SUCCESS') {
            let url = s.result_url;
            if (!url) {
                const outputs = await service.getTaskOutputs(taskId);
                if (outputs && outputs.length > 0) {
                    // 通常找第一个 mp4
                    const vid = outputs.find((o: any) => o.url && o.url.endsWith('.mp4'));
                    url = vid ? vid.url : outputs[0].url;
                }
            }
            return url || "UNKNOWN_URL";
        } else if (status === 'FAILED') {
            throw new Error(`视频生成失败: ${s.error_msg}`);
        }
    }
    throw new Error(`视频生成超时`);
}

main();
