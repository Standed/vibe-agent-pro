# 认证系统文档

> Video Agent Pro 的用户认证与权限管理系统

---

## 📋 系统概览

Video Agent Pro 使用 **Supabase Auth** 作为认证后端，实现了完整的用户认证和权限管理系统。

### 核心特性

- ✅ **Email + Password 认证** - 传统邮箱密码登录
- ✅ **OAuth 第三方登录** - 支持 GitHub, Google 等（待配置）
- ✅ **自动 Profile 创建** - 首次登录自动创建用户档案
- ✅ **角色权限系统** - admin / vip / user 三级权限
- ✅ **积分系统集成** - 不同角色不同积分策略
- ✅ **白名单机制** - 内测期间控制 AI 功能访问
- ✅ **频率限制** - 每分钟请求计数
- ✅ **Session 持久化** - Cookie 存储，自动刷新
- ✅ **Token 验证** - API Route 级别的身份验证

---

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ AuthProvider │───▶│ supabase.auth│───▶│ Cookie (session)     │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│         │                                          │                │
│         ▼                                          ▼                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              authenticatedFetch('/api/xxx')                  │  │
│  │              Authorization: Bearer <access_token>            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Routes                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   authenticateRequest()                       │  │
│  │  1. 从 Header/Cookie 提取 Token                              │  │
│  │  2. 使用 Supabase Admin 验证 Token                           │  │
│  │  3. 获取/创建 Profile                                         │  │
│  │  4. 返回 AuthenticatedUser                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         ▼                    ▼                    ▼                │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐           │
│  │checkWhitelist│    │checkCredits│      │checkRateLimit│         │
│  └────────────┘      └────────────┘      └────────────┘           │
│                              │                                      │
│                              ▼                                      │
│                    ┌────────────────┐                              │
│                    │ consumeCredits │                              │
│                    └────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 认证流程

### 1. 用户注册

```typescript
// src/app/auth/register/page.tsx
import { supabase } from '@/lib/supabase/client';

async function handleRegister(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    toast.error('注册失败: ' + error.message);
    return;
  }

  // Supabase 会发送验证邮件
  toast.success('注册成功！请查收验证邮件');
  router.push('/auth/login');
}
```

### 2. 用户登录

```typescript
// src/app/auth/login/page.tsx
async function handleLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    toast.error('登录失败: ' + error.message);
    return;
  }

  // 登录成功，session 自动存储到 cookie
  toast.success('登录成功！');
  router.push('/');
}
```

### 3. 自动 Profile 创建

首次登录时，`authenticateRequest()` 会自动创建用户 Profile：

```typescript
// src/lib/auth-middleware.ts (简化版)
export async function authenticateRequest(request: NextRequest) {
  // 1. 从 Header 或 Cookie 获取 Token
  const token = extractToken(request);
  if (!token) return { error: 401 };

  // 2. 验证 Token
  const { user } = await supabaseAdmin.auth.getUser(token);
  if (!user) return { error: 401 };

  // 3. 获取 Profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // 4. 如果 Profile 不存在，自动创建
  if (!profile) {
    const userRole = getUserRoleByEmail(user.email);
    const initialCredits = getInitialCredits(userRole);

    const { data: newProfile } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        role: userRole,
        credits: initialCredits,
        is_whitelisted: userRole === 'admin',
      })
      .select()
      .single();

    return { user: newProfile };
  }

  // 5. 提权逻辑：硬编码管理员邮箱
  const isAdminEmail = getUserRoleByEmail(user.email) === 'admin';
  const effectiveRole = isAdminEmail ? 'admin' : profile.role;

  return {
    user: {
      id: profile.id,
      email: profile.email,
      role: effectiveRole,
      credits: profile.credits,
      isWhitelisted: profile.is_whitelisted || effectiveRole === 'admin',
    },
  };
}
```

---

## 👥 角色权限系统

### 角色定义

| 角色 | 积分策略 | 白名单 | 初始积分 |
|------|----------|--------|----------|
| `admin` | 免费 (0 积分) | 自动开通 | 1000 |
| `vip` | 8 折 | 需开通 | 500 |
| `user` | 原价 | 需开通 | 60 |

### 角色判断逻辑

```typescript
// src/config/users.ts
const ADMIN_EMAILS = [
  'admin@example.com',
  'owner@example.com',
];

const VIP_EMAILS = [
  'vip1@example.com',
  'vip2@example.com',
];

export function getUserRoleByEmail(email: string): 'admin' | 'vip' | 'user' {
  const lowerEmail = email.toLowerCase();

  if (ADMIN_EMAILS.includes(lowerEmail)) return 'admin';
  if (VIP_EMAILS.includes(lowerEmail)) return 'vip';
  return 'user';
}

export function getInitialCredits(role: 'admin' | 'vip' | 'user'): number {
  switch (role) {
    case 'admin': return 1000;
    case 'vip': return 500;
    case 'user': return 60;
  }
}
```

### 提权逻辑

即使数据库中的 `role` 字段不是 `admin`，只要邮箱在 `ADMIN_EMAILS` 列表中，就会被提权为管理员：

