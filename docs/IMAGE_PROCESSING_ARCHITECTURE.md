# 图片处理架构文档

> 最后更新：2026-02-05
> 关联文档：[PRO_MODE_ARCHITECTURE.md](/docs/PRO_MODE_ARCHITECTURE.md), [AGENTS.md](/AGENTS.md)

## 概述

本文档描述 video-agent-pro 的图片处理架构，包括：

1. **图片来源**：画布拖入、上传、粘贴、历史记录等
2. **上传策略**：统一上传到 Cloudflare R2
3. **AI 模型交互**：各模型的图片传输方式
4. **Vercel 限制规避**：如何绕开 4.5MB 请求体限制

---

## 📊 图片处理链路

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         图片来源                                         │
├───────────────┬──────────────┬──────────────┬─────────────┬─────────────┤
│ 画布拖入      │ 电脑上传/拖入 │ 粘贴截图     │ PRO历史生成  │ PRO历史上传 │
│ (shot_ref)    │ (File)       │ (File)       │ (R2 URL)    │ (R2 URL)   │
└───────┬───────┴──────┬───────┴──────┬───────┴─────┬───────┴─────┬───────┘
        │              │              │             │             │
        ▼              ▼              ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    统一处理层（droppedReferences）                        │
│   类型：{ url: string, file?: File, source: string }                    │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    上传到 R2（如果是 File）                              │
│   storageService.uploadFile() → R2 URL                                  │
│   限制：10MB 以内，超时：120s，重试：3次                                  │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│    Gemini     │              │     即梦      │              │   SeeDream    │
│ (URL→后端下载) │              │ (直接传URL)   │              │ (URL→后端下载) │
└───────────────┘              └───────────────┘              └───────────────┘
```

---

## 🗄️ 存储策略

### Cloudflare R2 优先

所有图片统一上传到 Cloudflare R2：

| 特性 | 说明 |
|-----|------|
| 成本 | 存储免费，出站流量 $0.015/GB |
| CDN | 全球边缘节点 |
| 持久性 | 永久有效 URL |
| 限制 | 单文件最大 5GB |

### 上传流程

```typescript
// src/lib/storageService.ts
async uploadFile(file: File, folder: FolderInput, userId?: string) {
  // 1. 强制使用 R2
  // 2. 120s 超时，3 次重试
  // 3. 失败回退到 Supabase
  // 4. 最终回退到 Base64 Data URL
}
```

### 文件大小限制

| 场景 | 限制 | 压缩策略 |
|-----|------|---------|
| 用户上传/粘贴 | 10MB | 高质量压缩到 10MB 以内 |
| R2 上传 | 无限制 | 原图直传 |
| Gemini 后端下载 | 单图 ~3MB | sharp 压缩：2048px + JPEG 90% |

---

## 🤖 AI 模型图片传输

### Gemini（URL 优先 + 自动降级 - 2026-02 优化）

```
前端                API Route                              Google API
  │                        │                                   │
  │  POST { referenceImages: [{ url: "https://r2/..." }] }    │
  │───────────────────────>│                                   │
  │                        │                                   │
  │                        │ 1️⃣ 首次尝试: 预签名 URL (fileUri)  │
  │                        │ ──────────────────────────────────>│
  │                        │                                   │
  │                        │   ❌ 400 "Cannot fetch"            │
  │                        │ <──────────────────────────────────│
  │                        │                                   │
  │                        │ 2️⃣ 自动降级: 下载 → Base64         │
  │                        │ (服务端 fetch → inlineData)        │
  │                        │ ──────────────────────────────────>│
  │                        │                                   │
  │<───────────────────────│<──────────────────────────────────│
```

**双模式策略**：

| 模式 | 传输方式 | 触发条件 | 优势 |
|------|----------|----------|------|
| **URL 模式** | R2 预签名 URL → `fileData.fileUri` | 默认首次尝试 | 极速，零服务端负担 |
| **Download 模式** | 服务端下载 → Base64 → `inlineData` | `Cannot fetch` 错误后自动触发 | 100% 可靠 |

**实现代码**：

```typescript
// src/app/api/gemini-*/route.ts
const processReferenceImages = async (refs: any[], mode: 'url' | 'download' = 'url') => {
    // mode='url': 生成预签名 URL → fileData.fileUri
    // mode='download': 服务端 fetch → Base64 → inlineData
};

