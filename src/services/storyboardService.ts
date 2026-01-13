import { generateContent } from '@/lib/gemini-api';
import { SoraScript } from '@/types/runninghub';
import { ScriptAnalysis, CharacterDesign, StoryboardShot, SceneGroup } from '@/types/storyboard';

// Re-export for compatibility
export type { ScriptAnalysis, CharacterDesign, StoryboardShot, SceneGroup };

// Use configured storyboard model, fallback to a preview model if not set
const MODEL_NAME = process.env.GEMINI_STORYBOARD_MODEL || "gemini-3-flash-preview";

export class StoryboardService {
  constructor() { }

  private extractJSON(response: any): any {
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!cleanText) throw new Error('Empty AI response');
    return JSON.parse(cleanText);
  }

  /**
   * Analyze script for metadata
   */
  async analyzeScript(script: string): Promise<ScriptAnalysis> {
    const prompt = `
        Analyze the following movie script and extract metadata.
        IMPORTANT: All output (summary, descriptions, character names if possible) MUST be in Simplified Chinese (简体中文).
        Return JSON format:
        {
            "characters": ["name1", "name2"],
            "locations": ["loc1", "loc2"],
            "summary": "1-2 sentence summary",
            "artStyle": "suggested visual style (e.g. Cinematic, Anime)"
        }
        
        Script:
        ${script.substring(0, 5000)}
        `;

    const response = await generateContent(MODEL_NAME, prompt);
    return this.extractJSON(response);
  }

  /**
   * Generate storyboard shots
   */
  async generateStoryboardFromScript(script: string, artStyle?: string): Promise<StoryboardShot[]> {
    const prompt = `
        Convert this script into a shot list. Use film grammar (Shot Size, Camera Movement).
        Art Style: ${artStyle || 'Cinematic'}
        IMPORTANT: All output (descriptions, narration, dialogue) MUST be in Simplified Chinese (简体中文).
        IMPORTANT: Group shots into logical scenes. Use EXACTLY the same "location" string for all shots in the same scene context. Avoid creating new scenes for minor camera angle changes.
        Return JSON array of objects:
        [
            {
                "shotSize": "Medium Shot", // Valid: Extreme Wide Shot, Wide Shot, Full Shot, Medium Wide Shot, Medium Shot, Medium Close-Up, Close-Up, Extreme Close-Up, Low Angle Shot, High Angle Shot, Over the Shoulder Shot, Point of View Shot, Bird's Eye View, Dutch Angle, Establishing Shot
                "cameraMovement": "Static", // Valid: Pan, Tilt, Dolly, Zoom, Truck, Static, Pan Left, Pan Right, Tilt Up, Tilt Down, Dolly In, Dolly Out, Zoom In, Zoom Out, Truck Left, Truck Right, Pedestal Up, Pedestal Down, Handheld, Arc, Crane
                "description": "Visual description of the shot",
                "narration": "Optional voiceover",
                "dialogue": "Optional dialogue",
                "duration": 5, // estimated seconds (number only)
                "mainCharacters": ["char1"],
                "location": "Scene Location Name",
                "time": "Day/Night"
            }
        ]
        
        Script:
        ${script.substring(0, 8000)}
        `;

    const response = await generateContent(MODEL_NAME, prompt);
    const shots = this.extractJSON(response);
    // Add IDs
    return shots.map((s: any) => ({ ...s, id: crypto.randomUUID() }));
  }

  /**
   * Group shots into scenes
   */
  groupShotsIntoScenes(shots: StoryboardShot[]): SceneGroup[] {
    // Simple logic: group by location + continuous sequence
    const scenes: SceneGroup[] = [];
    let currentScene: SceneGroup | null = null;

    shots.forEach(shot => {
      const shotLoc = shot.location || "Unknown";
      // If location changes, new scene
      if (!currentScene || currentScene.location !== shotLoc) {
        if (currentScene) scenes.push(currentScene);
        currentScene = {
          name: `Scene ${scenes.length + 1} - ${shotLoc}`,
          location: shotLoc,
          shotIds: []
        };
      }
      currentScene.shotIds.push(shot.id);
    });
    if (currentScene) scenes.push(currentScene);
    return scenes;
  }

  /**
   * Generate character designs
   */
  async generateCharacterDesigns(params: { script: string, characterNames: string[], artStyle: string, projectSummary: string, shots: any[], existingContext?: string }): Promise<Record<string, CharacterDesign>> {
    const prompt = `
        Design characters based on the script and style.
        Style: ${params.artStyle}
        Characters to design: ${params.characterNames.join(', ')}
        Project Summary: ${params.projectSummary}
        ${params.existingContext ? `IMPORTANT: Consistent with existing character descriptions: ${params.existingContext}` : ''}
        IMPORTANT: All output MUST be in Simplified Chinese (简体中文).
        
        Return JSON object where key is character name:
        {
            "CharacterName": {
                "name": "CharacterName",
                "style": "Visual style (e.g. 2D Anime)",
                "genderAgeOccupation": "Gender, Age, Occupation",
                "bodyShape": "Body shape description",
                "faceFeatures": "Face details",
                "hair": "Hair style and color",
                "outfit": "Clothing details",
                "expressionMood": "Typical expression",
                "pose": "Default pose",
                "summary": "1 sentence character summary"
            }
        }
        `;

    const response = await generateContent(MODEL_NAME, prompt);
    return this.extractJSON(response);
  }

  /**
   * Generate location descriptions
   */
  async generateLocationDescriptions(script: string, locationNames: string[], artStyle?: string): Promise<Record<string, string>> {
    const prompt = `
        Analyze the script and generate atmospheric visual descriptions for the following locations.
        These descriptions will be used to generate concept art.
        
        Script:
        ${script.substring(0, 5000)}
        
        Locations to describe: ${locationNames.join(', ')}
        Art Style: ${artStyle || 'Cinematic'}
        
        Requirements:
        1. Output MUST be in Simplified Chinese (简体中文).
        2. Descriptions should focus on visual details, lighting, atmosphere, and mood.
        3. Keep each description under 100 words.
        4. Return a JSON object where the key is the exact location name provided, and the value is the description.
        
        Example Output:
        {
            "Old Factory": "A rusty, abandoned industrial space. Shafts of dusty light pierce through broken high windows. Cyberpunk atmosphere with neon graffiti on the walls.",
            "Coffee Shop": "Warm and cozy interior with wooden furniture and soft yellow lighting. Steam rises from cups, creating a relaxed mood."
        }
        `;

    const response = await generateContent(MODEL_NAME, prompt);
    return this.extractJSON(response);
  }

  /**
   * Generates a strict SoraScript JSON object from a simple idea.
   */
  async generateScript(simpleConcept: string): Promise<SoraScript> {
    const systemPrompt = `
       你是一位专业的电影导演。请将用户的创意转换为详细的电影剧本 JSON。
      
       重要：你必须输出符合以下精确 Schema 的有效 JSON 对象：
       {
         "character_setting": {
           "CharacterName": {
             "age": number,
             "appearance": "性别，年龄，头发(颜色，发型），衣服（颜色，款式），缺一不可",
             "name": "全文固定姓名",
             "voice": "GenderAge（例如：女·27岁） PitchMean（例如：215 Hz）Tempo（例如：180 SPM） Accent（例如：东京腔轻微卷舌）"
           }
         },
         "shots": [
           {
             "action": "动作",
             "camera": "镜头变化",
             "dialogue": { "role": "姓名", "text": "讲话内容" },
             "duration": 5,
             "location": "地点",
             "style_tags": "特效效果",
             "time": "具体时间（白天或晚上）",
             "visual": "镜头内容",
             "weather": "天气"
           }
         ]
       }
      
       约束条件：
       1. 确保 JSON 格式严格有效。
       2. "character_setting" 必须包含剧本中涉及的所有角色。
       3. "shots" 是一个数组，每个镜头的 duration 在 1-10s 之间。
       4. 不要添加额外的解释文字，只输出 JSON。
      
       用户创意: "${simpleConcept}"
     `;

    try {
      const response = await generateContent(MODEL_NAME, systemPrompt);
      return this.extractJSON(response) as SoraScript;
    } catch (error) {
      console.error('Storyboard AI Error:', error);
      // Fallback: Return a minimal valid script to prevent crash
      return {
        character_setting: {},
        shots: [
          {
            action: "Static shot",
            camera: "Static",
            duration: 15,
            location: "Unknown",
            style_tags: "Default",
            time: "Day",
            visual: simpleConcept,
            weather: "Clear"
          }
        ]
      };
    }
  }

  // Deprecated: Old string-based method
  async enhancePrompt(simpleConcept: string): Promise<string> {
    const script = await this.generateScript(simpleConcept);
    return JSON.stringify(script);
  }
}
