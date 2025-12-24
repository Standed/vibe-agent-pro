
import { SoraOrchestrator } from '../src/services/SoraOrchestrator';
import { Project, Scene, Shot, Character, AspectRatio } from '../src/types/project';
import { KaponaiService } from '../src/services/KaponaiService';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 加载环境变量
dotenv.config({ path: '.env.local' });

async function runTest() {
    console.log('🚀 开始 Sora 全链路集成测试 (对齐 Battle 逻辑版)...');
    console.log('--- 目标: 10s参考 -> 注册 -> @username码替换 -> 15s复合JSON ---\n');

    const orchestrator = new SoraOrchestrator();
    const kaponai = new KaponaiService();
    const userId = 'user-test-123';

    // 1. 设置本地素材绝对路径
    const skeletonPath = path.resolve(process.cwd(), 'scripts/test/骷髅兵.png');
    const linluoPath = path.resolve(process.cwd(), 'scripts/test/林洛-铠甲.png');

    if (!fs.existsSync(skeletonPath) || !fs.existsSync(linluoPath)) {
        console.error('❌ 错误: 找不到测试图片素材，请检查 scripts/test/ 目录下是否存在 骷髅兵.png 和 林洛-铠甲.png');
        return;
    }

    // 2. Mock dataService 并拦截 createVideo 以便查看拼装后的 JSON
    (orchestrator as any).dataService = {
        initialize: async () => { },
        saveCharacter: async (pId: string, char: Character) => {
            console.log(`   [MockDB] 角色 ${char.name} 状态: ${char.soraIdentity?.status} (@${char.soraIdentity?.username})`);
        },
        saveProject: async () => { },
        saveScene: async () => { }
    };

    // 拦截 KaponaiService.createVideo 来打印 JSON 剧本
    const originalCreateVideo = kaponai.createVideo.bind(kaponai);
    kaponai.createVideo = async (params: any) => {
        if (typeof params.prompt === 'object') {
            console.log('\n--- [拦截] 最终提交的 JSON 剧本内容 ---');
            console.log(JSON.stringify(params.prompt, null, 2));
            console.log('--- [完毕] ---\n');
        } else {
            console.log(`[Kaponai] 创建任务: ${params.seconds}s, 提示词: ${params.prompt.slice(0, 50)}...`);
        }
        return originalCreateVideo(params);
    };
    (orchestrator as any).kaponai = kaponai;

    // 3. 构建测试项目数据
    const mockProject: Project = {
        id: 'project-sora-anime-battle',
        title: '林洛之战',
        description: '全链路验证',
        metadata: {
            title: '林洛之战',
            description: '测试内容',
            artStyle: 'High-quality 2D anime style, cinematic lighting',
            created: new Date(),
            modified: new Date()
        },
        settings: {
            aspectRatio: AspectRatio.WIDE,
            resolution: '4K',
            generationMode: 'single'
        },
        characters: [
            {
                id: 'char-skeleton',
                name: '骷髅兵',
                description: '邪恶的骷髅战士。',
                appearance: '身穿破旧灰色铠甲，眼眶中蓝火跳动',
                referenceImages: [skeletonPath],
                soraIdentity: undefined // 强制触发 10s 视频 + 注册
            },
            {
                id: 'char-linluo',
                name: '林洛',
                description: '英勇的正义剑客。',
                appearance: '年轻男子，红色斗篷，银色闪耀铠甲',
                referenceImages: [linluoPath],
                soraIdentity: undefined // 强制触发 10s 视频 + 注册
            }
        ],
        scenes: [{
            id: 'scene-roof',
            projectId: 'project-sora-anime-battle',
            name: '古宅屋顶',
            order: 1,
            location: '深夜古宅屋顶',
            description: '对对峙场景'
        }],
        shots: [
            {
                id: 'shot-1',
                sceneId: 'scene-roof',
                order: 1,
                description: '骷髅兵 在屋檐边缘嘶吼，挥舞着巨大的骨剑。',
                duration: 7,
                shotSize: 'Full Shot',
                mainCharacters: ['骷髅兵'],
                cameraMovement: 'Pan'
            },
            {
                id: 'shot-2',
                sceneId: 'scene-roof',
                order: 2,
                description: '林洛 执剑而立，对着 骷髅兵 发起冲锋。两人兵刃相接。',
                duration: 8,
                shotSize: 'Close-Up',
                mainCharacters: ['林洛', '骷髅兵'],
                cameraMovement: 'Dolly In'
            }
        ]
    } as any;

    try {
        console.log('--- 准备就绪，开始执行 generateSceneVideo ---');

        const taskIds = await orchestrator.generateSceneVideo(mockProject, 'scene-roof', userId);
        console.log('\n✅ 所有任务提交完毕:', taskIds);

        if (taskIds.length > 0) {
            console.log('\n📡 正在轮询主任务进度...');
            const mainTaskId = taskIds[0];
            const result = await kaponai.waitForCompletion(mainTaskId, 60, 20000);
            console.log(`\n🎉 任务已完成! 状态: ${result.status}`);
            if (result.video_url) {
                console.log(`🔗 生产视频地址: ${result.video_url}`);
            }
        }

        console.log('\n✨ [测试结论]: 验证完毕。请检查输出日志中的 JSON 剧本，确认角色名已替换为 @username。');

    } catch (error: any) {
        console.error('\n❌ 测试流程中断:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

runTest();
