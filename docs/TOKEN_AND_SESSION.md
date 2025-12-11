# Supabase Token 和 Session 管理说明

## Supabase Token 机制

### Access Token
- **有效期**: 1小时（3600秒）**固定，无法修改**
- **用途**: API请求认证
- **自动刷新**: 由Supabase SDK自动处理

### Refresh Token
- **有效期**: 默认无限期（或可在Supabase Dashboard设置）
- **用途**: 刷新Access Token
- **存储位置**: localStorage (或配置的storage)

## 我们的实现方案

### ✅ 已实现的优化

#### 1. 自动Token刷新 ([src/lib/supabase/client.ts](../src/lib/supabase/client.ts))
```typescript
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // ✅ 持久化session
    autoRefreshToken: true,       // ✅ 自动刷新token
    detectSessionInUrl: true,     // ✅ 检测URL中的session
    storage: getSafeStorage(),    // ✅ 安全的storage（支持fallback）
    flowType: 'pkce',            // ✅ 使用PKCE安全流程
  },
});
```

#### 2. Token刷新时不影响用户体验 ([src/components/auth/AuthProvider.tsx](../src/components/auth/AuthProvider.tsx))
```typescript
// TOKEN_REFRESHED 事件：token刷新成功，不需要重新设置loading
if (event === 'TOKEN_REFRESHED') {
  console.log('[AuthProvider] ✅ Token已刷新，更新session');
  setSession(session);
  setUser(session?.user ?? null);
  // Token刷新不需要重新加载profile，用户无感知
  return;
}
```

**关键点**：
- ✅ TOKEN_REFRESHED事件不触发loading状态
- ✅ 不重新加载用户profile
- ✅ 页面不会出现"加载中"状态

#### 3. 项目加载等待认证完成 ([src/app/project/[id]/ProjectEditorClient.tsx](../src/app/project/[id]/ProjectEditorClient.tsx))
```typescript
useEffect(() => {
  // 等待认证完成后再加载项目
  if (authLoading) {
    console.log('[ProjectEditorClient] ⏳ 等待认证完成...');
    return;
  }
  // ... 加载项目逻辑
}, [params.id, loadProjectToStore, router, user, authLoading]);
```

**关键点**：
- ✅ 使用`authLoading`确保认证状态稳定后再加载数据
- ✅ 避免token刷新时重复加载项目
- ✅ 添加错误处理和重试机制

## 实际工作流程

### 正常场景
1. **用户登录** → 获取Access Token (1小时) + Refresh Token
2. **使用期间** → 每次API请求都带上Access Token
3. **55分钟后** → Supabase SDK自动用Refresh Token刷新Access Token
4. **刷新成功** → 控制台显示 `TOKEN_REFRESHED`，用户无感知
5. **继续使用** → 新的Access Token继续有效1小时

### Token过期场景
```
用户登录 → 1小时后
  ↓
Token即将过期 (< 5分钟)
  ↓
Supabase自动刷新 (autoRefreshToken: true)
  ↓
控制台: [Supabase Client] Auth state changed: TOKEN_REFRESHED
控制台: [AuthProvider] ✅ Token已刷新，更新session
  ↓
页面正常使用，用户无感知
```

### 长期未使用场景
```
用户登录后关闭浏览器 → 第二天打开
  ↓
Refresh Token仍然有效？
  ├─ 是 → 自动刷新Access Token → 继续使用
  └─ 否 → 需要重新登录
```

## 配置Refresh Token有效期

### Supabase Dashboard配置
1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Authentication** → **Settings**
4. 找到 **Security and User Sessions**
5. 配置以下参数：

```yaml
Refresh Token Lifetime:
- 默认: 无限期 (Unlimited)
- 推荐: 2592000 秒 (30天)

Refresh Token Rotation:
- 建议: ✅ Enabled (启用)

Reuse Interval:
- 建议: 10 秒
```

## 测试验证

### 在浏览器控制台测试
```javascript
// 方法1: 使用全局注入的supabase（需要先配置）
// 在页面上执行以下代码以暴露supabase到全局
window.supabase = (await import('./lib/supabase/client')).supabase;

// 方法2: 直接在React组件中使用
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  const expiresAt = new Date(session.expires_at * 1000);
  const now = new Date();
  const hoursRemaining = (session.expires_at - Date.now() / 1000) / 3600;

  console.log('Token过期时间:', expiresAt.toLocaleString('zh-CN'));
  console.log('当前时间:', now.toLocaleString('zh-CN'));
  console.log('剩余有效时间:', hoursRemaining.toFixed(2), '小时');
}
```

### 监控Token刷新
打开浏览器控制台，你会看到：
```
[Supabase Client] Auth state changed: TOKEN_REFRESHED
[AuthProvider] 🔐 认证状态变化: TOKEN_REFRESHED
[AuthProvider] ✅ Token已刷新，更新session
```

这是**正常现象**，表示token成功刷新！

## 常见问题

### Q1: 为什么看到 TOKEN_REFRESHED 后页面一直加载？
**A**: 这是之前的bug，现在已修复：
- ✅ AuthProvider不再在TOKEN_REFRESHED时重置loading
- ✅ ProjectEditorClient等待authLoading完成后再加载数据
- ✅ 添加了错误处理和超时机制

### Q2: Access Token只有1小时，能延长吗？
**A**: **不能**。这是Supabase的设计，无法修改。但通过自动刷新机制，用户感知不到token过期。

### Q3: 用户需要多久登录一次？
**A**: 取决于Refresh Token的有效期：
- 默认配置：Refresh Token无限期 → **几乎不需要重新登录**
- 推荐配置：30天 → **每30天登录一次**
- 如果用户在有效期内活跃，会自动续期

### Q4: 如何强制用户重新登录？
**A**: 在Supabase Dashboard的SQL Editor中执行：
```sql
-- 撤销特定用户的所有session
DELETE FROM auth.sessions WHERE user_id = 'user-uuid-here';

-- 撤销所有用户的session（谨慎使用！）
TRUNCATE auth.sessions;
```

### Q5: 如何检查当前session是否有效？
**A**: 使用以下代码：
```typescript
const { data: { user }, error } = await supabase.auth.getUser();
if (error) {
  console.error('Session无效:', error);
  // 重新登录
} else {
  console.log('Session有效，用户:', user.email);
}
```

## 安全建议

### 生产环境配置
```yaml
✅ 启用 Refresh Token Rotation
✅ 设置合理的 Refresh Token Lifetime (30天)
✅ 使用 HTTPS (必须)
✅ 启用 Row Level Security (RLS)
✅ 定期审查 admin_logs
✅ 监控异常登录行为
✅ 配置 Email Rate Limits
```

### Cookie安全
我们设置的cookie有效期是7天：
```typescript
const expires = new Date();
expires.setDate(expires.getDate() + 7);
document.cookie = `supabase-auth-token=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
```

如果需要更长的cookie有效期，可以在[src/lib/supabase/client.ts](../src/lib/supabase/client.ts)中修改。

## 相关文档

- [Supabase Auth - Sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth - Server-Side Auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase Auth - Deep Dive](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-deep-dive-jwts)

## 总结

✅ **Access Token**: 1小时固定，自动刷新，用户无感知
✅ **Refresh Token**: 可配置有效期，建议30天
✅ **自动续期**: 已启用，无需手动处理
✅ **用户体验**: Token刷新不影响页面加载
✅ **安全性**: PKCE流程 + Refresh Token Rotation

现在的实现已经能够：
- 让用户登录后长期保持登录状态（取决于Refresh Token配置）
- Token刷新时不影响用户使用
- 页面不会因为token刷新而卡在"加载中"
