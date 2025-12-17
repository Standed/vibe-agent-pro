/**
 * 积分消耗配置
 * 统一管理所有 AI 操作的积分消耗
 *
 * 🔧 支持环境变量覆盖：
 * - CREDITS_GEMINI_GRID=10
 * - CREDITS_GEMINI_IMAGE=8
 * - CREDITS_SEEDREAM_GENERATE=12
 * - CREDITS_VOLCANO_VIDEO=50
 * 等等（格式：CREDITS_<操作名称>）
 */

// 默认积分配置（1 积分 = 0.1 元，向上取整）
const DEFAULT_CREDITS_CONFIG = {
  // Gemini 系列
  GEMINI_GRID: 20,           // Grid 4K（统一默认 20 积分）
  GEMINI_GRID_2X2: 20,       // 2x2 Grid 4K
  GEMINI_GRID_3X3: 20,       // 3x3 Grid 4K
  GEMINI_GRID_2X3: 20,
  GEMINI_GRID_3X2: 20,
  GEMINI_IMAGE: 10,          // 单张图片生成（2K，10 积分）
  GEMINI_TEXT: 3,            // 文本生成 (脚本/对话)
  GEMINI_ANALYZE: 3,         // 图片分析
  GEMINI_EDIT: 10,           // 图片编辑（按单图计）

  // SeeDream 系列
  SEEDREAM_GENERATE: 3,      // SeeDream 4.5 单图 ~0.25 元 -> 向上取整 3
  SEEDREAM_EDIT: 3,          // 同上

  // 火山引擎系列
  VOLCANO_GENERATE: 12,      // 可按需覆盖
  VOLCANO_VIDEO: 50,         // 视频生成

  // 其他操作
  UPLOAD_PROCESS: 1,         // 图片上传处理
  BATCH_OPERATION: 5,        // 批量操作基础费用
} as const;

/**
 * 从环境变量读取积分配置（支持覆盖默认值）
 */
function loadCreditsConfig() {
  const config = { ...DEFAULT_CREDITS_CONFIG };

  // 遍历所有配置项，检查是否有对应的环境变量
  for (const key of Object.keys(config) as Array<keyof typeof config>) {
    const envKey = `CREDITS_${key}`;
    const envValue = process.env[envKey] || process.env[`NEXT_PUBLIC_${envKey}`];

    if (envValue) {
      const numValue = parseInt(envValue, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        (config as any)[key] = numValue;
        console.log(`[Credits Config] ✅ 从环境变量覆盖: ${key} = ${numValue}`);
      } else {
        console.warn(`[Credits Config] ⚠️ 环境变量 ${envKey} 的值无效: ${envValue}`);
      }
    }
  }

  return config;
}

// 导出最终配置（支持环境变量覆盖）
export const CREDITS_CONFIG = loadCreditsConfig();

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
  GEMINI_GRID_2X2: 'Gemini 2x2 Grid 生成',
  GEMINI_GRID_3X3: 'Gemini 3x3 Grid 生成',
  GEMINI_GRID_2X3: 'Gemini 2x3 Grid 生成',
  GEMINI_GRID_3X2: 'Gemini 3x2 Grid 生成',
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
 * 可通过环境变量 VIP_DISCOUNT_RATE 或 NEXT_PUBLIC_VIP_DISCOUNT_RATE 覆盖
 */
const DEFAULT_VIP_DISCOUNT_RATE = 0.8;
export const VIP_DISCOUNT_RATE = (() => {
  const envValue = process.env.VIP_DISCOUNT_RATE || process.env.NEXT_PUBLIC_VIP_DISCOUNT_RATE;
  if (envValue) {
    const numValue = parseFloat(envValue);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
      console.log(`[Credits Config] ✅ VIP 折扣率: ${numValue}`);
      return numValue;
    }
    console.warn(`[Credits Config] ⚠️ VIP_DISCOUNT_RATE 的值无效: ${envValue}，使用默认值 ${DEFAULT_VIP_DISCOUNT_RATE}`);
  }
  return DEFAULT_VIP_DISCOUNT_RATE;
})();

/**
 * 管理员免费
 * 可通过环境变量 ADMIN_FREE 或 NEXT_PUBLIC_ADMIN_FREE 覆盖（true/false）
 */
const DEFAULT_ADMIN_FREE = true;
export const ADMIN_FREE = (() => {
  const envValue = process.env.ADMIN_FREE || process.env.NEXT_PUBLIC_ADMIN_FREE;
  if (envValue !== undefined) {
    const boolValue = envValue.toLowerCase() === 'true' || envValue === '1';
    console.log(`[Credits Config] ✅ 管理员免费: ${boolValue}`);
    return boolValue;
  }
  return DEFAULT_ADMIN_FREE;
})();

/**
 * 根据 Grid 尺寸获取积分消耗
 */
export function getGridCreditsCost(gridRows: number, gridCols: number): number {
  const key = `GEMINI_GRID_${gridRows}X${gridCols}` as keyof typeof CREDITS_CONFIG;
  return CREDITS_CONFIG[key] || CREDITS_CONFIG.GEMINI_GRID;
}

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
