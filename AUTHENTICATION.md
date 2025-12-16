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
- ✅ **Session 持久化** - Cookie 存储，自动刷新
- ✅ **Token 验证** - API Route 级别的身份验证

---

## 🔐 认证流程

### 1. 用户注册

**前端注册流程**：

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

  // ⚠️ 注册成功后，Supabase 会发送验证邮件
  toast.success('注册成功！请查收验证邮件');
  router.push('/auth/login');
}
```

**自动 Profile 创建**：

```typescript
// src/lib/auth-middleware.ts
export async function authenticateRequest(request: NextRequest) {
  // ... 验证 token

  // 获取用户 profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, credits')
    .eq('id', user.id)
    .single();

  // ⭐ 如果 profile 不存在，自动创建
  if (profileError || !profile) {
    console.log('[Auth Middleware] Profile 不存在，正在自动创建...', user.id);

    // 根据邮箱判断用户角色
    const userEmail = user.email || '';
    const userRole = getUserRoleByEmail(userEmail); // admin / vip / user
    const initialCredits = getInitialCredits(userRole); // 根据角色分配初始积分

    const { data: newProfile } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: userEmail,
        role: userRole,
        credits: initialCredits,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      })
      .select()
      .single();

    return { user: newProfile };
  }

  return { user: profile };
}
```

### 2. 用户登录

**前端登录流程**：

```typescript
// src/app/auth/login/page.tsx
import { supabase } from '@/lib/supabase/client';

async function handleLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    toast.error('登录失败: ' + error.message);
    return;
  }

  // ⭐ 登录成功，session 自动存储到 cookie
  toast.success('登录成功！');
  router.push('/'); // 跳转到首页
}
```

**AuthProvider 管理会话**：

```typescript
// src/components/auth/AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: () => boolean;
  signOut: () => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. 获取当前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAuthenticated = () => !!user;

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### 3. Session 持久化

**Cookie 存储机制**：

```typescript
// src/lib/supabase/auth.ts
const SESSION_COOKIE_NAME = 'supabase-session';

// 读取 session cookie
export function readSessionCookie(): SessionTokens | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const sessionCookie = cookies.find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) return null;

  try {
    const raw = decodeURIComponent(sessionCookie.split('=')[1]);
    const parsed = JSON.parse(raw);
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    };
  } catch (err) {
    console.error('解析 session cookie 失败:', err);
    return null;
  }
}

// 保存 session 到 cookie
export function saveSessionToCookie(session: SessionTokens) {
  const cookieValue = encodeURIComponent(JSON.stringify(session));
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 天

  document.cookie = `${SESSION_COOKIE_NAME}=${cookieValue}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

// 清除 session cookie
export function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
```

---

## 🛡️ API Route 认证

### authenticatedFetch() - 客户端

**自动添加认证 header**：

```typescript
// src/lib/api-client.ts
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // 1. 从 cookie 读取 session
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

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // 4. 发送请求
  return fetch(url, { ...options, headers });
}
```

**使用示例**：

```typescript
// ✅ 所有 API 调用都应使用 authenticatedFetch
import { authenticatedFetch } from '@/lib/api-client';

// Grid 生成
const response = await authenticatedFetch('/api/gemini-grid', {
  method: 'POST',
  body: JSON.stringify({ prompt, gridRows, gridCols }),
});

// 数据库操作
const response = await authenticatedFetch('/api/supabase', {
  method: 'POST',
  body: JSON.stringify({
    table: 'projects',
    operation: 'select',
    filters: { eq: { user_id: user.id } },
  }),
});
```

### authenticateRequest() - 服务端

**API Route 中的用户验证**：

```typescript
// src/lib/auth-middleware.ts
export async function authenticateRequest(request: NextRequest) {
  try {
    // 1. 从 Authorization header 或 cookie 获取 token
    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : null;
    const tokenFromCookie = readAccessTokenFromCookies(request);
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return {
        error: NextResponse.json({ error: '未登录' }, { status: 401 }),
      };
    }

    // 2. 验证 token（使用 Service Role Key）
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return {
        error: NextResponse.json({ error: '认证失败' }, { status: 401 }),
      };
    }

    // 3. 获取用户 profile（包括积分和角色）
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, credits')
      .eq('id', user.id)
      .single();

    // 4. 如果 profile 不存在，自动创建
    if (!profile) {
      // ... 创建 profile 逻辑（见上文）
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
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    return {
      error: NextResponse.json({ error: '服务器错误' }, { status: 500 }),
    };
  }
}
```

**API Route 使用示例**：

```typescript
// src/app/api/gemini-grid/route.ts
import { authenticateRequest, checkCredits, consumeCredits } from '@/lib/auth-middleware';

