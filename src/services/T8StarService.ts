import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sizeOf from 'image-size';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * T8Star API 服务
 * API 文档：https://ai.t8star.cn
 */
export class T8StarService {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor() {
        this.baseUrl = process.env.T8STAR_BASE_URL || 'https://ai.t8star.cn';
        this.apiKey = process.env.T8STAR_API_KEY || '';

        if (!this.apiKey) {
            throw new Error('T8STAR_API_KEY is not set in environment variables');
        }
    }

    /**
     * 获取图片的宽高比，返回 '16:9' 或 '9:16'
     * @param imagePath 本地图片路径
     */
    async getImageAspectRatio(imagePath: string): Promise<'16:9' | '9:16'> {
        const imageBuffer = fs.readFileSync(imagePath);
        const dimensions = sizeOf(imageBuffer);
        if (!dimensions.width || !dimensions.height) {
            throw new Error('无法获取图片尺寸');
        }

        // 计算宽高比
        const ratio = dimensions.width / dimensions.height;

        // 如果宽度大于高度，使用横屏 16:9，否则使用竖屏 9:16
        return ratio > 1 ? '16:9' : '9:16';
    }

    /**
     * 将本地图片转换为 base64
     * @param imagePath 本地图片路径
     */
    async imageToBase64(imagePath: string): Promise<string> {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();

        // 根据文件扩展名确定 MIME 类型
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') {
            mimeType = 'image/jpeg';
        } else if (ext === '.gif') {
            mimeType = 'image/gif';
        } else if (ext === '.webp') {
            mimeType = 'image/webp';
        }

        return `data:${mimeType};base64,${base64}`;
    }

    /**
     * 创建角色 Character
     * @param url 视频 URL（包含需要创建的角色）
     * @param timestamps 时间范围，例如 "1,3" 表示 1-3 秒
     * @param from_task 或者使用已生成的任务 ID
     */
    async createCharacter(params: {
        url?: string;
        timestamps: string;
        from_task?: string;
    }): Promise<{
        id: string;
        username: string;
        permalink: string;
        profile_picture_url: string;
    }> {
        console.log(`[T8Star] 创建角色，参数:`, JSON.stringify(params, null, 2));

        const response = await fetch(`${this.baseUrl}/sora/v1/characters`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`创建角色失败: ${response.status} ${error}`);
        }

        const data = await response.json();
        console.log(`[T8Star] 角色创建成功:`, JSON.stringify(data, null, 2));
        return data;
    }

    /**
     * Sora2 图生视频
     * @param images 图片列表（URL 或 base64）
     * @param prompt 提示词
     * @param options 生成选项
     */
    async createImageToVideo(
        images: string[],
        prompt: string,
        options?: {
            model?: 'sora-2' | 'sora-2-pro';
            aspect_ratio?: '16:9' | '9:16';
            hd?: boolean;
            duration?: '10' | '15' | '25';
            notify_hook?: string;
            watermark?: boolean;
            private?: boolean;
        }
    ): Promise<{
        task_id: string;
    }> {
        const requestBody = {
            prompt,
            model: options?.model || 'sora-2',
            images,
            aspect_ratio: options?.aspect_ratio || '16:9',
            hd: options?.hd ?? false,
            duration: options?.duration || '10',
            watermark: options?.watermark ?? false,
            private: options?.private ?? false,
            ...(options?.notify_hook && { notify_hook: options.notify_hook })
        };

        console.log(`[T8Star] 创建图生视频，请求:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${this.baseUrl}/v2/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`创建图生视频失败: ${response.status} ${error}`);
        }

        const data = await response.json();
        console.log(`[T8Star] 图生视频任务创建成功:`, JSON.stringify(data, null, 2));
        return data;
    }

    /**
     * Sora2 故事板视频生成
     * @param prompt 提示词（故事板格式）
     * @param options 生成选项
     */
    async createStoryboardVideo(
        prompt: string,
        options?: {
            model?: 'sora-2' | 'sora-2-pro';
            aspect_ratio?: '16:9' | '9:16';
            hd?: boolean;
            duration?: '10' | '15' | '25';
            notify_hook?: string;
            watermark?: boolean;
            private?: boolean;
        }
    ): Promise<{
        task_id: string;
    }> {
        const requestBody = {
            prompt,
            model: options?.model || 'sora-2-pro',
            aspect_ratio: options?.aspect_ratio || '16:9',
            hd: options?.hd ?? false,
            duration: options?.duration || '15',
            watermark: options?.watermark ?? false,
            private: options?.private ?? false,
            ...(options?.notify_hook && { notify_hook: options.notify_hook })
        };

        console.log(`[T8Star] 创建故事板视频，请求:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${this.baseUrl}/v2/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`创建视频失败: ${response.status} ${error}`);
        }

        const data = await response.json();
        console.log(`[T8Star] 视频任务创建成功:`, JSON.stringify(data, null, 2));
        return data;
    }

    /**
     * 查询任务状态
     * @param taskId 任务 ID
     */
    async getTaskStatus(taskId: string): Promise<{
        task_id: string;
        platform: string;
        action: string;
        status: 'NOT_START' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
        fail_reason: string;
        submit_time: number;
        start_time: number;
        finish_time: number;
        progress: string;
        data: {
            output?: string;
        } | null;
        search_item: string;
    }> {
        console.log(`[T8Star] 查询任务状态: ${taskId}`);

        const response = await fetch(`${this.baseUrl}/v2/videos/generations/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`查询任务失败: ${response.status} ${error}`);
        }

        const data = await response.json();
        console.log(`[T8Star] 任务状态:`, JSON.stringify(data, null, 2));
        return data;
    }

    /**
     * 轮询等待任务完成
     * @param taskId 任务 ID
     * @param maxAttempts 最大轮询次数
     * @param intervalMs 轮询间隔（毫秒）
     */
    async waitForCompletion(
        taskId: string,
        maxAttempts: number = 120,
        intervalMs: number = 5000
    ): Promise<{
        task_id: string;
        status: string;
        data: { output?: string } | null;
        fail_reason?: string;
    }> {
        console.log(`[T8Star] 开始轮询任务 ${taskId}，最多 ${maxAttempts} 次，间隔 ${intervalMs}ms`);

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));

            try {
                const status = await this.getTaskStatus(taskId);

                const progressBar = '█'.repeat(Math.floor(i / (maxAttempts / 10))) +
                                  '░'.repeat(10 - Math.floor(i / (maxAttempts / 10)));
                console.log(`   [${progressBar}] ${status.status} ${status.progress} (${i + 1}/${maxAttempts})`);

                if (status.status === 'SUCCESS') {
                    console.log(`[T8Star] ✅ 任务完成！`);
                    return {
                        task_id: status.task_id,
                        status: status.status,
                        data: status.data
                    };
                }

                if (status.status === 'FAILURE') {
                    console.log(`[T8Star] ❌ 任务失败: ${status.fail_reason}`);
                    throw new Error(`任务失败: ${status.fail_reason}`);
                }
            } catch (error: any) {
                // 如果是网络错误，记录但继续重试
                if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
                    console.log(`   ⚠️ 网络错误，继续重试... (${i + 1}/${maxAttempts})`);
                    continue;
                }
                // 其他错误直接抛出
                throw error;
            }
        }

        throw new Error(`任务超时: 超过 ${maxAttempts} 次轮询仍未完成`);
    }
}
