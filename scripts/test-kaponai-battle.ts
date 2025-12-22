
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sizeOf from 'image-size';
import { KaponaiService } from '../src/services/KaponaiService';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * 辅助函数：自动计算图片比例并返回 Sora 支持的格式
 */
function getSoraSize(imagePath: string): string {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const dimensions = sizeOf(imageBuffer);
        if (!dimensions.width || !dimensions.height) return '1280x720';

        const ratio = dimensions.width / dimensions.height;
        if (ratio >= 1) return '1280x720'; // 16:9 横屏或正方形
        return '720x1280'; // 9:16 竖屏
    } catch (e) {
        return '1280x720';
    }
}

async function main() {
    console.log('⚔️  Kapon AI Sora2 Pro 25s 战斗场景测试 (骷髅兵 vs 林洛)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const service = new KaponaiService();

    // 素材路径
    const skeletonImg = path.resolve(process.cwd(), 'scripts/test/骷髅兵.png');
    const linluoImg = path.resolve(process.cwd(), 'scripts/test/林洛-铠甲.png');

    try {
        /*
        // ============================================
        // [备份] 步骤 1: 生成角色参考视频 (10s, 自动比例)
        // ============================================
        console.log('📹 [步骤 1] 正在并发生成角色参考视频 (10s)...');

        const [taskS, taskL] = await Promise.all([
            service.createVideo({
                model: 'sora-2',
                prompt: '一位身穿破旧灰色铠甲的枯骨战士，眼眶中蓝火跳动，手持重型骨剑。镜头环抱拍摄，从正面展示其全身细节，角色对着镜头摆出防御姿态。要求：画面极其稳定，严禁闪烁，色彩深沉，严格遵循视觉描述。',
                seconds: 10,
                size: getSoraSize(skeletonImg),
                input_reference: skeletonImg
            }),
            service.createVideo({
                model: 'sora-2',
                prompt: '英俊的年轻战士林洛，对着镜头说 今天天气真不错 我们出去玩吧，与镜头互动。要求：画面极其稳定，严禁闪烁，光影衔接自然，严格遵循视觉描述。',
                seconds: 10,
                size: getSoraSize(linluoImg),
                input_reference: linluoImg
            })
        ]);

        console.log(`   ✅ 骷髅兵参考视频任务: ${taskS.id}`);
        console.log(`   ✅ 林洛参考视频任务: ${taskL.id}`);

        // ============================================
        // [备份] 步骤 2: 等待参考视频完成
        // ============================================
        console.log('\n⏳ [步骤 2] 正在等待视频生成完成...');
        const [resS, resL] = await Promise.all([
            service.waitForCompletion(taskS.id),
            service.waitForCompletion(taskL.id)
        ]);
        const skeletonVideoUrlFallback = resS.video_url || `https://models.kapon.cloud/v1/videos/${taskS.id}/content`;
        const linluoVideoUrlFallback = resL.video_url || `https://models.kapon.cloud/v1/videos/${taskL.id}/content`;
        */

        // 🚀 当前使用：用户提供的已有参考视频 URL (快速测试)
        const skeletonVideoUrl = 'https://video.starying.cn/v/y6iuuQm42IWWISu1.mp4';
        const linluoVideoUrl = 'https://video.starying.cn/v/ZlDv1xP5ijffpdJf.mp4';

        console.log('📹 使用已有的角色参考视频:');
        console.log(`   💀 骷髅兵: ${skeletonVideoUrl}`);
        console.log(`   🛡️ 林洛: ${linluoVideoUrl}\n`);

        // ============================================
        // 步骤 3: 正式创建角色以获取 @username (提升一致性)
        // ============================================
        console.log('🎭 [步骤 3] 正在正式创建角色标识 (获取 @username)...');

        const [charResS, charResL] = await Promise.all([
            service.createCharacter({
                url: skeletonVideoUrl,
                timestamps: "1,3"
            }),
            service.createCharacter({
                url: linluoVideoUrl,
                timestamps: "1,3"
            })
        ]);

        const skeletonId = `@${charResS.username}`;
        const linluoId = `@${charResL.username}`;

        console.log(`   ✅ 骷髅战士 已绑定标识: ${skeletonId}`);
        console.log(`   ✅ 林洛 已绑定标识: ${linluoId}`);

        // ============================================
        // 步骤 4: 构建并提交 25s HD 战斗剧本
        // ============================================
        console.log('\n📝 [步骤 4] 正在构建 25s 史诗战斗剧本 (JSON 格式)...');

        const battleScript = {
            "character_setting": {
                [skeletonId]: {
                    "age": 100,
                    "appearance": `骷髅战士，身穿破旧深灰色盔甲，手持锈迹斑斑的骨剑，眼眶中闪烁蓝色幽光。角色编码：${skeletonId}`,
                    "name": "骷髅战士",
                    "voice": "Monster Deep Raspy"
                },
                [linluoId]: {
                    "age": 24,
                    "appearance": `年轻男子，黑色短发，银色闪耀铠甲，红色斗篷。角色编码：${linluoId}`,
                    "name": "林洛",
                    "voice": "Hero Brave Young"
                }
            },
            "shots": [
                {
                    "action": `${skeletonId} 和 ${linluoId} 在废弃王座大厅对峙`,
                    "camera": "从大厅远景缓慢推向中景，呈现压抑的空间感",
                    "dialogue": { "role": linluoId, "text": "你的统治到此为止了。" },
                    "duration": 6,
                    "location": "古老王座厅",
                    "style_tags": "4k, 电影感, 无闪烁, 丁达尔效应",
                    "time": "深夜",
                    "visual": `在幽暗的王座厅内，${skeletonId} 像一座雕像般矗立，骨剑倒插。${linluoId} 缓步步入大厅，银色铠甲在火光下反光，红色斗篷猎猎作响。两人目光交汇。`,
                    "weather": "寒冷"
                },
                {
                    "action": `${skeletonId} 猛然投掷骨剑，${linluoId} 侧滑避开并拔剑反击`,
                    "camera": "跟随动作快速平移",
                    "duration": 6,
                    "location": "大厅中央",
                    "style_tags": "动作大片, 极流畅, 无闪烁, 剑气光效",
                    "time": "深夜",
                    "visual": `${skeletonId} 爆发出蓝色魂火并投掷重剑。${linluoId} 优雅侧滑，战靴在地面擦出火星，随后拔出长剑划出一道银色剑光。`,
                    "weather": "室内"
                },
                {
                    "action": "双方在石柱交错间进行高强度对拼",
                    "camera": "环绕360度旋转拍摄",
                    "duration": 7,
                    "location": "大厅立柱区",
                    "style_tags": "火花四溅, 能量波动, 动作连贯",
                    "time": "深夜",
                    "visual": `${linluoId} 与 ${skeletonId} 的兵刃剧烈撞击，每一次交锋都伴随着能量波纹。${linluoId} 的银铠反射着 ${skeletonId} 眼中的蓝光，动作迅猛有力。`,
                    "weather": "灰尘飞扬"
                },
                {
                    "action": `${linluoId} 蓄力一击击碎 ${skeletonId}`,
                    "camera": "定格仰拍胜利姿态",
                    "duration": 6,
                    "location": "王座前方",
                    "style_tags": "终结时刻, 史诗感, 画面清晰",
                    "time": "凌晨",
                    "visual": `${linluoId} 的长剑汇聚耀眼强光，自上而下贯穿 ${skeletonId} 的核心。骷髅身体迅速崩裂风化，化作尘埃。遗迹重归沉寂。`,
                    "weather": "微光"
                }
            ]
        };

        console.log('   🚀 正在提交 Sora2 Pro 高清视频生成任务 (多角色一致性模式)...');

        const finalTask = await service.createVideo({
            model: 'sora-2-pro',
            prompt: battleScript,
            seconds: 25,
            size: '1792x1024'
        });

        console.log(`   ✅ 最终视频提交成功: ${finalTask.id}`);

        // ============================================
        // 步骤 5: 轮询并下载
        // ============================================
        console.log('\n⏳ [步骤 5] 正在轮询 25s HD 战斗视频 (可能需要更多时间)...');
        const finalStatus = await service.waitForCompletion(finalTask.id, 400, 10000);

        console.log(`\n🎉 25s 史诗视频生成成功！`);
        console.log(`🔗 视频 URL: ${finalStatus.video_url || '请查看下载文件'}`);

        const outputDir = path.resolve(process.cwd(), 'outputs');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        const outputPath = path.resolve(outputDir, `kaponai_epic_battle_${finalTask.id}.mp4`);

        await service.downloadVideo(finalTask.id, outputPath);
        console.log(`\n📥 视频已保存至: ${outputPath}`);

        console.log('\n✨ 测试流程全部完成！');

    } catch (error: any) {
        console.error('\n❌ 测试流程失败:', error.message);
        process.exit(1);
    }
}

main();
