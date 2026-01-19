# Supabase 认证与积分系统深度分析

## 1. 问题概述

用户反馈存在两个主要问题：
1.  **认证掉线**：用户在使用过程中突然无法访问 AI 功能，表现为 "Dropping Offline"。
2.  **积分错误**：前端显示的积分与实际不符，或提示积分不足但显示有积分。

## 2. 核心原因分析

### 2.1 认证掉线 (Dropping Offline)

**根本原因**：`supabase-session` Cookie 有效期与 Access Token 有效期不一致，且中间件缺乏过期检查。

*   **现状**：
    *   `cookie-utils.ts` 设置 `supabase-session` Cookie 的有效期为 **7天**。
    *   Supabase 的 Access Token 默认有效期为 **1小时**。
    *   `middleware.ts` 仅检查 Cookie **是否存在**，未检查 Token 是否过期。
*   **故障流程**：
    1.  用户登录，Cookie 被设置（7天有效），Token 被设置（1小时有效）。
    2.  用户 2 小时后回到页面。
    3.  `middleware.ts` 检查 Cookie 存在，**放行**请求。
    4.  前端/后端 API 调用 `authenticateRequest`，从 Cookie 读取 Token。
    5.  `supabase.auth.getUser(token)` 发现 Token 已过期，返回 401 错误。
    6.  API 请求失败，用户感知为“掉线”或功能不可用。
    7.  虽然前端 `AuthProvider` 有 `TOKEN_REFRESHED` 监听，但在页面初次加载或服务端渲染阶段，过期的 Token 会导致首屏数据获取失败。

### 2.2 积分错误 (Credit Discrepancies)

**根本原因**：前端 `AuthProvider` 的 "Fail Open" 策略导致显示虚假数据。

*   **现状**：
    *   `AuthProvider.tsx` 中 `fetchProfile` 函数包含兜底逻辑：如果 `getUserProfile` 失败（网络波动、RLS 延迟等），它会**凭空构造**一个临时 Profile。
    *   这个临时 Profile 使用 `INITIAL_CREDITS`（例如普通用户 60 分）。
*   **故障流程**：
    *   **场景 A（显示虚高）**：用户实际积分 0。由于网络原因 Profile 拉取失败。前端显示默认值 60。用户尝试生成（消耗 10），后端查库发现是 0，报错“积分不足”。用户困惑：“明明有 60 分为什么不能用？”
    *   **场景 B（显示虚低）**：用户实际积分 1000。Profile 拉取失败。前端显示默认值 60。用户困惑：“我的积分去哪了？”
*   **结论**：前端不应在数据获取失败时“猜测”用户的积分。

## 3. 解决方案

### 3.1 修复认证掉线

1.  **增强中间件检查**：
    *   在 `middleware.ts` 中引入 `isTokenExpired` 检查。
    *   如果 Token 过期，**不要放行**，而是重定向到登录页（或尝试刷新，但在 Edge 环境刷新较复杂，重定向是更稳妥的 MVP 方案）。
2.  **前端主动刷新**：
    *   `AuthProvider` 初始化时，如果发现 Token 过期，应先调用 `supabase.auth.refreshSession()` 获取新 Token，更新 Cookie 后再渲染子组件。

### 3.2 修复积分显示

1.  **移除前端虚假兜底**：
    *   删除 `AuthProvider.tsx` 中构造 `finalProfile` 的 `else` 分支。
    *   如果获取失败，`profile` 应为 `null`，UI 应显示加载状态或错误提示，而不是错误的数值。
2.  **后端自动初始化**：
    *   保留 `lib/auth-middleware.ts` 中的自动创建 Profile 逻辑（这是正确的，确保新用户有数据），但要优化错误处理，避免在数据库连接失败时尝试插入。

## 4. 实施计划

1.  **修改 `src/middleware.ts`**：增加 Token 过期校验。
2.  **修改 `src/components/auth/AuthProvider.tsx`**：
    *   移除“伪造 Profile”逻辑。
    *   优化 `initSession` 流程，确保 Token 有效性。
3.  **验证**：
    *   模拟 Token 过期场景（手动修改 Cookie），验证是否自动跳转或刷新。
    *   模拟网络断开，验证积分显示是否为 Loading/Error 状态而非默认值。
