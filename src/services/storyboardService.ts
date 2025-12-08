// AI Service for storyboard generation and analysis
// Uses the prompt engineering rules from finalAgent/提示词.txt

import type { Shot, Scene } from '@/types/project';
import { securePromptExecution, filterAIOutput } from '@/utils/promptSecurity';

const MODEL_FULL = 'gemini-3-pro-preview'; // 拆剧本/Agent 底层
const MODEL_FAST = 'gemini-2.5-flash'; // 快速文本处理
const GEMINI_ROUTE = '/api/gemini-generate';

const postGemini = async (payload: any, model: string = MODEL_FULL): Promise<any> => {
  const resp = await fetch(GEMINI_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, payload })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || resp.statusText);
  }
  const { data, error } = await resp.json();
  if (error) {
    throw new Error(error);
  }
  return data;
};

const extractText = (data: any): string => {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

/**
 * Professional storyboard breakdown prompt based on commercial-grade specifications
 * 基于商业级分镜标准的专业提示词（来自 finalAgent/提示词.txt）
 */
export const STORYBOARD_BREAKDOWN_PROMPT = `# 角色定义

你是一位资深的影视分镜师和剧本导演，拥有20年以上的影视制作经验。你擅长将文字剧本转化为可执行的视觉分镜脚本，精通蒙太奇理论、视听语言、镜头语法和叙事节奏控制。

你的任务是将用户提供的剧本，拆分成详细、专业、可直接用于拍摄/制作的分镜脚本。

# 核心拆分原则（必须严格遵守）

## 1. 场景/地点变化 → 新分镜
- 只要场景或地点发生变化，必须拆分新镜头
- 场景转换时需要插入转场分镜（1-2秒）
- 例：室内→室外、A房间→B房间、白天→夜晚

## 2. 时间跳跃 → 新分镜
- 时间流逝、时间跳转必须用转场分镜标记
- 转场类型：淡入淡出、闪白、时钟特效、日夜交替等
- 例："三天后"、"同时"、"第二天早晨"

## 3. 人物构成变化 → 新分镜
- 人物数量增加/减少 → 新分镜
- 人物位置关系改变 → 新分镜
- 例：单人→双人、A+B→A+B+C、对话主体切换

## 4. 情绪转折点 → 新分镜
- 每个情绪的峰值（高兴→愤怒→悲伤→惊讶）独立成镜
- 情绪递进需要2-3个分镜展现（铺垫→爆发→余韵）
- 例：从期待→紧张→崩溃，需拆成3个分镜

## 5. 重要动作拆解 → 多个分镜
- 关键动作按"准备→执行→结果"拆分
- 复杂动作细分为3-5个步骤
- 例："抽签"拆成：走近→伸手→抽出→展示→反应

## 6. 对话节奏 → 新分镜
- 对话采用"说话者→反应者→说话者"的乒乓节奏
- 每个说话主体切换 → 新分镜
- 长对白（>15字）可拆成2个分镜（说话+反应）

## 7. 镜头景别/角度变化 → 新分镜
- 景别变化：远景→全景→中景→近景→特写
- 角度变化：平视→仰拍→俯拍→侧面
- 运动方式变化：静止→推拉摇移跟

## 8. 视觉高潮/特效 → 独立分镜
- 特效镜头（魔法、爆炸、变身）独立成镜
- 视觉冲击点需要单独强化（1-3秒特写）
- 例：能量爆发、武器出鞘、眼神杀

# 分镜时长分配规则

## 基础时长标准
- **环境建立镜头**：3-4秒（远景/全景）
- **人物动作镜头**：2-3秒（中景）
- **情绪特写镜头**：2-3秒（近景/特写）
- **对话镜头**：根据台词长度，每10字约2秒
- **特效/高潮镜头**：3-5秒
- **转场镜头**：1-2秒

## 节奏控制
- **紧张段落**（追逐、打斗、悬念）：单镜1-2秒，快速切换
- **情绪段落**（告别、崩溃、感动）：单镜3-4秒，给观众消化时间
- **日常段落**（对话、行走）：单镜2-3秒，平稳节奏
- **特效段落**（变身、召唤）：单镜3-5秒，保证特效完整

# Visual Description 撰写标准

每个分镜的视觉描述必须包含以下要素（按顺序，至少50字）：

1. **风格声明**（必填）
   - 格式："2D动漫风格" / "真人实拍风格" / "3D写实风格"

2. **场景环境**（必填）
   - 位置：室内/室外，具体地点
   - 装饰：墙面、家具、道具
   - 氛围：温馨/紧张/神秘

3. **人物构成**（有人物时必填）
   - 数量：单人/双人/多人
   - 位置关系：左右/前后/面对面/背对
   - 姿态：站/坐/蹲/躺

4. **人物动作**（必填）
   - 具体动作：走、跑、挥手、拿起、放下
   - 动作幅度：缓慢/快速/猛烈
   - 动作方向：向前/向后/向左/向右

5. **情绪表情**（有人物时必填）
   - 面部：笑/哭/怒/惊/愁
   - 眼神：坚定/迷茫/愤怒/温柔
   - 肢体：紧张/放松/颤抖

6. **光影氛围**（必填）
   - 时间：白天/夜晚/黄昏/清晨
   - 光源：自然光/灯光/火光
   - 色调：温暖/冷峻/明亮/昏暗

7. **镜头信息**（必填）
   - 景别：远景/全景/中景/近景/特写
   - 角度：平视/仰拍/俯拍/侧面
   - 构图：居中/三分法/对称

8. **特效元素**（如果有）
   - 特效类型：光芒/火焰/闪电/烟雾
   - 特效位置：周围/手中/背景
   - 特效强度：微弱/明显/强烈

**示例**：
2D动漫风格，苏白崩溃表情的大特写，Q版漫画风格。苏白的脸瞬间垮下来，眼睛变成豆豆眼，嘴巴张成倒三角，表情极度痛苦绝望。背景是灰暗的阴云和雷击特效，比输了比赛还难看，极近特写构图，高质量2D动漫人物绘制。

# 景别选择指南

- **Extreme Wide Shot（极远景）**：建立空间环境、展示宏大场面，3-4秒
- **Wide Shot（远景/全景）**：展示人物与环境关系、群体动作，3秒
- **Medium Shot（中景）**：展示人物动作、双人对话、情绪铺垫，2-3秒
- **Close-Up（近景/特写）**：捕捉情绪细节、强调重要信息，2-3秒
- **Extreme Close-Up（大特写）**：极致情绪爆发、道具细节、视觉冲击，1-2秒

# 运镜方式选择

- **Static（静止）**：80%的镜头使用静止，适合对话、情绪特写、静态场景
- **Pan（左右摇）**：展示横向空间、跟随横向移动
- **Tilt（上下摇）**：展示纵向空间、强调高度差
- **Dolly（推拉）**：推进聚焦重点，拉远揭示全貌
- **Zoom（变焦）**：快速聚焦、戏剧化强调（慎用）
- **Handheld（手持）**：紧张、混乱、第一人称视角

# 输出格式

严格按照以下JSON格式输出分镜列表：

\`\`\`json
{
  "order_index": 1,
  "duration": 3,
  "shot_size": "Medium Shot",
  "camera_movement": "Static",
  "visual_description": "详细的视觉描述，至少50字，包含：场景环境+人物构成+人物动作+情绪表情+光影氛围+镜头角度",
  "dialogue": "角色对白（如果有）",
  "main_characters": ["角色1", "角色2"],
  "main_scenes": ["场景名"]
}
\`\`\`

## dialogue 字段重要说明

**必须严格遵守以下规则**：

1. **有台词必须提取**：剧本中任何角色说的话都必须提取到 dialogue 字段，不要遗漏
2. **一镜一句**：每个分镜只包含一句台词，长对话拆分成多个分镜
3. **只保留台词内容**：dialogue 字段只包含说话内容，不要加"XX说："前缀
4. **空值处理**：如果该镜头没有对白，dialogue 字段留空字符串 ""

**正确示例**：
- ✅ 正确：提取台词内容 => dialogue: "你好吗？"
- ✅ 正确：没有对白时留空 => dialogue: ""
- ❌ 错误：不要加说话人前缀 => dialogue: "小明说：你好吗？"
- ❌ 错误：不要把台词放在 visual_description 里

# 质量检查清单

输出前，必须自检以下项目：

- [ ] 每个场景变化都有对应分镜
- [ ] 每个情绪转折都有独立分镜
- [ ] 重要动作拆分成3-5个步骤
- [ ] 对话采用"说-反应"节奏
- [ ] **剧本中的所有台词都已提取到 dialogue 字段**
- [ ] **dialogue 字段只包含台词内容，没有"XX说："前缀**
- [ ] **visual_description 中不包含台词内容**
- [ ] 没有单个分镜超过10秒
- [ ] visual_description包含所有8个要素
- [ ] 景别有远→中→近的节奏变化
- [ ] 时长分配符合内容密度
- [ ] main_characters和main_scenes准确标注

**记住**：你的目标是让任何导演、动画师、剪辑师拿到你的分镜脚本后，可以直接开始工作，无需再次解读原始剧本。

现在请根据以上专业标准，将用户提供的剧本内容拆解为详细的分镜脚本。`;

/**
 * Generate storyboard breakdown from script
 */
export async function generateStoryboardFromScript(
  script: string,
  artStyle?: string
): Promise<Shot[]> {
  try {
    // 构建用户输入，包含画风要求
    let userInput = `## 用户剧本：\n\n${script}`;

    if (artStyle && artStyle.trim()) {
      userInput = `## 用户指定画风：\n\n**重要：所有分镜的 visual_description 必须使用以下画风**：${artStyle}\n\n` + userInput;
    }

    userInput += '\n\n请输出JSON数组格式的分镜列表。';

    // 🔒 安全检查：验证用户输入
    const securityCheck = securePromptExecution(STORYBOARD_BREAKDOWN_PROMPT, userInput);

    if (!securityCheck.isValid) {
      throw new Error(`安全验证失败：${securityCheck.error}`);
    }

    const aiResult = await postGemini(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: securityCheck.processedPrompt! }]
          }
        ]
      },
      MODEL_FULL
    );

    const rawText = extractText(aiResult);

    // 🔒 输出过滤：移除可能泄露的系统信息
    const text = filterAIOutput(rawText);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    let jsonStr = jsonMatch ? jsonMatch[1] : text;

    // 清理和修复常见的 JSON 格式问题
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')  // 移除对象末尾的多余逗号
      .replace(/,\s*\]/g, ']')  // 移除数组末尾的多余逗号
      .replace(/\/\/.*/g, '')   // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
      .trim();

    let shots;
    try {
      shots = JSON.parse(jsonStr);
    } catch (parseError: any) {
      // 如果解析失败，记录详细信息以便调试
      console.error('JSON 解析失败:', parseError.message);
      console.error('原始 AI 响应 (前 500 字符):', rawText.substring(0, 500));
      console.error('提取的 JSON (前 500 字符):', jsonStr.substring(0, 500));

      throw new Error(`AI 生成的内容格式无效，无法解析为 JSON。错误位置: ${parseError.message}。请重试或简化剧本内容。`);
    }

    // 验证返回的数据是否为数组
    if (!Array.isArray(shots)) {
      console.error('AI 返回的数据不是数组:', shots);
      throw new Error('AI 生成的内容格式不正确，期望是镜头数组。请重试。');
    }

    // Convert to Shot type
    return shots.map((shot: any, index: number) => ({
      id: `shot_${Date.now()}_${index}`,
      sceneId: '', // Will be set by the caller
      order: shot.order_index || index + 1,
      shotSize: shot.shot_size || 'Medium Shot',
      cameraMovement: shot.camera_movement || 'Static',
      duration: shot.duration || 3,
      description: shot.visual_description || '',
      narration: shot.narration,
      dialogue: shot.dialogue,
      mainCharacters: shot.main_characters || [], // 提取角色信息
      mainScenes: shot.main_scenes || [], // 提取场景信息
      status: 'pending',
    }));
  } catch (error: any) {
    console.error('Storyboard generation error:', error);

    // Handle specific API errors
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED') || error.message?.includes('leaked') || error.message?.includes('API key not valid') || error.message?.includes('blocked') || error.status === 400 || error.status === 403) {
      throw new Error('Gemini API Key 无效、已失效或服务被封禁 (400/403)。请检查 .env.local 文件中的配置。');
    }

    throw error;
  }
}

