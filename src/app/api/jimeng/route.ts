import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JIMENG_BASE_URL = 'https://jimeng.jianying.com';
const DEFAULT_ASSISTANT_ID = '513695';
const DRAFT_VERSION = '3.0.2';

// 模型映射 - 与 n8n 插件完全一致
const MODEL_MAP: Record<string, string> = {
    'jimeng-4.0': 'high_aes_general_v40',
    'jimeng-3.1': 'high_aes_general_v30l_art_fangzhou:general_v3.0_18b',
    'jimeng-3.0': 'high_aes_general_v30l:general_v3.0_18b',
    'jimeng-2.1': 'high_aes_general_v21_L:general_v2.1_L',
    'jimeng-2.0-pro': 'high_aes_general_v20_L:general_v2.0_L',
    'jimeng-2.0': 'high_aes_general_v20:general_v2.0',
    'jimeng-1.4': 'high_aes_general_v14:general_v1.4',
    'jimeng-xl-pro': 'text2img_xl_sft',
};

const DEFAULT_MODEL = 'jimeng-4.0';

// 比例值映射 - 与 n8n 插件完全一致
const RATIO_VALUE_MAP: Record<string, number> = {
    '16:9': 3,
    '21:9': 8,
    '3:2': 7,
    '4:3': 4,
    '1:1': 1,
    '3:4': 2,
    '2:3': 6,
    '9:16': 5,
};

// RatiosList - 与 n8n 插件 util.js 完全一致
const RatiosList = [
    { ratio: '21:9', value: { '1k': { width: 2016, height: 864 }, '2k': { width: 3024, height: 1296 } } },
    { ratio: '16:9', value: { '1k': { width: 1664, height: 936 }, '2k': { width: 2560, height: 1440 } } },
    { ratio: '3:2', value: { '1k': { width: 1584, height: 1056 }, '2k': { width: 2496, height: 1664 } } },
    { ratio: '4:3', value: { '1k': { width: 1472, height: 1104 }, '2k': { width: 2304, height: 1728 } } },
    { ratio: '1:1', value: { '1k': { width: 1328, height: 1328 }, '2k': { width: 2048, height: 2048 } } },
    { ratio: '3:4', value: { '1k': { width: 1104, height: 1472 }, '2k': { width: 1728, height: 2304 } } },
    { ratio: '2:3', value: { '1k': { width: 1056, height: 1584 }, '2k': { width: 1664, height: 2496 } } },
    { ratio: '9:16', value: { '1k': { width: 936, height: 1664 }, '2k': { width: 1440, height: 2560 } } },
];

function getClosestAspectRatio(width: number, height: number): string {
    const presetRatios = [
        { ratio: '21:9', value: 21 / 9 },
        { ratio: '16:9', value: 16 / 9 },
        { ratio: '4:3', value: 4 / 3 },
        { ratio: '1:1', value: 1 / 1 },
        { ratio: '3:4', value: 3 / 4 },
        { ratio: '9:16', value: 9 / 16 },
    ];
    const w = Number(width);
    const h = Number(height);
    if (w <= 0 || h <= 0 || isNaN(w) || isNaN(h)) {
        return '1:1';
    }
    const inputRatioValue = w / h;
    let closestRatio = '1:1';
    let minDifference = Infinity;
    for (const preset of presetRatios) {
        const difference = Math.abs(inputRatioValue - preset.value);
        if (difference < minDifference) {
            minDifference = difference;
            closestRatio = preset.ratio;
        }
    }
    return closestRatio;
}

class JimengApiClient {
    private refreshToken: string;
    private webId: number;
    private userId: string;
    private session: ReturnType<typeof axios.create>;

    constructor(refreshToken: string) {
        this.refreshToken = refreshToken;
        // 与 n8n 插件一致
        this.webId = Math.random() * 999999999999999999 + 7000000000000000000;
        this.userId = uuidv4().replace(/-/g, '');
        this.session = axios.create({
            headers: this.getFakeHeaders(),
        });
    }

    // 与 n8n 插件完全一致
    private getFakeHeaders() {
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cache-Control": "no-cache",
            "Last-Event-Id": "undefined",
            "Appid": DEFAULT_ASSISTANT_ID,
            "Appvr": "5.8.0",
            "Origin": "https://jimeng.jianying.com",
            "Pragma": "no-cache",
            "Priority": "u=1, i",
            "Referer": "https://jimeng.jianying.com",
            "Pf": "7",
            "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        };
    }

    // 与 n8n 插件完全一致
    private generateCookie() {
        const timestamp = Math.floor(Date.now() / 1000);
        const cookieParts = [
            `_tea_web_id=${this.webId}`,
            "is_staff_user=false",
            "store-region=cn-gd",
            "store-region-src=uid",
            `sid_guard=${this.refreshToken}%7C${timestamp}%7C5184000%7CMon%2C+03-Feb-2025+08%3A17%3A09+GMT`,
            `uid_tt=${this.userId}`,
            `uid_tt_ss=${this.userId}`,
            `sid_tt=${this.refreshToken}`,
            `sessionid=${this.refreshToken}`,
            `sessionid_ss=${this.refreshToken}`,
            `sid_tt=${this.refreshToken}`
        ];
        return cookieParts.join('; ');
    }

