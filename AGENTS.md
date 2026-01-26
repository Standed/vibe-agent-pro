# Video Agent Pro - AGENTS 指南

AI 驱动的视频分镜生成与编辑工具 | Next.js 15.1 + React 19 + TypeScript 5.8

---

## 🚀 开发环境提示

### 启动与构建
- **开发模式**: `npm run dev` (启动 Turbopack，支持热重载，端口 3000)
- **⚠️ 不要在开发时运行 `npm run build`** - 这会切换到生产模式，破坏热重载
- **生产构建**: `npm run build` (仅在需要部署或类型检查时运行)
- **代码检查**: `npm run lint` (ESLint 规则检查)

---

## 🏛 核心架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                              │
│   React 19 + Zustand + Tailwind CSS                                  │
│   useProjectStore (状态管理) + useAgent (AI 交互)                      │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────┴─────────────────────────────────────┐
│                         API 路由层 (API Routes)                       │
│   Next.js App Router (src/app/api/)                                   │
│   认证中间件 (auth-middleware.ts) + 统一网关 (supabase/)              │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────┴─────────────────────────────────────┐
│                         服务层 (Services)                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│   │AgentService  │  │GeminiService │  │VolcanoEngineService  │       │
│   │ (AI 推理)    │  │ (图片生成)   │  │  (SeeDream/SeeDance) │       │
│   └──────────────┘  └──────────────┘  └──────────────────────┘       │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│   │SoraOrchestrator│ │KaponaiService│ │JimengService         │       │
│   │ (视频编排)    │  │ (Sora API)   │  │  (即梦集成)          │       │
│   └──────────────┘  └──────────────┘  └──────────────────────┘       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────┴─────────────────────────────────────┐
│                         数据层 (Data Layer)                           │
│   dataService.ts (统一数据服务)                                       │
│   ┌─────────────────────────┐       ┌──────────────────────────┐     │
│   │    Supabase PostgreSQL  │       │    Cloudflare R2         │     │
│   │    (结构化数据 + URL)   │       │   (媒体文件存储)          │     │
│   └─────────────────────────┘       └──────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### 核心服务文件清单

| 服务 | 文件路径 | 职责 |
|------|----------|------|
| **Agent 核心** | `src/services/agentService.ts` | AI Agent 推理、Function Calling |
| **Agent 工具执行** | `src/services/agentTools.ts` | 工具实际执行逻辑 |
| **工具定义** | `src/services/agentToolDefinitions.ts` | 工具 JSON Schema (客户端安全) |
| **Gemini 服务** | `src/services/geminiService.ts` | Grid 多视图生成、图片分析 |
| **火山引擎服务** | `src/services/volcanoEngineService.ts` | SeeDream 图片、SeeDance 视频 |
| **Sora 编排器** | `src/services/SoraOrchestrator.ts` | Sora 视频生成全流程编排 (支持并行提交) |
| **Sora 任务管理** | `src/hooks/useSoraTaskManager.ts` | 统一任务管理 (批量同步、智能排序、总是覆盖) |
| **Kaponai 服务** | `src/services/KaponaiService.ts` | Sora API 底层封装 |
| **角色一致性** | `src/services/CharacterConsistencyService.ts` | 角色注册与参考视频生成 |
| **Sora Prompt** | `src/services/SoraPromptService.ts` | Sora 专用提示词生成 |
> ⚠️ **重要**: 本项目**不支持游客模式**，所有功能必须登录后使用。

### 认证流程

```typescript
// 所有 AI API 路由必须调用 authenticateRequest
const authResult = await authenticateRequest(request);
if ('error' in authResult) return authResult.error;

// 自动执行：JWT 验证 → Profile 创建 → 白名单检查 → 频率限制
```

- `src/middleware.ts` 会在访问层进行最佳努力的 Session 刷新：当 Access Token 接近过期时，使用 Refresh Token 刷新并回写 `supabase-session` Cookie，同时注入 `Authorization` Header 供 API 路由校验。

### 角色系统

