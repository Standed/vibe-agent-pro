# AGENTS.md

> **Video Agent Pro** - AI-Powered Video Production Tool
> 本文档为 AI 编码代理提供项目上下文和开发指南

---

## 📋 项目概述

**Video Agent Pro** 是一个 AI 驱动的视频分镜生成与编辑工具，支持 Agent 对话模式和 Pro 精细控制双模式工作流。

- **版本**: v0.4.0
- **技术栈**: Next.js 15.5.6 + React 19 + TypeScript 5.8.2 + Zustand + Supabase
- **AI 服务**: Google Gemini 2.0 Flash + Volcano Engine (SeeDream, SeeDance, Doubao)

---

## 🚀 快速启动

### 开发命令

```bash
# 启动开发服务器 (Turbopack)
npm run dev

# 构建生产版本 + TypeScript 类型检查
npm run build

# 启动生产服务器
npm run start

# ESLint 代码检查
npm run lint
```

### 环境变量

创建 `.env.local` 文件：

```env
# Gemini API (Grid 多视图生成)
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Volcano Engine API
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_api_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# Volcano Engine Model Endpoints
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxxx-xxxxx  # 图片生成
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxxx-xxxxx  # 视频生成
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxxx-xxxxx    # AI 对话

# Supabase (云端数据库)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Cloudflare R2 (文件存储)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-domain.r2.dev
```

---

## 🏗️ 核心架构

### 数据流向

```
User Action → Component → Store Action → dataService
                                      ↓
                              Supabase API Gateway
                                      ↓
                          PostgreSQL (Cloud) / IndexedDB (Fallback)
```

### 关键设计模式

#### 1. 统一数据层 (dataService)

**所有数据操作必须通过 `dataService` 进行**，自动处理 Supabase/IndexedDB 切换。

```typescript
// ✅ 正确方式
import { dataService } from '@/lib/dataService';
await dataService.saveProject(project);

// ❌ 错误方式 - 不要直接调用
import { supabase } from '@/lib/supabase/client';
await supabase.from('projects').insert(...);
```

**文件位置**: `src/lib/dataService.ts`

#### 2. 防抖自动保存 (800ms)

Store actions 自动触发防抖保存，避免频繁 I/O：

```typescript
// 所有 update/add/delete actions 都会自动触发防抖保存
updateShot(shotId, { status: 'done' }); // 800ms 后自动保存
addScene({ name: 'Scene 1', ... });      // 800ms 后自动保存
```

**文件位置**: `src/store/useProjectStore.ts:155-168`

#### 3. API 路由代理 (隐藏 API Key)

**所有 AI API 调用必须通过 Next.js API Routes 代理**，避免暴露 API Key：

```typescript
// ✅ 正确 - 通过 API Route 代理
await fetch('/api/gemini-grid', {
  method: 'POST',
  body: JSON.stringify({ prompt, gridRows, gridCols })
});

// ❌ 错误 - 直接调用外部 API
await fetch('https://generativelanguage.googleapis.com/...', {
  headers: { 'X-API-Key': process.env.NEXT_PUBLIC_GEMINI_API_KEY }
});
```

**API Routes 位置**: `src/app/api/*/route.ts`

#### 4. 聊天消息云端存储 (独立表)

**聊天历史使用独立的 `chat_messages` 表，支持三级 scope**：

```typescript
// ✅ 新版 API - 云端存储
await dataService.saveChatMessage({
  id: crypto.randomUUID(),
  userId: user.id,
  projectId: project.id,
  scope: 'project',  // 'project' | 'scene' | 'shot'
  role: 'user',
  content: '请生成分镜',
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ❌ 旧版 API - 已废弃
addChatMessage({ ... }); // project.chatHistory 字段已弃用
```

**数据库 Schema**: `supabase/schema.sql` (第 9 节)
**API 实现**: `src/lib/dataService.ts:595-714`

#### 5. 认证 Header 自动注入

**所有 Supabase API 调用使用 `authenticatedFetch()`**：

```typescript
// ✅ 正确 - 自动添加 Authorization header
import { authenticatedFetch } from '@/lib/api-client';
const resp = await authenticatedFetch('/api/supabase', {
  method: 'POST',
  body: JSON.stringify({ table: 'projects', operation: 'select' })
});

// ❌ 错误 - 缺少认证 header
const resp = await fetch('/api/supabase', { method: 'POST', ... });
```

