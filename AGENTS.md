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

## 🎨 UI/UX 设计哲学 (2026-02 更新)

本项目采用 **"Film-Grade Black & White" (电影级黑白)** 美学设计系统：

- **核心色调**：极致的黑白灰 (Zinc) 基调，移除多余的品牌色干扰，让内容（分镜图）成为绝对主角。
- **高对比交互**：关键操作按钮（如“生成”）强制采用 **黑底白字** (Dark Mode 下白底黑字)，确保在任何背景下都具备最高可读性。
- **玻璃拟态 (Glassmorphism)**：大面积使用背景模糊 (`backdrop-blur`) 与半透明层级，营造现代、轻盈的悬浮感。
- **精细交互**：
  - **主题适配 (Theme Adaptability)**：登录页 (Login Page) 全面支持明/暗模式自动切换，文字与背景对比度经过 WCAG 标准校准，确保在任何光照环境下都清晰可见。
  - **Pro 模式悬浮**：图片悬浮时采用 **内描边 (1px Inset Border)** + **1.1x 缩放**，移除厚重边框，提供更现代的沉浸式预览体验。
  - **侧边栏折叠**：无缝的宽度过渡与 UI 响应。
  - **Tooltip 系统**: 使用 React Portal 渲染到 `document.body`,确保在任何滚动容器中都能正确显示 (例如即梦模型说明)。
  - **下拉菜单交互**: 移除全屏遮罩层 (Portal Mask)，改用原生 `window.addEventListener('click')` 全局监听，彻底解决 z-index 穿透和菜单无法点击的问题。
  - **状态指示器**: 简约的圆点设计 - 绿色(完成)、黄色脉冲(处理中)、红色(错误)、灰色(草稿)。

---

##  产品视图架构

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

### Pro 模式参考图要点（更新）

- **首尾帧**：进入 `start-end2video` 时自动把分镜图写入首帧状态（真实 state），删除后不再显示虚影。
- **参考生视频**：手动参考图优先，`@角色/@场景` 自动检测补齐；列表为空时才投影分镜图。
- **交互解耦**：拖拽/上传逻辑集中到 `useChatReferenceInteractions.ts`，`ChatPanel.tsx` 更专注编排。
- **跨分镜隔离**：切换分镜会重置 Vidu/Sora 参考图状态，避免污染下一镜头。
- **聊天历史加载**：默认加载最近 30 条，向上滚动加载更多；首次进入自动滚到底部。
- **聊天滚动优化**：通过 `useChatScroll` hook 统一管理滚动行为（首次加载/媒体加载/分页）。
 - **状态稳定性 (Fix)**：参考图状态通过 `useRef` + 版本锁管理，彻底解决闭包陷阱导致的删除失效。

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

### 核心服务文件 (22+)

| 分类 | 服务 | 文件路径 | 职责 |
|------|------|----------|------|
| **Agent** | Agent 核心 | `agentService.ts` | AI 推理、Function Calling、对话管理 |
| | 工具执行 | `agentTools.ts` | 工具分发和执行逻辑 |
| | 工具定义 | `agentToolDefinitions.ts` | 28 个工具 JSON Schema |
| | 并行执行器 | `parallelExecutor.ts` | 多工具并行执行（含 Vidu） |
| | 上下文构建 | `contextBuilder.ts` | Agent 对话上下文组装 |
| | 会话管理 | `sessionManager.ts` | 多轮对话会话持久化 |
| **图片生成** | Gemini 服务 | `geminiService.ts` | Grid 多视图、图片分析、编辑 |
| | 火山引擎 | `volcanoEngineService.ts` | SeeDream 图片、SeeDance 视频 |
| | 即梦服务 | `jimengService.ts` | 中文优化图片生成 |
| | R2 上传 | `r2-server-upload.ts` | 服务端上传、Grid 切片、预签名 URL 生成 |
| **视频生成** | Sora 编排器 | `SoraOrchestrator.ts` | Sora 全流程编排、并行提交 |
| | Sora 提示词 | `SoraPromptService.ts` | Sora 专用提示词生成 |
| | 批量 Sora | `BatchSoraService.ts` | 批量视频生成 |
| | Kaponai 服务 | `KaponaiService.ts` | Sora API 底层封装 |
| | 角色一致性 | `CharacterConsistencyService.ts` | 角色注册与参考视频 |
| | Vidu 服务 | `ViduService.ts` | Vidu 视频 API 封装 |
| | Vidu 任务 | `ViduTaskManager.ts` | 任务创建、状态查询、R2 自动转存 |
| | RunningHub | `RunningHubService.ts` | ComfyUI 工作流接入 |
| | T8Star | `T8StarService.ts` | T8Star 视频 API |
| **数据层** | 数据服务 | `dataService.ts` | 统一数据 CRUD |
| | 存储服务 | `storageService.ts` | R2 上传/下载 |
| | 资产服务 | `AssetService.ts` | 资产元数据管理 |
| | 资产日志 | `assetLogService.ts` | 转存日志、失败重试查询 |
| | 迁移服务 | `migrationService.ts` | 数据迁移工具 |
| **基础设施** | 任务队列 | `TaskQueueService.ts` | 并发限制、优先级队列 |
| | API 响应 | `api-response.ts` | 标准化错误响应格式 |
#### Profile 自动创建

