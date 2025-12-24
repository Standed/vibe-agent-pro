import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { T8StarService } from '../src/services/T8StarService';

/**
 * T8Star API 完整测试：骷髅兵 vs 林洛 战斗场景
 *
 * 工作流程：
 * 1. 为骷髅兵生成角色视频（图生视频，10s）
 * 2. 为林洛生成角色视频（图生视频，10s）
 * 3. 从视频创建两个角色
 * 4. 生成 15s 战斗场景（4个镜头，引用两个角色）
 */

async function main() {
    console.log('⚔️  T8Star Sora2 Pro 战斗场景生成测试\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiKey = process.env.T8STAR_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-')) {
        console.error('❌ 错误: T8STAR_API_KEY 未正确配置');
        process.exit(1);
    }

    const service = new T8StarService();

    try {
        // ============================================
        // 步骤 1-2: 并发准备两个角色的图生视频任务
        // ============================================
        console.log('🎬 步骤 1-2/5: 并发生成两个角色视频\n');

        // 准备骷髅兵数据
        const skeletonImagePath = path.resolve(process.cwd(), 'scripts/test/骷髅兵.png');
        console.log('🦴 准备骷髅兵数据...');
        console.log(`   图片路径: ${skeletonImagePath}`);
        const skeletonAspectRatio = await service.getImageAspectRatio(skeletonImagePath);
        console.log(`   ✅ 图片比例: ${skeletonAspectRatio}`);
        const skeletonBase64 = await service.imageToBase64(skeletonImagePath);
        console.log(`   ✅ Base64 长度: ${skeletonBase64.length} 字符\n`);

        // 准备林洛数据
        const linluoImagePath = path.resolve(process.cwd(), 'scripts/test/林洛-铠甲.png');
        console.log('🛡️  准备林洛数据...');
        console.log(`   图片路径: ${linluoImagePath}`);
        const linluoAspectRatio = await service.getImageAspectRatio(linluoImagePath);
        console.log(`   ✅ 图片比例: ${linluoAspectRatio}`);
        const linluoBase64 = await service.imageToBase64(linluoImagePath);
        console.log(`   ✅ Base64 长度: ${linluoBase64.length} 字符\n`);

        // 并发提交两个图生视频任务
        console.log('🚀 并发提交两个图生视频任务...\n');
        const [skeletonTask, linluoTask] = await Promise.all([
            service.createImageToVideo(
                [skeletonBase64],
                '一个身穿破旧盔甲的骷髅战士，手持一把锈迹斑斑的骨剑，眼眶中闪烁着蓝色幽光。它对着镜头缓慢转身，展示全身装备，然后摆出战斗姿态，剑指镜头方向，与镜头互动。',
                {
                    model: 'sora-2',
                    duration: '10',
                    aspect_ratio: skeletonAspectRatio,
                    hd: false
                }
            ),
            service.createImageToVideo(
                [linluoBase64],
                '一位身穿华丽银绿色铠甲的年轻战士，黑色短发，蓝色眼眸，肩部有尖锐的护肩，胸甲上有金色纹饰。他对着镜头自信地转身，展示铠甲细节，然后拔出武器，摆出迎战姿态，与镜头互动。',
                {
                    model: 'sora-2',
                    duration: '10',
                    aspect_ratio: linluoAspectRatio,
                    hd: false
                }
            )
        ]);

        console.log(`✅ 骷髅兵任务提交成功: ${skeletonTask.task_id}`);
        console.log(`✅ 林洛任务提交成功: ${linluoTask.task_id}\n`);

        // ============================================
        // 步骤 3: 并发等待两个角色视频生成完成
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⏳ 步骤 3/5: 并发等待两个角色视频生成完成\n');

        const [skeletonVideo, linluoVideo] = await Promise.all([
            (async () => {
                console.log('📹 等待骷髅兵视频生成...\n');
                const video = await service.waitForCompletion(skeletonTask.task_id, 60, 5000);
                console.log(`\n✅ 骷髅兵视频生成完成！`);
                console.log(`   视频 URL: ${video.data?.output}\n`);
                return video;
            })(),
            (async () => {
                console.log('📹 等待林洛视频生成...\n');
                const video = await service.waitForCompletion(linluoTask.task_id, 60, 5000);
                console.log(`\n✅ 林洛视频生成完成！`);
                console.log(`   视频 URL: ${video.data?.output}\n`);
                return video;
            })()
        ]);

        // ============================================
        // 步骤 4: 并发创建两个角色
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🎭 步骤 4/5: 并发创建两个角色\n');

        const [skeletonCharacter, linluoCharacter] = await Promise.all([
            (async () => {
                console.log('创建骷髅兵角色...');
                const character = await service.createCharacter({
                    url: skeletonVideo.data?.output,
                    timestamps: '1,3'
                });
                console.log(`   ✅ 骷髅兵角色创建成功！`);
                console.log(`   Username: @${character.username}`);
                console.log(`   ID: ${character.id}\n`);
                return character;
            })(),
            (async () => {
                console.log('创建林洛角色...');
                const character = await service.createCharacter({
                    url: linluoVideo.data?.output,
                    timestamps: '1,3'
                });
                console.log(`   ✅ 林洛角色创建成功！`);
                console.log(`   Username: @${character.username}`);
                console.log(`   ID: ${character.id}\n`);
                return character;
            })()
        ]);

        // ============================================
        // 步骤 5: 生成 15s 战斗场景（4个镜头）
        // ============================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⚔️  步骤 5/5: 生成 15s 战斗场景（4个镜头）\n');

        // 使用 JSON 格式的 storyboard，包含 character_setting 和 shots
        // 所有角色引用使用动态获取的 @username
        const battleStoryboard = {
            "character_setting": {
                "骷髅战士": {
                    "age": 100,
                    "appearance": `骷髅，身穿破旧深灰色盔甲，手持锈迹斑斑的骨剑，眼眶中闪烁蓝色幽光，肩部有破损的护肩，腰间挂着皮质腰带和小袋。角色编码：@${skeletonCharacter.username}`,
                    "name": "骷髅战士",
                    "voice": "男性低沉 PitchMean（120 Hz） Tempo（100 SPM） Accent（沙哑阴森）"
                },
                "林洛": {
                    "age": 20,
                    "appearance": `男性，黑色短发，蓝色眼眸，身穿华丽银绿色铠甲，肩部有尖锐护肩，胸甲上有金色纹饰，腿部有银色护腿，手持精致长剑。角色编码：@${linluoCharacter.username}`,
                    "name": "林洛",
                    "voice": "男性年轻 PitchMean（180 Hz） Tempo（150 SPM） Accent（坚定有力）"
                }
            },
            "shots": [
                {
                    "action": `@${skeletonCharacter.username} 和 @${linluoCharacter.username} 警惕对峙`,
                    "camera": "侧面环绕拍摄，从左至右缓慢移动",
                    "duration": 4,
                    "location": "荒凉战场废墟",
                    "style_tags": "紧张，对峙，暗黑与光明对比",
                    "time": "黄昏",
                    "visual": `在荒凉的战场废墟中，@${skeletonCharacter.username} 和 @${linluoCharacter.username} 相距十米对峙。骷髅战士手持骨剑，眼中蓝光闪烁；林洛紧握武器，铠甲在黄昏余光下闪耀。两人警惕地盯着对方，战斗一触即发。`,
                    "weather": "晴朗"
                },
                {
                    "action": `@${skeletonCharacter.username} 发起进攻，@${linluoCharacter.username} 闪避反击`,
                    "camera": "快速跟随拍摄，从侧面捕捉动作",
                    "duration": 4,
                    "location": "战场废墟中央",
                    "style_tags": "激烈，快速，能量碰撞",
                    "time": "黄昏",
                    "visual": `@${skeletonCharacter.username} 率先发起进攻，快速冲向 @${linluoCharacter.username}，骨剑划出幽蓝色剑光。@${linluoCharacter.username} 迅速侧身闪避，同时挥剑反击。两把剑在空中碰撞，迸发出火花和能量波纹。`,
                    "weather": "晴朗"
                },
                {
                    "action": `@${linluoCharacter.username} 找到破绽发动攻击，@${skeletonCharacter.username} 被击退`,
                    "camera": "从后方跟随林洛视角",
                    "duration": 4,
                    "location": "战场废墟",
                    "style_tags": "压制性进攻，动态打击",
                    "time": "黄昏",
                    "visual": `激战中，@${linluoCharacter.username} 找到破绽，一剑劈向 @${skeletonCharacter.username} 的肩膀。骷髅战士勉强格挡，被巨大力量击退数步，盔甲碎片飞溅。@${linluoCharacter.username} 紧追不舍，连续发动攻击。`,
                    "weather": "晴朗"
                },
                {
                    "action": `@${linluoCharacter.username} 蓄力一击击败 @${skeletonCharacter.username}`,
                    "camera": "正面拍摄林洛胜利姿态",
                    "duration": 3,
                    "location": "战场废墟",
                    "style_tags": "决战，胜利，英雄气概",
                    "time": "黄昏",
                    "visual": `决战时刻，@${linluoCharacter.username} 蓄力一击，武器上凝聚金色光芒。@${skeletonCharacter.username} 拼尽全力格挡，但最终骨剑断裂，身体被击飞倒地。@${linluoCharacter.username} 站在原地收剑，身后是战败的骷髅战士。`,
                    "weather": "晴朗，夕阳余晖"
                }
            ]
        };

        console.log('战斗故事板 (JSON 格式):');
        console.log('─'.repeat(60));
        console.log(JSON.stringify(battleStoryboard, null, 2));
        console.log('─'.repeat(60));
        console.log();

        console.log('提交战斗视频生成任务...');
        const battleTask = await service.createStoryboardVideo(
            JSON.stringify(battleStoryboard),
            {
                model: 'sora-2',
                aspect_ratio: '16:9',
                duration: '15',
                hd: false,
                watermark: false
            }
        );

        console.log(`   ✅ 任务提交成功: ${battleTask.task_id}\n`);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⏳ 等待战斗视频生成完成（最多 15 分钟）\n');

        const battleVideo = await service.waitForCompletion(
            battleTask.task_id,
            180,  // 15s HD 视频可能需要更长时间
            5000
        );

        // ============================================
        // 完成！
        // ============================================
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 战斗场景生成完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('📊 生成结果汇总:\n');
        console.log(`🦴 骷髅兵角色视频: ${skeletonVideo.data?.output}`);
        console.log(`   角色 ID: ${skeletonCharacter.id} (@${skeletonCharacter.username})\n`);

        console.log(`🛡️  林洛角色视频: ${linluoVideo.data?.output}`);
        console.log(`   角色 ID: ${linluoCharacter.id} (@${linluoCharacter.username})\n`);

        console.log(`⚔️  战斗场景视频: ${battleVideo.data?.output}\n`);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n🎬 下载最终视频: ${battleVideo.data?.output}\n`);
        console.log('✅ 测试成功完成！\n');

    } catch (error: any) {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ 测试失败');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('错误信息:', error.message || error);
        if (error.stack) {
            console.error('\n堆栈跟踪:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
