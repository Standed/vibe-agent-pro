# API 架构文档

> Video Agent Pro 的 API 架构设计与实现指南

---

## 📋 架构概览

### 核心设计原则

1. **API Key 隐藏** - 所有外部 API 调用通过 Next.js API Routes 代理
2. **统一认证** - 使用 `authenticatedFetch()` 自动添加认证 header
3. **白名单拦截** - 内测期间仅限白名单用户使用 AI 功能
4. **积分系统** - 所有 AI 操作需要消耗积分，管理员免费，VIP 8 折
5. **请求可取消** - 支持 AbortController 中止进行中的请求
6. **错误重试** - 自动重试机制，处理限流和网络错误
7. **频率限制** - 基于数据库的每分钟请求计数

---

## 📡 API Routes 完整列表

### Gemini API

| Route | 功能 | 积分消耗 | 说明 |
|-------|------|---------|------|
| `/api/gemini-grid` | Grid 多视图生成 | 20 | 支持 2x2, 3x3 布局 |
| `/api/gemini-image` | 单张图片生成 | 10 | 直接生成单图 |
| `/api/gemini-text` | 文本生成 | 3 | Agent 推理使用 |
| `/api/gemini-analyze` | 图片分析 | 3 | 分析图片内容 |
| `/api/gemini-edit` | 图片编辑 | 10 | 基于原图编辑 |
| `/api/gemini-generate` | 通用生成 | 10 | 通用图片生成 |

### Volcano Engine API

| Route | 功能 | 积分消耗 | 说明 |
|-------|------|---------|------|
| `/api/seedream` | SeeDream 图片生成 | 3 | 火山引擎图片生成 |
| `/api/seedream-edit` | SeeDream 图片编辑 | 3 | 火山引擎图片编辑 |

### Sora Video API (NEW)

| Route | 方法 | 功能 | 说明 |
|-------|------|------|------|
| `/api/sora/generate` | POST | 提交视频生成任务 | 使用 RunningHub 服务 |
| `/api/sora/status` | GET | 查询任务状态 | 轮询任务进度 |
| `/api/sora/character/register` | POST | 角色注册 | 直接注册或生成+注册 |
| `/api/sora/character/status` | GET | 查询角色注册状态 | 检查 @username |
| `/api/sora/character/latest-video` | GET | 获取角色最新参考视频 | 用于预览 |

### Agent API

| Route | 方法 | 功能 | 说明 |
|-------|------|------|------|
| `/api/agent` | POST | Agent 对话 | Function Calling + 工具执行 |
| `/api/ai` | POST | AI 通用接口 | 文本生成等 |

### 即梦 API

| Route | 方法 | 功能 | 说明 |
|-------|------|------|------|
| `/api/jimeng` | POST | 即梦图片生成 | 支持 Blend 模式 |

### 其他 API

| Route | 方法 | 功能 | 说明 |
|-------|------|------|------|
| `/api/supabase` | POST | 统一 Supabase Gateway | 数据库 CRUD 操作 |
| `/api/upload-r2` | POST | 文件上传 | Cloudflare R2 存储 |
| `/api/fetch-image` | GET | 图片代理下载 | 避免 CORS 问题 |
| `/api/image-proxy` | GET | 图片代理 | 图片 URL 转发 |
| `/api/proxy-image` | GET | 代理图片 | 另一个代理端点 |
| `/api/projects` | GET/POST | 项目操作 | 项目 CRUD |
| `/api/storyboard` | POST | 分镜板生成 | AI 剧本解析 |
| `/api/error-report` | POST | 错误报告 | 用户反馈收集 |
| `/api/cron` | GET | 定时任务 | 后台任务触发 |

### Admin API

| Route | 方法 | 功能 | 说明 |
|-------|------|------|------|
| `/api/admin/users` | GET/POST | 用户管理 | 白名单、积分管理 |
| `/api/admin/sora/repair` | POST | Sora 任务修复 | 批量修复失败任务 |

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

### 2. API Route 认证中间件

**API Route 使用 `authenticateRequest()` 验证用户**：

