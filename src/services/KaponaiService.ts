
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import {
    KaponaiResponse,
    KaponaiCharacterResponse,
    KaponaiVideoParams,
    KaponaiCharacterParams
} from '../types/kaponai';

export class KaponaiService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string, baseUrl?: string) {
        // 强制从环境变量读取，避免硬编码泄露
        const envApiKey = apiKey || process.env.KAPONAI_API_KEY;
        if (!envApiKey) {
            throw new Error('KAPONAI_API_KEY is required. Please set it in your environment variables.');
        }
        this.apiKey = envApiKey;
        this.baseUrl = (baseUrl || process.env.KAPONAI_BASE_URL || 'https://models.kapon.cloud').replace(/\/$/, '');
    }

    async assertReachable(timeoutMs = 3000): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            await fetch(this.baseUrl, { method: 'HEAD', signal: controller.signal });
        } catch (error: any) {
            const reason = error?.name === 'AbortError' ? 'timeout' : (error?.message || 'unknown error');
            throw new Error(`Kaponai unreachable: ${reason}`);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * 创建 Sora 角色
     * 可以基于现有视频 URL 或任务 ID
     */
    async createCharacter(params: KaponaiCharacterParams): Promise<KaponaiCharacterResponse> {
        // 记录完整的请求信息
        console.log('========== Kaponai CreateCharacter 请求详情 ==========');
        console.log('请求URL:', `${this.baseUrl}/sora/v1/characters`);
        console.log('请求方法:', 'POST');
        console.log('请求头:', JSON.stringify({
            'Authorization': `Bearer ${this.apiKey.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        }, null, 2));
        console.log('请求体:', JSON.stringify(params, null, 2));
        console.log('====================================================');

        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/sora/v1/characters`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });

                if (!response.ok) {
                    const error = await response.text();
                    console.error('========== Kaponai CreateCharacter 错误响应 ==========');
                    console.error('状态码:', response.status);
                    console.error('响应体:', error);
                    console.error('====================================================');

                    // 专门针对负载高的情况进行重试
                    if (response.status === 429 || response.status === 500) {
                        console.warn(`[Kaponai] 创建角色尝试 ${attempt} 失败 (状态码: ${response.status})，准备重试...`);
                        lastError = new Error(`Kaponai Create Character Error: ${response.status} ${error}`);
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 2000 * attempt)); // Reduced backoff
                            continue;
                        }
                    }
                    throw new Error(`Kaponai Create Character Error: ${response.status} ${error}`);
                }

                const result = await response.json() as KaponaiCharacterResponse;
                console.log('========== Kaponai CreateCharacter 成功响应 ==========');
                console.log('响应:', JSON.stringify(result, null, 2));
                console.log('====================================================');
                return result;
            } catch (error: any) {
                lastError = error;
                // 网络层面的错误也值得重试
                if (attempt < 3 && (error.code === 'ECONNRESET' || error.message.includes('fetch failed'))) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    /**
     * 创建视频任务 (支持文本、参考图、角色引用)
     */
    async createVideo(params: KaponaiVideoParams): Promise<KaponaiResponse<any>> {
        const url = `${this.baseUrl}/v1/videos`;

        // 如果包含本地文件路径作为 input_reference，使用 FormData
        if (typeof params.input_reference === 'string' && fs.existsSync(params.input_reference)) {
            const formData = new FormData();
            formData.append('model', params.model);

            // 如果 prompt 是对象，转为字符串
            const promptStr = typeof params.prompt === 'object' ? JSON.stringify(params.prompt) : params.prompt;
            formData.append('prompt', promptStr);

            formData.append('seconds', params.seconds.toString());
            formData.append('size', params.size);

            if (params.character_url) formData.append('character_url', params.character_url);
            if (params.character_timestamps) formData.append('character_timestamps', params.character_timestamps);
            if (params.private) formData.append('private', params.private);

            // 读取文件流
            formData.append('input_reference', fs.createReadStream(params.input_reference));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Kaponai Create Video (Multipart) Error: ${response.status} ${error}`);
            }

            return await response.json() as KaponaiResponse<any>;
        }

        // 默认使用 JSON
        const requestBody = {
            ...params,
            prompt: typeof params.prompt === 'object' ? JSON.stringify(params.prompt) : params.prompt
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Kaponai Create Video (JSON) Error: ${response.status} ${error}`);
        }

        return await response.json() as KaponaiResponse<any>;
    }

    /**
     * 查询视频状态 (带重试逻辑)
     */
    async getVideoStatus(videoId: string): Promise<KaponaiResponse<any>> {
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/v1/videos/${videoId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`Kaponai Get Status Error: ${response.status} ${error}`);
                }

                return await response.json() as KaponaiResponse<any>;
            } catch (error: any) {
                console.warn(`[Kaponai] 查询状态尝试 ${attempt} 失败: ${error.message}`);
                lastError = error;
                if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
        throw lastError;
    }

    /**
     * 下载视频内容 (带重试逻辑)
     */
    async downloadVideo(videoId: string, targetPath: string): Promise<string> {
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/v1/videos/${videoId}/content`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`Kaponai Download Error: ${response.status}`);
                }

                const fileStream = fs.createWriteStream(targetPath);
                return await new Promise((resolve, reject) => {
                    if (!response.body) {
                        reject(new Error('Response body is null'));
                        return;
                    }
                    response.body.pipe(fileStream);
                    response.body.on('error', reject);
                    fileStream.on('finish', () => resolve(targetPath));
                });
            } catch (error: any) {
                console.warn(`[Kaponai] 下载视频尝试 ${attempt} 失败: ${error.message}`);
                lastError = error;
                if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
            }
        }
        throw lastError;
    }

    /**
     * 辅助函数：轮询直到任务结束
     */
    async waitForCompletion(videoId: string, maxRetries = 600, interval = 5000): Promise<KaponaiResponse<any>> {
        for (let i = 0; i < maxRetries; i++) {
            const status = await this.getVideoStatus(videoId);
            console.log(`[Kaponai] 任务 ${videoId} 状态: ${status.status} (${status.progress}%)`);

            if (status.status === 'completed') return status;
            if (status.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(status.error)}`);

            await new Promise(r => setTimeout(r, interval));
        }
        throw new Error(`Timeout waiting for video ${videoId}`);
    }
}