    private getModel(model: string): string {
        return MODEL_MAP[model || DEFAULT_MODEL] || MODEL_MAP[DEFAULT_MODEL];
    }

    // 与 n8n 插件完全一致
    async request(method: string, path: string, data?: any, params?: any, headers?: any) {
        const url = path.startsWith('https://') ? path : `${JIMENG_BASE_URL}${path}`;
        const requestHeaders = {
            'Cookie': this.generateCookie(),
            ...(headers || {})
        };

        try {
            const config: any = {
                method,
                url,
                headers: requestHeaders,
                params: { ...params, ...(method === 'get' ? data : {}) },
                data: method !== 'get' ? data : undefined
            };
            console.log('[Jimeng] Request URL:', url);
            console.log('[Jimeng] Request params:', JSON.stringify(params));
            console.log('[Jimeng] Request data:', JSON.stringify(data));

            const response = await this.session(config);
            console.log('[Jimeng] Response:', JSON.stringify(response.data));
            return response.data;
        } catch (error: any) {
            console.error('[Jimeng API Error]', error.response?.data || error.message);
            throw error;
        }
    }

    // 与 n8n 插件完全一致
    async getCredit() {
        const result = await this.request('post', '/commerce/v1/benefits/user_credit', {}, {}, { 'Referer': 'https://jimeng.jianying.com/ai-tool/image/generate' });
        const credit = result.credit || {};
        const gift_credit = credit.gift_credit || 0;
        const purchase_credit = credit.purchase_credit || 0;
        const vip_credit = credit.vip_credit || 0;
        return {
            gift_credit,
            purchase_credit,
            vip_credit,
            total_credit: gift_credit + purchase_credit + vip_credit
        };
    }

    // 与 n8n 插件完全一致
    async receiveCredit() {
        await this.request('post', '/commerce/v1/benefits/credit_receive', { 'time_zone': 'Asia/Shanghai' }, {}, { 'Referer': 'https://jimeng.jianying.com/ai-tool/image/generate' });
    }

    // 严格按照 n8n 插件的 generateImage 实现
    async generateImage(
        prompt: string,
        model: string = 'jimeng-4.0',
        aspectRatio: string = '16:9',
        resolutionType: string = '2k'
    ) {
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('prompt必须是非空字符串');
        }

        // 获取分辨率配置 - 与 n8n 插件 text.js 调用方式一致
        const imgInfo = RatiosList.find(item => item.ratio === aspectRatio);
        if (!imgInfo) {
            throw new Error('宽高比不正确');
        }

        const resolutionConfig = imgInfo.value[resolutionType as '1k' | '2k'];
        const width = resolutionConfig.width;
        const height = resolutionConfig.height;

        // 计算 image_ratio
        const image_ratio = RATIO_VALUE_MAP[getClosestAspectRatio(width, height)] || 1;

        const modelName = model || DEFAULT_MODEL;
        const actualModel = this.getModel(modelName);

        // 与 n8n 插件一致：先检查积分
        const creditInfo = await this.getCredit();
        if (creditInfo.total_credit <= 0) {
            await this.receiveCredit();
        }

        const componentId = uuidv4();
        const submitId = uuidv4();

        // rqParams - 与 n8n 插件完全一致
        const rqParams = {
            "aid": parseInt(DEFAULT_ASSISTANT_ID, 10),
            "aigc_features": "app_lip_sync",
            "da_version": "3.3.3",
            "web_version": "7.5.0",
            "web_component_open_flag": 1,
            "device_platform": "web",
            "region": "CN",
            "web_id": Math.floor(this.webId)
        };

        // abilities - 与 n8n 插件完全一致 (文生图模式，无图片上传)
        const abilities = {
            "generate": {
                "type": "",
                "id": uuidv4(),
                "core_param": {
                    "type": "",
                    "id": uuidv4(),
                    "model": actualModel,
                    "prompt": prompt,
                    "negative_prompt": "",
                    "seed": Math.floor(Math.random() * 1000000000) + 2500000000,
                    "sample_strength": 0.5,
                    "image_ratio": image_ratio,
                    "large_image_info": {
                        "type": "",
                        "id": uuidv4(),
                        "height": height,
                        "width": width,
                        "resolution_type": resolutionType  // '1k' 或 '2k' 字符串
                    }
                },
                "history_option": {
                    "type": "",
                    "id": uuidv4(),
                }
            }
        };

        // rqData - 与 n8n 插件完全一致
        const rqData: any = {
            "extend": {
                "root_model": actualModel,
                "template_id": "",
            },
            "submit_id": submitId,
            "draft_content": JSON.stringify({
                "type": "draft",
                "id": uuidv4(),
                "min_version": DRAFT_VERSION,
                "is_from_tsn": true,
                "version": "3.3.3",
                "main_component_id": componentId,
                "component_list": [{
                    "type": "image_base_component",
                    "id": componentId,
                    "min_version": DRAFT_VERSION,
                    "metadata": {
                        "type": "",
                        "id": uuidv4(),
                        "created_platform": 3,
                        "created_platform_version": "",
                        "created_time_in_ms": Date.now(),
                        "created_did": ""
                    },
                    "generate_type": "generate",
                    "aigc_mode": "workbench",
                    "abilities": {
                        "type": "",
                        "id": uuidv4(),
                        ...abilities
                    }
                }]
            }),
        };

