import { SoraParams, RunningHubResponse, TaskCreationResult, TaskStatusResult, NodeInfo, SoraScript } from '@/types/runninghub';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = process.env.RUNNINGHUB_BASE_URL || 'https://www.runninghub.cn/task/openapi';

// WebApp IDs from User's Curl
const APP_ID_SORA_I2V = "1973555366057390081";
const APP_ID_CHAR_REF = "2001563656125071361";

export class RunningHubService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.RUNNINGHUB_API_KEY || '';
        this.baseUrl = BASE_URL;

        if (!this.apiKey) {
            console.warn('RunningHub API Key is missing. Please set RUNNINGHUB_API_KEY in .env.local');
        }
    }

    /**
     * Upload image to RunningHub and get fileName (hash)
     * Based on official API documentation
     *
     * @returns fileName - The server path like "api/9d77b8530f8b3591...png"
     */
    async uploadImage(imageUrlOrPath: string): Promise<string> {
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[RunningHub] 上传图片 (尝试 ${attempt}/3): ${imageUrlOrPath}`);

                // Download image if it's a URL
                let imageBuffer: Buffer;
                let fileName: string;

                if (imageUrlOrPath.startsWith('http')) {
                    const response = await fetch(imageUrlOrPath);
                    if (!response.ok) {
                        throw new Error(`Failed to download image: ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                    fileName = imageUrlOrPath.split('/').pop() || 'image.png';
                } else {
                    // Read from local file
                    const fsPromises = await import('fs/promises');
                    imageBuffer = await fsPromises.readFile(imageUrlOrPath);
                    fileName = imageUrlOrPath.split('/').pop() || 'image.png';
                }

                // Create multipart form data
                const formData = new FormData();

                formData.append('apiKey', this.apiKey);
                formData.append('file', imageBuffer, {
                    filename: fileName,
                    contentType: 'image/png'
                });
                formData.append('fileType', 'input');

                // Upload to RunningHub official endpoint
                const uploadResponse = await fetch(`${this.baseUrl}/upload`, {
                    method: 'POST',
                    headers: {
                        'Host': 'www.runninghub.cn',
                        ...formData.getHeaders()
                    },
                    body: formData
                });

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
                }

                const uploadData = await uploadResponse.json() as RunningHubResponse<any>;
                console.log('[RunningHub] 上传响应:', JSON.stringify(uploadData, null, 2));

                if (uploadData.code !== 0) {
                    throw new Error(`Upload failed: ${uploadData.msg}`);
                }

                // Extract fileName from response
                const serverFileName = (uploadData as any).data?.fileName;

                if (!serverFileName) {
                    throw new Error('Failed to get fileName from upload response');
                }

                console.log(`[RunningHub] ✅ 图片上传成功，fileName: ${serverFileName}`);
                return serverFileName;

            } catch (error: any) {
                console.warn(`[RunningHub] Upload Image Attempt ${attempt} failed: ${error.message}`);
                lastError = error;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
            }
        }
        throw lastError;
    }

    /**
     * Step 1: Upload Character to generate consistency reference
     * Returns the Task ID. User needs to poll this to get the final "hash" or filename.
     *
     * UPDATE: RunningHub supports direct image URLs! No need to upload first.
     *
     * @param imageUrl - Direct URL to the character image (e.g., "https://example.com/image.png")
     * @param prompt - Text prompt describing the character action
     */
    async uploadCharacter(imageUrl: string, prompt: string): Promise<TaskCreationResult> {
        // Node 15: Image (Direct URL works!)
        // Node 14: Prompt (Text input)
        const nodeInfoList: NodeInfo[] = [
            {
                nodeId: "15",
                fieldName: "image",
                fieldValue: imageUrl // Can use direct URLs!
            },
            {
                nodeId: "14",
                fieldName: "prompt",
                fieldValue: prompt
            }
        ];

        const payload = {
            webappId: APP_ID_CHAR_REF,
            apiKey: this.apiKey,
            nodeInfoList
        };

        try {
            console.log('[RunningHub] 上传角色参考，payload:', JSON.stringify(payload, null, 2));

            const response = await fetch(`${this.baseUrl}/ai-app/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Host': 'www.runninghub.cn'
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`RunningHub Character Upload Error: ${response.status} ${errorText}`);
            }

            const data = await response.json() as RunningHubResponse<any>;
            console.log('[RunningHub] 角色上传响应:', JSON.stringify(data, null, 2));

            if (data.code !== 0) throw new Error(data.msg || 'Character upload failed');

            const taskId = typeof data.data === 'string' ? data.data : (data.data as any)?.taskId;
            return { taskId: taskId, status: 'QUEUED' };

        } catch (error) {
            console.error('[RunningHub] Upload Character Error:', error);
            throw error;
        }
    }

    /**
     * Submit a Sora Video Generation Task (I2V / T2V with strict Script)
     * Note: "prompt" must be a JSON string valid against SoraScript schema.
     *
     * IMPORTANT: If using image_url, it should be the hash obtained from uploadImage()
     */
    async submitTask(scriptJson: string | SoraScript, params: SoraParams = {}): Promise<TaskCreationResult> {
        const {
            aspect_ratio = 'landscape',
            duration = 15,
            image_url
        } = params;

        // Ensure properly stringified prompt
        const promptValue = typeof scriptJson === 'string' ? scriptJson : JSON.stringify(scriptJson);

        // Construct Node List based on User's verified Curl
        // Order matters: Node 2 (image) first if exists, then Node 1 (params)
        const nodeInfoList: NodeInfo[] = [];

        // Optional: Image Input (Node 2) - should be hash from uploadImage
        if (image_url) {
            nodeInfoList.push({
                nodeId: "2",
                fieldName: "image",
                fieldValue: image_url // Hash like "825b8cb2f5603b068704ef435df77d570f081be814a40f652f080b8d4bc6ba03.png"
            });
        }

        // Node 1 parameters
        nodeInfoList.push(
            {
                nodeId: "1",
                fieldName: "model",
                fieldValue: aspect_ratio // "portrait", "landscape", "portrait-hd", "landscape-hd"
            },
            {
                nodeId: "1",
                fieldName: "prompt",
                fieldValue: promptValue // The strict JSON script
            },
            {
                nodeId: "1",
                fieldName: "duration_seconds",
                fieldValue: duration.toString()
            }
        );

        const payload = {
            webappId: APP_ID_SORA_I2V,
            apiKey: this.apiKey,
            nodeInfoList
        };

        try {
            console.log('[RunningHub] 提交视频生成任务，payload:', JSON.stringify(payload, null, 2));

            const response = await fetch(`${this.baseUrl}/ai-app/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Host': 'www.runninghub.cn'
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`RunningHub API Error: ${response.status} ${errorText}`);
            }

            const data: RunningHubResponse<any> = await response.json() as RunningHubResponse<any>;
            console.log('[RunningHub] 视频任务响应:', JSON.stringify(data, null, 2));

            if (data.code !== 0) {
                throw new Error(`RunningHub Task Failed: ${data.msg}`);
            }

            const taskId = typeof data.data === 'string' ? data.data : (data.data as any)?.taskId;

            if (!taskId) {
                console.error("Unknown response format:", data);
                throw new Error("Failed to parse Task ID from response");
            }

            return { taskId: taskId, status: 'QUEUED' };

        } catch (error) {
            console.error('[RunningHub] Submit Task Error:', error);
            throw error;
        }
    }

    /**
     * Check Task Status
     * Official endpoint: /task/openapi/status
     */
    async getTaskStatus(taskId: string): Promise<TaskStatusResult> {
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const statusResponse = await fetch(`${this.baseUrl}/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Host': 'www.runninghub.cn'
                    },
                    body: JSON.stringify({
                        apiKey: this.apiKey,
                        taskId: taskId
                    })
                });

                if (!statusResponse.ok) {
                    throw new Error(`Status Check HTTP Error: ${statusResponse.status}`);
                }

                const data = await statusResponse.json() as RunningHubResponse<any>;

                if (data.code !== 0) {
                    throw new Error(`Query failed: ${data.msg}`);
                }

                const resultData = (data as any).data;

                let status: string;
                let progress = 0;
                let result_url: string | undefined;
                let error_msg: string | undefined;

                if (typeof resultData === 'string') {
                    status = resultData;
                } else if (typeof resultData === 'object' && resultData !== null) {
                    status = resultData.status || resultData.taskStatus || 'QUEUED';
                    progress = resultData.progress || 0;
                    result_url = resultData.resultUrl || resultData.result_url || resultData.url;
                    error_msg = resultData.errorMsg || resultData.error_msg;
                } else {
                    status = 'UNKNOWN';
                }

                if (status === 'SUCCESS' && !result_url) {
                    try {
                        const outputs = await this.getTaskOutputs(taskId);
                        if (outputs && outputs.length > 0) {
                            const videoOutput = outputs.find((o: any) => o.type === 'video' || o.type === 'image');
                            if (videoOutput && videoOutput.url) {
                                result_url = videoOutput.url;
                            }
                        }
                    } catch (err) {
                        console.warn('[RunningHub] Failed to get outputs:', err);
                    }
                }

                return {
                    taskId: taskId,
                    status: status as any,
                    progress: progress,
                    result_url: result_url,
                    error_msg: error_msg
                };

            } catch (error: any) {
                console.warn(`[RunningHub] Get Status Attempt ${attempt} failed: ${error.message}`);
                lastError = error;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
            }
        }
        console.error('[RunningHub] All status check attempts failed.');
        throw lastError;
    }

    /**
     * Get Task Outputs/Results
     * Official endpoint: /task/openapi/outputs
     */
    async getTaskOutputs(taskId: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/outputs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Host': 'www.runninghub.cn'
                },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    taskId: taskId
                })
            });

            if (!response.ok) {
                throw new Error(`Get Outputs HTTP Error: ${response.status}`);
            }

            const data = await response.json() as RunningHubResponse<any>;
            console.log('[RunningHub] 任务输出响应:', JSON.stringify(data, null, 2));

            if (data.code !== 0) {
                throw new Error(`Get outputs failed: ${data.msg}`);
            }

            return (data as any).data;

        } catch (error) {
            console.error('[RunningHub] Get Outputs Error:', error);
            throw error;
        }
    }

    /**
     * Cancel a running task
     * Official endpoint: /task/openapi/cancel
     */
    async cancelTask(taskId: string): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Host': 'www.runninghub.cn'
                },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    taskId: taskId
                })
            });

            if (!response.ok) {
                throw new Error(`Cancel Task HTTP Error: ${response.status}`);
            }

            const data = await response.json() as RunningHubResponse<any>;
            console.log('[RunningHub] 取消任务响应:', JSON.stringify(data, null, 2));

            if (data.code !== 0) {
                throw new Error(`Cancel task failed: ${data.msg}`);
            }

        } catch (error) {
            console.error('[RunningHub] Cancel Task Error:', error);
            throw error;
        }
    }
}
