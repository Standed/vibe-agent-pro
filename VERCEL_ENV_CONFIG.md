# ⚠️ 重要：Vercel 环境变量配置指南

## 🔴 安全性改进完成

我已经将所有 API Key 相关的环境变量从 `NEXT_PUBLIC_` 前缀改为**服务端专用变量**，防止 API Key 泄露到客户端代码中。

**你需要立即在 Vercel Dashboard 中更新环境变量配置！**

---

## 📝 需要在 Vercel 中配置的环境变量

### 1. 访问 Vercel 项目设置

1. 访问：https://vercel.com/william-shis-projects-b479c055/video-agent-pro
2. 点击 **Settings** → **Environment Variables**

### 2. 删除旧的环境变量（带 NEXT_PUBLIC_ 前缀的）

删除以下变量（如果存在）：
- ❌ `NEXT_PUBLIC_VOLCANO_API_KEY`
- ❌ `NEXT_PUBLIC_VOLCANO_BASE_URL`
- ❌ `NEXT_PUBLIC_SEEDREAM_MODEL_ID`
- ❌ `NEXT_PUBLIC_SEEDANCE_MODEL_ID`
- ❌ `NEXT_PUBLIC_DOUBAO_MODEL_ID`
- ❌ `NEXT_PUBLIC_GEMINI_API_KEY`
- ❌ `NEXT_PUBLIC_TTS_*`

### 3. 添加新的环境变量（没有 NEXT_PUBLIC_ 前缀）

复制以下配置，在 Vercel 中逐一添加：

```env
# ========================================
# Supabase 配置（必须保留 NEXT_PUBLIC_）
# ========================================
NEXT_PUBLIC_SUPABASE_URL=https://spfobstzqfwwnjymqriw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZm9ic3R6cWZ3d25qeW1xcml3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzU2MzEsImV4cCI6MjA4MDkxMTYzMX0.4ugonQzO4BB3o7dRCufAjLqiGhFYbqoEjUS6NpMHr74

# Supabase 服务端密钥（仅服务端）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZm9ic3R6cWZ3d25qeW1xcml3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTMzNTYzMSwiZXhwIjoyMDgwOTExNjMxfQ.FHBx_hMYmYna7jV0bVtEiAGvyqEn4E-cVkg_R8Gbj_o

# ========================================
# Cloudflare R2 存储配置（仅服务端）
# ========================================
R2_BUCKET_NAME=video-agent-media
R2_ACCESS_KEY_ID=539846b750d86d7371c7c131af8afb87
R2_SECRET_ACCESS_KEY=614f13662a34a7167617e34e6a6c2424c7492392d183c669bd27a0f23edcc11e
R2_ENDPOINT=https://fc4fd3d1dd8af9baec6919a34f8b67ec.r2.cloudflarestorage.com

# R2 公开访问域名（必须保留 NEXT_PUBLIC_）
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-522ca521cf3a4baab54032e3dfddbd2d.r2.dev

# ========================================
# Gemini API 配置（仅服务端）⚠️ 重要
# ========================================
GEMINI_API_KEY=AIzaSyDziHoMunoHB3gh7Lno0wjFDkVgQ272nFQ
GEMINI_TEXT_API_KEY=AIzaSyDziHoMunoHB3gh7Lno0wjFDkVgQ272nFQ
GEMINI_IMAGE_API_KEY=AIzaSyDziHoMunoHB3gh7Lno0wjFDkVgQ272nFQ
GEMINI_AGENT_API_KEY=AIzaSyDziHoMunoHB3gh7Lno0wjFDkVgQ272nFQ

# Gemini 模型配置（按功能区分）
GEMINI_STORYBOARD_MODEL=gemini-3-pro-preview
GEMINI_AGENT_MODEL=gemini-3-pro-preview
GEMINI_TEXT_MODEL=gemini-3-pro-preview
GEMINI_ANALYZE_MODEL=gemini-3-pro-preview
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview

# ========================================
# Volcano Engine 配置（仅服务端）⚠️ 重要
# ========================================
VOLCANO_API_KEY=4400e6ae-ef35-4487-a5bf-1c94fe5f5bbd
VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDREAM_MODEL_ID=doubao-seedream-4-5-251128
SEEDANCE_MODEL_ID=doubao-seedance-1-0-pro-fast-251015
DOUBAO_MODEL_ID=doubao-seed-1-6-250615

# ========================================
# TTS 配置（可选，仅服务端）
# ========================================
TTS_APPID=xxxx
TTS_ACCESS_TOKEN=xxxx
TTS_SECRET_KEY=71a95e2a-e20e-4d4c-9c65-388c073cbdf8
TTS_VOICE_TYPE=xxxx

# ========================================
# 代理配置（可选，本地开发用）
# ========================================
# HTTP_PROXY=http://127.0.0.1:7897
# HTTPS_PROXY=http://127.0.0.1:7897
```

---

## 🎯 配置步骤（逐步指南）

### Step 1: 打开 Vercel 环境变量页面

访问：https://vercel.com/william-shis-projects-b479c055/video-agent-pro/settings/environment-variables

### Step 2: 添加每个环境变量

对于上面列表中的每个变量：

1. 点击 **Add New**
2. **Key**: 输入变量名（如 `VOLCANO_API_KEY`）
3. **Value**: 粘贴对应的值
4. **Environments**: 选择所有环境（Production, Preview, Development）
5. 点击 **Save**

### Step 3: 重新部署

配置完成后：

1. 回到 Deployments 页面
2. 点击最新的部署右侧的 **⋯** 菜单
3. 选择 **Redeploy**
4. 勾选 **Use existing Build Cache** 取消勾选
5. 点击 **Redeploy**

---

## ✅ 验证部署

部署完成后，访问你的 Vercel URL，检查：

- [ ] 页面正常加载
- [ ] 能够登录/注册（Supabase 连接正常）
- [ ] AI 生成功能正常（Grid/单图/视频）
- [ ] 文件上传正常（R2 配置正常）

---

## 🐛 常见问题

### 1. 部署后 API 调用 500 错误

**原因**：环境变量未配置或配置错误

**解决**：
1. 检查 Vercel Dashboard > Settings > Environment Variables
2. 确保所有必需变量都已添加
3. 点击 Function Logs 查看具体错误信息

### 2. "API not configured" 错误

**原因**：API Key 变量名不正确

**解决**：
- 确保使用**新的变量名**（无 `NEXT_PUBLIC_` 前缀）
- 例如：`VOLCANO_API_KEY` 而不是 `NEXT_PUBLIC_VOLCANO_API_KEY`

### 3. 图片/视频加载失败

**原因**：R2 配置错误

**解决**：
- 检查 `NEXT_PUBLIC_R2_PUBLIC_URL` 是否正确（必须保留 NEXT_PUBLIC_ 前缀）
- 检查 R2 CORS 设置

---

## 📚 相关文档

- [ENV_MIGRATION_PLAN.md](./ENV_MIGRATION_PLAN.md) - 详细迁移方案
- [DEPLOY.md](./DEPLOY.md) - 完整部署指南
- [.env.example](../.env.example) - 环境变量示例

---

**创建时间**: 2025-12-18
**重要性**: 🔴 高（安全问题）
**操作时间**: 立即

如果有任何问题，请查看 Vercel 的 Function Logs 获取详细错误信息。
