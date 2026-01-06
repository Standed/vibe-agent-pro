import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';
import type { Database } from '@/lib/supabase/database.types';

export const maxDuration = 60;

// 延迟创建 Supabase 客户端，避免构建时报错
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin: any | null = null;

function getSupabaseAdmin(): any {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables for supabase API');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient<Database>(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return supabaseAdmin;
}

// 允许的表和操作（白名单）
const ALLOWED_TABLES = [
  'projects',
  'scenes',
  'shots',
  'characters',
  'audio_assets',
  'profiles',
  'chat_messages', // ✅ 聊天历史消息表
  'series', // ✅ 剧集表
] as const;

const ALLOWED_OPERATIONS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];
type AllowedOperation = typeof ALLOWED_OPERATIONS[number];

interface SupabaseRequest {
  table: string;
  operation: string;
  userId?: string;
  data?: any;
  filters?: {
    eq?: Record<string, any>;
    in?: Record<string, any[]>;
    neq?: Record<string, any>;
  };
  select?: string;
  order?: {
    column: string;
    ascending?: boolean;
  };
  single?: boolean;
  limit?: number;
  offset?: number;
}

// 需要校验 UUID 的字段映射
const UUID_FIELDS: Record<AllowedTable, string[]> = {
  projects: ['id', 'user_id'],
  scenes: ['id', 'project_id'],
  shots: ['id', 'scene_id'],
  characters: ['id', 'project_id'],
  audio_assets: ['id', 'project_id'],
  profiles: ['id'],
  chat_messages: ['id', 'user_id', 'project_id', 'scene_id', 'shot_id'], // ✅ 聊天消息 UUID 字段
  series: ['id', 'user_id'], // ✅ 剧集 UUID 字段
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown) =>
  typeof value === 'string' && UUID_REGEX.test(value);

const collectInvalidUuidFields = (
  table: AllowedTable,
  data: any,
  filters?: SupabaseRequest['filters'],
) => {
  const invalidFields: string[] = [];
  const uuidFields = UUID_FIELDS[table] || [];

  const checkObject = (obj: Record<string, any>) => {
    uuidFields.forEach((field) => {
      const val = obj?.[field];
      if (val === undefined || val === null || val === 'null') return;

      const values = Array.isArray(val) ? val : [val];
      // Skip validation for null values (already handled above, but being explicit for array elements)
      const nonNullValues = values.filter(v => v !== null && v !== 'null');
      if (nonNullValues.length === 0) return;

      if (!nonNullValues.every(isValidUuid)) {
        invalidFields.push(field);
      }
    });
  };

  if (data) {
    if (Array.isArray(data)) {
      data.forEach(checkObject);
    } else {
      checkObject(data);
    }
  }

  if (filters?.eq) {
    Object.entries(filters.eq).forEach(([key, value]) => {
      if (uuidFields.includes(key)) {
        if (value === null || value === 'null') return;
        const values = Array.isArray(value) ? value : [value];
        if (!values.every(v => v === null || v === 'null' || isValidUuid(v))) {
          invalidFields.push(key);
        }
      }
    });
  }

  if (filters?.neq) {
    Object.entries(filters.neq).forEach(([key, value]) => {
      if (uuidFields.includes(key)) {
        if (value === null || value === 'null') return;
        const values = Array.isArray(value) ? value : [value];
        if (!values.every(v => v === null || v === 'null' || isValidUuid(v))) {
          invalidFields.push(key);
        }
      }
    });
  }

  if (filters?.in) {
    Object.entries(filters.in).forEach(([key, value]) => {
      if (uuidFields.includes(key)) {
        const values = Array.isArray(value) ? value : [];
        if (!values.every(v => v === null || v === 'null' || isValidUuid(v))) {
          invalidFields.push(key);
        }
      }
    });
  }

  return Array.from(new Set(invalidFields));
};

// 需要强制注入/过滤 user_id 的表
const USER_ID_FIELD: Partial<Record<AllowedTable, string>> = {
  projects: 'user_id',
  chat_messages: 'user_id',
  series: 'user_id',
  profiles: 'id', // ✅ 确保用户只能查询/更新自己的 Profile
};

const injectUserIdToData = (table: AllowedTable, data: any, userId: string) => {
  const field = USER_ID_FIELD[table];
  if (!field || !data) return data;

  if (Array.isArray(data)) {
    return data.map((item) => ({
      ...item,
      [field]: userId,
    }));
  }

  return {
    ...data,
    [field]: userId,
  };
};

const ensureUserIdFilter = (
  table: AllowedTable,
  filters: SupabaseRequest['filters'],
  userId: string
) => {
  const field = USER_ID_FIELD[table];
  if (!field) return filters;

  const nextFilters = { ...(filters || {}) };
  nextFilters.eq = { ...(nextFilters.eq || {}), [field]: userId };
  return nextFilters;
};

