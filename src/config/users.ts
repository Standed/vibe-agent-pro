/**
 * 用户角色和积分配置
 *
 * 🔧 支持环境变量覆盖：
 * - INITIAL_CREDITS_ADMIN=1000
 * - INITIAL_CREDITS_VIP=500
 * - INITIAL_CREDITS_USER=60
 * - ADMIN_EMAILS=admin1@example.com,admin2@example.com
 * - VIP_EMAILS=vip1@example.com,vip2@example.com
 */

/**
 * 管理员邮箱列表
 * 在这里添加管理员账号的邮箱
 * 可通过环境变量 ADMIN_EMAILS 或 NEXT_PUBLIC_ADMIN_EMAILS 覆盖（逗号分隔）
 */
const DEFAULT_ADMIN_EMAILS = [
  // 主管理员
  'derushin5002@gmail.com',
  // 可以添加更多管理员邮箱
  // 'admin@xysai.ai',
];

export const ADMIN_EMAILS = (() => {
  const envValue = process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (envValue) {
    const emails = envValue.split(',').map(e => e.trim()).filter(e => e);
    if (emails.length > 0) {
      console.log(`[User Config] ✅ 管理员邮箱列表 (来自环境变量): ${emails.length} 个`);
      return emails;
    }
  }
  return DEFAULT_ADMIN_EMAILS;
})();

/**
 * VIP 用户邮箱列表（可选）
 * 可通过环境变量 VIP_EMAILS 或 NEXT_PUBLIC_VIP_EMAILS 覆盖（逗号分隔）
 */
const DEFAULT_VIP_EMAILS: string[] = [
  // 示例：'vip@example.com',
];

export const VIP_EMAILS: string[] = (() => {
  const envValue = process.env.VIP_EMAILS || process.env.NEXT_PUBLIC_VIP_EMAILS;
  if (envValue) {
    const emails = envValue.split(',').map(e => e.trim()).filter(e => e);
    if (emails.length > 0) {
      console.log(`[User Config] ✅ VIP 邮箱列表 (来自环境变量): ${emails.length} 个`);
      return emails;
    }
  }
  return DEFAULT_VIP_EMAILS;
})();

/**
 * 不同角色的初始积分
 * 可通过环境变量覆盖：
 * - INITIAL_CREDITS_ADMIN 或 NEXT_PUBLIC_INITIAL_CREDITS_ADMIN
 * - INITIAL_CREDITS_VIP 或 NEXT_PUBLIC_INITIAL_CREDITS_VIP
 * - INITIAL_CREDITS_USER 或 NEXT_PUBLIC_INITIAL_CREDITS_USER
 */
const DEFAULT_INITIAL_CREDITS = {
  admin: 1000,  // 管理员初始 1000 积分
  vip: 500,     // VIP 用户初始 500 积分
  user: 0,      // 普通用户初始 0 积分
} as const;

export const INITIAL_CREDITS = {
  admin: (() => {
    const envValue = process.env.INITIAL_CREDITS_ADMIN || process.env.NEXT_PUBLIC_INITIAL_CREDITS_ADMIN;
    if (envValue) {
      const numValue = parseInt(envValue, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        console.log(`[User Config] ✅ 管理员初始积分: ${numValue}`);
        return numValue;
      }
    }
    return DEFAULT_INITIAL_CREDITS.admin;
  })(),
  vip: (() => {
    const envValue = process.env.INITIAL_CREDITS_VIP || process.env.NEXT_PUBLIC_INITIAL_CREDITS_VIP;
    if (envValue) {
      const numValue = parseInt(envValue, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        console.log(`[User Config] ✅ VIP 初始积分: ${numValue}`);
        return numValue;
      }
    }
    return DEFAULT_INITIAL_CREDITS.vip;
  })(),
  user: (() => {
    const envValue = process.env.INITIAL_CREDITS_USER || process.env.NEXT_PUBLIC_INITIAL_CREDITS_USER;
    if (envValue) {
      const numValue = parseInt(envValue, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        console.log(`[User Config] ✅ 普通用户初始积分: ${numValue}`);
        return numValue;
      }
    }
    return DEFAULT_INITIAL_CREDITS.user;
  })(),
} as const;

/**
 * 根据邮箱判断用户角色
 */
export function getUserRoleByEmail(email: string): 'admin' | 'vip' | 'user' {
  const normalizedEmail = email.toLowerCase().trim();

  if (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(normalizedEmail)) {
    return 'admin';
  }

  if (VIP_EMAILS.map(e => e.toLowerCase()).includes(normalizedEmail)) {
    return 'vip';
  }

  return 'user';
}

/**
 * 根据角色获取初始积分
 */
export function getInitialCredits(role: 'admin' | 'vip' | 'user'): number {
  return INITIAL_CREDITS[role];
}
