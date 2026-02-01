# Pro 模式 (ChatPanel) 架构文档

> 最后更新：2026-02-01
> 关联文档：[AGENTS.md](./AGENTS.md)

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
├── StartEndFrameSelector.tsx  # 首尾帧选择器
├── ImagePreviewOverlay.tsx    # 图片预览遮罩
├── ReferenceSection.tsx       # 参考图区域组件（纯展示）
├── MessageList.tsx            # 消息列表组件（性能优化）
└── dragTypes.ts               # 拖拽类型定义
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
    source: 'shot_ref' | 'manual_upload' | 'history_ref' | 'dropped' | 'auto_detect';
    label?: string;
};
```

| source | 含义 | 来源 |
|--------|------|------|
| `shot_ref` | 分镜图 | Vidu 模式下动态投影的分镜图 |
| `manual_upload` | 手动上传 | 用户上传的图片 |
| `history_ref` | 历史记录 | 从历史消息添加的图片 |
| `dropped` | 拖拽添加 | 从画布拖拽过来的图片 |
| `auto_detect` | 自动检测 | 从 Prompt 分析出的角色/资产图 |

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
3. 用于提供更丰富的参考上下文

API 调用：
POST /api/vidu/generate
{
    "mode": "reference2video",
    "images": [所有可见参考图URL],
    ...
}
```

### 4. Sora 视频 (`sora-video`)

```
触发条件：selectedModel === 'sora-video'

逻辑 (严格隔离)：
1. **屏蔽** 所有 auto_detect 参考图 (防止 Prompt 干扰)
2. **屏蔽** Vidu 的分镜图投影
3. **只显示** 用户显式手动上传或从历史添加的图片
4. 确保 Sora 模式永远拥有纯净的操作空间

API 调用：
POST /api/sora
{
    "referenceImages": [手动上传列表],
    ...
}
```

---

## 🪝 核心 Hooks

### useChatHistory
位置：`src/hooks/chat/useChatHistory.ts`

功能：
- 加载分镜的聊天历史
- 支持分页加载
- 合并 Sora 视频消息

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

### useAutoReference
位置：`src/hooks/chat/useAutoReference.ts`

功能：
- 管理当前活跃的参考图列表
- 支持拖拽排序
- 支持手动上传

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
