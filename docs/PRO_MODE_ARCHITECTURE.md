# Pro 模式 (ChatPanel) 架构文档

> 最后更新：2026-02-02
> 关联文档：[AGENTS.md](/AGENTS.md), [sora 在本项目中的架构.md](/docs/sora%20在本项目中的架构.md)

## 概述

Pro 模式是 video-agent-pro 的核心交互界面，位于 `src/components/chat/ChatPanel.tsx`。它提供了一个类似聊天的界面，用于：

1. **图片生成** - 通过 Gemini/即梦等 AI 生成分镜图
2. **视频生成** - 通过 Vidu/Sora 生成短视频
3. **参考图管理** - 拖拽、上传、复用参考图

---

## 📁 文件结构

```
src/components/chat/
├── ChatPanel.tsx              # 主组件（派生状态管理中心）
├── ChatInput.tsx              # 输入框组件
├── ChatBubble.tsx             # 消息气泡组件
├── DraggableReference.tsx     # 可拖拽参考图组件
├── StartEndFrameSelector.tsx  # 首尾帧选择器（含 ↔️ 切换按钮）
├── ImagePreviewOverlay.tsx    # 图片预览遮罩
├── ReferenceSection.tsx       # 参考图区域组件（纯展示）
├── MessageList.tsx            # 消息列表组件（性能优化）
└── dragTypes.ts               # 拖拽类型定义

src/hooks/chat/
├── useChatGeneration.ts       # 生成请求调度、消息处理
├── useChatHistory.ts          # 聊天历史管理（分页/删除）
├── useChatScroll.ts           # 聊天滚动管理（首次加载/媒体加载/加载更多）
├── useChatActions.ts          # 消息操作回调（恢复/重用）(NEW)
├── useChatModals.ts           # 模态框状态管理 (NEW)
├── useApplyVideoToShot.ts     # 视频应用到分镜逻辑 (NEW)
├── useAutoReference.ts        # 参考图自动检测
├── useVideoModeReferences.ts  # 视频模式参考图状态（派生/删除/移动）(ENHANCED)
├── useChatReferenceInteractions.ts # 拖拽/上传交互封装
├── useStartEndFrames.ts       # 首尾帧状态管理
├── useVideoReferences.ts      # 视频模式参考图状态隔离
└── useReferenceCallbacks.ts   # 参考图操作回调解耦

src/hooks/sora/
├── useSoraConfig.ts           # Sora 参数状态管理 (NEW)
└── useSoraGeneration.ts       # Sora 生成流程

src/hooks/generation/
├── useViduGeneration.ts       # Vidu 生成流程
└── useJimengGeneration.ts     # 即梦生成流程
```

---

## 🎯 核心模式逻辑

### 模式分类

| 模式 | selectedModel | 子模式 | 参考图逻辑 |
|------|---------------|--------|-----------|
| 图片生成 | `gemini-grid`, `gemini-single`, `jimeng`, `seedream` | - | 显示用户添加 + 自动检测 (Auto-Detect) |
| Vidu 图生视频 | `vidu-video` | `img2video` | **投影分镜图** (Derived State) 或 显示手动图 |
| Vidu 首尾帧 | `vidu-video` | `start-end2video` | 分镜图作为**初始化首帧**，删除即空 |
| Vidu 参考生视频 | `vidu-video` | `reference2video` | 显示用户添加 + 自动检测 (Auto-Detect) |
| Sora 视频 | `sora-video` | - | **严格隔离**，仅显示手动上传图 |

### 参考图来源

```typescript
type ActiveReference = {
    url: string;
    source: 'shot_ref' | 'manual_upload' | 'history_ref' | 'auto_detect';
    label?: string;
};
```

| source | 含义 | 来源 |
|--------|------|------|
| `shot_ref` | 分镜图 | Vidu 模式下动态投影的分镜图 |
| `manual_upload` | 手动上传 | 用户上传的图片 |
| `history_ref` | 历史记录 | 从历史消息添加的图片 |
| `auto_detect` | 自动检测 | 从 Prompt 分析出的角色/资产图 |
| `external_url` | 外部拖拽链接 | 浏览器/系统拖拽 URL 进入参考图（支持 URL/TEXT） |