| 角色 | 说明 | 积分策略 |
|------|------|----------|
| **Admin** | 管理员 | 免费使用所有功能 (`ADMIN_FREE = true`) |
| **VIP** | VIP 用户 | 8 折优惠 (`VIP_DISCOUNT_RATE = 0.8`) |
| **User** | 普通用户 | 标准积分消耗 |

### 积分消耗标准 (1 积分 ≈ 0.1 元)

```typescript
GEMINI_GRID: 20 积分      // Grid 多视图生成
GEMINI_IMAGE: 10 积分     // Gemini 单图
GEMINI_TEXT/ANALYZE: 3 积分
SEEDREAM_GENERATE: 3 积分
VOLCANO_VIDEO: 50 积分
```

---

## 🤖 Agent 工具列表

Agent 通过 Function Calling 调用以下工具操作项目（共 27 个工具）：

### 查询类工具

| 工具名 | 描述 | 关键参数 |
|--------|------|----------|
| `getProjectContext` | 获取项目完整上下文信息 | - |
| `getSceneDetails` | 获取场景详情 | `sceneId` |
| `getShotDetails` | 获取分镜详情 | `shotId` |
| `searchScenes` | 搜索场景 | `query` |

### 创建/更新类工具

| 工具名 | 描述 | 关键参数 |
|--------|------|----------|
| `createScene` | 创建新场景 | `name`, `description` |
| `updateScene` | 更新场景信息 | `sceneId`, `updates` |
| `addShots` | 添加分镜 | `sceneId`, `count`, `shots[]` |
| `updateShot` | 更新分镜信息 | `shotId`, `updates` |
| `addCharacter` | 添加新角色 | `name`, `description`, `appearance` |
| `updateCharacter` | 更新角色信息 | `characterId`, `updates` |
| `addLocation` | 添加新地点 | `name`, `description` |
| `updateLocation` | 更新地点信息 | `locationId`, `updates` |

### 删除类工具

| 工具名 | 描述 | 关键参数 |
|--------|------|----------|
| `deleteScene` | 删除单个场景 | `sceneId` |
| `deleteScenes` | 批量删除场景 | `sceneIds[]`, `sceneIndexes[]`, `deleteDuplicates` |
| `deleteShot` | 删除单个分镜 | `shotId` |
| `deleteShots` | 批量删除分镜 | `shotIds[]`, `shotIndexes[]`, `deleteDuplicates` |
| `deleteCharacter` | 删除单个角色 | `characterId` |
| `deleteCharacters` | 批量删除角色 | `characterIds[]`, `characterNames[]` |
| `deleteLocations` | 批量删除地点 | `locationIds[]`, `locationNames[]` |

### 图片生成工具

| 工具名 | 描述 | 关键参数 |
|--------|------|----------|
| `generateShotImage` | 生成单个分镜图片 | `shotId`, `mode (seedream/gemini/grid)`, `gridSize`, `force` |
| `batchGenerateSceneImages` | 批量生成场景图片 | `sceneId`, `mode`, `gridSize`, `force` |
| `batchGenerateProjectImages` | 批量生成项目图片 | `mode`, `gridSize`, `force` |
| `generateCharacterThreeView` | 生成角色三视图 | `characterId`, `prompt`, `artStyle` |
| `generateLocationImages` | 批量生成地点参考图 | `locationIds[]`, `model (jimeng/gemini)` |

### 🎨 Gemini Image Editing (v3.5+)
- **Pure Prompt Mode**: When editing an existing image (uploaded or history), the system automatically disables character/location context injection.
- **Instruction**: Use direct commands like "Remove text", "Change background to blue".
- **Reference**: The base image is sent as a reference image.
- **Smart Compression**: Single image editing supports up to 3.5MB / 2.5K resolution.

### 视频生成工具 (Sora)

| 工具名 | 描述 | 关键参数 |
|--------|------|----------|
| `generateSceneVideo` | 生成场景 Sora 视频 | `sceneId` |
| `generateShotsVideo` | 生成指定分镜 Sora 视频 | `sceneId`, `shotIds[]`, `shotIndexes[]`, `globalShotIndexes[]` |
| `batchGenerateProjectVideosSora` | 批量生成 Sora 视频 | `force` |