用户首次登录时,系统自动创建 Profile:
- 默认 `credits = 0`、`role = 'user'`、`is_whitelisted = false`
- 若无头像,前端生成 DiceBear 默认头像(仅前端显示,不写数据库)
- 通过 `supabase/user_management.sql` 中的触发器实现

#### 登录流程优化 (2026-02 Final)
- **Hybrid Auth 策略**: 
  - **Proxy-First**: `getUserProfile` 优先使用 API 代理 (`fetchProfileViaProxy`) 绕过 Client Session 水合延迟。
  - **Smart Fallback**: Cookie 失效时，尝试短超时 (800ms) 从 Supabase 持久化 Session 恢复，避免无限等待。
- **竞态条件防护**: 引入 `activeUserIdRef` 锁机制，防止快速切换账号或登出时异步请求污染全局状态。
- **非阻塞式 UX**: 登录页禁用乐观 UI 强制等待验证，非登录页立即响应，消除"闪烁"感。
- **默认头像策略**: 前端生成 DiceBear 头像仅用于显示，不再触发 SQL UPDATE，从根本上杜绝 RLS 死锁。
- **RLS 策略修复**: 配合 `fix_avatar_upload_rls.sql` 实现最小权限原则。

#### 头像上传优化 (2026-02)

- **简化流程**: 移除 `Auth.updateUser` 调用,直接更新 `profiles` 表
- **详细日志**: 添加 11 步上传日志 (`[Avatar Upload]`),方便调试
- **失败处理**: profiles 表更新失败时立即抛出异常,防止闪回
- **缓存破坏**: URL 添加 `?t=${Date.now()}` 时间戳防止浏览器缓存
- **Optimistic UI**: 立即显示本地预览,后台异步上传和刷新
| | 认证中间件 | `auth-middleware.ts` | JWT 验证、积分扣除 |
| | Supabase 事务 | `supabase/transactions.ts` | 批量原子操作 |
| | 视频转存 | `video-transfer.ts` | 统一 R2 转存（带重试） |
| | 日志服务 | `logService.ts` | 结构化日志 |
| **Planning** | 意图分析 | `planningIntentService.ts` | 剧本分析、角色地点提取 |
| | 剧本服务 | `storyboardService.ts` | 分镜生成与解析 |

### Hook 架构 (22 个)

#### Chat Hook (12)

| Hook | 文件 | 职责 |
|------|------|------|
| `useChatGeneration` | `hooks/chat/useChatGeneration.ts` | 生成请求调度、消息处理 |
| `useChatHistory` | `hooks/chat/useChatHistory.ts` | 历史加载、分页、删除 |
| `useChatScroll` | `hooks/chat/useChatScroll.ts` | 智能滚动（首次/媒体/分页） |
| `useChatActions` | `hooks/chat/useChatActions.ts` | 恢复状态、重用图片 |
| `useChatModals` | `hooks/chat/useChatModals.ts` | 模态框状态管理 |
| `useChatReferenceInteractions` | `hooks/chat/useChatReferenceInteractions.ts` | 拖拽/上传交互封装 |
| `useApplyVideoToShot` | `hooks/chat/useApplyVideoToShot.ts` | 视频应用到分镜 |
| `useAutoReference` | `hooks/chat/useAutoReference.ts` | @提及自动检测参考图 |
| `useVideoModeReferences` | `hooks/chat/useVideoModeReferences.ts` | 视频模式参考图状态 |
| `useStartEndFrames` | `hooks/chat/useStartEndFrames.ts` | Vidu 首尾帧管理 |
| `useVideoReferences` | `hooks/chat/useVideoReferences.ts` | 各模式独立参考图状态 |
| `useReferenceCallbacks` | `hooks/chat/useReferenceCallbacks.ts` | 参考图操作回调 |

#### Sora Hook (5)

| Hook | 文件 | 职责 |
|------|------|------|
| `useSoraConfig` | `hooks/sora/useSoraConfig.ts` | Sora 参数状态（模型/时长/比例） |
| `useSoraGeneration` | `hooks/sora/useSoraGeneration.ts` | Sora 生成流程 |
| `useSoraTaskManager` | `hooks/sora/useSoraTaskManager.ts` | 任务批量轮询 (Batch)、状态同步 |
| `useSoraCharacter` | `hooks/sora/useSoraCharacter.ts` | 角色注册与一致性 |
| `useSoraVideoMessages` | `hooks/sora/useSoraVideoMessages.ts` | 视频消息处理 |