---

## 🔄 视频模式详细逻辑 (v2 - 派生状态)

> 新增：采用派生状态 (Derived State) 避免跨模式数据污染

### 1. Vidu 图生视频 (`img2video`)

```
触发条件：selectedModel === 'vidu-video' && viduMode === 'img2video'

逻辑 (派生状态)：
1. 如果用户没有手动上传任何参考图，且没有删除过分镜图：
   -> 系统会自动**投影** (Project) 当前分镜图作为参考图
2. 如果用户上传了手动参考图：
   -> 投影消失，显示用户上传的图
3. 如果用户删除了投影的分镜图：
   -> 记录删除意图 (isShotRefDeleted)，列表变空
4. 不再直接修改 manualReferenceUrls，彻底杜绝污染 Sora 模式

API 调用：
POST /api/vidu/generate
{
    "mode": "img2video",
    "images": [最终显示列表的第一个URL],
    ...
}
```

### 2. Vidu 首尾帧 (`start-end2video`)

```
触发条件：selectedModel === 'vidu-video' && viduMode === 'start-end2video'

逻辑：
1. 仅在**进入模式**或**切换分镜**时触发初始化
2. 如果首帧为空且分镜有图 -> 自动填入分镜图
3. 移除旧版的 defaultStartFrameUrl 属性 -> 删除首帧后状态为真正的 Null (无虚影)
4. 尾帧必须用户手动上传
5. **发送时** 首尾帧会作为用户消息的参考图展示，确保聊天记录可回放

API 调用：
POST /api/vidu/generate
{
    "mode": "start-end2video",
    "images": [首帧URL, 尾帧URL],
    ...
}
```

### 3. Vidu 参考生视频 (`reference2video`)

```
触发条件：selectedModel === 'vidu-video' && viduMode === 'reference2video'

逻辑：
1. **允许** Prompt 自动检测的参考图 (auto_detect)
2. **允许** 分镜图投影 (如果列表为空)
3. 手动上传优先，自动检测补齐
4. **支持拖拽排序**（包含 auto_detect）
4. 用于提供更丰富的参考上下文

API 调用：
POST /api/vidu/generate
{
    "mode": "reference2video",
    "images": [所有可见参考图URL],
    ...
}
```

### Vidu 状态轮询与 R2 转存

- Pro 模式提交 Vidu 任务后会通过 `/api/sora/status?taskId=...` 轮询状态。
- `/api/sora/status` 内部会调用 `ViduTaskManager.checkAndUpdateTask`：
  - 成功后写入 `kaponai_url` → 触发 `transferToR2` → 更新 `r2_url`。
  - 如果有 `shotId`，会同步 `shots.video_clip`。
- 转存失败会写入 `asset_logs`（operationType: `vidu_video`）用于后台追踪。

### 4. Sora 视频 (`sora-video`)

```
触发条件：selectedModel === 'sora-video'

逻辑 (严格隔离)：
1. **屏蔽** 所有 auto_detect 参考图 (防止 Prompt 干扰)
2. **屏蔽** Vidu 的分镜图投影
3. **只显示** 用户显式手动上传或从历史添加的图片
4. 确保 Sora 模式永远拥有纯净的操作空间
5. **切换分镜时** 参考图会重置，避免跨分镜污染

API 调用：
POST /api/sora
{
    "referenceImages": [手动上传列表],
    ...
}

### Sora 2 / Sora 2 Pro

- `sora-2`：10s / 15s
- `sora-2-pro`：15s / 25s
- 竖屏/横屏分别使用 1024x1792 / 1792x1024
- 转存失败会写入 `asset_logs`（operationType: `sora_video`）
```

---

## 🪝 核心 Hooks

### useChatHistory
位置：`src/hooks/chat/useChatHistory.ts`

