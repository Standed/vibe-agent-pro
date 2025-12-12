# SaaS 版本部署指南

## 📋 总览

本指南将帮助你将 Video Agent Pro 部署为 SaaS 服务，使用以下技术栈：
- **数据库**: Supabase (PostgreSQL)
- **部署**: Vercel (前端 + API Routes)
- **CDN/域名**: Cloudflare (可选)
- **存储**: Supabase Storage

## 🚀 部署步骤

### 阶段 1: Supabase 配置

#### 1.1 创建项目

1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 创建新项目（参考 `SUPABASE_SETUP.md`）
3. 执行 `supabase/schema.sql` 创建数据库表
4. 创建 Storage buckets（media, avatars, audio）
5. 配置触发器和RLS策略

#### 1.2 获取凭证

在 Supabase Dashboard -> Settings -> API 中获取：
- Project URL
- `anon` public key
- `service_role` secret key（保密！）

#### 1.3 创建管理员账号

```sql
-- 1. 在 Authentication -> Users 中创建账号
-- 2. 然后执行：
UPDATE public.profiles
SET role = 'admin', credits = 100000
WHERE email = 'your-admin@email.com';
```

### 阶段 2: Vercel 部署

#### 2.1 推送代码到 GitHub

```bash
# 提交当前更改
git add .
git commit -m "Add SaaS implementation with Supabase integration"

# 推送到 GitHub
git push origin saas-supabase-implementation
```

#### 2.2 在 Vercel 中导入项目

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "New Project"
3. 导入你的 GitHub 仓库
4. 选择 `saas-supabase-implementation` 分支
5. 配置环境变量（见下方）

#### 2.3 配置环境变量

在 Vercel 项目设置 -> Environment Variables 中添加：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...（公开密钥）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...（服务端密钥，保密！）

# Gemini API
NEXT_PUBLIC_GEMINI_API_KEY=AIza...

# Volcano Engine API
NEXT_PUBLIC_VOLCANO_API_KEY=your_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxx
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxx
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxx
```

⚠️ **重要**: 确保不要将 `SUPABASE_SERVICE_ROLE_KEY` 添加到 `NEXT_PUBLIC_` 前缀！

#### 2.4 部署

点击 "Deploy" 按钮，等待部署完成（约 2-3 分钟）。

部署成功后，你会得到一个 URL，例如：
```
https://video-agent-pro.vercel.app
```

### 阶段 3: Cloudflare 配置（可选）

使用 Cloudflare 可以获得：
- 自定义域名
- CDN 加速
- DDoS 防护
- R2 存储（替代 Supabase Storage，降低成本）

#### 3.1 添加域名到 Cloudflare

1. 在 Cloudflare 中添加你的域名
2. 更新域名 DNS 服务器指向 Cloudflare

#### 3.2 配置 DNS 记录

在 Cloudflare DNS 设置中添加：

```
Type: CNAME
Name: @ (或 www)
Content: cname.vercel-dns.com
Proxy status: Proxied (橙色云朵)
```

#### 3.3 在 Vercel 中添加自定义域名

1. Vercel 项目设置 -> Domains
2. 添加你的域名（例如: vibeagent.com）
3. 验证所有权

#### 3.4 配置 Cloudflare R2 存储（可选）

如果想使用 Cloudflare R2 替代 Supabase Storage（成本更低）：

1. 在 Cloudflare 中启用 R2
2. 创建 bucket
3. 获取 API 凭证
4. 更新代码中的文件上传逻辑

**R2 定价**:
- 前 10 GB 存储: 免费
- 超过 10 GB: $0.015/GB/月
- 无出站流量费用（Supabase 要收费）

## 🔧 部署后配置

### 1. 测试登录/注册

1. 访问 `https://your-domain.com/auth/register`
2. 注册一个测试账号
3. 检查邮箱验证邮件
4. 登录测试

### 2. 访问管理后台

1. 访问 `https://your-domain.com/admin`
2. 使用管理员账号登录
3. 测试充值功能

### 3. 测试 AI 功能

1. 创建项目
2. 生成 Grid（会消耗积分）
3. 检查积分是否正确扣除
4. 查看积分交易记录

## 📊 监控和维护

### Supabase 监控

在 Supabase Dashboard 中查看：
- **API Logs**: 查看 API 调用
- **Database**: 查看数据库使用情况
- **Auth**: 查看登录/注册统计
- **Storage**: 查看存储使用量

### Vercel 监控

在 Vercel Dashboard 中查看：
- **Analytics**: 页面访问统计
- **Logs**: 服务器日志
- **Speed Insights**: 性能监控
- **Usage**: 带宽和函数调用统计