### Sora 工具选择规则

| 用户意图 | 正确工具 | 参数示例 |
|----------|----------|----------|
| "分镜14用sora重新生成" | `generateShotsVideo` | `globalShotIndexes: [14]` |
| "20-23分镜重新生成" | `generateShotsVideo` | `globalShotIndexes: [20, 21, 22, 23]` |
| "分镜14, 20-23, 33-35" | `generateShotsVideo` | `globalShotIndexes: [14, 20, 21, 22, 23, 33, 34, 35]` |
| "整个项目重新生成" | `batchGenerateProjectVideosSora` | `force: true` |
| "场景2用sora生成" | `generateSceneVideo` | `sceneId: "xxx"` |

---

## 🎥 Sora 视频生成架构

### 核心流程

```
1. 角色注册 → 2. 场景拆分 → 3. Prompt 组装 → 4. 任务提交 → 5. 状态轮询 → 6. R2 持久化
```

### 关键设计决策

| 决策 | 说明 |
|------|------|
| **动态比例双轨制** | 角色注册跟随源图比例，正片生成跟随项目设置 |
| **精简 JSON 协议** | `@username` 作为角色唯一 Key，废弃冗余中文名 |
| **智能拆分** | >15s 场景自动拆分为多段任务 (Greedy Packing) |
| **并行任务提交** | 跨场景/多镜头任务使用 `Promise.all` 并行提交 |
| **智能自动同步** | 任务完成后批量同步到分镜，**Sora 视频总是覆盖** |
| **批量处理优化** | 只对 30s 内的新任务写数据库，避免页面加载时疯狂请求 |
| **Timeline 联动** | 进度条拖拽支持自动切镜，播放状态严格同步 |
| **多镜头任务映射** | `sora_tasks.shot_ids` 记录覆盖分镜，支持单任务对应多镜头 |

### 详细文档
- `docs/sora 在本项目中的架构.md` - Sora 集成完整技术文档

### Pro 模式交互设计 (v3.4+)

| 功能 | 说明 |
|------|------|
| **所见即所得参考图** | 输入框上方的参考图列表即为最终生成使用的参考图，无隐式添加 |
| **双向联动** | 删图自动删文本中的 `@角色`，删文本自动移除参考图 |
| **自动格式化** | 输入普通角色名自动转换为 `@角色` 并出图 |
| **显式引用优先** | 断开分镜描述的隐式关联，只有输入框内容决定参考图 |

### Pro 模式 Grid 生成 (v3.6+)

| 特性 | 说明 |
|------|------|
| **简化版提示词** | 不包含复杂分镜逻辑，适合用户自由创作 |
| **与 Gemini 直出类似** | 只添加 Grid 布局提示词，保持简单 |
| **参考图限制** | 最多 10 张，每张最大 10MB，压缩后每张 4MB 预算 |
| **不影响 Agent** | Agent 模式仍使用 `generateMultiViewGrid`（完整分镜描述） |
| **Grid 历史记录** | 分镜级别 Grid 生成历史自动保存，支持刷新后查看 |

### Pro 模式拖拽交互 (v3.8+)

| 功能 | 说明 |
|------|------|
| **预览图 / Grid 切片拖拽** | 图片预览 Modal 或 Pro 模式生成的图片可直接拖拽到左侧分镜列表 |
| **持久化策略** | 拖拽操作不仅更新前端 `referenceImage`，还会**同步写入**目标分镜的 `generationHistory` |
| **反向拖拽** | 左侧分镜列表的缩略图可拖拽到 Pro 模式输入框，自动添加为参考图 |
| **数据一致性** | 采用 Optimistic UI 更新 + 后台异步保存，确保刷新后历史记录不丢失 |
| **文件拖拽** | 支持直接从文件系统拖拽图片到 Pro 输入框 (`NativeTypes.FILE`) |

### Pro 模式生成架构 (v3.8.1)

