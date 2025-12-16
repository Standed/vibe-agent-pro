# API 架构文档

> Video Agent Pro 的 API 架构设计与实现指南

---

## 📋 架构概览

### 核心设计原则

1. **API Key 隐藏** - 所有外部 API 调用通过 Next.js API Routes 代理
2. **统一认证** - 使用 `authenticatedFetch()` 自动添加认证 header
3. **积分系统** - 所有 AI 操作需要消耗积分
4. **请求可取消** - 支持 AbortController 中止进行中的请求
5. **错误重试** - 自动重试机制，处理限流和网络错误

---

## 🔐 认证流程

### 1. 客户端认证请求

**所有 API 调用必须使用 `authenticatedFetch()`**：

```typescript
// src/lib/api-client.ts
import { authenticatedFetch } from '@/lib/api-client';

// ✅ 正确方式
const response = await authenticatedFetch('/api/gemini-grid', {
  method: 'POST',
  body: JSON.stringify({ prompt, gridRows, gridCols }),
});

// ❌ 错误方式 - 缺少认证
const response = await fetch('/api/gemini-grid', { ... });
```

**工作原理**：

```typescript
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // 1. 从 cookie 读取 session（避免 supabase.auth.getSession() 挂起）
  const sessionTokens = readSessionCookie();

  if (!sessionTokens?.access_token) {
    throw new Error('未登录，请先登录');
  }

  // 2. 检查 token 是否过期
  if (isTokenExpired(sessionTokens.access_token)) {
    throw new Error('登录已过期，请重新登录');
  }

  // 3. 添加 Authorization header
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${sessionTokens.access_token}`);

  // 4. 发送请求
  return fetch(url, { ...options, headers });
}
```

### 2. API Route 认证中间件

**API Route 使用 `authenticateRequest()` 验证用户**：

```typescript
// src/app/api/gemini-grid/route.ts
import { authenticateRequest, checkCredits, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits } from '@/config/credits';

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error; // 返回 401 或 500 错误
  }

  const { user } = authResult;

  // 2. 检查积分是否足够
  const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
  const creditsCheck = checkCredits(user, requiredCredits);
  if (!creditsCheck.success) {
    return creditsCheck.error; // 返回 403 错误
  }

  // 3. 执行 AI 操作
  const result = await callGeminiAPI(...);

  // 4. 消耗积分
  await consumeCredits(user.id, requiredCredits, 'generate-grid', 'Grid 生成');

  // 5. 返回结果
  return NextResponse.json({ fullImage: result });
}
```

**工作原理**：

```typescript
// src/lib/auth-middleware.ts
export async function authenticateRequest(request: NextRequest) {
  // 1. 从 Authorization header 或 cookie 获取 token
  const token = extractToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }

  // 2. 使用 Supabase Admin 验证 token
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { error: NextResponse.json({ error: '认证失败' }, { status: 401 }) };
  }

  // 3. 获取用户 profile（包括积分和角色）
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, credits')
    .eq('id', user.id)
    .single();

  // 4. 如果 profile 不存在，自动创建
  if (!profile) {
    const userRole = getUserRoleByEmail(user.email);
    const initialCredits = getInitialCredits(userRole);

    await supabaseAdmin.from('profiles').insert({
      id: user.id,
      email: user.email,
      role: userRole,
      credits: initialCredits,
    });
  }

  // 5. 返回用户信息
  return {
    user: {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      credits: profile.credits,
    },
  };
}
```

---

## 💰 积分系统

### 积分配置

**所有积分配置在 `src/config/credits.ts`**：

```typescript
export const CREDITS_CONFIG = {
  // Gemini 系列
  GEMINI_GRID_2X2: 5,        // 2x2 Grid 生成
  GEMINI_GRID_3X3: 10,       // 3x3 Grid 生成
  GEMINI_IMAGE: 8,           // 单张图片生成
  GEMINI_TEXT: 2,            // 文本生成
  GEMINI_ANALYZE: 3,         // 图片分析
  GEMINI_EDIT: 5,            // 图片编辑

  // SeeDream 系列
  SEEDREAM_GENERATE: 12,     // SeeDream 图片生成
  SEEDREAM_EDIT: 10,         // SeeDream 图片编辑

  // 火山引擎系列
  VOLCANO_VIDEO: 50,         // 视频生成 (较贵)
};

// VIP 用户 8 折
export const VIP_DISCOUNT_RATE = 0.8;

