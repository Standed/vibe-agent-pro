# Video Agent Pro - AGENTS 指南

AI 驱动的视频分镜生成与编辑工具 | Next.js 15.1 + React 19 + TypeScript 5.8

> ⚠️ **重要**: 本项目**不支持游客模式**，所有功能必须登录后使用。

---

## 🚀 开发环境

### 快速命令

```bash
# 开发模式 (推荐)
npm run dev              # Turbopack 热重载，端口 3000

# 生产构建 (仅部署时)
npm run build            # 类型检查 + 生产构建
npm run lint             # ESLint 代码检查
```

> ⚠️ **不要在开发时运行 `npm run build`**，这会切换到生产模式，破坏热重载。

---

## � 产品视图架构

### 三大核心视图

项目采用**三视图架构**，覆盖完整的影视创作流程：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ViewSwitcher (视图切换器)                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│   │   故事构思       │  │   图片生成       │  │   视频输出       │             │
│   │   (Planning)    │  │   (Canvas)      │  │   (Timeline)    │             │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│            │                    │                    │                      │
│   剧本分镜脚本阶段    →    分镜图片生成    →    视频生成与预览                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 视图 | 核心功能 | 交互模式 | 对应组件 |
|------|----------|----------|----------|
| **故事构思** (Planning) | 剧本创作、场景规划、角色地点提取 | **纯 Agent 模式** | `PlanningView.tsx`, `PlanningChat.tsx` |
| **图片生成** (Canvas) | 无限画布、分镜编排、Grid 图片生成 | Agent + Pro 双驱动 | `InfiniteCanvas.tsx`, `RightPanel.tsx` |
| **视频输出** (Timeline) | 视频预览、Sora 任务队列、时间轴编辑 | Agent + Pro 双驱动 | `TimelineView.tsx`, `LeftSidebarNew.tsx` |

### Agent + Pro 双驱动模式

**Canvas** 和 **Timeline** 视图支持两种交互模式切换：

| 模式 | 入口 | 特点 | 适用场景 |
|------|------|------|----------|
| **Agent 模式** | `AgentPanel.tsx` | 自然语言对话、AI 自动编排、批量操作 | 快速迭代、复杂任务 |
| **Pro 模式** | `ChatPanel.tsx` | 精细参数控制、参考图管理、历史复用 | 精确调整、图生图、视频生成 |

> 📘 **Pro 模式详细架构文档**：[docs/PRO_MODE_ARCHITECTURE.md](./docs/PRO_MODE_ARCHITECTURE.md)

```typescript
// RightPanel.tsx 中的模式切换
const { controlMode, setControlMode } = useProjectStore();
// controlMode: 'agent' | 'pro'

// 两个模式通过右侧面板切换，共享选中分镜状态
{controlMode === 'agent' ? <AgentPanel /> : <ChatPanel />}
```

---

## 🖼️ 故事构思视图 (Planning)

### 功能概述

| 功能 | 说明 | 实现 |
|------|------|------|
| **剧本输入** | 粘贴或输入原始剧本 | 文本编辑区 |
| **AI 分镜生成** | 自动拆分场景和分镜 | `useAIStoryboard` Hook |
| **角色提取** | 自动识别角色并创建 | `planningIntentService.ts` |
| **地点提取** | 自动识别地点并创建 | `planningIntentService.ts` |
| **分镜预览** | 实时预览生成的分镜结构 | `StoryboardEditor.tsx` |

### Planning 模式限制

> ⚠️ **Planning 频道禁止调用图片/视频生成工具**，仅支持结构化操作（分镜拆解、角色地点提取），避免提前消耗资源。

---

## 🏛 图片生成视图 (Canvas)

### 无限画布

| 功能 | 说明 |
|------|------|
| **缩放** | 50%-200%，支持滚轮和按钮 |
| **平移** | 拖拽画布移动视野 |
| **场景分组** | 分镜按场景分组显示 |
| **分镜卡片** | 显示分镜信息、状态、缩略图 |
| **智能排列** | 基于画面比例自适应网格 |