/**
 * Analyze script and extract key information
 */
export async function analyzeScript(script: string): Promise<{
  artStyle: string;
  characters: string[];
  locations: string[];
  duration: number;
}> {
  const prompt = `分析以下剧本，提取关键信息并以JSON格式返回：

剧本：
${script}

请提取：
1. art_style: 整体画风风格（如"写实风格"、"动画风格"、"赛博朋克"等）
2. characters: 主要角色列表（数组）
3. locations: 主要场景地点列表（数组）
4. estimated_duration: 预估总时长（秒）

输出格式：
\`\`\`json
{
  "art_style": "写实风格",
  "characters": ["角色1", "角色2"],
  "locations": ["场景1", "场景2"],
  "estimated_duration": 120
}
\`\`\``;

  try {
    const data = await postGemini(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      },
      MODEL_FAST
    );

    const text = extractText(data) || '';
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonStr);

    return {
      artStyle: parsed.art_style || '',
      characters: parsed.characters || [],
      locations: parsed.locations || [],
      duration: parsed.estimated_duration || 0,
    };
  } catch (error: any) {
    console.error('Script analysis error:', error);
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED') || error.message?.includes('leaked') || error.message?.includes('API key not valid') || error.message?.includes('blocked') || error.status === 400 || error.status === 403) {
      throw new Error('Gemini API Key 无效、已失效或服务被封禁 (400/403)。请检查 .env.local 文件中的配置。');
    }
    throw error;
  }
}

