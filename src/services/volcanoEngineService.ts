// Volcano Engine API Service for video generation
// Based on long_video_gen/app_250911.py

export interface StoryboardScene {
  order_index: number;
  duration: number;
  shot_size: string;
  camera_movement: string;
  visual_description: string;
  dialogue?: string;
  narration?: string;
  main_characters: string[];
  main_scenes: string[];
}

export interface StoryboardData {
  art_style: string;
  character_settings: string;
  scenes: StoryboardScene[];
}

export interface VideoGenerationTask {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  video_url?: string;
  error?: string;
}

export interface AudioGenerationResult {
  audio_data: ArrayBuffer;
  duration: number;
}

export class VolcanoEngineService {
  private apiKey: string;
  private baseUrl: string;
  private seedreamModelId: string;
  private seedanceModelId: string;
  private doubaoModelId: string;
  private static instance: VolcanoEngineService | null = null;

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_VOLCANO_API_KEY || '';
    this.baseUrl = process.env.NEXT_PUBLIC_VOLCANO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    this.seedreamModelId = process.env.NEXT_PUBLIC_SEEDREAM_MODEL_ID || '';
    this.seedanceModelId = process.env.NEXT_PUBLIC_SEEDANCE_MODEL_ID || '';
    this.doubaoModelId = process.env.NEXT_PUBLIC_DOUBAO_MODEL_ID || '';
  }

  /**
   * Singleton helper for client components that expect getInstance
   */
  static getInstance(): VolcanoEngineService {
    if (!this.instance) {
      this.instance = new VolcanoEngineService();
    }
    return this.instance;
  }

  /**
   * Generate storyboard from user input using Doubao LLM
   */
  async generateStoryboard(
    userInput: string,
    storyboardPrompt: string
  ): Promise<string> {
    const prompt = storyboardPrompt.replace('{USER_INPUT}', userInput);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.doubaoModelId,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Storyboard generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Extract structured storyboard information from generated text
   */
  async extractStoryboardInfo(
    storyboardContent: string,
    extractionPrompt: string
  ): Promise<StoryboardData> {
    const prompt = extractionPrompt.replace('{{input}}', storyboardContent);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.doubaoModelId,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Storyboard extraction failed: ${response.statusText}`);
    }

    const data = await response.json();
    const jsonStr = data.choices[0].message.content;

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new Error('Failed to parse storyboard JSON');
    }
  }

  /**
   * Generate scene image using SeeDream
   */
  async generateSceneImage(
    sceneDescription: string,
    imagePromptTemplate: string
  ): Promise<{ imageUrl: string; imageBase64: string }> {
    const prompt = imagePromptTemplate.replace('{场景}', sceneDescription);

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.seedreamModelId,
        prompt: prompt,
        size: '1024x1024',
      }),
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    const imageUrl = data.data[0].url;

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageBase64 = await this.blobToBase64(imageBlob);

    return { imageUrl, imageBase64 };
  }

  /**
   * Generate single image using SeeDream (简化版本用于Pro模式)
   */
  /**
   * Generate single image using SeeDream model
   * 根据项目画面比例生成单图
   */
  async generateSingleImage(
    prompt: string,
    aspectRatio?: string // '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'
  ): Promise<string> {
    if (!this.seedreamModelId) {
      throw new Error('SeeDream model ID 未配置，请在 .env.local 中设置 NEXT_PUBLIC_SEEDREAM_MODEL_ID');
    }

    // 根据画面比例计算尺寸 - 满足 SeeDream API 最小像素要求（3,686,400 像素）
    const sizeMap: Record<string, string> = {
      '16:9': '2560x1440',   // 16:9 宽屏 QHD (3,686,400 px)
      '9:16': '1440x2560',   // 9:16 竖屏 QHD (3,686,400 px)
      '1:1': '2048x2048',    // 1:1 正方形 2K (4,194,304 px)
      '4:3': '2240x1680',    // 4:3 标准 (3,763,200 px)
      '3:4': '1680x2240',    // 3:4 竖版 (3,763,200 px)
      '21:9': '2940x1260',   // 21:9 超宽屏 (3,704,400 px)
    };

    const size = aspectRatio && sizeMap[aspectRatio] ? sizeMap[aspectRatio] : '2048x2048';

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.seedreamModelId,
        prompt: prompt,
        size: size,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeeDream 图片生成失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].url) {
      throw new Error('SeeDream 返回数据格式错误');
    }

    return data.data[0].url;
  }

  /**
   * 图片编辑 (Image-to-Image)
   * 根据原图和新提示词生成编辑后的图片
   */
  async editImage(
    imageUrl: string,
    prompt: string,
    aspectRatio?: string
  ): Promise<string> {
    if (!this.seedreamModelId) {
      throw new Error('SeeDream model ID 未配置');
    }

    // 根据画面比例计算尺寸 - 与 generateSingleImage 保持一致，满足 3,686,400 像素最小要求
    const sizeMap: Record<string, string> = {
      '16:9': '2560x1440',   // 16:9 宽屏 QHD (3,686,400 px)
      '9:16': '1440x2560',   // 9:16 竖屏 QHD (3,686,400 px)
      '1:1': '2048x2048',    // 1:1 正方形 2K (4,194,304 px)
      '4:3': '2240x1680',    // 4:3 标准 (3,763,200 px)
      '3:4': '1680x2240',    // 3:4 竖版 (3,763,200 px)
      '21:9': '2940x1260',   // 21:9 超宽屏 (3,704,400 px)
    };

    const size = aspectRatio && sizeMap[aspectRatio] ? sizeMap[aspectRatio] : '2048x2048';

    const response = await fetch(`${this.baseUrl}/images/variations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.seedreamModelId,
        prompt: prompt,
        image: imageUrl, // 原图URL
        size: size,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`图片编辑失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].url) {
      throw new Error('返回数据格式错误');
    }

    return data.data[0].url;
  }

  /**
   * Generate video prompt using Doubao
   */
  async generateVideoPrompt(
    sceneDescription: string,
    videoPromptPrompt: string
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.doubaoModelId,
        messages: [
          { role: 'system', content: videoPromptPrompt },
          { role: 'user', content: sceneDescription },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Video prompt generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Generate scene video using SeeDance (image-to-video)
   */
  async generateSceneVideo(
    videoPrompt: string,
    imageBase64: string
  ): Promise<VideoGenerationTask> {
    const response = await fetch(`${this.baseUrl}/content_generation/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.seedanceModelId,
        content: [
          {
            type: 'text',
            text: videoPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Video generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: 'processing',
    };
  }

  /**
   * Poll video generation task status
   */
  async getVideoTaskStatus(taskId: string): Promise<VideoGenerationTask> {
    const response = await fetch(
      `${this.baseUrl}/content_generation/tasks/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: data.status,
      video_url: data.content?.video_url,
      error: data.error,
    };
  }

  /**
   * Wait for video generation to complete
   */
  async waitForVideoCompletion(
    taskId: string,
    onProgress?: (status: string) => void
  ): Promise<string> {
    while (true) {
      const task = await this.getVideoTaskStatus(taskId);

      if (onProgress) {
        onProgress(task.status);
      }

      if (task.status === 'succeeded' && task.video_url) {
        return task.video_url;
      } else if (task.status === 'failed') {
        throw new Error(`Video generation failed: ${task.error}`);
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Generate audio using TTS WebSocket
   * Note: This requires a WebSocket connection and is complex to implement
   * For now, this is a placeholder that should be implemented server-side
   */
  async generateSceneAudio(
    narration: string,
    ttsConfig: {
      appid: string;
      accessToken: string;
      voiceType: string;
    }
  ): Promise<ArrayBuffer> {
    // This would need to be implemented as a server-side API route
    // that handles WebSocket connections to the TTS service
    throw new Error('TTS generation should be implemented server-side');
  }

  /**
   * Helper: Convert Blob to base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Download video from URL and return as Blob
   */
  async downloadVideo(videoUrl: string): Promise<Blob> {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    return await response.blob();
  }
}

// Export singleton instance
export const volcanoEngineService = new VolcanoEngineService();