### RightPanel (Agent + Pro)

| 功能 | Agent 模式 | Pro 模式 |
|------|------------|----------|
| **图片生成** | 自然语言描述 → AI 选择模型和参数 | 手动选择模型、参考图、分辨率 |
| **Grid 生成** | `"生成一个 3x3 Grid"` | 选择 Grid 尺寸、样式预设 |
| **批量操作** | `"批量生成场景3的所有分镜图片"` | 不支持 |
| **图片编辑** | 描述修改需求 | 上传图片 + 编辑指令 |

---

## 🎥 视频输出视图 (Timeline)

### 核心功能

| 功能 | 说明 |
|------|------|
| **视频预览** | 大画面视频播放器，支持自动切镜 |
| **进度条** | 拖拽跳转，自动匹配对应分镜 |
| **任务队列** | Sora/Vidu 任务状态监控 |
| **分镜导航** | 左侧分镜列表，点击跳转 |

### 视频视图下的 Agent + Pro

在 Timeline 视图中，右侧面板同样支持双模式：

| 模式 | 功能重点 |
|------|----------|
| **Agent** | `"用 Sora 生成分镜 14-16"`、`"批量生成所有视频"` |
| **Pro** | 选择分镜、配置视频参数、查看生成历史 |

---

## 🏛 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           前端层 (Frontend)                                   │
│   React 19 + Zustand + Tailwind CSS                                          │
│   三视图切换 (Planning/Canvas/Timeline) + Agent/Pro 双模式                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────────┐
│                           API 路由层 (25+ 端点)                               │
│   Next.js App Router (src/app/api/)                                          │
│   auth-middleware.ts (认证/积分/白名单) + dataService (统一数据层)              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────────┐
│                           服务层 (22+ 服务文件)                               │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│   │   AgentService    │  │   GeminiService   │  │ VolcanoEngineService│     │
│   │   (AI 推理/FC)    │  │   (图片/Grid)     │  │  (SeeDream/SeeDance)│     │
│   └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│   │  SoraOrchestrator │  │  KaponaiService   │  │   JimengService   │       │
│   │   (视频编排)      │  │   (Sora API)      │  │   (即梦集成)       │       │
│   └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│   │   ViduService     │  │ ViduTaskManager   │  │ CharacterService  │       │
│   │   (Vidu API)      │  │   (任务管理)      │  │   (角色一致性)     │       │
│   └───────────────────┘  └───────────────────┘  └───────────────────┘       │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────────┐
│                           数据层 (Data Layer)                                │
│   dataService.ts (统一数据服务) + storageService.ts (R2 存储)                 │
│   ┌─────────────────────────────┐       ┌─────────────────────────────┐     │
│   │    Supabase PostgreSQL      │       │       Cloudflare R2         │     │
│   │    (结构化数据 + URL)       │       │      (媒体文件存储)          │     │
│   └─────────────────────────────┘       └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 核心服务文件

| 分类 | 服务 | 文件路径 | 职责 |
|------|------|----------|------|
| **Agent** | Agent 核心 | `agentService.ts` | AI 推理、Function Calling、对话管理 |
| | 工具执行 | `agentTools.ts` | 工具分发和执行逻辑 |
| | 工具定义 | `agentToolDefinitions.ts` | 28 个工具 JSON Schema |
| | 并行执行器 | `parallelExecutor.ts` | 多工具并行执行（含 Vidu） |
| **图片生成** | Gemini 服务 | `geminiService.ts` | Grid 多视图、图片分析、编辑 |
| | 火山引擎 | `volcanoEngineService.ts` | SeeDream 图片、SeeDance 视频 |
| | 即梦服务 | `jimengService.ts` | 中文优化图片生成 |
| **视频生成** | Sora 编排器 | `SoraOrchestrator.ts` | Sora 全流程编排、并行提交 |
| | Kaponai 服务 | `KaponaiService.ts` | Sora API 底层封装 |
| | 角色一致性 | `CharacterConsistencyService.ts` | 角色注册与参考视频 |
| | Vidu 服务 | `ViduService.ts` | Vidu 视频 API 封装 |
| | Vidu 任务 | `ViduTaskManager.ts` | 任务创建、状态查询、R2 转存 |
| **Planning** | 意图分析 | `planningIntentService.ts` | 剧本分析、角色地点提取 |
| | 剧本服务 | `storyboardService.ts` | 分镜生成与解析 |

