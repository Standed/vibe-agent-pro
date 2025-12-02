// AI Service for storyboard generation and analysis
// Uses the prompt engineering rules from finalAgent/提示词.txt

import { GoogleGenAI } from '@google/genai';
import type { Shot, Scene } from '@/types/project';

const getGeminiClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Storyboard breakdown prompt based on finalAgent/提示词.txt
 * 包含8大核心拆分原则和详细的视觉描述标准
 */
export const STORYBOARD_BREAKDOWN_PROMPT = `你是一位专业的影视分镜师，擅长将剧本内容拆解为可执行的分镜脚本。

## 核心拆分原则（8大原则）：

1. **场景/地点变化** → 新分镜
   - 任何地点切换（室内→室外，A房间→B房间）都应开启新分镜

2. **时间跳跃** → 新分镜
   - 时间段变化（白天→夜晚，几小时后，次日等）需要新分镜

3. **人物构成变化** → 新分镜
   - 画面中出现/消失关键角色时，应拆分新镜头

4. **情绪转折点** → 新分镜
   - 角色情绪从平静→愤怒，从欢乐→悲伤等重大转变需要新分镜

5. **重要动作拆解** → 多个分镜
   - 复杂动作（如打斗、追逐）应拆解为多个连续镜头

6. **对话节奏** → 新分镜
   - 每段对话、每个说话者切换时，通常需要新镜头
   - 正反打镜头（Shot/Reverse Shot）

7. **镜头景别/角度变化** → 新分镜
   - 从远景切到特写，或从俯拍切到平视，应分开

8. **视觉高潮/特效** → 独立分镜
   - 爆炸、魔法、特殊效果等应单独成镜，便于后期处理

## 时长分配规则：

- **对话镜头**：2-4秒/句，取决于对白长度
- **动作镜头**：根据动作复杂度，3-8秒
- **情绪特写**：1-2秒快速反应，3-5秒深度情绪
- **环境展示**：远景3-6秒，细节特写2-3秒
- **过渡镜头**：1-2秒

**总原则**：单个分镜一般不超过10秒，复杂场景可适当延长

## 视觉描述标准（每个分镜必须包含）：

1. **画风风格**：写实/动画/赛博朋克/水墨等
2. **环境描述**：地点、时间、天气、氛围
3. **角色信息**：外观、服装、位置、姿态
4. **动作描述**：具体动作、表情、眼神
5. **情绪基调**：紧张/温馨/恐怖/浪漫等
6. **光影设置**：自然光/人造光/逆光/侧光，明暗对比
7. **镜头语言**：景别（特写/中景/远景）、角度（俯拍/仰拍/平视）、运动（推拉摇移跟）
8. **特殊效果**：慢动作/色彩滤镜/景深等

## 输出格式（严格JSON）：

\`\`\`json
{
  "order_index": 1,
  "duration": 3,
  "shot_size": "Medium Shot",
  "camera_movement": "Static",
  "visual_description": "写实风格，清晨阳光透过落地窗洒进现代简约的客厅，空气中飘浮着细微的灰尘颗粒。一位穿着白色衬衫的年轻女性坐在灰色沙发上，低头看着手机，神情专注，眉头微皱。背景中可见绿植和书架。柔和的自然光从左侧照射，形成温暖的氛围。中景镜头，平视角度，静态构图。",
  "dialogue": "（如果有对白）",
  "main_characters": ["角色1"],
  "main_scenes": ["场景名称"]
}
\`\`\`

请根据以上规则，将用户提供的剧本内容拆解为详细的分镜脚本。`;

/**
 * Generate storyboard breakdown from script
 */
export async function generateStoryboardFromScript(
  script: string
): Promise<Shot[]> {
  const ai = getGeminiClient();
  const model = 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `${STORYBOARD_BREAKDOWN_PROMPT}\n\n## 用户剧本：\n\n${script}\n\n请输出JSON数组格式的分镜列表。`,
    });

    const text = response.text || '';

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    const shots = JSON.parse(jsonStr);

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
      status: 'pending',
    }));
  } catch (error) {
    console.error('Storyboard generation error:', error);
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
  const ai = getGeminiClient();
  const model = 'gemini-2.5-flash';

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
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    const data = JSON.parse(jsonStr);

    return {
      artStyle: data.art_style || '',
      characters: data.characters || [],
      locations: data.locations || [],
      duration: data.estimated_duration || 0,
    };
  } catch (error) {
    console.error('Script analysis error:', error);
    throw error;
  }
}

/**
 * Enhance shot description with more cinematic details
 */
export async function enhanceShotDescription(
  description: string
): Promise<string> {
  const ai = getGeminiClient();
  const model = 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `作为一位专业影视分镜师，请增强以下镜头描述，添加更多视觉细节、光影描述和情绪氛围。保持原意，但让描述更加生动和具有画面感。

原描述：${description}

请输出增强后的描述（不要使用markdown格式，直接返回文本）：`,
    });

    return response.text || description;
  } catch (error) {
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
  const ai = getGeminiClient();
  const model = 'gemini-2.5-flash';

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
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    const scenes = JSON.parse(jsonStr);

    return scenes.map((scene: any) => ({
      name: scene.name,
      location: scene.location,
      shotIds: scene.shot_indices.map((i: number) => shots[i - 1]?.id || ''),
    }));
  } catch (error) {
    console.error('Scene grouping error:', error);
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