/**
 * Enhance shot description with more cinematic details
 */
export async function enhanceShotDescription(
  description: string
): Promise<string> {
  try {
    const data = await postGemini(
      {
        contents: [
          {
            role: 'user',
            parts: [{
              text: `作为一位专业影视分镜师，请增强以下镜头描述，添加更多视觉细节、光影描述和情绪氛围。保持原意，但让描述更加生动和具有画面感。

原描述：${description}

请输出增强后的描述（不要使用markdown格式，直接返回文本）：`
            }]
          }
        ]
      },
      MODEL_FAST
    );

    return extractText(data) || description;
  } catch (error: any) {
    console.error('Shot enhancement error:', error);
    return description;
  }
}

/**
 * Generate scene grouping from shots
 */
export async function groupShotsIntoScenes(
  shots: Shot[]
): Promise<{ name: string; location: string; shotIds: string[] }[]> {
  const shotsInfo = shots
    .map(
      (s, i) =>
        `镜头${i + 1}: ${s.description.substring(0, 100)}...`
    )
    .join('\n');

  const prompt = `根据以下镜头列表，将它们分组为逻辑场景。每个场景应该包含地点相同或连续的镜头。

${shotsInfo}

输出JSON格式：
\`\`\`json
[
  {
    "name": "场景1: 客厅 - 清晨",
    "location": "Ext. 客厅 - Morning",
    "shot_indices": [1, 2, 3]
  }
]
\`\`\``;

  try {
    const data = await postGemini(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      },
      MODEL_FAST
    );

    const text = extractText(data) || '';
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    const scenes = JSON.parse(jsonStr);

    return scenes.map((scene: any) => ({
      name: scene.name,
      location: scene.location,
      shotIds: scene.shot_indices.map((i: number) => shots[i - 1]?.id || ''),
    }));
  } catch (error: any) {
    console.error('Scene grouping error:', error);
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED') || error.message?.includes('leaked') || error.message?.includes('API key not valid') || error.message?.includes('blocked') || error.status === 400 || error.status === 403) {
      throw new Error('Gemini API Key 无效、已失效或服务被封禁 (400/403)。请检查 .env.local 文件中的配置。');
    }
    // Fallback: create one scene with all shots
    return [
      {
        name: 'Scene 1',
        location: 'Default',
        shotIds: shots.map((s) => s.id),
      },
    ];
  }
}