// 管理员免费
export const ADMIN_FREE = true;
```

**支持环境变量覆盖**：

```env
# .env.local
CREDITS_GEMINI_GRID_3X3=15  # 覆盖默认的 10 积分
CREDITS_VOLCANO_VIDEO=40     # 覆盖默认的 50 积分
VIP_DISCOUNT_RATE=0.7        # VIP 7 折
ADMIN_FREE=true              # 管理员免费
```

### 积分检查与消耗

```typescript
// 1. 计算实际积分消耗（考虑用户角色）
import { calculateCredits } from '@/config/credits';

const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
// user.role = 'admin' → 0 积分（免费）
// user.role = 'vip' → 8 积分（8 折）
// user.role = 'user' → 10 积分（原价）

// 2. 检查积分是否足够
import { checkCredits } from '@/lib/auth-middleware';

const creditsCheck = checkCredits(user, requiredCredits);
if (!creditsCheck.success) {
  return creditsCheck.error; // 403: 积分不足
}

// 3. 消耗积分（原子操作，防止并发问题）
import { consumeCredits } from '@/lib/auth-middleware';

await consumeCredits(
  user.id,
  requiredCredits,
  'generate-grid',      // 操作类型
  'Gemini Grid 生成'    // 描述
);
```

**积分消耗是原子操作**：

```sql
-- supabase/schema.sql
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation_type TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_current_credits INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 1. 锁定用户行，防止并发问题
  SELECT credits INTO v_current_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- 2. 检查积分是否足够
  IF v_current_credits < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '积分不足',
      'current_credits', v_current_credits
    );
  END IF;

  -- 3. 扣除积分
  UPDATE profiles
  SET credits = credits - p_amount
  WHERE id = p_user_id;

  -- 4. 记录交易
  INSERT INTO credit_transactions (user_id, amount, operation_type, description)
  VALUES (p_user_id, -p_amount, p_operation_type, p_description)
  RETURNING id INTO v_transaction_id;

  -- 5. 返回成功
  RETURN jsonb_build_object(
    'success', true,
    'credits_after', v_current_credits - p_amount,
    'amount_consumed', p_amount,
    'transaction_id', v_transaction_id
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 🚫 请求取消 (AbortController)

### 客户端取消请求

**Agent 对话支持取消**：

```typescript
// src/hooks/useAgent.ts
const abortControllerRef = useRef<AbortController | null>(null);

const sendMessage = useCallback(async (message: string) => {
  // 创建新的 AbortController
  abortControllerRef.current = new AbortController();

  try {
    // 传递 signal 给 AI 服务
    const action = await processUserCommand(
      message,
      chatHistory,
      context,
      abortControllerRef.current.signal // ⚠️ 传递 signal
    );

    // ... 处理结果
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      toast.info('已停止当前 AI 处理');
    }
  } finally {
    abortControllerRef.current = null;
  }
}, []);

const stop = useCallback(() => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort(); // 中止请求
    abortControllerRef.current = null;
  }
  setIsProcessing(false);
}, []);
```

### API 服务支持取消

**所有 AI 服务支持 signal**：

```typescript
// src/services/agentService.ts
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal // ⚠️ 接受 signal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // 如果外部传入了 signal，监听它的 abort 事件
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal, // 传递给 fetch
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求已取消');
    }
    throw error;
  }
}
```

---

## 🔄 错误重试机制

### Gemini API 重试

**自动处理限流和网络错误**：

```typescript
// src/services/agentService.ts
async function callGeminiWithBackoff(
  payload: any,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<any> {
  let attempt = 0;
  const MAX_RETRIES = 3;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetchWithTimeout('/api/gemini-text', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, timeoutMs, signal);

      if (response.ok) {
        return await response.json();
      }

      // 处理限流 (429)
      if (response.status === 429) {
        const errorText = await response.text();
        const { retryMs, message } = parseRateLimitInfo(errorText);

        if (retryMs && attempt < MAX_RETRIES) {
          console.warn(`限流，等待 ${retryMs / 1000}秒 后重试...`);
          await sleep(retryMs);
          attempt++;
          continue;
        }
      }

      // 其他错误直接抛出
      throw new Error(`API 错误 ${response.status}`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error; // 不重试取消的请求
      }

      if (attempt === MAX_RETRIES) {
        throw error; // 最后一次尝试失败，抛出错误
      }

      // 网络错误，等待后重试
      await sleep(2000 * (attempt + 1));
      attempt++;
    }
  }

  throw new Error('请求失败');
}
```

### dataService 重试

**Supabase API 调用自动重试 3 次**：

```typescript
// src/lib/dataService.ts
private async callSupabaseAPI(request: any): Promise<any> {
  const maxRetries = 3;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await authenticatedFetch('/api/supabase', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'API 调用失败');
      }

      return result.data;
    } catch (err: any) {
      console.warn(`API 调用失败 (尝试 ${i + 1}/${maxRetries}):`, err.message);
      lastError = err;

      // 等待后重试
      if (i < maxRetries - 1) {
        const delay = 1000 * (i + 1); // 1s, 2s, 3s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

---

## 📡 API Routes 列表

### Gemini API

| Route | 功能 | 积分消耗 |
|-------|------|---------|
| `/api/gemini-grid` | Grid 多视图生成 | 5-10 |
| `/api/gemini-image` | 单张图片生成 | 8 |
| `/api/gemini-text` | 文本生成 | 2 |
| `/api/gemini-analyze` | 图片分析 | 3 |
| `/api/gemini-edit` | 图片编辑 | 5 |

### Volcano Engine API

| Route | 功能 | 积分消耗 |
|-------|------|---------|
| `/api/seedream` | SeeDream 图片生成 | 12 |
| `/api/seedream-edit` | SeeDream 图片编辑 | 10 |
| `/api/volcano-video` | 视频生成 | 50 |

### 其他 API

| Route | 功能 | 说明 |
|-------|------|------|
| `/api/supabase` | 统一 Supabase Gateway | 数据库操作 |
| `/api/upload-r2` | 文件上传 | Cloudflare R2 |
| `/api/fetch-image` | 图片代理下载 | 避免 CORS |

---

## 🔧 环境变量配置

### 必需变量

```env
# Gemini API
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Volcano Engine API
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_api_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxxx-xxxxx
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxxx-xxxxx
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxxx-xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # 仅服务端使用
```

### 可选变量（覆盖默认配置）

```env
# 积分系统
CREDITS_GEMINI_GRID_3X3=15           # 覆盖默认 10 积分
CREDITS_VOLCANO_VIDEO=40             # 覆盖默认 50 积分
VIP_DISCOUNT_RATE=0.7                # VIP 折扣率（默认 0.8）
ADMIN_FREE=true                      # 管理员免费（默认 true）

# 超时配置
NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS=300000   # Gemini 图片生成超时（默认 240s）
NEXT_PUBLIC_AGENT_TIMEOUT_MS=30000         # Agent 轻量请求超时（默认 30s）
NEXT_PUBLIC_AGENT_AI_TIMEOUT_MS=90000      # Agent AI 对话超时（默认 90s）
```

---

## 🐛 常见问题

### 1. 401 Unauthorized 错误

**原因**: 未使用 `authenticatedFetch()` 或 token 过期

**解决**:
```typescript
// ✅ 使用 authenticatedFetch
import { authenticatedFetch } from '@/lib/api-client';
await authenticatedFetch('/api/gemini-grid', { ... });
```

### 2. 403 Forbidden 错误（积分不足）

**原因**: 用户积分余额不足

**解决**:
- 检查用户积分余额
- 使用管理员账号测试（免费）
- 调整积分配置（降低消耗）

### 3. AbortError 错误

**原因**: 用户取消了请求

**解决**: 正常行为，捕获并显示友好提示

```typescript
catch (error: any) {
  if (error?.name === 'AbortError') {
    toast.info('已停止当前 AI 处理');
  }
}
```

### 4. 请求超时

**原因**: Gemini API 响应慢或网络问题

**解决**:
- 增加超时时间: `NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS=300000`
- 减小参考图片大小
- 检查网络连接

---

## 📚 相关文档

- **认证系统**: [AUTHENTICATION.md](./AUTHENTICATION.md) - 认证流程详细说明
- **积分系统**: [CREDITS_SYSTEM.md](./CREDITS_SYSTEM.md) - 积分配置和管理
- **开发指南**: [AGENTS.md](./AGENTS.md) - 快速参考
- **数据库 Schema**: [supabase/schema.sql](./supabase/schema.sql) - 完整数据库结构

---

**最后更新**: 2025-12-17
**维护者**: Claude Code + 西羊石团队