---

## 🎭 认证与积分系统

### 认证流程

```typescript
// 所有 AI API 路由必须调用 authenticateRequest
const authResult = await authenticateRequest(request);
if ('error' in authResult) return authResult.error;

// 自动执行链：JWT 验证 → Profile → 白名单 → 积分
```

### 角色与权限

| 角色 | 说明 | 积分策略 |
|------|------|----------|
| **Admin** | 管理员 | 免费使用 (`ADMIN_FREE = true`) |
| **VIP** | VIP 用户 | 8 折优惠 (`VIP_DISCOUNT_RATE = 0.8`) |
| **User** | 普通用户 | 标准积分消耗 |

### 积分消耗标准

> 1 积分 ≈ 0.1 元，支持环境变量覆盖：`CREDITS_<操作名>=值`

| 操作 | 积分 | 说明 |
|------|------|------|
| `GEMINI_GRID` | 20 | Grid 多视图生成 (2x2/3x3) |
| `GEMINI_IMAGE` | 10 | Gemini 单图 (2K) |
| `GEMINI_TEXT` | 3 | 文本生成 |
| `GEMINI_ANALYZE` | 3 | 图片分析 |
| `GEMINI_EDIT` | 10 | 图片编辑 |
| `SEEDREAM_GENERATE` | 3 | SeeDream 4.5 单图 |
| `VOLCANO_VIDEO` | 50 | SeeDance 视频生成 |
| `VIDU_720P` | 2/秒 | Vidu 720p 视频 |
| `VIDU_1080P` | 4/秒 | Vidu 1080p 视频 |

---

## 🤖 Agent 工具系统

### 工具列表 (28 个)

Agent 通过 Function Calling 调用工具，支持**并行执行**：

```typescript
// parallelExecutor.ts
const parallelizableByTarget = new Set([
  'generateShotsVideo',    // 不同分镜范围可并行
  'generateSceneVideo',    // 不同场景可并行
  'generateShotImage',     // 不同镜头可并行
]);
// Vidu 视频生成也使用相同的并行机制
```

#### 查询类工具 (4)

| 工具名 | 描述 |
|--------|------|
| `getProjectContext` | 获取项目完整上下文 |
| `getSceneDetails` | 获取场景详情 |
| `getShotDetails` | 获取分镜详情 |
| `searchScenes` | 搜索场景 |

#### 创建/更新类工具 (8)

| 工具名 | 描述 |
|--------|------|
| `createScene` | 创建新场景 |
| `updateScene` | 更新场景信息 |
| `addShots` | 添加分镜 |
| `updateShot` | 更新分镜信息 |
| `addCharacter` | 添加新角色 |
| `updateCharacter` | 更新角色信息 |
| `addLocation` | 添加新地点 |
| `updateLocation` | 更新地点信息 |

#### 删除类工具 (7)

| 工具名 | 描述 |
|--------|------|
| `deleteScene` | 删除单个场景 |
| `deleteScenes` | 批量删除场景 |
| `deleteShot` | 删除单个分镜 |
| `deleteShots` | 批量删除分镜 |
| `deleteCharacter` | 删除单个角色 |
| `deleteCharacters` | 批量删除角色 |
| `deleteLocations` | 批量删除地点 |

#### 图片生成工具 (5)

| 工具名 | 描述 |
|--------|------|
| `generateShotImage` | 生成单个分镜图片 |
| `batchGenerateSceneImages` | 批量生成场景图片 |
| `batchGenerateProjectImages` | 批量生成项目图片 |
| `generateCharacterThreeView` | 生成角色三视图 |
| `generateLocationImages` | 批量生成地点参考图 |

#### 视频生成工具 (4)