// 自动降级逻辑
try {
    result = await makeGeminiRequest('url');
} catch (urlError: any) {
    if (urlError.status === 400 && urlError.body?.includes('Cannot fetch')) {
        result = await makeGeminiRequest('download'); // 自动重试
    }
}
```

**优势**：
- ✅ 大多数情况享受 URL 模式的极速传输
- ✅ 遇到 R2 防火墙问题自动降级，用户无感知
- ✅ 支持最大 100MB 文件 (URL 模式) / 20MB (Download 模式)

### 即梦

```
前端                API Route (/api/jimeng)                即梦 API
  │                        │                                   │
  │  POST { imageUrls: ["https://r2/...", ...] }              │
  │───────────────────────>│                                   │
  │                        │                                   │
  │                        │ 1. 直接透传 URL                   │
  │                        │────────────────────────────────────>
  │                        │                                   │
  │                        │ 2. 返回 history_id (异步)         │
  │<───────────────────────│<────────────────────────────────────
  │                        │                                   │
  │  3. 轮询 /api/jimeng (check-status)                       │
  │───────────────────────>│                                   │
```

**关键**：即梦原生支持 URL，无需 Base64 转换。

### SeeDream

类似 Gemini，后端从 URL 下载并压缩。

---

## ⚡ Vercel 限制规避

### 问题

Vercel Serverless Function 请求体限制：**4.5MB**

### 解决方案

**前端只传 URL，后端下载**：

```
❌ 不走这条路（会触发 4.5MB 限制）：
   前端 Base64 → API Route → Gemini

✅ 我们的做法（完美绕开）：
   前端 URL → API Route（只传 URL 字符串） → 后端下载+压缩 → Gemini
```

**实现**：

```typescript
// src/services/geminiService.ts
export const urlsToReferenceImages = async (imageUrls: string[]) => {
  return imageUrls.map(url => ({
    mimeType: '',  // 为空，后端自动探测
    data: '',      // 为空，强制使用 URL 模式
    url: url       // 只传 URL
  }));
};
```

---

## 🔧 图片压缩

### 前端压缩（上传前）
 
 ```typescript
 // src/utils/imageCompression.ts
 export async function compressFileForUpload(file: File, onProgress?: (p: number) => void): Promise<File>
 ```
 
 **智能策略 (v4.0.1)**：
 
 | 文件特征 | 处理方式 | 优势 |
 |----------|----------|------|
 | **< 3MB** | **Fast Path**: 直接透传原文件 | 零延迟，秒传体验，画质无损 |
 | **> 3MB** | **Auto Compress**: 等比缩放 (max 2560px) + JPEG 85% | 确保不超 R2 限制，加快超大图上传 |
 
 - **Web Worker**: 经过权衡，暂未引入 Worker，利用主线程处理 10MB 以下图片性能尚可接受，优先保持架构简单性。
 - **Progress Feedback**: 压缩过程现在提供进度回调，UI 显示更平滑。

### 后端压缩（Gemini）

```typescript
// src/app/api/gemini-grid/route.ts
await sharp(inputBuffer)
  .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 90 })
  .toBuffer();
