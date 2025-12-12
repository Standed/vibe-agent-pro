# 认证架构重构方案

## 🔍 当前问题分析

### 问题1：认证逻辑分散在多个地方
1. **AuthProvider.tsx** - 监听 onAuthStateChange，设置 user/session
2. **client.ts** - 也监听 onAuthStateChange，设置 cookie
3. **login/page.tsx** - 也监听 onAuthStateChange，处理跳转
4. **auth.ts** - 设置 cookie
5. **page.tsx** - 检查 cookie，显示错误提示

### 问题2：多个监听器导致冲突
- 同一个事件（SIGNED_IN）触发多次处理
- 多个地方都在尝试设置 cookie
- 多个地方都在尝试跳转页面
- **结果**：不断刷新、循环跳转

### 问题3：状态不统一
- AuthProvider 有 user 状态
- page.tsx 检查 cookie 而不是读取 user
- 导致"有 cookie 但无 user"的错误提示

---

## ✅ 理想的架构

### 核心原则
1. **单一数据源**：只有 AuthProvider 管理认证状态
2. **单向数据流**：Supabase → AuthProvider → 其他组件
3. **职责分离**：每个模块只做一件事

### 架构图
```
                    Supabase Auth API
                           ↓
                  ┌─────────────────┐
                  │  AuthProvider   │ ← 唯一的状态管理
                  │  (Context)      │
                  └─────────────────┘
                    ↓        ↓        ↓
                 user    session   loading
                    ↓        ↓        ↓
            ┌──────────┬──────────┬──────────┐
            │ login    │ home     │ editor   │
            │ page     │ page     │ page     │
            └──────────┴──────────┴──────────┘
              (只读状态，不监听变化)
```

---

## 📋 各模块职责

### 1. AuthProvider.tsx (唯一的状态源)
**职责**：
- ✅ 初始化时从 cookie 恢复会话（setSession）
- ✅ 监听 onAuthStateChange（唯一的监听点）
- ✅ 维护 user/session/loading 状态
- ✅ 设置/清除 supabase-session cookie
- ✅ 提供 signIn/signOut 方法（包装 auth.ts）

**不做**：
- ❌ 不处理页面跳转（交给各个页面组件）

### 2. src/lib/supabase/client.ts (纯客户端)
**职责**：
- ✅ 创建 Supabase client
- ✅ 配置 auth storage

**不做**：
- ❌ 不监听 onAuthStateChange
- ❌ 不设置 cookie
- ❌ 不管理状态

### 3. src/lib/supabase/auth.ts (纯工具函数)
**职责**：
- ✅ 提供 signIn(email, password) - 调用 Supabase API
- ✅ 提供 signOut() - 调用 Supabase API
- ✅ 提供 signUp() - 调用 Supabase API

**不做**：
- ❌ 不设置 cookie（交给 AuthProvider）
- ❌ 不监听状态变化
- ❌ 不处理跳转

### 4. src/app/auth/login/page.tsx (登录UI)
**职责**：
- ✅ 提供登录表单
- ✅ 调用 AuthProvider 的 signIn 方法
- ✅ 监听 user 变化 → 跳转到目标页面

**不做**：
- ❌ 不监听 onAuthStateChange（已有 AuthProvider）
- ❌ 不设置 cookie

### 5. src/app/page.tsx (首页)
**职责**：
- ✅ 读取 AuthProvider 的 user/loading 状态
- ✅ 根据状态显示内容

**不做**：
- ❌ 不检查 cookie
- ❌ 不显示"检测到历史登录标记"错误
- ❌ 不管理认证逻辑

---

## 🔧 具体修改计划

### Step 1: 清理 client.ts
```typescript
// 移除：onAuthStateChange 监听
// 移除：cookie 设置逻辑
// 保留：client 创建
```

### Step 2: 简化 auth.ts
```typescript
// 移除：setSessionCookie 调用
// 保留：纯 API 调用（signIn, signOut, signUp）
```

### Step 3: 修复 login/page.tsx
```typescript
// 移除：onAuthStateChange 监听
// 改为：useEffect(() => { if (user) router.push(redirectTo) }, [user])
```

### Step 4: 简化 page.tsx
```typescript
// 移除：hasAuthCookie 状态
// 移除：cookie 检查逻辑
// 移除：错误提示
// 只保留：根据 user 显示内容
```

### Step 5: 确保 AuthProvider 完整
```typescript
// 确认：onAuthStateChange 监听存在
// 确认：setSessionCookie 在状态变化时调用
// 确认：提供完整的 Context API
```

---

## ✅ 预期效果

### 登录流程
```
1. 用户在 login page 输入账号密码
2. 调用 AuthProvider.signIn()
3. AuthProvider 调用 auth.signIn()
4. Supabase 返回 session
5. onAuthStateChange 触发 (只在 AuthProvider 中)
6. AuthProvider 设置 user + cookie
7. login page 检测到 user 变化 → 跳转
8. home page 读取 user → 显示内容
```

### 刷新页面流程
```
1. AuthProvider 初始化
2. 从 cookie 读取 tokens
3. 调用 setSession 恢复会话
4. 设置 user 状态
5. loading = false
6. 页面显示内容
```

---

## 🚀 开始实施

按顺序执行：
1. ✅ 清理 client.ts
2. ✅ 简化 auth.ts
3. ✅ 修复 login/page.tsx
4. ✅ 简化 page.tsx
5. ✅ 测试完整流程