功能：
- 加载分镜的聊天历史
- 支持分页加载
- 合并 Sora 视频消息
- 默认只加载最近 30 条，向上滚动加载更多
- 首次进入自动滚到底部（由 ChatPanel 触发）

返回值：
```typescript
{
    messages: ChatPanelMessage[];
    setMessages: (msgs) => void;
    deleteMessage: (id: string) => void;
    isLoading: boolean;
    hasMore: boolean;
}
```

### useChatScroll
位置：`src/hooks/chat/useChatScroll.ts`

功能：
- **首次加载滚动**：切换分镜时自动滚动到消息列表底部
- **媒体加载补偿**：图片/视频加载完成后触发滚动补偿
- **加载更多保持**：向上滚动加载历史时保持滚动位置
- **智能跟随**：新消息到达时，仅在用户靠近底部时自动滚动

返回值：
```typescript
{
    containerRef: React.RefObject<HTMLDivElement>;  // 消息容器 ref
    endRef: React.RefObject<HTMLDivElement>;        // 底部锚点 ref
    handleMediaLoaded: () => void;                  // 媒体加载回调
    beforeLoadMore: () => void;                     // 加载更多前调用
    afterLoadMore: () => void;                      // 加载更多后调用
    scrollToBottom: (behavior?: ScrollBehavior) => void;  // 强制滚动
}
```

### useAutoReference
位置：`src/hooks/chat/useAutoReference.ts`

功能：
- 管理当前活跃的参考图列表
- 支持拖拽排序
- 支持手动上传
 - 输出 `mentionedAssets`（角色/场景命中），供 Vidu reference2video 自动引用

返回值：
```typescript
{
    activeReferences: ActiveReference[];
    setDroppedReferences: (refs) => void;
    manualReferenceUrls: string[];
    setManualReferenceUrls: (urls) => void;
}
```

### useStartEndFrames
位置：`src/hooks/chat/useStartEndFrames.ts`

功能：
- 管理首尾帧状态
- 支持默认首帧

返回值：
```typescript
{
    frames: { startFrame, endFrame };
    setStartFrame: (frame) => void;
    setEndFrame: (frame) => void;
    clearFrames: () => void;
    getFrameUrls: () => [string, string] | null;
}
```

### useChatReferenceInteractions (新增)
位置：`src/hooks/chat/useChatReferenceInteractions.ts`

功能：
- 将拖拽/上传的复杂分支从 `ChatPanel` 中抽离
- 按模式分别写入对应状态（Vidu/Sora/图片）

返回值：
```typescript
{
    handleFileUpload: (e) => void;
    drop: (ref) => void;        // react-dnd drop ref
    isOver: boolean;            // 是否拖拽悬停
}
```

### useChatGeneration
位置：`src/hooks/chat/useChatGeneration.ts`

功能：
- 处理 Gemini/Seedream 图片生成
- 管理生成状态

### useSoraGeneration
位置：`src/hooks/sora/useSoraGeneration.ts`

功能：
- 处理 Sora 视频生成
- 轮询任务状态
- 保存视频结果

### useVideoReferences (新增)
位置：`src/hooks/chat/useVideoReferences.ts`

功能：
- **状态隔离**：为不同视频模式提供独立的参考图状态
- 避免跨模式数据污染

返回值：
```typescript
{
    // Vidu 图生视频（单图）
    viduImg2VideoRef: ActiveReference | null;
    setViduImg2Video: (ref) => void;
    clearViduImg2Video: () => void;
    
    // Vidu 参考生视频（最多 7 张）
    viduReferenceRefs: ActiveReference[];
    addViduReference: (ref) => boolean;
    removeViduReference: (ref) => void;
    moveViduReference: (from, to) => void;
    replaceViduReferences: (refs) => void;
    
    // Sora（单图）
    soraRef: ActiveReference | null;
    setSora: (ref) => void;
    clearSora: () => void;
}
```