| 组件/Hook | 职责 |
|-----------|------|
| `useChatGeneration` | 核心生成 Hook：消息发送、参考图预上传 (带压缩)、乐观更新、后台 R2 上传 |
| `useChatHistory` | 历史记录管理：加载/保存聊天消息、Sora 视频状态合并 |
| `useAutoReference` | 引用管理：`@` 提及检测、自动添加角色/地点参考图、拖拽状态处理 |
| `ChatPanel.tsx` | 纯 UI 组件：渲染消息列表、输入框、拖拽区域 |

**参考图上传流程 (v3.8.1)**:
1. 用户选择/拖拽图片 → 添加到 `uploadedImages` 状态
2. 点击发送 → `useChatGeneration.handleSend()` 触发
3. 图片压缩 (`compressFileToBase64`) → 2048px JPEG
4. 并发上传到 R2 → 获得 URL 列表
5. URL 列表传入 `geminiService` → API Route 服务端拉取图片
6. 生成结果 (Base64) 立即上屏 (乐观更新)
7. 后台异步上传结果到 R2 → 更新消息为持久化 URL


---

## 📁 项目结构速查

```
src/
├── app/
│   ├── api/                    # API 路由 (22+ 端点)
│   │   ├── agent/              # Agent 对话
│   │   ├── sora/               # Sora 相关 (10 个子端点)
│   │   ├── gemini-*/           # Gemini 各功能端点
│   │   ├── jimeng/             # 即梦图片生成
│   │   ├── seedream*/          # SeeDream 图片生成
│   │   ├── admin/              # 管理后台 API
│   │   ├── upload-r2/          # R2 文件上传
│   │   └── supabase/           # 统一数据库网关
│   ├── admin/                  # 管理后台页面
│   ├── auth/                   # 认证页面 (登录/注册)
│   └── project/[id]/           # 项目编辑页
├── components/                 # UI 组件 (13 个目录)
│   ├── agent/                  # Agent 相关组件
│   ├── asset/                  # 资产管理 (角色、地点)
│   ├── auth/                   # 认证组件 (AuthProvider)
│   ├── canvas/                 # 无限画布
│   ├── chat/                   # 聊天界面 + Pro 模式组件
│   ├── director/               # 导演/构思模式
│   ├── grid/                   # Grid 生成 UI
│   ├── jimeng/                 # 即梦集成
│   ├── layout/                 # 布局组件 (侧边栏、面板、设置等)
│   ├── project/                # 项目对话框
│   ├── providers/              # React Context
│   ├── shot/                   # 分镜相关组件
│   └── ui/                     # 通用 UI 组件
├── config/
│   ├── credits.ts              # 积分配置
│   └── users.ts                # 管理员名单
├── hooks/                      # 自定义 Hooks (按功能分组)
│   ├── agent/                  # Agent Hook (useAgent)
│   ├── chat/                   # 聊天面板逻辑 (useChatHistory, useAutoReference)
│   ├── generation/             # AI 生成 (useAIStoryboard, useJimengGeneration...)
│   └── sora/                   # Sora 视频 (useSoraTaskManager, useSoraCharacter...)
├── lib/
│   ├── dataService.ts          # 统一数据服务层
│   ├── storageService.ts       # R2 存储服务
│   ├── auth-middleware.ts      # 认证中间件
│   ├── api-client.ts           # 认证请求客户端
│   └── supabase/               # Supabase 客户端配置
├── services/                   # 业务服务层 (19+ 文件)
│   ├── agentService.ts         # Agent 核心
│   ├── agentToolDefinitions.ts # 工具定义 (28 个工具)
│   ├── SoraOrchestrator.ts     # Sora 编排器
│   └── tools/                  # 工具实现 (7 个文件)
├── store/
│   └── useProjectStore.ts      # Zustand 状态管理
└── types/                      # TypeScript 类型定义
    └── project.ts              # 项目数据模型

scripts/
├── deploy/                     # 部署脚本
├── test/                       # 测试脚本
└── tools/                      # 工具脚本
```

---

## 💾 数据存储架构

### 核心原则