```typescript
// 示例: src/app/api/gemini-grid/route.ts
import { authenticateRequest, checkCredits, consumeCredits, checkWhitelist } from '@/lib/auth-middleware';
import { calculateCredits } from '@/config/credits';

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error; // 返回 401 或 500 错误
  }
  const { user } = authResult;

  // 2. 检查白名单 (内测期间)
  const whitelistCheck = checkWhitelist(user);
  if ('error' in whitelistCheck) {
    return whitelistCheck.error; // 返回 403 错误
  }

  // 3. 检查积分是否足够
  const requiredCredits = calculateCredits('GEMINI_GRID', user.role);
  const creditsCheck = checkCredits(user, requiredCredits);
  if (!creditsCheck.success) {
    return creditsCheck.error; // 返回 403 错误
  }

  // 4. 执行 AI 操作
  const result = await callGeminiAPI(...);

  // 5. 消耗积分
  await consumeCredits(user.id, requiredCredits, 'generate-grid', 'Grid 生成');

  // 6. 返回结果
  return NextResponse.json({ fullImage: result });
}
```

### 3. 认证中间件函数

| 函数 | 功能 | 返回 |
|------|------|------|
| `authenticateRequest(request)` | 验证 JWT Token，获取用户信息 | `{ user }` 或 `{ error }` |
| `checkWhitelist(user)` | 检查用户是否在白名单中 | `{ success: true }` 或 `{ error }` |
| `checkCredits(user, amount)` | 检查用户积分是否足够 | `{ success: true }` 或 `{ error }` |
| `consumeCredits(userId, amount, type, desc)` | 消耗用户积分 (原子操作) | `{ success, creditsAfter }` |
| `checkRateLimit(userId, type, limit)` | 检查频率限制 | `{ success: true }` 或 `{ error }` |

---

## 💰 积分系统

### 积分配置

**所有积分配置在 `src/config/credits.ts`**：

```typescript
export const CREDITS_CONFIG = {
  // Gemini 系列
  GEMINI_GRID: 20,           // Grid 生成 (统一 20 积分)
  GEMINI_IMAGE: 10,          // 单张图片生成
  GEMINI_TEXT: 3,            // 文本生成
  GEMINI_ANALYZE: 3,         // 图片分析
  GEMINI_EDIT: 10,           // 图片编辑

  // SeeDream 系列
  SEEDREAM_GENERATE: 3,      // SeeDream 图片生成
  SEEDREAM_EDIT: 3,          // SeeDream 图片编辑

  // 火山引擎系列
  VOLCANO_VIDEO: 50,         // 视频生成
};

// VIP 用户 8 折
export const VIP_DISCOUNT_RATE = 0.8;

// 管理员免费
export const ADMIN_FREE = true;
```

### 积分计算逻辑

```typescript
// 计算实际积分消耗（考虑用户角色）
import { calculateCredits } from '@/config/credits';

const requiredCredits = calculateCredits('GEMINI_GRID', user.role);
// user.role = 'admin' → 0 积分（免费）
// user.role = 'vip' → 16 积分（20 * 0.8）
// user.role = 'user' → 20 积分（原价）
```

---

## 🚫 请求取消 (AbortController)

### 客户端取消请求

```typescript
// src/hooks/useAgent.ts
const abortControllerRef = useRef<AbortController | null>(null);

const sendMessage = useCallback(async (message: string) => {
  abortControllerRef.current = new AbortController();

  try {
    const action = await processUserCommand(
      message,
      chatHistory,
      context,
      abortControllerRef.current.signal // 传递 signal
    );
    // ... 处理结果
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      toast.info('已停止当前 AI 处理');
    }
  }
}, []);

const stop = useCallback(() => {
  abortControllerRef.current?.abort();
  setIsProcessing(false);
}, []);
```

---

## 🔄 错误重试机制

### Gemini API 重试

