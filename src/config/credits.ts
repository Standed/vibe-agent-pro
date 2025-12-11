/**
 * 积分消耗配置
 * 统一管理所有 AI 操作的积分消耗
 */

export const CREDITS_CONFIG = {
  // Gemini 系列
  GEMINI_GRID: 10,           // Grid 图片生成 (2x2 或 3x3)
  GEMINI_IMAGE: 8,           // 单张图片生成
  GEMINI_TEXT: 2,            // 文本生成 (聊天、剧本等)
  GEMINI_ANALYZE: 3,         // 图片分析
  GEMINI_EDIT: 5,            // 图片编辑

  // SeeDream 系列
  SEEDREAM_GENERATE: 12,     // SeeDream 图片生成
  SEEDREAM_EDIT: 10,         // SeeDream 图片编辑

  // 火山引擎系列
  VOLCANO_GENERATE: 12,      // 火山引擎图片生成
  VOLCANO_VIDEO: 50,         // 视频生成 (较贵)

  // 其他操作
  UPLOAD_PROCESS: 1,         // 图片上传处理
  BATCH_OPERATION: 5,        // 批量操作基础费用
} as const;

/**
 * 根据操作类型获取积分消耗
 */
export function getCreditsCost(operation: keyof typeof CREDITS_CONFIG): number {
  return CREDITS_CONFIG[operation];
}

/**
 * 操作类型到描述的映射
 */
export const OPERATION_DESCRIPTIONS: Record<keyof typeof CREDITS_CONFIG, string> = {
  GEMINI_GRID: 'Gemini Grid 图片生成',
  GEMINI_IMAGE: 'Gemini 图片生成',
  GEMINI_TEXT: 'Gemini 文本生成',
  GEMINI_ANALYZE: 'Gemini 图片分析',
  GEMINI_EDIT: 'Gemini 图片编辑',
  SEEDREAM_GENERATE: 'SeeDream 图片生成',
  SEEDREAM_EDIT: 'SeeDream 图片编辑',
  VOLCANO_GENERATE: '火山引擎图片生成',
  VOLCANO_VIDEO: '视频生成',
  UPLOAD_PROCESS: '图片上传处理',
  BATCH_OPERATION: '批量操作',
};

/**
 * 获取操作描述
 */
export function getOperationDescription(operation: keyof typeof CREDITS_CONFIG): string {
  return OPERATION_DESCRIPTIONS[operation];
}

/**
 * VIP 用户折扣率 (0.8 = 8折)
 */
export const VIP_DISCOUNT_RATE = 0.8;

/**
 * 管理员免费
 */
export const ADMIN_FREE = true;

/**
 * 计算实际消耗积分（考虑用户角色）
 */
export function calculateCredits(
  operation: keyof typeof CREDITS_CONFIG,
  userRole: 'user' | 'admin' | 'vip'
): number {
  const baseCost = getCreditsCost(operation);

  // 管理员免费
  if (userRole === 'admin' && ADMIN_FREE) {
    return 0;
  }

  // VIP 用户打折
  if (userRole === 'vip') {
    return Math.ceil(baseCost * VIP_DISCOUNT_RATE);
  }

  // 普通用户原价
  return baseCost;
}