**文件位置**: `src/lib/api-client.ts`

---

## 📂 项目结构

```
src/
├── app/                              # Next.js App Router
│   ├── api/                          # API Routes (代理所有外部 API)
│   │   ├── gemini-grid/route.ts      # Grid 多视图生成
│   │   ├── gemini-image/route.ts     # 单图生成
│   │   ├── gemini-text/route.ts      # 文本生成
│   │   ├── seedream/route.ts         # 图片生成 (Volcano Engine)
│   │   ├── seedream-edit/route.ts    # 图片编辑
│   │   ├── supabase/route.ts         # 统一 Supabase Gateway
│   │   └── upload-r2/route.ts        # 文件上传
│   ├── project/[id]/page.tsx         # 项目编辑页面
│   └── page.tsx                      # 首页 (项目列表)
│
├── components/                       # React 组件
│   ├── layout/                       # 布局组件
│   │   ├── LeftSidebarNew.tsx        # 左侧栏 (剧本/分镜脚本/资源)
│   │   ├── RightPanel.tsx            # 右侧面板 (Agent/Pro + 分镜详情)
│   │   ├── ProPanel.tsx              # Pro 模式控制面板
│   │   ├── AgentPanel.tsx            # Agent 对话面板
│   │   ├── ChatPanelWithHistory.tsx  # Pro 模式对话 (shot/scene/project)
│   │   └── Timeline.tsx              # 时间轴编辑器
│   ├── canvas/
│   │   └── InfiniteCanvas.tsx        # 无限画布
│   ├── grid/
│   │   └── GridPreviewModal.tsx      # Grid 切片预览与分配
│   ├── shot/
│   │   ├── ShotListItem.tsx          # 分镜卡片
│   │   └── ShotDetailPanel.tsx       # 分镜详情面板 (oiioii 风格)
│   ├── project/
│   │   └── NewProjectDialog.tsx      # 新建项目对话框
│   └── auth/
│       └── AuthProvider.tsx          # 认证 Provider
│
├── services/                         # 业务逻辑层
│   ├── geminiService.ts              # Gemini API 服务
│   ├── volcanoEngineService.ts       # Volcano Engine API 服务
│   ├── storyboardService.ts          # AI 分镜生成
│   ├── agentService.ts               # AI Agent 对话
│   ├── contextBuilder.ts             # 上下文构建
│   ├── parallelExecutor.ts           # 并行工具执行器
│   └── sessionManager.ts             # 会话管理
│
├── store/                            # 状态管理
│   └── useProjectStore.ts            # Zustand Store (Immer middleware)
│
├── types/                            # TypeScript 类型定义
│   └── project.ts                    # 所有数据模型
│
├── lib/                              # 工具库
│   ├── dataService.ts                # 统一数据层 (Supabase/IndexedDB)
│   ├── api-client.ts                 # authenticatedFetch()
│   ├── supabase/                     # Supabase 客户端
│   │   ├── client.ts                 # Supabase 客户端初始化
│   │   ├── auth.ts                   # 认证相关
│   │   └── credits.ts                # 积分系统
│   └── storageService.ts             # 本地存储服务
│
└── locales/                          # 国际化
    ├── zh.ts                         # 简体中文
    └── en.ts                         # English
```

---

## 🔧 开发指南

### 1. 添加新功能流程

#### Step 1: 检查是否需要修改数据模型

```typescript
// src/types/project.ts
export interface Shot {
  id: string;
  sceneId: string;
  // ... 现有字段
  newField?: string; // 添加新字段
}
```

#### Step 2: 更新 Store Action (如果需要)

```typescript
// src/store/useProjectStore.ts
updateShot: (id, updates) => {
  set((state) => {
    const shot = state.project?.shots.find((s) => s.id === id);
    if (shot) {
      Object.assign(shot, updates);
    }
  });
  // ⚠️ 重要：自动触发防抖保存
  get().debouncedSaveProject();
},
```

#### Step 3: 实现 UI 组件

```typescript
// src/components/...
import { useProjectStore } from '@/store/useProjectStore';

const { updateShot } = useProjectStore();

const handleUpdate = () => {
  updateShot(shotId, { newField: 'value' });
  // 无需手动调用 saveProject()，Store action 会自动触发
};
```

#### Step 4: 添加国际化文本 (如果需要)

