# 🚀 一键部署到 Vercel

## 快速部署方式（推荐）

### 方式一：通过 Vercel Dashboard（最简单）

点击下面的按钮直接部署：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Standed/vibe-agent-pro)

**或者手动操作**：

1. **访问 Vercel 导入页面**：
   ```
   https://vercel.com/new/import?s=https://github.com/Standed/vibe-agent-pro
   ```

2. **连接 GitHub 账户**（如果还未连接）

3. **配置项目**：
   - Project Name: `vibe-agent-pro` (或自定义)
   - Framework Preset: Next.js (自动检测)
   - Root Directory: `./` (默认)

4. **配置环境变量**（点击 "Environment Variables"）：

   **必需变量**：
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key

   # R2 Storage
   R2_BUCKET_NAME=vibe-agent-media
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
   NEXT_PUBLIC_R2_PUBLIC_URL=https://your-domain.com

   # Gemini API
   GEMINI_TEXT_API_KEY=your_gemini_key
   GEMINI_IMAGE_API_KEY=your_gemini_key
   GEMINI_AGENT_API_KEY=your_gemini_key

   # Volcano Engine
   NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_key
   NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
   NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxx
   NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxx
   NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxx
   ```

5. **点击 "Deploy"** - Vercel 会自动：
   - 克隆仓库
   - 安装依赖
   - 构建项目
   - 部署到全球 CDN

6. **等待 2-3 分钟**，部署完成后你会得到一个 URL：
   ```
   https://vibe-agent-pro.vercel.app
   ```

---

### 方式二：使用 Vercel CLI（需要修复计算机名）

如果你的电脑名称包含中文或特殊字符，Vercel CLI 会报错。解决方法：

#### 临时解决（推荐）
直接使用方式一的 Vercel Dashboard 部署。

#### 永久解决（修改计算机名）
1. 打开"设置" > "系统" > "关于"
2. 点击"重命名这台电脑"
3. 改为英文名称（如 `dev-pc`）
4. 重启电脑
5. 重新运行：
   ```bash
   vercel login
   vercel --prod
   ```

---

## 部署后配置

### 1. 自动部署设置
Vercel 已自动配置：
- ✅ 每次推送到 `main` 分支 → 自动部署到生产环境
- ✅ 每次推送到其他分支 → 自动创建预览环境
- ✅ 每个 Pull Request → 自动创建预览部署

### 2. 自定义域名（可选）
在 Vercel Dashboard：
1. 进入项目设置
2. Domains → Add Domain
3. 按提示配置 DNS 记录

### 3. 环境变量管理
在 Vercel Dashboard：
1. Settings → Environment Variables
2. 可以为不同环境（Production/Preview/Development）设置不同的值

---

## 📊 部署状态检查

部署完成后，访问你的项目 URL：
```
https://vibe-agent-pro.vercel.app
```

检查：
- [ ] 页面能正常加载
- [ ] 能够登录/注册（Supabase 连接正常）
- [ ] AI 生成功能正常（API 配置正常）
- [ ] 文件上传正常（R2 配置正常）

---

## 🐛 常见问题

### 构建失败
- 查看构建日志：Deployments → 点击失败的部署 → View Build Logs
- 常见原因：环境变量缺失、依赖安装失败

### API 调用 500 错误
- 检查环境变量是否正确配置
- 查看 Function Logs（Runtime Logs）

### 图片加载失败
- 检查 R2_PUBLIC_URL 是否正确
- 检查 R2 CORS 配置

---

## 🎯 下一步

1. ✅ 访问部署 URL 测试功能
2. ✅ 配置自定义域名（可选）
3. ✅ 设置 Vercel Analytics（可选）
4. ✅ 配置告警通知（可选）

---

**部署时间**: 2025-12-18
**GitHub 仓库**: https://github.com/Standed/vibe-agent-pro
**Vercel 项目**: vibe-agent-pro
