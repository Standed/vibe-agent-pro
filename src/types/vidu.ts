/**
 * Vidu 视频生成 API 类型定义
 * API 文档：https://docs.kapon.cloud/vidu/video-generation
 */

// ==================== 生成模式 ====================
export type ViduMode = 'img2video' | 'start-end2video' | 'reference2video';

// ==================== 任务状态 ====================
export type ViduTaskState = 'created' | 'queueing' | 'processing' | 'success' | 'failed';

// ==================== 通用参数 ====================
export interface ViduCommonParams {
    model?: string;                  // 默认 viduq2-pro-fast
    duration?: number;               // 1-10s，默认 5s
    resolution?: '720p' | '1080p';   // 默认 1080p
    movement_amplitude?: 'auto' | 'small' | 'medium' | 'large';
    off_peak?: boolean;              // 错峰模式，默认关闭
    watermark?: boolean;             // 是否添加水印
    wm_position?: string;            // 水印位置
    wm_url?: string;                 // 水印图片 URL
    callback_url?: string;           // 回调地址
}

// ==================== 图生视频参数 ====================
export interface ViduImg2VideoParams extends ViduCommonParams {
    images: [string];  // 必须 1 张图片 URL
}

// ==================== 首尾帧参数 ====================
export interface ViduStartEnd2VideoParams extends ViduCommonParams {
    images: [string, string];  // 必须 2 张（首帧 + 尾帧）
}

// ==================== 参考生视频参数 ====================
export interface ViduReference2VideoParams extends ViduCommonParams {
    images: string[];  // 1-7 张参考图 URL
    prompt: string;    // 提示词，最长 2000 字符
}

// ==================== 创建任务响应 ====================
export interface ViduCreateResponse {
    task_id: string;
    state: ViduTaskState;
}

// ==================== 任务查询响应 ====================
export interface ViduTaskResponse {
    id: string;
    state: ViduTaskState;
    credits?: number;            // 消耗的积分
    creations?: ViduCreation[];  // 生成的视频列表
}

export interface ViduCreation {
    id: string;
    url: string;                 // 生成视频的临时 URL
    cover_url: string;           // 封面图 URL
    watermarked_url?: string;    // 带水印的视频 URL
}

// ==================== 取消任务响应 ====================
export interface ViduCancelResponse {
    credits?: number;  // 退还的积分（若有）
}

// ==================== 积分计算 ====================
/**
 * 计算 Vidu 视频生成所需积分
 * 从 CREDITS_CONFIG 读取配置（可通过环境变量覆盖）
 */
export function calculateViduCredits(duration: number, resolution: '720p' | '1080p'): number {
    // 动态导入避免循环依赖（如果需要）
    // 这里可以直接使用，因为 credits.ts 不依赖 vidu.ts
    const { CREDITS_CONFIG } = require('@/config/credits');

    const perSecondCredits = resolution === '720p'
        ? CREDITS_CONFIG.VIDU_VIDEO_720P_PER_SECOND
        : CREDITS_CONFIG.VIDU_VIDEO_1080P_PER_SECOND;

    return duration * perSecondCredits;
}