```typescript
// auth-middleware.ts
const isAdminEmail = getUserRoleByEmail(user.email) === 'admin';
const effectiveRole = isAdminEmail ? 'admin' : profile.role;
```

---

## 🛡️ 认证中间件详解

### AuthenticatedUser 接口

```typescript
export interface AuthenticatedUser {
  id: string;           // Supabase User ID
  email: string;        // 用户邮箱
  role: 'user' | 'admin' | 'vip';  // 有效角色
  credits: number;      // 当前积分
  isWhitelisted: boolean;  // 是否在白名单中
}
```

### 中间件函数

#### authenticateRequest()

验证用户身份，返回用户信息或错误：

```typescript
const authResult = await authenticateRequest(request);
if ('error' in authResult) {
  return authResult.error; // NextResponse with 401 or 500
}
const { user } = authResult;
```

#### checkWhitelist()

检查用户是否在白名单中（内测期间必须）：

```typescript
const whitelistCheck = checkWhitelist(user);
if ('error' in whitelistCheck) {
  return whitelistCheck.error; // 403: 未获得内测权限
}
```

#### checkCredits()

检查用户积分是否足够：

```typescript
const creditsCheck = checkCredits(user, requiredCredits);
if (!creditsCheck.success) {
  return creditsCheck.error; // 403: 积分不足
}
```

#### consumeCredits()

消耗用户积分（原子操作）：

```typescript
const result = await consumeCredits(
  user.id,
  requiredCredits,
  'generate-grid',  // 操作类型
  'Grid 生成'       // 描述
);

if (!result.success) {
  console.error('积分消耗失败:', result.error);
}
```

#### checkRateLimit()

检查频率限制：

```typescript
const rateLimit = await checkRateLimit(user.id, 'chat', 30); // 每分钟 30 次
if ('error' in rateLimit) {
  return rateLimit.error; // 429: 请求过于频繁
}
```

---

## 🍪 Session 管理

### Cookie 存储

```typescript
// src/lib/supabase/auth.ts
const SESSION_COOKIE_NAME = 'supabase-session';

// 读取 session cookie
export function readSessionCookie(): { access_token: string; refresh_token: string } | null {
  const cookies = document.cookie.split(';');
  const sessionCookie = cookies.find(c => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
  
  if (!sessionCookie) return null;
  
  try {
    const raw = decodeURIComponent(sessionCookie.split('=')[1]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 保存 session 到 cookie (7 天有效)
export function saveSessionToCookie(session: { access_token: string; refresh_token: string }) {
  const cookieValue = encodeURIComponent(JSON.stringify(session));
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  document.cookie = `${SESSION_COOKIE_NAME}=${cookieValue}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

// 清除 session cookie
export function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
```

### AuthProvider 组件

```typescript
// src/components/auth/AuthProvider.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取当前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSessionCookie();
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

## 🔄 Token 刷新

### 自动刷新配置

```typescript
// src/lib/supabase/client.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,   // 自动刷新 token
    persistSession: true,     // 持久化 session
    detectSessionInUrl: true, // 从 URL 检测 session（OAuth 回调）
  },
});
```

### 手动刷新

```typescript
const { data, error } = await supabase.auth.refreshSession();

if (error) {
  console.error('刷新 token 失败:', error);
  router.push('/auth/login');
  return;
}

saveSessionToCookie({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
});
```

---

## 🔧 环境变量

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ⚠️ 仅服务端使用（不要加 NEXT_PUBLIC_ 前缀）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 📊 数据库表结构

### profiles 表

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'vip')),
  credits INTEGER DEFAULT 60,
  is_whitelisted BOOLEAN DEFAULT FALSE,
  
  -- 频率限制字段
  last_chat_at TIMESTAMPTZ,
  chat_count_in_min INTEGER DEFAULT 0,
  last_image_at TIMESTAMPTZ,
  image_count_in_min INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### credit_transactions 表

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🐛 常见问题

### 1. 登录后显示"未登录"

**原因**: Cookie 未正确保存

**解决**:
- 检查浏览器是否允许第三方 cookie
- 清除浏览器缓存和 cookie
- 检查 `readSessionCookie()` 日志

### 2. Token 过期错误

**原因**: Token 有效期到期（默认 1 小时）

**解决**:
- 确保 `autoRefreshToken: true`
- 手动调用 `supabase.auth.refreshSession()`

### 3. Profile 自动创建失败

**原因**: `SUPABASE_SERVICE_ROLE_KEY` 未配置或 RLS 策略限制

**解决**:
- 检查环境变量是否正确
- 检查 profiles 表的 RLS 策略

### 4. 白名单检查失败

**原因**: 用户 `is_whitelisted` 为 false

**解决**:
- 管理员在后台开通白名单
- 或将用户邮箱添加到 `ADMIN_EMAILS` / `VIP_EMAILS`

---

## 📚 相关文档

- **API 架构**: [API_ARCHITECTURE.md](./API_ARCHITECTURE.md)
- **积分系统**: [docs/CREDITS_SYSTEM.md](./docs/CREDITS_SYSTEM.md)
- **开发指南**: [AGENTS.md](./AGENTS.md)

---

**最后更新**: 2025-12-24
**版本**: v0.6.0
