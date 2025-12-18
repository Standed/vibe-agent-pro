# 环境变量安全迁移方案

## 🔴 安全问题

当前很多 API Key 使用了 `NEXT_PUBLIC_` 前缀，这会导致它们被打包到客户端 JavaScript 中，**任何人都能在浏览器控制台看到**。

## ✅ 迁移方案

### 保留 NEXT_PUBLIC_ 的（必须在客户端使用）

| 变量名 | 用途 | 是否安全 |
|--------|------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | ✅ 安全（公开信息） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | ✅ 安全（设计为公开） |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | R2 公开访问域名 | ✅ 安全（公开 CDN 域名） |

### 移除 NEXT_PUBLIC_ 的（只在服务端使用）

| 旧变量名 | 新变量名 | 用途 |
|---------|---------|------|
| `NEXT_PUBLIC_VOLCANO_API_KEY` | `VOLCANO_API_KEY` | 火山引擎 API Key |
| `NEXT_PUBLIC_VOLCANO_BASE_URL` | `VOLCANO_BASE_URL` | 火山引擎 Base URL |
| `NEXT_PUBLIC_SEEDREAM_MODEL_ID` | `SEEDREAM_MODEL_ID` | SeeDream 模型 ID |
| `NEXT_PUBLIC_SEEDANCE_MODEL_ID` | `SEEDANCE_MODEL_ID` | SeeDance 模型 ID |
| `NEXT_PUBLIC_DOUBAO_MODEL_ID` | `DOUBAO_MODEL_ID` | Doubao 模型 ID |
| `NEXT_PUBLIC_GEMINI_API_KEY` | `GEMINI_API_KEY` | Gemini API Key |
| `NEXT_PUBLIC_TTS_APPID` | `TTS_APPID` | TTS 应用 ID |
| `NEXT_PUBLIC_TTS_ACCESS_TOKEN` | `TTS_ACCESS_TOKEN` | TTS 访问令牌 |
| `NEXT_PUBLIC_TTS_SECRET_KEY` | `TTS_SECRET_KEY` | TTS 密钥 |
| `NEXT_PUBLIC_TTS_VOICE_TYPE` | `TTS_VOICE_TYPE` | TTS 声音类型 |

### 可硬编码的（配置类，不需要环境变量）

| 旧变量名 | 建议 |
|---------|------|
| `NEXT_PUBLIC_APP_NAME` | 硬编码为 "Video Agent Pro" |
| `NEXT_PUBLIC_DEFAULT_VIDEO_WIDTH` | 硬编码为 1920 |
| `NEXT_PUBLIC_DEFAULT_VIDEO_HEIGHT` | 硬编码为 1080 |
| `NEXT_PUBLIC_DEFAULT_FPS` | 硬编码为 30 |
| `NEXT_PUBLIC_AGENT_TIMEOUT_MS` | 硬编码为 30000 |
| `NEXT_PUBLIC_AGENT_AI_TIMEOUT_MS` | 硬编码为 90000 |

## 📝 修改文件清单

### 1. 环境变量文件
- `.env.local` - 本地开发环境
- `.env.example` - 示例配置

### 2. API Routes（已经支持多种格式）
- `src/app/api/seedream/route.ts` ✅
- `src/app/api/seedream-edit/route.ts` ✅
- `src/app/api/gemini-*/route.ts` ✅

### 3. Service 文件（需要修改）
- `src/services/volcanoEngineService.ts`
- `src/services/geminiService.ts`
- `src/services/agentService.ts`
- `src/services/agentTools.ts`

### 4. 配置文件（需要修改）
- `src/config/credits.ts`
- `src/config/users.ts`

### 5. 库文件
- `src/lib/cloudflare-r2.ts`
- `src/lib/storageService.ts`

## 🔒 安全原则

1. **API Keys 永远不要使用 NEXT_PUBLIC_** - 它们会暴露在客户端
2. **公开信息可以使用 NEXT_PUBLIC_** - 如 Supabase URL, R2 Public URL
3. **配置信息尽量硬编码** - 减少环境变量数量
4. **服务端优先** - 所有 API 调用通过 API Routes 代理

## 🚀 Vercel 环境变量配置

迁移后，在 Vercel Dashboard 中只需配置：

```env
# Supabase（必须，客户端）
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

# Supabase 服务端密钥（必须，服务端）
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# R2 存储（必须）
R2_BUCKET_NAME=video-agent-media
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Gemini API（必须，服务端）
GEMINI_API_KEY=AIzaSyBxxx
GEMINI_TEXT_API_KEY=AIzaSyBxxx
GEMINI_IMAGE_API_KEY=AIzaSyBxxx
GEMINI_AGENT_API_KEY=AIzaSyBxxx

# Volcano Engine（必须，服务端）
VOLCANO_API_KEY=4400e6ae-xxx
VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDREAM_MODEL_ID=doubao-seedream-4-5-251128
SEEDANCE_MODEL_ID=doubao-seedance-1-0-pro-fast-251015
DOUBAO_MODEL_ID=doubao-seed-1-6-250615

# TTS（可选，服务端）
TTS_APPID=xxx
TTS_ACCESS_TOKEN=xxx
TTS_SECRET_KEY=xxx
TTS_VOICE_TYPE=BV700_V2_streaming
```

---

**创建时间**: 2025-12-18
**优先级**: 🔴 高（安全问题）