export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) {
    return authResult.error; // 401 或 500 错误
  }

  const { user } = authResult;

  // 2. 检查积分
  const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
  const creditsCheck = checkCredits(user, requiredCredits);
  if (!creditsCheck.success) {
    return creditsCheck.error; // 403 错误
  }

  // 3. 执行操作
  const result = await generateGrid(...);

  // 4. 消耗积分
  await consumeCredits(user.id, requiredCredits, 'generate-grid');

  // 5. 返回结果
  return NextResponse.json(result);
}
```

---

## 👥 角色权限系统

### 角色定义

```typescript
export type UserRole = 'admin' | 'vip' | 'user';

// 角色权限
- admin: 管理员，所有功能免费使用（ADMIN_FREE = true）
- vip: VIP 用户，所有功能 8 折（VIP_DISCOUNT_RATE = 0.8）
- user: 普通用户，所有功能原价
```

### 角色判断

**根据邮箱自动分配角色**：

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

export function getUserRoleByEmail(email: string): UserRole {
  const lowerEmail = email.toLowerCase();

  if (ADMIN_EMAILS.includes(lowerEmail)) {
    return 'admin';
  }

  if (VIP_EMAILS.includes(lowerEmail)) {
    return 'vip';
  }

  return 'user';
}

// 根据角色分配初始积分
export function getInitialCredits(role: UserRole): number {
  switch (role) {
    case 'admin':
      return 999999; // 管理员大量积分（但实际免费）
    case 'vip':
      return 500;    // VIP 初始 500 积分
    case 'user':
      return 100;    // 普通用户初始 100 积分
  }
}
```

### 权限检查

```typescript
// 计算实际积分消耗（考虑角色）
import { calculateCredits } from '@/config/credits';

const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);

// user.role = 'admin' → 0 积分（免费）
// user.role = 'vip' → 8 积分（10 * 0.8 = 8）
// user.role = 'user' → 10 积分（原价）
```

---

## 🔄 Token 刷新机制

**Supabase 自动刷新 token**：

```typescript
// supabase 客户端配置
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,  // ✅ 自动刷新 token
    persistSession: true,    // ✅ 持久化 session
    detectSessionInUrl: true, // ✅ 从 URL 检测 session（OAuth 回调）
  },
});
```

**手动刷新 token**（如果需要）：

```typescript
const { data, error } = await supabase.auth.refreshSession();

if (error) {
  console.error('刷新 token 失败:', error);
  // 重新登录
  router.push('/auth/login');
}

// 更新 cookie
saveSessionToCookie({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
});
```

---

## 🚪 登出流程

```typescript
// src/components/auth/AuthProvider.tsx
const signOut = async () => {
  // 1. 调用 Supabase 登出
  await supabase.auth.signOut();

  // 2. 清除本地 state
  setUser(null);

  // 3. 清除 cookie
  clearSessionCookie();

  // 4. 跳转到登录页
  router.push('/auth/login');
};
```

---

## 🔧 环境变量配置

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ⚠️ 仅服务端使用（不要加 NEXT_PUBLIC_ 前缀）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 🐛 常见问题

### 1. 登录后显示"未登录"

**原因**: Cookie 未正确保存或 `authenticatedFetch` 未读取到 session

**解决**:
- 检查浏览器是否允许第三方 cookie
- 清除浏览器缓存和 cookie
- 检查 `readSessionCookie()` 是否正确解析

### 2. Token 过期错误

**原因**: Token 有效期到期（默认 1 小时）

**解决**:
- 启用自动刷新: `autoRefreshToken: true`
- 手动刷新 token: `supabase.auth.refreshSession()`

### 3. 401 Unauthorized 错误

**原因**: 未使用 `authenticatedFetch()` 或 token 无效

**解决**:
- 检查是否使用了 `authenticatedFetch()`
- 检查 Authorization header 是否正确
- 重新登录获取新 token

### 4. Profile 自动创建失败

**原因**: 数据库权限不足或 RLS 策略限制

**解决**:
- 检查 Supabase Service Role Key 是否正确
- 检查 profiles 表的 RLS 策略
- 查看服务端日志获取详细错误

---

## 📚 相关文档

- **API 架构**: [API_ARCHITECTURE.md](./API_ARCHITECTURE.md) - API 认证流程
- **积分系统**: [CREDITS_SYSTEM.md](./CREDITS_SYSTEM.md) - 积分与角色关系
- **数据库 Schema**: [supabase/schema.sql](./supabase/schema.sql) - profiles 表结构

---

**最后更新**: 2025-12-17
**维护者**: Claude Code + 西羊石团队