> ⚠️ **Supabase 绝对不存储媒体文件本身，只存储 URL 引用！**

```
✅ 正确：Supabase 只存储 Cloudflare R2 的访问 URL（TEXT 类型）
❌ 错误：Supabase 存储图片/视频/音频的二进制数据或 Base64
```

### 存储分工

| 存储 | 用途 | 内容 |
|------|------|------|
| **Supabase PostgreSQL** | 结构化数据 | 用户、项目、场景、分镜、聊天历史、积分记录 |
| **Cloudflare R2** | 媒体文件 | 图片、视频、音频、Grid 切片 |

### 数据表概览

- `profiles` - 用户信息、积分余额、角色
- `projects` - 项目元数据
- `scenes` - 场景数据
- `shots` - 分镜数据
- `characters` - 角色数据 (支持全局角色)
- `audio_assets` - 音频资源
- `chat_messages` - AI 对话历史 (三级层级: project/scene/shot)
- `sora_tasks` - Sora 任务状态
- `series` - 剧集管理

---

## 🔑 核心开发规范

### 数据操作

```typescript
// ✅ 正确：统一数据层，自动处理云端同步
import { dataService } from '@/lib/dataService';
await dataService.saveProject(project);

// ❌ 错误：不要直接调用底层客户端
import { supabase } from '@/lib/supabase/client';
```

### Agent 请求取消

```typescript
// Agent 对话支持取消（通过 stop() 方法）
const { stop, sendMessage } = useAgent();

// 内部已集成防重复提交逻辑（2秒内相同消息哈希拦截）
```

### 工具并行执行

```typescript
// 使用 ParallelExecutor 执行工具调用
import { ParallelExecutor } from '@/services/parallelExecutor';
const executor = new ParallelExecutor(project, storeCallbacks, onProgress, userId);
const results = await executor.execute(toolCalls);
```

---

## ⚠️ 严禁行为

- ❌ **严禁**在客户端直接暴露或使用 API Key
- ❌ **严禁**跳过白名单检查直接调用 AI 接口
- ❌ **严禁**直接修改 `project.chatHistory`（已迁移至云端 `chat_messages` 表）
- ❌ **严禁**在轮询 API 中使用同步阻塞（`waitForCompletion` 仅限后端长时任务）
- ❌ **严禁**存储 Base64 图片到 Supabase（必须上传 R2 后存储 URL）

---

## 📋 关键设计决策

| 决策 | 说明 |
|------|------|
| **纯云端存储** | 不再支持游客模式/本地存储，所有数据存储在 Supabase |
| **受控内测制** | 默认注册用户无 AI 权限，需管理员手动开启 `is_whitelisted` |
| **请求可取消** | 所有长耗时 AI 请求必须支持 AbortSignal |
| **Grid 场景级** | Grid 生成是场景级别的，切片后手动分配给镜头 |
| **状态自动保存** | Store 变更触发 800ms 防抖保存，无需手动 save |
| **生成历史持久化** | 所有 AI 生成结果（含 Grid/单图/视频）自动保存至历史记录，确保素材可下载 |
| **Serverless 限制** | Sora 长时任务在 Vercel Serverless 环境下会超时，需容器化部署 |
| **Planning 模式限制** | Planning 频道禁止调用图片/视频生成工具，避免提前消耗资源 |

---

## 🔄 AI 模型集成

| 模型 | 用途 | 服务文件 |
|------|------|----------|
| **Gemini 3 Flash** | Agent 推理、Grid 多视图生成、图片分析 | `geminiService.ts` |
| **火山引擎 SeeDream** | 高质量图片生成 | `volcanoEngineService.ts` |
| **火山引擎 SeeDance** | 图生视频 | `volcanoEngineService.ts` |
| **Sora 2 (Kaponai)** | 专业视频生成、角色一致性 | `KaponaiService.ts`, `SoraOrchestrator.ts` |
| **即梦 (Jimeng)** | 中文优化的图像生成 | `jimengService.ts` |

---

## 🎨 Jimeng 集成细节