/**
 * POST /api/supabase
 * 统一的 Supabase 操作代理
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    const body: SupabaseRequest = await request.json();
    const { table, operation, data, filters, select, order, single, limit, offset, userId: bodyUserId } = body;
    const userId = user.id;

    // 1. 验证必需参数
    if (!table || !operation) {
      return NextResponse.json(
        { error: '缺少必需参数: table, operation' },
        { status: 400 }
      );
    }

    // 身份校验：请求体携带的 userId 必须与登录用户一致
    if (bodyUserId && bodyUserId !== userId) {
      return NextResponse.json(
        { error: '用户身份不匹配，请重新登录' },
        { status: 403 }
      );
    }

    // 2. 验证表和操作是否在白名单中
    if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
      return NextResponse.json(
        { error: `不允许访问表: ${table}` },
        { status: 403 }
      );
    }

    if (!ALLOWED_OPERATIONS.includes(operation as AllowedOperation)) {
      return NextResponse.json(
        { error: `不允许的操作: ${operation}` },
        { status: 403 }
      );
    }

    // 🔒 白名单检查：非查询操作必须在白名单中
    if (operation !== 'select') {
      const whitelistCheck = checkWhitelist(user);
      if ('error' in whitelistCheck) return whitelistCheck.error;
    }

    // 校验 userId / 过滤条件中的 UUID，提前阻断 Supabase 的 22P02 错误
    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { error: 'userId 必须是有效的 UUID' },
        { status: 400 }
      );
    }

    const dataWithUserId = injectUserIdToData(table as AllowedTable, data, userId);
    const filtersWithUserId = ensureUserIdFilter(table as AllowedTable, filters, userId);

    const invalidUuidFields = collectInvalidUuidFields(
      table as AllowedTable,
      dataWithUserId,
      filtersWithUserId
    );
    if (invalidUuidFields.length > 0) {
      return NextResponse.json(
        { error: `无效的 UUID 字段: ${invalidUuidFields.join(', ')}` },
        { status: 400 }
      );
    }

    console.log('[Supabase API] 📡', operation.toUpperCase(), table, 'userId:', userId);

    // 🔍 详细日志：记录完整的请求数据（用于调试 UUID 错误）
    if (operation === 'upsert' || operation === 'insert') {
      console.log('[Supabase API] 📦 完整数据负载:', JSON.stringify(dataWithUserId, null, 2));
    }
    if (filtersWithUserId) {
      console.log('[Supabase API] 🔎 过滤条件:', JSON.stringify(filtersWithUserId, null, 2));
    }

    // 3. 构建查询
    // 使用 any 简化后续链式调用的类型约束
    let query: any = getSupabaseAdmin().from(table);

    // 4. 执行操作
    switch (operation) {
      case 'select':
        query = query.select(select || '*');

        // 应用过滤条件
        if (filtersWithUserId?.eq) {
          Object.entries(filtersWithUserId.eq).forEach(([key, value]) => {
            if (value === null || value === 'null') {
              query = (query as any).is(key, null);
            } else {
              query = (query as any).eq(key, value);
            }
          });
        }
        if (filtersWithUserId?.in) {
          Object.entries(filtersWithUserId.in).forEach(([key, value]) => {
            query = (query as any).in(key, value);
          });
        }
        if (filtersWithUserId?.neq) {
          Object.entries(filtersWithUserId.neq).forEach(([key, value]) => {
            if (value === null || value === 'null') {
              query = (query as any).not(key, 'is', null);
            } else {
              query = (query as any).neq(key, value);
            }
          });
        }

        // 应用排序
        if (order) {
          query = (query as any).order(order.column, { ascending: order.ascending ?? false });
        }

        // 单条记录
        if (single) {
          query = (query as any).single();
        } else {
          // 应用分页
          if (limit !== undefined) {
            const start = offset || 0;
            const end = start + limit - 1;
            query = (query as any).range(start, end);
          }
        }
        break;

      case 'insert':
        if (!dataWithUserId) {
          return NextResponse.json({ error: '缺少 data 参数' }, { status: 400 });
        }
        query = (query as any).insert(dataWithUserId).select();
        break;

      case 'update':
        if (!dataWithUserId) {
          return NextResponse.json({ error: '缺少 data 参数' }, { status: 400 });
        }
        query = (query as any).update(dataWithUserId);

        // 应用过滤条件（必须有过滤条件）
        if (filtersWithUserId?.eq) {
          Object.entries(filtersWithUserId.eq).forEach(([key, value]) => {
            if (value === null || value === 'null') {
              query = (query as any).is(key, null);
            } else {
              query = (query as any).eq(key, value);
            }
          });
        } else {
          return NextResponse.json(
            { error: 'update 操作必须提供 filters.eq' },
            { status: 400 }
          );
        }

        query = (query as any).select();
        break;

      case 'upsert':
        if (!dataWithUserId) {
          return NextResponse.json({ error: '缺少 data 参数' }, { status: 400 });
        }
        query = (query as any).upsert(dataWithUserId).select();
        break;

      case 'delete':
        // 必须先调用 .delete() 方法
        query = (query as any).delete();

        // 应用过滤条件（必须有过滤条件，防止误删全表）
        if (filtersWithUserId?.eq) {
          Object.entries(filtersWithUserId.eq).forEach(([key, value]) => {
            if (value === null || value === 'null') {
              query = (query as any).is(key, null);
            } else {
              query = (query as any).eq(key, value);
            }
          });
        } else {
          return NextResponse.json(
            { error: 'delete 操作必须提供 filters.eq' },
            { status: 400 }
          );
        }
        break;

      default:
        return NextResponse.json(
          { error: `未知操作: ${operation}` },
          { status: 400 }
        );
    }

    // 5. 执行查询
    const { data: result, error } = await query;

    if (error) {
      console.error('[Supabase API] ❌ 操作失败 - 完整错误信息:', JSON.stringify(error, null, 2));
      console.error('[Supabase API] ❌ 错误代码:', error.code);
      console.error('[Supabase API] ❌ 错误消息:', error.message);
      console.error('[Supabase API] ❌ 错误详情:', error.details);
      console.error('[Supabase API] ❌ 错误提示:', error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[Supabase API] ✅ 操作成功');
    return NextResponse.json({ success: true, data: result });

  } catch (err) {
    console.error('[Supabase API] ❌ 服务器错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