| 工具名 | 描述 | 并行支持 |
|--------|------|----------|
| `generateSceneVideo` | 生成场景 Sora 视频 | ✅ 不同场景可并行 |
| `generateShotsVideo` | 生成指定分镜 Sora 视频 | ✅ 不同分镜范围可并行 |
| `batchGenerateProjectVideosSora` | 批量生成 Sora 视频 | 串行（内部并行提交） |
| `generateViduVideo` | 生成 Vidu 视频 | ✅ 不同分镜可并行 |

### Sora/Vidu 工具选择规则

| 用户意图 | 正确工具 | 参数示例 |
|----------|----------|----------|
| "分镜14用sora生成" | `generateShotsVideo` | `globalShotIndexes: [14]` |
| "20-23分镜重新生成" | `generateShotsVideo` | `globalShotIndexes: [20, 21, 22, 23]` |
| "整个项目用 Sora 生成" | `batchGenerateProjectVideosSora` | `force: true` |
| "分镜5用 Vidu 生成" | `generateViduVideo` | `shotId: "xxx"` |

---

## 🎥 视频生成架构

### Sora 核心流程

```
1. 角色注册 → 2. 场景拆分 → 3. Prompt 组装 → 4. 任务提交 → 5. 状态轮询 → 6. R2 持久化
```

| 设计决策 | 说明 |
|----------|------|
| **动态比例双轨制** | 角色注册跟随源图比例，正片跟随项目设置 |
| **智能拆分** | >15s 场景自动拆分 (Greedy Packing) |
| **并行任务提交** | 跨场景/多镜头 `Promise.all` 并行 |
| **多镜头任务映射** | `sora_tasks.shot_ids` 记录覆盖分镜 |

### Vidu 核心流程

```
1. 图片获取 → 2. 参数校验 → 3. 积分预扣 → 4. 任务提交 → 5. 状态轮询 → 6. R2 持久化
```

| 特性 | 说明 |
|------|------|
| **模式** | img2video, start-end2video (首尾帧), reference2video |
| **时长** | 1-10 秒可选 |
| **分辨率** | 720p (2分/秒)、1080p (4分/秒) |
| **并行执行** | Agent 模式下支持多分镜并行生成 |

### 视频任务统一表 (sora_tasks)

| 字段 | 说明 |
|------|------|
| `provider` | 提供商：`sora`, `vidu`, `jimeng`, `volcano`, `runway` |
| `status` | 状态：`queued`, `processing`, `completed`, `failed`, `cancelled` |
| `generation_params` | 提供商特定参数 (JSONB) |
| `kaponai_url` | 提供商临时链接 (24h 过期) |
| `r2_url` | R2 持久化链接 |
| `shot_ids` | 多镜头任务覆盖的分镜 ID 列表 |

---

## 💾 数据存储架构

### 核心原则

> ⚠️ **Supabase 绝对不存储媒体文件本身，只存储 URL 引用！**

| 存储 | 用途 | 内容 |
|------|------|------|
| **Supabase PostgreSQL** | 结构化数据 | 用户、项目、场景、分镜、聊天历史、任务 |
| **Cloudflare R2** | 媒体文件 | 图片、视频、音频、Grid 切片 |

### 数据表概览

| 表名 | 用途 |
|------|------|
| `profiles` | 用户信息、积分余额、角色 |
| `projects` | 项目元数据 |
| `scenes` | 场景数据 |
| `shots` | 分镜数据 |
| `characters` | 角色数据 |
| `locations` | 地点数据 |
| `audio_assets` | 音频资源 |
| `chat_messages` | AI 对话历史 (三级层级) |
| `sora_tasks` | 视频任务状态 (多提供商统一) |

---

## 📁 项目结构