```typescript
// src/services/agentService.ts
async function callGeminiWithBackoff(payload: any, timeoutMs: number, signal?: AbortSignal) {
  let attempt = 0;
  const MAX_RETRIES = 3;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetchWithTimeout('/api/gemini-text', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, timeoutMs, signal);

      if (response.ok) return await response.json();

      // 处理限流 (429)
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const { retryMs } = parseRateLimitInfo(await response.text());
        await sleep(retryMs || 5000);
        attempt++;
        continue;
      }

      throw new Error(`API 错误 ${response.status}`);
    } catch (error: any) {
      if (error.name === 'AbortError') throw error; // 不重试取消的请求
      if (attempt === MAX_RETRIES) throw error;
      await sleep(2000 * (attempt + 1));
      attempt++;
    }
  }
}
```

### dataService 重试

```typescript
// src/lib/dataService.ts
private async callSupabaseAPI(request: any): Promise<any> {
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await authenticatedFetch('/api/supabase', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      
      if (!response.ok) throw new Error('API 调用失败');
      return (await response.json()).data;
    } catch (err) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      } else {
        throw err;
      }
    }
  }
}
```

---

## ⏱️ 频率限制 (Rate Limiting)

### 实现机制

使用数据库字段实现简单的每分钟计数：

```typescript
// src/lib/auth-middleware.ts
export async function checkRateLimit(
  userId: string,
  type: 'chat' | 'image',
  limit: number
): Promise<{ success: true } | { error: NextResponse }> {
  // 1. 读取用户的 last_chat_at / chat_count_in_min 字段
  // 2. 检查是否在同一分钟内
  // 3. 如果超过限制，返回 429 错误
  // 4. 否则更新计数器并放行
}
```

### 数据库字段

```sql
-- profiles 表
ALTER TABLE profiles ADD COLUMN last_chat_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN chat_count_in_min INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN last_image_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN image_count_in_min INTEGER DEFAULT 0;
```

---

## 🔧 环境变量配置

### 必需变量

```env
# Gemini API
GEMINI_TEXT_API_KEY=your_gemini_api_key
GEMINI_IMAGE_API_KEY=your_gemini_api_key
GEMINI_AGENT_API_KEY=your_gemini_api_key

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

# Cloudflare R2
R2_BUCKET_NAME=your_bucket_name
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
NEXT_PUBLIC_R2_PUBLIC_URL=https://your-domain.r2.dev

# Kaponai (Sora API)
KAPONAI_API_KEY=your_kaponai_api_key
KAPONAI_BASE_URL=https://models.kapon.cloud
```

### 可选变量

```env
# 积分系统
VIP_DISCOUNT_RATE=0.8
ADMIN_FREE=true
INITIAL_CREDITS_ADMIN=1000
INITIAL_CREDITS_VIP=500
INITIAL_CREDITS_USER=60

# 超时配置
NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS=240000
NEXT_PUBLIC_AGENT_TIMEOUT_MS=30000
NEXT_PUBLIC_AGENT_AI_TIMEOUT_MS=90000
```

---

## 🐛 常见问题

### 1. 401 Unauthorized 错误

**原因**: 未使用 `authenticatedFetch()` 或 token 过期

**解决**:
```typescript
import { authenticatedFetch } from '@/lib/api-client';
await authenticatedFetch('/api/gemini-grid', { ... });
```

### 2. 403 Forbidden 错误

**原因**: 积分不足或未开通白名单

**解决**:
- 检查用户积分余额
- 使用管理员账号测试（免费）
- 联系管理员开通白名单

### 3. 429 Too Many Requests

**原因**: 频率限制触发

**解决**:
- 等待 1 分钟后重试
- 检查 `checkRateLimit` 配置

### 4. AbortError

**原因**: 用户取消了请求

**解决**: 正常行为，捕获并显示友好提示

---

## 📚 相关文档

- **认证系统**: [AUTHENTICATION.md](./AUTHENTICATION.md)
- **积分系统**: [docs/CREDITS_SYSTEM.md](./docs/CREDITS_SYSTEM.md)
- **开发指南**: [AGENTS.md](./AGENTS.md)
- **Sora 架构**: [docs/sora 在本项目中的架构.md](./docs/sora%20在本项目中的架构.md)

---

**最后更新**: 2025-12-24
**版本**: v0.6.0