### 设置告警

1. Supabase -> Settings -> Integrations -> 配置 Slack/Email 告警
2. Vercel -> Settings -> Notifications -> 配置部署失败通知

## 💰 成本估算

### 免费套餐（前期测试）

```
Supabase Free:
- 500 MB 数据库
- 1 GB 文件存储
- 2 GB 带宽
成本: ¥0

Vercel Hobby:
- 100 GB 带宽
- 无限部署
成本: ¥0

Cloudflare Free:
- 无限流量
- 基础 CDN
成本: ¥0

总成本: ¥0/月
适合: 100-500 测试用户
```

### 生产环境（付费套餐）

```
Supabase Pro (¥180/月):
- 8 GB 数据库
- 100 GB 文件存储
- 250 GB 带宽

Vercel Pro (¥145/月):
- 1 TB 带宽
- 优先支持

Cloudflare Pro (¥145/月):
- 高级安全功能
- 更快速的 CDN

总成本: ¥470/月
适合: 1000-10000 用户
```

## 🔐 安全检查清单

部署前请确认：

- [ ] `SUPABASE_SERVICE_ROLE_KEY` 没有暴露给前端
- [ ] 所有 API Routes 都验证了用户身份
- [ ] RLS 策略已正确配置
- [ ] Storage buckets 访问策略已设置
- [ ] 邮箱验证已启用
- [ ] 强密码策略已配置
- [ ] Vercel 环境变量已正确设置
- [ ] 生产环境使用 HTTPS
- [ ] Cloudflare SSL 模式设置为 "Full (Strict)"
- [ ] CORS 配置正确

## 🐛 常见问题排查

### 问题 1: 用户注册后没有自动创建 profile

**原因**: 触发器未创建

**解决方案**:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 问题 2: API 调用返回 403 Forbidden

**原因**: RLS 策略阻止了访问

**解决方案**:
- 检查用户是否已登录
- 检查 RLS 策略是否正确
- 使用 `service_role` key（仅限服务端）

### 问题 3: 文件上传失败

**原因**: Storage bucket 策略未设置

**解决方案**:
- 检查 bucket 是否存在
- 检查上传路径是否符合策略
- 检查文件大小限制

### 问题 4: 积分扣除失败

**原因**: RPC 函数调用错误

**解决方案**:
```sql
-- 检查函数是否存在
SELECT * FROM pg_proc WHERE proname = 'consume_credits';

-- 测试调用
SELECT public.consume_credits(
  'user_uuid'::uuid,
  10,
  'test-operation',
  'test'
);
```

### 问题 5: Vercel 部署失败

**原因**: 环境变量缺失或构建错误

**解决方案**:
- 检查 Vercel 日志
- 确认所有环境变量已设置
- 本地运行 `npm run build` 测试

## 📈 下一步优化

部署成功后，可以考虑：

1. **添加支付功能**
   - 接入支付宝/微信支付
   - 实现自动充值

2. **性能优化**
   - 启用 Vercel Edge Functions
   - 使用 CDN 缓存静态资源
   - 优化图片加载

3. **监控增强**
   - 接入 Sentry（错误追踪）
   - 接入 PostHog（用户行为分析）
   - 设置自定义告警

4. **SEO 优化**
   - 添加 sitemap.xml
   - 配置 robots.txt
   - 优化 meta 标签

5. **用户体验**
   - 添加新手引导
   - 实现积分充值优惠活动
   - 添加推荐奖励机制

## 🎯 完整部署流程总结

```bash
# 1. Supabase 配置
□ 创建项目
□ 执行 schema.sql
□ 创建 Storage buckets
□ 创建管理员账号

# 2. 代码准备
□ 提交代码到 GitHub
□ 确认环境变量配置正确

# 3. Vercel 部署
□ 导入 GitHub 项目
□ 配置环境变量
□ 部署

# 4. 域名配置（可选）
□ Cloudflare 添加域名
□ 配置 DNS
□ Vercel 添加自定义域名

# 5. 测试
□ 测试注册/登录
□ 测试管理后台
□ 测试 AI 功能
□ 测试积分系统

# 6. 监控
□ 设置告警
□ 定期检查日志
□ 监控成本使用
```

## 📚 相关文档

- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Supabase 详细配置
- [BUSINESS_MODEL_SECURITY.md](BUSINESS_MODEL_SECURITY.md) - 商业模式和安全
- [VERCEL_SUPABASE_DEPLOYMENT.md](VERCEL_SUPABASE_DEPLOYMENT.md) - 架构分析

---

**祝部署顺利！如有问题，请查看 Supabase 和 Vercel 官方文档。**
