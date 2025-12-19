import axios from 'axios';

export interface JimengGenerateParams {
    prompt: string;
    model?: string;
    aspectRatio?: string;
    negativePrompt?: string;
    sessionid?: string;
}

export interface JimengTaskStatus {
    historyId: string;
    sessionid?: string;
}

class JimengService {
    async generateImage(params: JimengGenerateParams) {
        try {
            const response = await axios.post('/api/jimeng', {
                action: 'generate-image',
                payload: params,
                sessionid: params.sessionid
            });
            return response.data;
        } catch (error: any) {
            console.error('Jimeng generateImage error:', error);
            throw error;
        }
    }

    async generateVideo(params: JimengGenerateParams & { imageUrl?: string }) {
        try {
            const response = await axios.post('/api/jimeng', {
                action: 'generate-video',
                payload: params,
                sessionid: params.sessionid
            });
            return response.data;
        } catch (error: any) {
            console.error('Jimeng generateVideo error:', error);
            throw error;
        }
    }

    async checkStatus(params: JimengTaskStatus) {
        try {
            const response = await axios.post('/api/jimeng', {
                action: 'check-status',
                payload: params,
                sessionid: params.sessionid
            });
            return response.data;
        } catch (error: any) {
            console.error('Jimeng checkStatus error:', error);
            throw error;
        }
    }

    async getCredit(sessionid?: string) {
        try {
            const response = await axios.post('/api/jimeng', {
                action: 'get-credit',
                sessionid
            });
            return response.data;
        } catch (error: any) {
            console.error('Jimeng getCredit error:', error);
            throw error;
        }
    }

    // 轮询任务直到完成
    async pollTask(historyId: string, sessionid?: string, maxAttempts = 60) {
        // 新的 check-status API 直接在服务端轮询并返回结果
        const result = await this.checkStatus({ historyId, sessionid });

        // 如果返回成功，直接使用所有图片
        if (result.success) {
            return {
                success: true,
                urls: result.imageUrls || [], // 返回所有图片
                url: result.imageUrls?.[0] || '', // 兼容旧接口
                type: 'image',
                record: result
            };
        }

        // 如果是传统响应格式，按原方式处理
        const record = result.data?.[historyId];
        if (!record) throw new Error('Task record not found');

        console.log(`[Jimeng] Status: ${record.status}`);

        if (record.status === 30) {
            if (record.fail_code === '2038') {
                throw new Error('图片内容被过滤');
            }
            throw new Error(`Task failed: ${record.fail_code || 'Unknown error'}`);
        }

        if (record.status === 50) {
            const itemList = record.item_list || [];
            if (itemList.length === 0) {
                throw new Error('No images generated');
            }

            // 提取所有图片 URL
            const imageUrls: string[] = [];
            for (const item of itemList) {
                let imageUrl;
                if (item.image?.large_images?.[0]?.image_url) {
                    imageUrl = item.image.large_images[0].image_url;
                } else if (item.common_attr?.cover_url) {
                    imageUrl = item.common_attr.cover_url;
                }
                if (imageUrl) {
                    imageUrls.push(imageUrl);
                }
            }

            if (imageUrls.length === 0) {
                throw new Error('No image URL found in result');
            }

            return {
                success: true,
                urls: imageUrls, // 所有图片
                url: imageUrls[0], // 兼容旧接口
                type: 'image',
                record
            };
        }

        throw new Error('Generation still in progress or failed');
    }
}

export const jimengService = new JimengService();