### useReferenceCallbacks (新增)
位置：`src/hooks/chat/useReferenceCallbacks.ts`

功能：
- **解耦回调**：将参考图操作回调从 ChatPanel 中提取
- 统一管理添加、删除、移动参考图的逻辑
- 修复闭包问题

返回值：
```typescript
{
    handleAddToReference: (url: string) => void;  // 从历史/外部添加参考图
    handleRemoveReference: (ref) => void;         // 删除参考图
    handleMoveReference: (from, to) => void;      // 拖拽排序
}
```

---

## 📦 组件解耦计划

### 当前问题（已优化）

`ChatPanel.tsx` 经过重构，目前已将渲染逻辑剥离：
1. 消息列表渲染 -> `MessageList.tsx`
2. 参考图管理 -> `ReferenceSection.tsx`

### 解耦目标 (已实现)

```
ChatPanel.tsx (主容器，编排逻辑)
├── MessageList.tsx (消息列表，支持 Memo)
├── ReferenceSection.tsx (参考图区域，支持多模式)
│   ├── DefaultReferenceDisplay (Vidu 投影)
│   ├── StartEndFrameSelector (首尾帧)
│   └── DraggableReferenceList (拖拽列表)
├── ChatInput.tsx (输入框)
└── ImagePreviewOverlay.tsx (预览)
```

---

## 🚀 性能优化

### 已实现

1. **图片懒加载**
   - DraggableReference 使用 `loading="lazy"`
   - 加载时显示骨架屏

2. **React.memo 优化**
   - MessageItem 组件
   - ReferenceSection 组件
   - 自定义比较函数减少重渲染

3. **R2 并发上传控制**
   - 最大并发数 3
   - 指数退避重试
   - 失败不中断其他上传

### 待实现

1. **消息分页加载**
   - 基础结构已就绪
   - 需要添加滚动触发加载

2. **虚拟滚动**
   - 大量消息时考虑使用 react-virtualized

---

## 🔗 相关 API

| API | 用途 |
|-----|------|
| `POST /api/gemini/generate` | Gemini 图片生成 |
| `POST /api/jimeng` | 即梦图片生成 |
| `POST /api/vidu/generate` | Vidu 视频生成 |
| `POST /api/sora` | Sora 视频生成 |
| `POST /api/upload/r2` | R2 图片上传 |

---

## 📋 类型定义

```typescript
// src/types/project.ts

interface ChatPanelMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
    referenceImages?: string[];
    model?: GenerationModel;
    shotId?: string;
    sceneId?: string;
    gridData?: GridData;
    videoUrl?: string;
    metadata?: {
        prompt?: string;
        basePrompt?: string;
        viduTaskId?: string;
        soraTaskId?: string;
        [key: string]: any;
    };
}

type GenerationModel = 
    | 'gemini-grid' 
    | 'gemini-single' 
    | 'jimeng' 
    | 'seedream'
    | 'vidu-video'
    | 'sora-video';
```

---

## ⚠️ 注意事项

1. **分镜图同步**：通过派生状态投影，**禁止**直接修改 `manualReferenceUrls`
2. **Sora 独立性**：严格过滤，确保 Sora 模式不含自动生成的噪音
3. **首尾帧验证**：提交前必须验证首尾帧都已设置
4. **类型安全**：`FrameImage.source` 必须准确反映来源

---

## 🧪 测试清单

### 图生视频
- [ ] 分镜有图片且未被删除时，自动投影显示
- [ ] 切换到 Sora 模式，投影消失
- [ ] 删除投影，状态记录为 Deleted

### 首尾帧
- [ ] 进场自动填充已有的分镜图
- [ ] 点击删除，立即变为空白（无虚影）
- [ ] 尾帧必须手动上传

### 参考生视频
- [ ] 显示投影 + 手动图 + Auto-Detect 图
- [ ] 上下文最丰富

### Sora 视频
- [ ] 默认无参考图
- [ ] Auto-Detect 自动隐藏
- [ ] 仅显示手动图
