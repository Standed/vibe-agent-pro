import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import CRC32 from 'crc-32';
import sizeOf from 'image-size';
import * as querystring from 'querystring';

export const maxDuration = 60;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JIMENG_BASE_URL = 'https://jimeng.jianying.com';
const DEFAULT_ASSISTANT_ID = '513695';
const DRAFT_VERSION = '3.0.2';

// 模型映射
// 模型映射
const MODEL_MAP: Record<string, string> = {
    'jimeng-4.5': 'high_aes_general_v40l',
    'jimeng-4.1': 'high_aes_general_v41',
    'jimeng-4.0': 'high_aes_general_v40'
};

const DEFAULT_MODEL = 'jimeng-4.0';

// 比例值映射
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

// RatiosList
// RatiosList
const RatiosList = [
    { ratio: '21:9', value: { '1k': { width: 2016, height: 864 }, '2k': { width: 3024, height: 1296 }, '4k': { width: 6400, height: 2742 } } },
    { ratio: '16:9', value: { '1k': { width: 1664, height: 936 }, '2k': { width: 2560, height: 1440 }, '4k': { width: 5404, height: 3040 } } },
    { ratio: '3:2', value: { '1k': { width: 1584, height: 1056 }, '2k': { width: 2496, height: 1664 }, '4k': { width: 5268, height: 3512 } } },
    { ratio: '4:3', value: { '1k': { width: 1472, height: 1104 }, '2k': { width: 2304, height: 1728 }, '4k': { width: 4864, height: 3648 } } },
    { ratio: '1:1', value: { '1k': { width: 1328, height: 1328 }, '2k': { width: 2048, height: 2048 }, '4k': { width: 4096, height: 4096 } } },
    { ratio: '3:4', value: { '1k': { width: 1104, height: 1472 }, '2k': { width: 1728, height: 2304 }, '4k': { width: 3648, height: 4864 } } },
    { ratio: '2:3', value: { '1k': { width: 1056, height: 1584 }, '2k': { width: 1664, height: 2496 }, '4k': { width: 3512, height: 5268 } } },
    { ratio: '9:16', value: { '1k': { width: 936, height: 1664 }, '2k': { width: 1440, height: 2560 }, '4k': { width: 3040, height: 5404 } } },
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

function isNonEmptyObject(value: any): boolean {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    return Object.keys(value).length > 0;
}

class JimengApiClient {
    private refreshToken: string;
    private webId: number;
    private userId: string;
    private session: ReturnType<typeof axios.create>;
    private uploadImageProofUrl = 'https://imagex.bytedanceapi.com/';

    constructor(refreshToken: string) {
        this.refreshToken = refreshToken;
        this.webId = Math.random() * 999999999999999999 + 7000000000000000000;
        this.userId = uuidv4().replace(/-/g, '');
        this.session = axios.create({
            headers: this.getFakeHeaders(),
        });
    }

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
            // console.log('[Jimeng] Request params:', JSON.stringify(params));
            // console.log('[Jimeng] Request data:', JSON.stringify(data));

            const response = await this.session(config);
            // console.log('[Jimeng] Response:', JSON.stringify(response.data));
            return response.data;
        } catch (error: any) {
            console.error('[Jimeng API Error]', error.response?.data || error.message);
            throw error;
        }
    }

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

    async receiveCredit() {
        await this.request('post', '/commerce/v1/benefits/credit_receive', { 'time_zone': 'Asia/Shanghai' }, {}, { 'Referer': 'https://jimeng.jianying.com/ai-tool/image/generate' });
    }

    // --- 上传相关方法 ---

    generateRandomString(length: number) {
        const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    async getUploadAuth() {
        const authRes = await this.request('post', '/mweb/v1/get_upload_token?aid=513695&da_version=3.3.3&aigc_features=app_lip_sync', { 'scene': 2 });
        if (!authRes.data) {
            throw new Error(authRes.errmsg || '获取上传凭证失败,账号可能已掉线!');
        }
        return authRes.data;
    }

    addHeaders(amzDate: string, sessionToken: string, requestBody: any) {
        const headers: any = {
            'X-Amz-Date': amzDate,
            'X-Amz-Security-Token': sessionToken,
        };
        if (isNonEmptyObject(requestBody)) {
            const bodyStr = JSON.stringify(requestBody);
            headers['X-Amz-Content-Sha256'] = crypto.createHash('sha256').update(bodyStr).digest('hex');
        }
        return headers;
    }

    credentialString(amzDate: string, region: string, service: string) {
        const credentialArr = [
            amzDate.substring(0, 8),
            region,
            service,
            'aws4_request',
        ];
        return credentialArr.join('/');
    }

    signedHeaders(requestHeaders: any) {
        const headers = Object.keys(requestHeaders).map(key => key.toLowerCase());
        return headers.sort().join(';');
    }

    canonicalString(requestMethod: string, requestParams: any, requestHeaders: any, requestBody: any) {
        const canonicalHeaders: string[] = [];
        Object.keys(requestHeaders).sort().forEach(key => {
            canonicalHeaders.push(`${key.toLowerCase()}:${requestHeaders[key]}`);
        });
        const canonicalHeadersStr = canonicalHeaders.join('\n') + '\n';
        const body = requestBody ? JSON.stringify(requestBody) : '';
        const paramsStr = querystring.stringify(requestParams);
        const canonicalStringArr = [
            requestMethod.toUpperCase(),
            '/',
            paramsStr,
            canonicalHeadersStr,
            this.signedHeaders(requestHeaders),
            crypto.createHash('sha256').update(body).digest('hex'),
        ];
        return canonicalStringArr.join('\n');
    }

    signature(secretAccessKey: string, amzDate: string, region: string, service: string, requestMethod: string, requestParams: any, requestHeaders: any, requestBody: any) {
        const amzDay = amzDate.substring(0, 8);
        const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(amzDay).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const signingKey = crypto.createHmac('sha256', kService).update('aws4_request').digest();

        const canonicalStr = this.canonicalString(requestMethod, requestParams, requestHeaders, requestBody);
        const stringToSignArr = [
            'AWS4-HMAC-SHA256',
            amzDate,
            this.credentialString(amzDate, region, service),
            crypto.createHash('sha256').update(canonicalStr).digest('hex'),
        ];
        const stringToSign = stringToSignArr.join('\n');
        return crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    }

    generateAuthorizationAndHeader(accessKeyId: string, secretAccessKey: string, sessionToken: string, region: string, service: string, requestMethod: string, requestParams: any, requestBody: any) {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
        const requestHeaders = this.addHeaders(amzDate, sessionToken, requestBody);
        const authorizationParams = [
            `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${this.credentialString(amzDate, region, service)}`,
            `SignedHeaders=${this.signedHeaders(requestHeaders)}`,
            `Signature=${this.signature(secretAccessKey, amzDate, region, service, requestMethod, requestParams, requestHeaders, requestBody)}`,
        ];
        const authorization = authorizationParams.join(', ');
        return {
            ...requestHeaders,
            'Authorization': authorization
        };
    }

    async getImageSize(imgData: Buffer) {
        try {
            const dimensions = sizeOf(imgData);
            return {
                width: dimensions.width || 1024,
                height: dimensions.height || 1024
            };
        } catch (error: any) {
            console.error('获取图片尺寸失败:', error.message);
            return { width: 1024, height: 1024 };
        }
    }

    async uploadCoverFile(fileUrl: string) {
        try {
            // 1. 获取图片数据
            console.log('[Jimeng] Downloading image from:', fileUrl);
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const imageData = Buffer.from(response.data);

            // 2. 获取上传凭证
            const uploadAuth = await this.getUploadAuth();

            // 3. 计算 CRC32
            const crcInt = CRC32.buf(imageData);
            const imageCrc32 = (crcInt >>> 0).toString(16).padStart(8, '0');

            // 4. 申请上传
            const getUploadImageProofRequestParams = {
                'Action': 'ApplyImageUpload',
                'FileSize': imageData.length,
                'ServiceId': 'tb4s082cfz',
                'Version': '2018-08-01',
                's': this.generateRandomString(11),
            };
            const requestHeadersInfo = this.generateAuthorizationAndHeader(
                uploadAuth.access_key_id,
                uploadAuth.secret_access_key,
                uploadAuth.session_token,
                'cn-north-1',
                'imagex',
                'GET',
                getUploadImageProofRequestParams,
                undefined
            );

            const uploadImgRes = await this.request('get', `${this.uploadImageProofUrl}?${querystring.stringify(getUploadImageProofRequestParams)}`, {}, {}, requestHeadersInfo);
            if (uploadImgRes.Response && uploadImgRes.Response.Error) {
                throw new Error(uploadImgRes.Response.Error.Message);
            }

            // 5. 上传文件
            const uploadAddress = uploadImgRes.Result.UploadAddress;
            const uploadImgUrl = `https://${uploadAddress.UploadHosts[0]}/upload/v1/${uploadAddress.StoreInfos[0].StoreUri}`;
            const uploadHeaders = {
                'Authorization': uploadAddress.StoreInfos[0].Auth,
                'Content-Crc32': imageCrc32,
                'Content-Type': 'application/octet-stream',
            };
            const uploadResponse = await axios.post(uploadImgUrl, imageData, { headers: uploadHeaders });
            const imageUploadRes = uploadResponse.data;
            if (imageUploadRes.code !== 2000) {
                throw new Error(imageUploadRes.message || '上传失败');
            }

            // 6. 提交上传
            const commitImgParams = {
                'Action': 'CommitImageUpload',
                'FileSize': imageData.length,
                'ServiceId': 'tb4s082cfz',
                'Version': '2018-08-01',
            };
            const commitImgContent = {
                'SessionKey': uploadAddress.SessionKey,
            };
            const commitImgHead = this.generateAuthorizationAndHeader(
                uploadAuth.access_key_id,
                uploadAuth.secret_access_key,
                uploadAuth.session_token,
                'cn-north-1',
                'imagex',
                'POST',
                commitImgParams,
                commitImgContent
            );
            commitImgHead['Content-Type'] = 'application/json';

            const commitImg = await this.request('post', `${this.uploadImageProofUrl}?${querystring.stringify(commitImgParams)}`, commitImgContent, undefined, commitImgHead);
            if (commitImg.Response && commitImg.Response.Error) {
                throw new Error(commitImg.Response.Error.Message);
            }

            // 7. 获取尺寸并返回
            const { width, height } = await this.getImageSize(imageData);
            return {
                width,
                height,
                uploadId: commitImg.Result.Results[0].Uri
            };

        } catch (error: any) {
            console.error('[Jimeng] Upload failed:', error);
            throw new Error(`上传文件失败: ${error.message}`);
        }
    }

    // --- 生成图片 ---

    async generateImage(
        prompt: string,
        model: string = 'jimeng-4.0',
        aspectRatio: string = '16:9',
        resolutionType: string = '2k',
        imageUrls?: string[]
    ) {
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('prompt必须是非空字符串');
        }

        // 获取分辨率配置
        const imgInfo = RatiosList.find(item => item.ratio === aspectRatio);
        if (!imgInfo) {
            throw new Error('宽高比不正确');
        }

        const resolutionConfig = imgInfo.value[resolutionType as '1k' | '2k'];
        let width = resolutionConfig.width;
        let height = resolutionConfig.height;

        const modelName = model || DEFAULT_MODEL;
        const actualModel = this.getModel(modelName);

        // 检查积分
        const creditInfo = await this.getCredit();
        if (creditInfo.total_credit <= 0) {
            await this.receiveCredit();
        }

        const componentId = uuidv4();

        // 处理参考图上传
        const hasFilePath = !!(imageUrls && imageUrls.length > 0);
        let uploadId = undefined;
        let ability_list: any[] = [];

        if (hasFilePath && imageUrls) {
            for (const url of imageUrls) {
                const result = await this.uploadCoverFile(url);
                uploadId = result.uploadId;
                // 如果是图生图，使用图片的尺寸作为基础，或者保持默认分辨率
                // 这里参考插件逻辑，如果有上传图片，可能会调整宽高，但为了保持用户选择的比例，我们暂不强制覆盖，除非是 1:1
                // width = result.width;
                // height = result.height;

                ability_list.push({
                    "type": "",
                    "id": uuidv4(),
                    "name": "byte_edit",
                    "image_uri_list": [uploadId],
                    "image_list": [
                        {
                            "type": "image",
                            "id": uuidv4(),
                            "source_from": "upload",
                            "platform_type": 1,
                            "name": "",
                            "image_uri": uploadId,
                            "width": result.width,
                            "height": result.height,
                            "format": "",
                            "uri": uploadId
                        }
                    ],
                    "strength": 0.5
                });
                // 避免并发过快
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // 计算 image_ratio
        const image_ratio = RATIO_VALUE_MAP[getClosestAspectRatio(width, height)] || 1;

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

        let abilities;
        if (hasFilePath && uploadId) {
            // 图生图 (Blend) 模式
            abilities = {
                "blend": {
                    "type": "",
                    "id": uuidv4(),
                    "min_features": [],
                    "core_param": {
                        "type": "",
                        "id": uuidv4(),
                        "model": actualModel,
                        "prompt": prompt + '##', // 插件加了 ##
                        "sample_strength": 0.5,
                        "image_ratio": image_ratio,
                        "large_image_info": {
                            "type": "",
                            "id": uuidv4(),
                            "height": height,
                            "width": width,
                            "resolution_type": resolutionType
                        }
                    },
                    "ability_list": ability_list,
                    "prompt_placeholder_info_list": [
                        {
                            "type": "",
                            "id": uuidv4(),
                            "ability_index": 0
                        }
                    ],
                    "postedit_param": {
                        "type": "",
                        "id": uuidv4(),
                        "generate_type": 0
                    }
                }
            };
        } else {
            // 文生图模式
            abilities = {
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
                            "resolution_type": resolutionType
                        }
                    },
                    "history_option": {
                        "type": "",
                        "id": uuidv4(),
                    }
                }
            };
        }

        const rqData: any = {
            "extend": {
                "root_model": actualModel,
                "template_id": "",
            },
            "submit_id": uuidv4(),
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
                    "generate_type": hasFilePath ? "blend" : "generate",
                    "aigc_mode": "workbench",
                    "abilities": {
                        "type": "",
                        "id": uuidv4(),
                        ...abilities
                    }
                }]
            }),
        };

        if (!hasFilePath) {
            rqData["metrics_extra"] = JSON.stringify({
                "promptSource": "custom",
                "generateCount": 1,
                "enterFrom": "click",
                "generateId": "0fc92bbf-7aed-4a96-88ed-d38c512eb27d",
                "isRegenerate": false
            });
        }

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
            const { prompt, model = 'jimeng-4.0', aspectRatio = '16:9', imageUrls } = payload;
            const result = await client.generateImage(prompt, model, aspectRatio, '2k', imageUrls);
            return NextResponse.json(result);
        }

        if (action === 'check-status') {
            const { historyId } = payload;
            // Revert to long-polling as requested by user.
            // Server will wait until completion or timeout (default 60s).
            const result = await client.pollImageTask(historyId);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('[Jimeng API Error]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