        // metrics_extra - 与 n8n 插件完全一致
        rqData["metrics_extra"] = JSON.stringify({
            "promptSource": "custom",
            "generateCount": 1,
            "enterFrom": "click",
            "generateId": "0fc92bbf-7aed-4a96-88ed-d38c512eb27d",
            "isRegenerate": false
        });

        const result = await this.request('post', '/mweb/v1/aigc_draft/generate', rqData, rqParams);

        const historyId = result.data?.aigc_data?.history_record_id;
        if (!historyId) {
            const errorMsg = result.errmsg || '记录ID不存在';
            throw new Error(errorMsg);
        }

        return {
            ...result,
            historyId
        };
    }

    // pollImageTask - 与 n8n 插件 util.js 完全一致
    async pollImageTask(historyId: string, maxTimes: number = 60) {
        const imageInfo = {
            "width": 2048,
            "height": 2048,
            "format": "webp",
            "image_scene_list": [
                { "scene": "smart_crop", "width": 360, "height": 360, "uniq_key": "smart_crop-w:360-h:360", "format": "webp" },
                { "scene": "smart_crop", "width": 480, "height": 480, "uniq_key": "smart_crop-w:480-h:480", "format": "webp" },
                { "scene": "smart_crop", "width": 720, "height": 720, "uniq_key": "smart_crop-w:720-h:720", "format": "webp" },
                { "scene": "smart_crop", "width": 720, "height": 480, "uniq_key": "smart_crop-w:720-h:480", "format": "webp" },
                { "scene": "smart_crop", "width": 360, "height": 240, "uniq_key": "smart_crop-w:360-h:240", "format": "webp" },
                { "scene": "smart_crop", "width": 240, "height": 320, "uniq_key": "smart_crop-w:240-h:320", "format": "webp" },
                { "scene": "smart_crop", "width": 480, "height": 640, "uniq_key": "smart_crop-w:480-h:640", "format": "webp" },
                { "scene": "normal", "width": 2400, "height": 2400, "uniq_key": "2400", "format": "webp" },
                { "scene": "normal", "width": 1080, "height": 1080, "uniq_key": "1080", "format": "webp" },
                { "scene": "normal", "width": 720, "height": 720, "uniq_key": "720", "format": "webp" },
                { "scene": "normal", "width": 480, "height": 480, "uniq_key": "480", "format": "webp" },
                { "scene": "normal", "width": 360, "height": 360, "uniq_key": "360", "format": "webp" }
            ]
        };

        let status = 20;
        let failCode: string | undefined;
        let itemList: any[] = [];

        for (let i = 0; i < maxTimes; i++) {
            const historyResult = await this.request('post', '/mweb/v1/get_history_by_ids', {
                "history_ids": [historyId],
                "image_info": imageInfo,
                "http_common_info": {
                    "aid": parseInt(DEFAULT_ASSISTANT_ID, 10)
                }
            });

            const record = historyResult.data?.[historyId];
            if (!record) {
                throw new Error('图片任务记录不存在');
            }

            status = record.status;
            failCode = record.fail_code;
            itemList = record.item_list || [];

            console.log(`[Jimeng] Poll attempt ${i + 1}, status: ${status}`);

            if (status === 30) {
                if (failCode === '2038') {
                    throw new Error('图片内容被过滤');
                }
                throw new Error(`图像生成失败，错误码: ${failCode}`);
            }

            if (status === 50) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const imageUrls: string[] = [];
        for (const item of itemList) {
            let imageUrl: string | undefined;
            if (item.image?.large_images?.[0]?.image_url) {
                imageUrl = item.image.large_images[0].image_url;
            } else if (item.common_attr?.cover_url) {
                imageUrl = item.common_attr.cover_url;
            }
            if (imageUrl) {
                imageUrls.push(imageUrl);
            }
        }

        return {
            success: status === 50,
            imageUrls,
            status,
            failCode
        };
    }
}

export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;

    try {
        const body = await request.json();
        const { action, payload, sessionid: providedSessionId } = body;

        const sessionid = providedSessionId || process.env.JIMENG_SESSION_ID;

        if (!sessionid) {
            return NextResponse.json({ error: 'Missing Jimeng sessionid' }, { status: 400 });
        }

        const client = new JimengApiClient(sessionid);

        if (action === 'generate-image') {
            const { prompt, model = 'jimeng-4.0', aspectRatio = '16:9' } = payload;
            // 使用 1k 分辨率，与 n8n 插件默认值一致
            const result = await client.generateImage(prompt, model, aspectRatio, '2k');
            return NextResponse.json(result);
        }

        if (action === 'check-status') {
            const { historyId } = payload;
            const result = await client.pollImageTask(historyId);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('[Jimeng API Error]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