#### Generation Hook (5)

| Hook | 文件 | 职责 |
|------|------|------|
| `useViduGeneration` | `hooks/generation/useViduGeneration.ts` | Vidu 生成流程 |
| `useJimengGeneration` | `hooks/generation/useJimengGeneration.ts` | 即梦生成流程 |
| `useAIStoryboard` | `hooks/generation/useAIStoryboard.ts` | AI 分镜生成 |
| `useAssetGeneration` | `hooks/generation/useAssetGeneration.ts` | 资产批量生成 |
| `useThreeViewGeneration` | `hooks/generation/useThreeViewGeneration.ts` | 角色三视图生成 |


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
| `SORA2_PRO_15S` | 50 | Sora 2 Pro 15s |
| `SORA2_PRO_25S` | 100 | Sora 2 Pro 25s |

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

### 🛠 管理端修复工具

- `POST /api/admin/fix-direct-generation-history`
  - 支持 `provider`/`providers` 过滤（如 `vidu`）
  - 补转存 R2 + 补写历史 & 聊天记录

### 视频任务统一表 (sora_tasks)

| 字段 | 说明 |
|------|------|
| `provider` | 提供商：`sora`, `vidu`, `jimeng`, `volcano`, `runway` |
| `status` | 状态：`queued`, `processing`, `completed`, `failed`, `cancelled` |
| `generation_params` | 提供商特定参数 (JSONB) |
| `kaponai_url` | 提供商临时链接 (24h 过期) |
| `r2_url` | R2 持久化链接 |
| `shot_ids` | 多镜头任务覆盖的分镜 ID 列表 |

### 批量轮询机制 (v3.9.6)

为避免频繁请求和优化性能，Sora/Vidu 任务状态采用**批量轮询**：

```typescript
// POST /api/sora/status/batch
// 一次请求同时查询多个任务状态
const response = await fetch('/api/sora/status/batch', {
    method: 'POST',
    body: JSON.stringify({ taskIds: ['task1', 'task2', ...] })
});
// 返回 Map<taskId, TaskStatus>
```

| 特性 | 说明 |
|------|------|
| **批量查询** | 单次 API 调用可查询 60+ 任务 |
| **自动转存** | 任务完成时自动触发 R2 转存 |
| **失败记录** | 转存失败写入 `asset_logs` 供后台追踪 |
| **客户端缓存** | `useSoraTaskManager` 使用 Map 索引加速查询 |

### Cron 定时任务 (v4.0.1 异步架构)
 
 为解决 Serverless 函数超时问题，已重构为**双阶段异步架构**：
 
 | Cron 路由 | 触发时间 | 功能与特性 |
 |-----------|----------|------------|
 | `/api/cron/check-sora-status` | 每 5 分钟 | **轻量轮询**：仅查询 API 状态并更新 DB。若任务完成，仅标记为 `pending_upload`，**不执行耗时上传**。毫秒级响应。 |
 | `/api/cron/retry-transfers` | 每 5 分钟 | **重型工兵**：专门处理 `pending_upload` 状态及失败的任务。每次处理 5-10 个，负责下载视频并上传 R2。 |
 
 ```typescript
 // vercel.json
 {
   "crons": [
     { "path": "/api/cron/check-sora-status", "schedule": "*/5 * * * *" },
     { "path": "/api/cron/retry-transfers", "schedule": "*/5 * * * *" }
   ]
 }
 ```
 
 ### 事务原子性 (v4.0.1)
 
 核心批量操作已迁移至 **PostgreSQL RPC (存储过程)**，确保数据库级原子性：
 
 - `delete_scene_atomic(scene_id)`: 原子删除场景及其下所有分镜。
 - `delete_project_atomic(project_id)`: 原子删除项目及级联数据。
 
 对应的 TypeScript 封装：`src/lib/supabase/transactions.ts` (已移除客户端分步逻辑)。

### Gemini 参考图优化 (v3.9.6)

Gemini 接口采用 **URL 优先 + 自动降级** 策略：

```
首次请求：预签名 URL (fileUri) → 极速
         ↓ 若返回 "Cannot fetch" 错误
自动重试：服务端下载 → Base64 (inlineData) → 稳健
```

| 模式 | 传输方式 | 优势 |
|------|----------|------|
| **URL 模式** | R2 预签名 URL → `fileData.fileUri` | 极速，零服务端负担 |
| **Download 模式** | 服务端下载 → Base64 → `inlineData` | 100% 可靠 |

