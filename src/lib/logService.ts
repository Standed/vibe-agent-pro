/**
 * 日志服务
 *
 * 支持多种日志存储方式：
 * 1. Supabase 数据库表（应用日志、用户行为）
 * 2. Console（开发环境）
 * 3. Sentry（错误追踪，可选）
 */

import { supabase } from './supabase/client';
import { getCurrentUser } from './supabase/auth';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogCategory =
  | 'auth' // 认证相关
  | 'credits' // 积分操作
  | 'ai_generation' // AI 生成
  | 'file_upload' // 文件上传
  | 'project' // 项目操作
  | 'system'; // 系统事件

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  userId?: string;
  timestamp: Date;
}

class LogService {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * 记录日志
   */
  async log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: any
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category,
      message,
      data,
      timestamp: new Date(),
    };

    // 获取当前用户（如果已登录）
    try {
      const user = await getCurrentUser();
      if (user) {
        entry.userId = user.id;
      }
    } catch (error) {
      // 忽略获取用户错误
    }

    // 1. 开发环境：输出到控制台
    if (this.isDevelopment) {
      this.logToConsole(entry);
    }

    // 2. 重要日志：存储到 Supabase
    if (this.shouldPersist(level, category)) {
      await this.logToDatabase(entry);
    }

    // 3. 错误日志：发送到 Sentry（如果配置）
    if (level === 'error' && this.isSentryEnabled()) {
      this.logToSentry(entry);
    }
  }

  /**
   * 判断是否需要持久化存储
   * （只存储重要日志，避免数据库膨胀）
   */
  private shouldPersist(level: LogLevel, category: LogCategory): boolean {
    // 总是存储错误
    if (level === 'error') return true;

    // 存储关键业务操作
    const criticalCategories: LogCategory[] = [
      'auth',
      'credits',
      'ai_generation',
    ];
    return criticalCategories.includes(category);
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.category}]`;
    const timestamp = entry.timestamp.toISOString();

    switch (entry.level) {
      case 'error':
        console.error(timestamp, prefix, entry.message, entry.data);
        break;
      case 'warn':
        console.warn(timestamp, prefix, entry.message, entry.data);
        break;
      case 'debug':
        console.debug(timestamp, prefix, entry.message, entry.data);
        break;
      default:
        console.log(timestamp, prefix, entry.message, entry.data);
    }
  }

  /**
   * 存储到 Supabase 数据库
   * 注意：需要先创建 logs 表
   */
  private async logToDatabase(entry: LogEntry): Promise<void> {
    try {
      // 只在生产环境存储
      if (this.isDevelopment) return;

      await (supabase as any).from('application_logs').insert({
        level: entry.level,
        category: entry.category,
        message: entry.message,
        data: entry.data || {},
        user_id: entry.userId || null,
        created_at: entry.timestamp.toISOString(),
      });
    } catch (error) {
      // 日志存储失败不应该影响主流程
      console.error('Failed to log to database:', error);
    }
  }

  /**
   * 发送到 Sentry（错误追踪）
   */
  private logToSentry(entry: LogEntry): void {
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(entry.message), {
        level: entry.level,
        extra: {
          category: entry.category,
          data: entry.data,
          userId: entry.userId,
        },
      });
    }
  }

  /**
   * 检查 Sentry 是否启用
   */
  private isSentryEnabled(): boolean {
    return !!process.env.NEXT_PUBLIC_SENTRY_DSN;
  }

  // ===== 快捷方法 =====

  info(category: LogCategory, message: string, data?: any) {
    return this.log('info', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: any) {
    return this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: any) {
    return this.log('error', category, message, data);
  }

  debug(category: LogCategory, message: string, data?: any) {
    return this.log('debug', category, message, data);
  }

  // ===== 业务日志快捷方法 =====

  /**
   * 记录 AI 生成操作
   */
  async logAIGeneration(operation: string, credits: number, success: boolean, data?: any) {
    await this.log(
      success ? 'info' : 'error',
      'ai_generation',
      `AI ${operation} - ${success ? '成功' : '失败'}`,
      { operation, credits, success, ...data }
    );
  }

  /**
   * 记录积分操作
   */
  async logCreditsOperation(
    type: 'consume' | 'grant' | 'refund',
    amount: number,
    balance: number,
    data?: any
  ) {
    await this.log('info', 'credits', `积分${type === 'consume' ? '消费' : type === 'grant' ? '充值' : '退款'}: ${amount}`, {
      type,
      amount,
      balance,
      ...data,
    });
  }

  /**
   * 记录文件上传
   */
  async logFileUpload(fileType: string, size: number, storage: 'r2' | 'supabase' | 'local', success: boolean) {
    await this.log(
      success ? 'info' : 'error',
      'file_upload',
      `文件上传到 ${storage} - ${success ? '成功' : '失败'}`,
      { fileType, size, storage, success }
    );
  }

  /**
   * 记录认证事件
   */
  async logAuth(event: 'login' | 'logout' | 'register', email?: string) {
    await this.log('info', 'auth', `用户${event === 'login' ? '登录' : event === 'logout' ? '登出' : '注册'}`, {
      event,
      email,
    });
  }
}

export const logger = new LogService();