```
src/
├── app/
│   ├── api/                    # API 路由 (25 个目录)
│   │   ├── admin/              # 管理后台
│   │   ├── agent/              # Agent 对话
│   │   ├── sora/               # Sora (10 个子端点)
│   │   ├── vidu/               # Vidu (generate/status/cancel)
│   │   ├── gemini-*/           # Gemini 端点
│   │   ├── jimeng/             # 即梦图片
│   │   ├── seedream*/          # SeeDream 图片
│   │   └── supabase/           # 数据库网关
│   └── project/[id]/           # 项目编辑页
│       └── ProjectEditorClient.tsx  # 三视图容器
├── components/
│   ├── agent/                  # AgentPanel
│   ├── canvas/                 # InfiniteCanvas
│   ├── chat/                   # ChatPanel + Pro 模式组件
│   ├── director/               # PlanningView, PlanningChat
│   ├── layout/                 # TimelineView, ViewSwitcher, RightPanel
│   └── ...
├── hooks/
│   ├── agent/                  # useAgent
│   ├── chat/                   # useChatHistory, useChatGeneration, useAutoReference
│   ├── generation/             # useAIStoryboard, useJimengGeneration
│   └── sora/                   # useSoraTaskManager, useSoraCharacter
├── services/                   # 22 个服务文件
│   ├── agentService.ts
│   ├── agentToolDefinitions.ts
│   ├── parallelExecutor.ts
│   ├── SoraOrchestrator.ts
│   ├── ViduService.ts
│   ├── ViduTaskManager.ts
│   └── tools/                  # 7 个工具实现文件
├── lib/
│   ├── dataService.ts
│   ├── storageService.ts
│   └── auth-middleware.ts
└── store/
    └── useProjectStore.ts
```

---

## 🔑 核心开发规范

### 数据操作

```typescript
// ✅ 正确：统一数据层
import { dataService } from '@/lib/dataService';
await dataService.saveProject(project);

// ❌ 错误：不要直接调用底层客户端
import { supabase } from '@/lib/supabase/client';
```

### 工具并行执行

```typescript
import { ParallelExecutor } from '@/services/parallelExecutor';
const executor = new ParallelExecutor(project, storeCallbacks, onProgress, userId);
const results = await executor.execute(toolCalls);
// Vidu、Sora 视频生成工具自动并行执行
```

---

## ⚠️ 严禁行为

| 严禁 | 原因 |
|------|------|
| ❌ 客户端暴露 API Key | 安全风险 |
| ❌ 跳过白名单检查 | 权限控制 |
| ❌ 直接修改 `project.chatHistory` | 已迁移至 `chat_messages` 表 |
| ❌ 轮询使用同步阻塞 | Serverless 超时 |
| ❌ 存储 Base64 到 Supabase | 必须上传 R2 |
| ❌ Planning 模式调用生成工具 | 消耗资源，需切换到 Canvas |

---

## 📋 关键设计决策

| 决策 | 说明 |
|------|------|
| **三视图架构** | Planning → Canvas → Timeline，完整覆盖创作流程 |
| **Agent + Pro 双驱动** | 每个视图都支持 AI 对话和精细控制 |
| **工具并行执行** | Sora/Vidu 生成工具可并行，提升效率 |
| **视频任务统一表** | `sora_tasks` 支持多提供商扩展 |
| **归属校验** | 所有任务操作验证 `user_id` |
| **纯云端存储** | 不支持游客/本地模式 |
| **受控内测制** | 需开启 `is_whitelisted` |

---

## 🔄 AI 模型集成

| 模型 | 用途 | 服务文件 |
|------|------|----------|
| **Gemini 3 Flash** | Agent 推理、Grid、图片分析 | `geminiService.ts` |
| **火山引擎 SeeDream** | 高质量图片生成 | `volcanoEngineService.ts` |
| **火山引擎 SeeDance** | 图生视频 | `volcanoEngineService.ts` |
| **Sora 2 (Kaponai)** | 专业视频、角色一致性 | `SoraOrchestrator.ts` |
| **Vidu (Kaponai)** | 快速图生视频 | `ViduService.ts` |
| **即梦 (Jimeng)** | 中文优化图片 | `jimengService.ts` |

---

**最后更新**: 2026-01-31  
**版本**: v3.9.2 (Vidu 集成 + 三视图架构文档 + 并行执行说明)