关键函数：`processReferenceImages(refs, mode: 'url' | 'download')`



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
│   ├── api/                    # API 路由 (41 个端点)
│   │   ├── admin/              # 管理后台 (5 个子端点)
│   │   ├── agent/              # Agent 对话
│   │   ├── sora/               # Sora (10 个子端点)
│   │   ├── vidu/               # Vidu (generate/status/cancel)
│   │   ├── gemini-*/           # Gemini 端点 (6 个)
│   │   ├── jimeng/             # 即梦图片
│   │   ├── seedream*/          # SeeDream 图片
│   │   ├── upload-r2/          # R2 上传
│   │   └── supabase/           # 数据库网关
│   └── project/[id]/           # 项目编辑页
│       └── ProjectEditorClient.tsx  # 三视图容器
├── components/
│   ├── agent/                  # AgentPanel
│   ├── canvas/                 # InfiniteCanvas
│   ├── chat/                   # ChatPanel + Pro 模式组件 (16 个文件)
│   │   ├── ChatPanel.tsx       # Pro 模式主组件
│   │   ├── ChatInput.tsx       # 输入区域
│   │   ├── MessageList.tsx     # 消息列表
│   │   ├── ChatBubble.tsx      # 消息气泡
│   │   ├── GenerationResult.tsx # 生成结果展示
│   │   └── StartEndFrameSelector.tsx  # 首尾帧选择器
│   ├── director/               # PlanningView, PlanningChat
│   ├── layout/                 # TimelineView, ViewSwitcher, RightPanel
│   └── ...
├── hooks/                      # 自定义 Hooks (18 个文件)
│   ├── agent/
│   │   └── useAgent.ts         # Agent 对话逻辑
│   ├── chat/                   # Pro 模式 Hooks (8 个)
│   │   ├── useChatHistory.ts   # 消息历史加载与缓存
│   │   ├── useChatScroll.ts    # 聊天滚动管理
│   │   ├── useChatGeneration.ts # 生成逻辑核心
│   │   ├── useAutoReference.ts # @提及自动检测
│   │   ├── useVideoReferences.ts # Vidu/Sora 参考图状态
│   │   ├── useStartEndFrames.ts  # 首尾帧管理
│   │   ├── useReferenceCallbacks.ts # 参考图操作回调
│   │   └── useChatReferenceInteractions.ts # 拖拽/上传交互
│   ├── generation/             # AI 生成 Hooks (5 个)
│   │   ├── useAIStoryboard.ts  # 剧本分镜生成
│   │   ├── useJimengGeneration.ts # 即梦图片生成
│   │   ├── useViduGeneration.ts # Vidu 视频生成
│   │   ├── useAssetGeneration.ts # 资产生成
│   │   └── useThreeViewGeneration.ts # 三视图生成
│   └── sora/                   # Sora Hooks (4 个)
│       ├── useSoraTaskManager.ts # 任务状态管理
│       ├── useSoraGeneration.ts  # 视频生成
│       ├── useSoraCharacter.ts   # 角色一致性
│       └── useSoraVideoMessages.ts # 视频消息处理
├── services/                   # 服务层 (28 个文件)
│   ├── agentService.ts
│   ├── agentToolDefinitions.ts
│   ├── parallelExecutor.ts
│   ├── SoraOrchestrator.ts
│   ├── ViduService.ts
│   ├── ViduTaskManager.ts
│   ├── jimengService.ts
│   ├── geminiService.ts
│   └── tools/                  # 7 个工具实现文件
├── lib/
│   ├── dataService.ts          # 统一数据层 (97 个方法)
│   ├── storageService.ts       # R2 存储服务
│   ├── auth-middleware.ts      # 认证中间件
│   ├── video-transfer.ts       # 视频转存工具
│   ├── assetLogService.ts      # 资产日志服务
│   └── cloudflare-r2.ts        # R2 客户端
├── utils/
│   ├── uploadQueue.ts          # 并发上传控制
│   └── fileValidation.ts       # 文件验证
└── store/
    └── useProjectStore.ts      # Zustand 全局状态

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


## 🧠 Skill System (v4.0.2)

本项目引入了 Anthropic 官方 Skills 系统，提升 Agent 的专业能力：

### Frontend Design Skill
- **路径**: `.agent/skills/frontend-design/SKILL.md`
- **来源**: Anthropic 官方 (Claude)
- **功能**: 指导生成高质量、无"AI味"的前端 UI 设计。
- **原则**: 
  - 拒绝平庸字体 (如 Arial)
  - 大胆的色彩与排版
  - 强调动效与空间构图

---

**最后更新**: 2026-02-05
**版本**: v4.0.2 (Login Flow Fix & UI Optimizations)