```typescript
// src/locales/zh.ts
export const zh = {
  newFeature: {
    title: '新功能标题',
    description: '功能描述',
  },
};

// src/locales/en.ts
export const en = {
  newFeature: {
    title: 'New Feature Title',
    description: 'Feature description',
  },
};
```

### 2. 调用 AI API 规范

#### Grid 多视图生成

```typescript
import { generateMultiViewGrid } from '@/services/geminiService';

const { fullImage, slices } = await generateMultiViewGrid(
  prompt,
  gridRows,
  gridCols,
  aspectRatio,
  imageSize,
  referenceImages
);
```

**⚠️ 重要**: Grid 生成是**场景级别**的，不是镜头级别：
- 用户选择一个场景
- 生成 Grid (完整图 + 切片)
- 手动分配切片到该场景下的各个镜头

**文件位置**: `src/services/geminiService.ts:198-312`

#### 单图生成

```typescript
import { generateSingleImage } from '@/services/geminiService';

const imageUrl = await generateSingleImage(prompt, aspectRatio, referenceImages);
```

#### 视频生成

```typescript
import { VolcanoEngineService } from '@/services/volcanoEngineService';

const volcanoService = new VolcanoEngineService();
const videoUrl = await volcanoService.generateVideo(imageUrl, videoPrompt);
```

### 3. 聊天消息存储规范

#### Agent 模式 (项目级对话)

```typescript
// src/hooks/useAgent.ts:189-201
await dataService.saveChatMessage({
  id: generateMessageId(),
  userId: user.id,
  projectId: project.id,
  scope: 'project',  // 项目级
  role: 'user',
  content: message,
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

#### Pro 模式 (shot/scene/project 三级 scope)

```typescript
// src/components/layout/ChatPanelWithHistory.tsx
const scope = selectedShotId ? 'shot' : currentSceneId ? 'scene' : 'project';

await dataService.saveChatMessage({
  id: generateMessageId(),
  userId: user.id,
  projectId: project.id,
  shotId: selectedShotId || undefined,
  sceneId: currentSceneId || undefined,
  scope,
  role: 'user',
  content: message,
  // ...
});
```

#### 加载历史消息

```typescript
const messages = await dataService.getChatMessages({
  projectId: project.id,
  scope: 'shot',
  shotId: selectedShotId,
});
```

### 4. 错误处理规范

#### API 调用错误

```typescript
try {
  const result = await apiCall();
  return result;
} catch (error: any) {
  console.error('API 调用失败:', error);
  // 显示用户友好的错误信息
  toast.error('操作失败，请稍后重试');
  throw new Error('操作失败，请稍后重试');
}
```

#### 认证错误

```typescript
// geminiService.ts 已处理
if (resp.status === 401) {
  throw new Error('请先登录后再使用 AI 生成功能');
}
if (resp.status === 403 && errorData.error?.includes('积分')) {
  throw new Error(errorData.error);
}
```

---

## 🧪 测试指南

### 手动测试流程

1. **启动开发服务器**
```bash
npm run dev
```

2. **访问应用**
```
http://localhost:3000
```

3. **测试核心功能**
- [ ] 创建新项目 (填写名称、概要、画风、画面比例)
- [ ] 输入剧本，点击 "AI 自动分镜"
- [ ] 添加角色，生成三视图
- [ ] 选择场景，生成 Grid (2x2 或 3x3)
- [ ] 手动分配 Grid 切片到镜头
- [ ] 生成视频 (基于镜头的参考图)
- [ ] Agent 模式对话 (项目级)
- [ ] Pro 模式对话 (shot/scene/project 三级)
- [ ] 刷新页面，检查数据持久化

### TypeScript 类型检查

```bash
npm run build
```

**必须通过编译，无 TypeScript 错误**

### 常见问题排查

#### 1. Supabase API 调用失败 (401 Unauthorized)

**原因**: 未使用 `authenticatedFetch()` 或会话过期

**解决**:
```typescript
// ✅ 正确
import { authenticatedFetch } from '@/lib/api-client';
const resp = await authenticatedFetch('/api/supabase', {...});
```

#### 2. Gemini API 超时 (240 秒)

**原因**: 网络代理速度慢或请求过大

**解决**:
- 检查 `.env.local` 中的 `NEXT_PUBLIC_GEMINI_API_KEY`
- 减小参考图片大小
- 增加超时时间: 设置 `NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS`

#### 3. State 更新不触发 re-render

**原因**: 直接修改了 state（违反不可变性）

**解决**: 使用 Store actions (已集成 Immer，自动处理)
```typescript
// ✅ 正确
updateShot(shotId, { status: 'done' });

