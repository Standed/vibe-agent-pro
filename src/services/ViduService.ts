/**
 * Vidu 视频生成服务
 * 官方 API: https://api.vidu.cn/ent/v2/*
 * 文档: https://docs.kapon.cloud/vidu/video-generation
 */

import fetch from 'node-fetch';
import type {
    ViduImg2VideoParams,
    ViduStartEnd2VideoParams,
    ViduReference2VideoParams,
    ViduCreateResponse,
    ViduTaskResponse,
    ViduCancelResponse
} from '@/types/vidu';

export class ViduService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string, baseUrl?: string) {
        // 复用 KAPONAI_API_KEY 环境变量，默认使用 Kaponai 网关
        const envApiKey = apiKey || process.env.KAPONAI_API_KEY;
        if (!envApiKey) {
            throw new Error('KAPONAI_API_KEY is required for Vidu service. Please set it in environment variables.');
        }
        this.apiKey = envApiKey;
        // 根据 Kaponai 文档: https://models.kapon.cloud/vidu/ent/v2/{action}
        // 注意：构造函数中 baseUrl 若传入则优先，否则默认 Kaponai 地址
        this.baseUrl = baseUrl || 'https://models.kapon.cloud/vidu/ent/v2';
    }

    /**
     * 图生视频 (Image to Video)
     * 单张图片生成视频
     */
    async img2video(params: ViduImg2VideoParams): Promise<ViduCreateResponse> {
        console.log('[Vidu] img2video 请求');
        // 移除日志中的敏感参数，只记录部分关键信息
        console.log('参数:', JSON.stringify({
            model: params.model,
            duration: params.duration,
            resolution: params.resolution,
            off_peak: params.off_peak,
            callback_url: params.callback_url
        }, null, 2));

        const requestBody = {
            model: params.model || 'viduq2-pro-fast',
            images: params.images,
            duration: params.duration || 5,
            resolution: params.resolution || '1080p',
            off_peak: params.off_peak || false,
            watermark: params.watermark ?? false,
            wm_position: params.wm_position,
            wm_url: params.wm_url,
            callback_url: params.callback_url,
            prompt: params.prompt ? params.prompt.substring(0, 2000) : undefined
        };

        return this.makeRequest('/img2video', requestBody);
    }

    /**
     * 首尾帧生成 (Start-End to Video)
     * 首帧 + 尾帧生成过渡视频
     */
    async startEnd2video(params: ViduStartEnd2VideoParams): Promise<ViduCreateResponse> {
        console.log('[Vidu] startEnd2video 请求');
        // 移除日志中的敏感参数，只记录部分关键信息
        console.log('参数:', JSON.stringify({
            model: params.model,
            duration: params.duration,
            resolution: params.resolution,
            off_peak: params.off_peak,
            callback_url: params.callback_url
        }, null, 2));

        const requestBody = {
            model: params.model || 'viduq2-pro-fast',
            images: params.images,
            duration: params.duration || 5,
            resolution: params.resolution || '1080p',
            off_peak: params.off_peak || false,
            watermark: params.watermark ?? false,
            wm_position: params.wm_position,
            wm_url: params.wm_url,
            callback_url: params.callback_url,
            prompt: params.prompt ? params.prompt.substring(0, 2000) : undefined
        };

        return this.makeRequest('/start-end2video', requestBody);
    }

    /**
     * 参考生视频 (Reference to Video)
     * 参考图 + 文本描述生成视频
     */
    async reference2video(params: ViduReference2VideoParams): Promise<ViduCreateResponse> {
        console.log('========== Vidu Reference2Video 请求 ==========');
        console.log('参数:', JSON.stringify(params, null, 2));

        const requestBody = {
            model: params.model || 'viduq2-pro-fast',
            images: params.images,
            prompt: params.prompt ? params.prompt.substring(0, 2000) : '',
            aspect_ratio: params.aspect_ratio, // 透传比例参数
            duration: params.duration || 5,
            resolution: params.resolution || '1080p',
            off_peak: params.off_peak || false,
            watermark: params.watermark ?? false,
            wm_position: params.wm_position,
            wm_url: params.wm_url,
            callback_url: params.callback_url
        };

        return this.makeRequest('/reference2video', requestBody);
    }

    /**
     * 查询任务状态
     * GET /tasks/{task_id}/creations
     */
    async getTaskStatus(taskId: string): Promise<ViduTaskResponse> {
        let lastError: any;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/tasks/${taskId}/creations`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });

                if (!response.ok) {
                    const error = await response.text();
                    console.error(`[Vidu] 查询任务状态失败 (尝试 ${attempt}/3):`, error);

                    if (response.status === 429 || response.status === 500) {
                        lastError = new Error(`Vidu Task Status Error: ${response.status} ${error}`);
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 1000 * attempt));
                            continue;
                        }
                    }
                    throw new Error(`Vidu Task Status Error: ${response.status} ${error}`);
                }

                const result = await response.json() as ViduTaskResponse;
                console.log(`[Vidu] 任务 ${taskId} 状态:`, result.state);
                return result;
            } catch (error: any) {
                console.warn(`[Vidu] 查询状态尝试 ${attempt} 失败:`, error.message);
                lastError = error;
                if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        throw lastError;
    }

    /**
     * 取消任务
     * POST /tasks/{task_id}/cancel
     */
    async cancelTask(taskId: string): Promise<ViduCancelResponse> {
        console.log(`[Vidu] 取消任务: ${taskId}`);

        const response = await fetch(`${this.baseUrl}/tasks/${taskId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vidu Cancel Task Error: ${response.status} ${error}`);
        }

        const result = await response.json() as ViduCancelResponse;
        console.log(`[Vidu] 任务 ${taskId} 已取消，退还积分:`, result.credits);
        return result;
    }

    /**
     * 轮询等待任务完成
     * @param taskId 任务 ID
     * @param maxRetries 最大重试次数（默认 600 次）
     * @param interval 轮询间隔（默认 3 秒）
     */
    async waitForCompletion(
        taskId: string,
        maxRetries = 600,
        interval = 3000
    ): Promise<ViduTaskResponse> {
        for (let i = 0; i < maxRetries; i++) {
            const status = await this.getTaskStatus(taskId);

            console.log(`[Vidu] 任务 ${taskId} 状态: ${status.state} (${i + 1}/${maxRetries})`);

            if (status.state === 'success') {
                console.log(`[Vidu] 任务 ${taskId} 完成！`);
                return status;
            }

            if (status.state === 'failed') {
                throw new Error(`Vidu task ${taskId} failed`);
            }

            await new Promise(r => setTimeout(r, interval));
        }

        throw new Error(`Vidu task ${taskId} timeout after ${maxRetries} retries`);
    }

    /**
     * 统一请求方法（带重试逻辑）
     */
    private async makeRequest(endpoint: string, body: any): Promise<ViduCreateResponse> {
        let lastError: any;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const error = await response.text();
                    console.error(`[Vidu] ${endpoint} 失败 (尝试 ${attempt}/3):`, error);

                    // 429/500 错误重试
                    if (response.status === 429 || response.status === 500) {
                        lastError = new Error(`Vidu API Error: ${response.status} ${error}`);
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 2000 * attempt));
                            continue;
                        }
                    }
                    throw new Error(`Vidu API Error: ${response.status} ${error}`);
                }

                const result = await response.json() as ViduCreateResponse;
                console.log('========== Vidu 响应 ==========');
                console.log('task_id:', result.task_id);
                console.log('state:', result.state);
                console.log('================================');
                return result;
            } catch (error: any) {
                lastError = error;
                // 网络错误也重试
                if (attempt < 3 && (error.code === 'ECONNRESET' || error.message.includes('fetch failed'))) {
                    console.warn(`[Vidu] 网络错误，准备重试 (${attempt}/3)`);
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                    continue;
                }
                throw error;
            }
        }

        throw lastError;
    }
}
