# Vercel 部署指南

## 📋 环境变量配置清单

部署到 Vercel 前，请在 Vercel Dashboard 中配置以下环境变量：

### 🔐 必需的环境变量

#### Supabase 配置
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase 匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase 服务端密钥（仅服务端使用）

#### Cloudflare R2 存储
- `R2_BUCKET_NAME` - R2 存储桶名称
- `R2_ACCESS_KEY_ID` - R2 访问密钥 ID
- `R2_SECRET_ACCESS_KEY` - R2 秘密访问密钥
- `R2_ENDPOINT` - R2 端点 URL
- `NEXT_PUBLIC_R2_PUBLIC_URL` - R2 公开访问域名

#### Gemini API
- `GEMINI_TEXT_API_KEY` - 文本生成 API Key
- `GEMINI_IMAGE_API_KEY` - 图片生成 API Key
- `GEMINI_AGENT_API_KEY` - Agent 推理 API Key

#### Volcano Engine API
- `NEXT_PUBLIC_VOLCANO_API_KEY` - 火山引擎 API Key
- `NEXT_PUBLIC_VOLCANO_BASE_URL` - 火山引擎基础 URL
- `NEXT_PUBLIC_SEEDREAM_MODEL_ID` - SeeDream 模型 ID
- `NEXT_PUBLIC_SEEDANCE_MODEL_ID` - SeeDance 模型 ID
- `NEXT_PUBLIC_DOUBAO_MODEL_ID` - Doubao 模型 ID

### 🔧 可选的环境变量

#### TTS 语音合成
- `NEXT_PUBLIC_TTS_APPID`
- `NEXT_PUBLIC_TTS_ACCESS_TOKEN`
- `NEXT_PUBLIC_TTS_SECRET_KEY`
- `NEXT_PUBLIC_TTS_VOICE_TYPE`

#### 积分系统
- `INITIAL_CREDITS_ADMIN`
- `INITIAL_CREDITS_VIP`
- `INITIAL_CREDITS_USER`
- `VIP_DISCOUNT_RATE`
- `ADMIN_FREE`
- `ADMIN_EMAILS`
- `VIP_EMAILS`

## 🚀 部署步骤

### 方式一：使用 Vercel CLI（推荐，最快）

1. **登录 Vercel**：
```bash
vercel login
```

2. **部署到生产环境**：
```bash
vercel --prod
```

### 方式二：通过 Vercel Dashboard

1. 访问 https://vercel.com/new
2. 导入 GitHub 仓库：`Standed/vibe-agent-pro`
3. 配置环境变量（参考上面的清单）
4. 点击 "Deploy"

## ⚙️ 部署后配置

1. **设置自定义域名**（可选）
   - 在 Vercel Dashboard > Settings > Domains 中添加

2. **检查构建日志**
   - 确保没有错误或警告

3. **测试功能**
   - 测试登录/注册
   - 测试 AI 生成功能
   - 测试文件上传

## 🔍 故障排除

### 构建失败
- 检查 Node.js 版本是否为 18.x 或更高
- 查看构建日志中的错误信息

### API 调用失败
- 检查环境变量是否正确配置
- 检查 API Key 是否有效

### 图片/视频上传失败
- 检查 R2 配置是否正确
- 检查 CORS 设置

## 📊 性能优化建议

1. 启用 Vercel Analytics
2. 配置 Edge Functions（如果需要）
3. 设置合适的 Cache-Control 头
4. 优化图片加载（已使用 next/image）

---

**创建时间**: 2025-12-18
**版本**: v0.4.0