// ❌ 错误
project.shots[0].status = 'done'; // 不会触发 re-render
```

#### 4. IndexedDB 数据丢失

**原因**: `debouncedSaveProject()` 未完成保存

**解决**: 等待 800ms 后再刷新页面，或手动调用 `saveProject()`

---

## ⚠️ 重要提醒

### 绝对不要 (NEVER)

- ❌ 直接调用 Supabase client，绕过 `dataService`
- ❌ 直接修改 state，不使用 Store actions
- ❌ 在客户端直接调用外部 AI API，暴露 API Key
- ❌ 使用 `project.chatHistory` 字段存储聊天消息 (已废弃)
- ❌ 使用 `localStorage` 存储聊天消息 (已迁移到云端)
- ❌ 跳过 `authenticatedFetch()`，导致认证失败
- ❌ 提交代码前不运行 `npm run build` 检查类型错误

### 始终记住 (ALWAYS)

- ✅ 所有数据操作通过 `dataService`
- ✅ 使用 Store actions，自动触发防抖保存
- ✅ API 调用通过 Next.js API Routes 代理
- ✅ 聊天消息使用 `dataService.saveChatMessage()`
- ✅ Supabase 调用使用 `authenticatedFetch()`
- ✅ Grid 生成是场景级别的，不是镜头级别
- ✅ TypeScript strict mode，无 `any` 类型
- ✅ **所有回复使用简体中文**

---

## 📝 代码质量检查清单

### 提交前必检项

- [ ] `npm run build` 通过，无 TypeScript 错误
- [ ] 无 ESLint 警告 (`npm run lint`)
- [ ] 在浏览器中手动测试主要功能流程
- [ ] 检查控制台无错误或警告
- [ ] 数据持久化正常 (刷新页面后数据仍存在)
- [ ] 边界情况处理 (空数据、网络错误、超时)
- [ ] Git commit message 清晰 (遵循规范)

### TypeScript 规范

```typescript
// ✅ 严格类型
interface ShotUpdate {
  status: ShotStatus;
  referenceImage?: string;
}
updateShot(shotId, updates);

// ❌ any 类型
updateShot(shotId, updates: any);
```

### 命名规范

```typescript
// 组件：PascalCase
const GridPreviewModal = () => {};

// 函数：camelCase
const handleGridGeneration = () => {};

// 常量：UPPER_CASE
const DEFAULT_TIMEOUT = 30000;

// 类型：PascalCase
interface GridHistoryItem {}
```

---

## 🔗 相关文档

- **开发指南**: [CLAUDE.md](./CLAUDE.md) - 详细开发流程和规范
- **功能清单**: [FEATURES.md](./FEATURES.md) - 所有功能列表
- **聊天迁移**: [CHAT_STORAGE_MIGRATION.md](./CHAT_STORAGE_MIGRATION.md) - 聊天历史云端迁移指南
- **数据库 Schema**: [supabase/schema.sql](./supabase/schema.sql) - 完整数据库结构
- **用户文档**: [README.md](./README.md) - 用户使用指南

---

## 🎯 快速参考

### 常用文件快速定位

| 功能 | 文件路径 |
|------|---------|
| 项目状态 | `src/store/useProjectStore.ts` |
| 数据服务 | `src/lib/dataService.ts` |
| 类型定义 | `src/types/project.ts` |
| Gemini API | `src/services/geminiService.ts` |
| Agent 对话 | `src/hooks/useAgent.ts` |
| 聊天消息 | `src/components/layout/ChatPanelWithHistory.tsx` |
| 分镜详情 | `src/components/shot/ShotDetailPanel.tsx` |
| Grid 预览 | `src/components/grid/GridPreviewModal.tsx` |
| API 网关 | `src/app/api/supabase/route.ts` |
| 认证 | `src/components/auth/AuthProvider.tsx` |

### 常用命令快速参考

```bash
# 开发
npm run dev              # 启动开发服务器 (localhost:3000)

# 构建与检查
npm run build            # 构建 + TypeScript 类型检查
npm run lint             # ESLint 代码检查

# 生产
npm run start            # 启动生产服务器
```

---

**最后更新**: 2025-12-16
**维护者**: Claude Code + 西羊石团队