```

---

## ❓ 请求失败原因分析

### 即梦失败常见原因

| 原因 | 表现 | 解决 |
|-----|------|------|
| Session 过期 | `401` / `session invalid` | 重新登录即梦获取新 sessionid |
| 内容过滤 | `fail_code: 2038` | 调整提示词避免敏感内容 |
| 服务过载 | 轮询超时 | 重试 |
| URL 不可访问 | 无法下载参考图 | 确保 R2 URL 公开可访问 |

### Gemini 失败常见原因

| 原因 | 表现 | 解决 |
|-----|------|------|
| API Key 无效 | `403 PERMISSION_DENIED` | 检查环境变量配置 |
| 服务过载 | `503 UNAVAILABLE` | 等待重试 |
| 请求超时 | `AbortError` | 减少参考图数量或提升网络 |
| 参考图过大 | `413 Payload Too Large` | 减少图片数量（最多 10 张） |
| 图片下载失败 | 后端 `fetch` 失败 | 检查 R2 URL 可访问性 |

### 通用排查步骤

1. **检查浏览器控制台**：查看具体错误信息
2. **查看 Vercel 日志**：`vercel logs <deployment-url>`
3. **检查网络**：确保 R2 URL 可公开访问
4. **检查配额**：确认 API Key 积分/额度充足

---

## 📁 相关文件

### 图片处理核心

| 文件 | 功能 |
|-----|------|
| `src/lib/storageService.ts` | R2 上传统一入口 |
| `src/lib/r2-server-upload.ts` | 服务端 R2 上传、Grid 切片、预签名 URL 生成 |
| `src/lib/cloudflare-r2.ts` | R2 客户端底层封装 |
| `src/lib/cloudflare-r2.ts` | R2 客户端底层封装 |
| `src/utils/imageCompression.ts` | 前端图片压缩 |

### 前端展示交互
| 文件 | 功能 |
|-----|------|
| `DraggableCanvasShotCard.tsx` | 画布卡片，侧边栏生成按钮 (高对比度) |
| `ChatBubble.tsx` | 聊天气泡，参考图悬浮效果 (1.1x Zoom + 1px Inset Border) |
| `GenerationResult.tsx` | 生成结果，统一的悬浮交互逻辑 (Refined Visuals) |

### AI 模型集成

| 文件 | 功能 |
|-----|------|
| `src/services/geminiService.ts` | Gemini 客户端，URL 透传 |
| `src/services/jimengService.ts` | 即梦客户端，URL 直传 |
| `src/app/api/gemini-grid/route.ts` | Gemini Grid 后端，URL 优先 + 降级 |
| `src/app/api/gemini-image/route.ts` | Gemini 单图后端，URL 优先 + 降级 |
| `src/app/api/jimeng/route.ts` | 即梦后端透传 |

### 基础设施服务 (v3.9.6 新增)

| 文件 | 功能 |
|-----|------|
| `src/services/TaskQueueService.ts` | 全局任务队列（并发控制、优先级、超时） |
| `src/lib/api-response.ts` | 统一 API 响应格式 (`apiError`/`apiSuccess`) |
| `src/lib/video-transfer.ts` | 视频 R2 转存（带指数退避重试） |
| `src/lib/supabase/transactions.ts` | Supabase 批量事务操作 |
| `src/components/ui/StatusComponents.tsx` | 统一 UI 状态组件 (Spinner/Skeleton/EmptyState/Badge) |

---

## 🔧 基础设施服务详解

### TaskQueueService

全局任务队列服务，用于限制并发任务数量，避免触发 API 限流。

```typescript
// 预定义的全局队列实例
export const imageGenerationQueue = new TaskQueueService({
    concurrency: 5,         // 最大并发 5
    maxQueueSize: 50,       // 队列上限 50
    taskTimeout: 180000,    // 3 分钟超时
});

export const videoGenerationQueue = new TaskQueueService({
    concurrency: 3,         // 视频生成更耗资源
    maxQueueSize: 30,
    taskTimeout: 300000,    // 5 分钟超时
});

export const uploadQueue = new TaskQueueService({
    concurrency: 5,
    maxQueueSize: 100,
    taskTimeout: 60000,     // 1 分钟超时
});
```

### 统一 API 响应

所有 API 路由使用标准化响应格式：

```typescript
import { apiError, apiSuccess, ApiErrors } from '@/lib/api-response';

// 成功响应
return apiSuccess({ imageUrl, slices }, 200);

// 错误响应
return apiError('生成失败', 500, 'GENERATION_FAILED');

// 快捷方法
return ApiErrors.unauthorized();      // 401
return ApiErrors.insufficientCredits(); // 402
return ApiErrors.badRequest('参数错误'); // 400
```

### 视频转存服务

统一的视频 R2 转存逻辑，支持指数退避重试：

```typescript
import { transferVideoToR2 } from '@/lib/video-transfer';

const { r2Url, key } = await transferVideoToR2({
    providerUrl: task.kaponai_url,
    task: { id, user_id, project_id, shot_id, provider: 'vidu' },
    maxRetries: 3,
    retryDelayMs: 1500,
});
```