详见项目中已有的 Jimeng 集成说明（逆向工程自 `n8n-nodes-jimeng`）：

- **核心依赖**: `crc-32`, `image-size`, `crypto`
- **上传流程**: 下载 → 申请 Token → 上传 → 提交确认
- **Blend 模式**: 存在参考图时必须使用 `blend` 模式
- **签名算法**: AWS Signature Version 4 (Service: `imagex`, Region: `cn-north-1`)
- **纯净模式 (Pure Prompt)**: 
    - 当用户在 Pro 模式下编辑图片（图生图）时，系统会自动检测意图。
    - 如果是简单的编辑指令（如“换个背景”），系统会跳过自动提示词增强，直接使用用户指令。
    - 此时会禁用角色/场景上下文注入，避免 AI 过度联想。

### Gemini 直出分辨率选项 (v3.7+)

| 特性 | 说明 |
|------|------|
| **2K/4K 用户可选** | Gemini 直出模式支持用户在 UI 中选择分辨率 |
| **Grid 固定 4K** | Grid 模式保持 4K 高清输出，不受影响 |
| **Agent 模式不变** | Agent 模式继续使用 `generateMultiViewGrid` |

### R2 临时存储 (v3.7+)

| 特性 | 说明 |
|------|------|
| **临时上传端点** | `/api/upload-temp-r2` 用于临时参考图上传 |
| **自动清理** | 上传到 `temp/` 目录，由 R2 生命周期规则 1 天后自动删除 |
| **解除载荷限制** | 大参考图先上传到 R2，只传 URL 给 Gemini API |

---

**最后更新**: 2026-01-26  
**版本**: v3.7.1 (Grid 比例修复 + 首页封面优化)

### v3.7.1 更新日志
1. **Gemini Grid 比例修复**：
    - 解决了 `getAllProjects` 方法硬编码默认设置导致项目设置 (Aspect Ratio) 被忽略的问题。
    - 现在 Pro 模式下的 Grid 生成将正确遵循项目的 21:9 / 16:9 设置。
2. **首页体验优化**：
    - 实现了项目封面的自动提取与自愈：当检测到项目缺失封面时，异步从分镜中提取首张图片并持久化到数据库。
    - 移除了首页过时的“灵感推荐”标签占位符。
3. **基础设施**：
    - 修复了 `saveProject` 在仅更新元数据时可能因空关联数据触发的数据库约束错误 (500 Error)。

### v3.8.0 更新日志
1. **ChatPanel 重构与解耦**：
    - 将 `ChatPanel.tsx` 核心逻辑拆分为 `useChatHistory` (历史记录管理) 和 `useAutoReference` (引用与 At 检测)。
    - 大幅降低组件复杂度，提升可维护性和渲染性能。
2. **双向拖拽支持**：
    - **Pro -> Storyboard**: 支持将生成的 Grid/单图从预览视图直接拖拽到分镜卡片，并自动同步到该分镜的历史记录。
    - **Storyboard -> Pro**: 支持将分镜列表中的缩略图拖拽到 Pro 聊天框，自动识别为参考图。

### v3.8.1 更新日志
1. **Pro Mode 架构重构**：
    - 新增 `useChatGeneration` Hook，将消息发送、图片上传、生成状态管理等核心逻辑从 `ChatPanel.tsx` 中解耦。
    - 实现**乐观更新模式**：生成结果立即上屏 (Base64)，后台静默上传 R2。
    - 实现**参考图 R2 预上传**：本地参考图先压缩上传到 R2，再传 URL 给 API。
2. **前端图片压缩**：
    - 集成 `compressFileToBase64`，所有上传图片自动压缩为 2048px JPEG。
3. **后端 API Route 优化**：
    - 支持从 URL 拉取图片，载荷限制放宽至 20MB，新增 15s 超时保护。
4. **拖拽修复**：
    - 统一处理分镜拖拽和文件拖拽，修复 `ignoredUrls` 状态问题。

---

**最后更新**: 2026-01-27
**版本**: v3.8.1 (Pro Mode 架构重构 + 图片压缩优化)
