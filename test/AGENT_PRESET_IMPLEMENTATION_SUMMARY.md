# Agent 预设功能实现总结

## 实现日期
2025-12-08

## 功能概述

为 Agent 模式添加了一键生成预设功能，用户可以通过点击预设按钮快速执行常见的图片生成任务。

## 实现的功能

### 1. UI 预设按钮（AgentPanel.tsx）

在 Agent 面板添加了"快捷操作"区域，包含 4 个预设按钮：

| 按钮 | 图标 | 功能 | 预填充命令 |
|------|------|------|------------|
| SeeDream 批量生成 | ✨ Sparkles | 为当前场景所有未生成分镜使用 SeeDream 生成图片 | "使用 SeeDream 为当前场景所有未生成的分镜生成图片" |
| Grid 2x2 自动分配 | ⊞ Grid3x3 | 生成 2x2 Grid 并自动分配前 4 个分镜 | "使用 Gemini Grid (2x2) 为当前场景生成多视图并自动分配" |
| Grid 3x3 自动分配 | ⊞ Grid3x3 | 生成 3x3 Grid 并自动分配前 9 个分镜 | "使用 Gemini Grid (3x3) 为当前场景生成多视图并自动分配" |
| 全项目批量生成 | 🖼 ImageIcon | 为整个项目所有未生成分镜使用 SeeDream 生成图片 | "为整个项目的所有未生成分镜使用 SeeDream 生成图片" |

**交互逻辑**:
- 仅在空白状态显示（`chatHistory.length === 0`）
- 点击预设按钮填充输入框（不自动发送）
- 用户可以编辑后再发送
- 发送后触发 Agent 工具调用

### 2. Agent 工具定义（agentTools.ts）

新增了 3 个工具：

#### 2.1 `generateShotImage` - 单个分镜生成

**功能**: 为单个分镜生成图片，支持三种模式

**参数**:
```typescript
{
  shotId: string;         // 分镜 ID
  mode: 'seedream' | 'gemini' | 'grid';  // 生成模式
  prompt?: string;        // 可选提示词
}
```

**支持的模式**:
- `seedream`: 使用 Volcano SeeDream 4.5 生成单图
- `gemini`: 使用 Gemini 图像编辑功能（image-to-image）
- `grid`: 使用 Gemini Grid 生成多视图（仅生成，不自动分配）

#### 2.2 `batchGenerateSceneImages` - 场景批量生成

**功能**: 为当前场景的分镜批量生成图片

**参数**:
```typescript
{
  sceneId: string;                        // 场景 ID
  mode: 'seedream' | 'gemini' | 'grid';  // 生成模式
  prompt?: string;                        // 可选提示词
  gridSize?: '2x2' | '3x3';              // Grid 模式时的网格大小
  targetShotIds?: string[];               // 可选：指定要生成的分镜 ID
}
```

**模式说明**:
- `seedream` / `gemini`: 逐个生成每个分镜
- `grid`: 生成 Grid 并**自动分配**切片到分镜

**Grid 自动分配逻辑**:
1. 取前 N 个分镜（N = grid size，如 2x2 则 4 个）
2. 合并所有分镜描述生成 Grid
3. 自动将切片分配给对应分镜（按顺序）
4. 更新每个分镜的 `referenceImage`
5. 保存 Grid 历史到场景级
6. 保存生成历史到分镜级

#### 2.3 `batchGenerateProjectImages` - 项目全局生成

**功能**: 为整个项目的所有未生成分镜生成图片

**参数**:
```typescript
{
  mode: 'seedream' | 'gemini';  // 生成模式（不支持 Grid）
  prompt?: string;               // 可选提示词
}
```

**执行流程**:
1. 遍历项目所有场景
2. 找出每个场景中未生成的分镜（`status !== 'done'` 或无 `referenceImage`）
3. 逐个调用生成 API
4. 更新分镜状态和历史记录

### 3. 历史记录集成

#### 3.1 分镜级历史（GenerationHistoryItem）

每次生成后添加到 `shot.generationHistory`:

```typescript
{
  timestamp: Date;
  provider: 'volcanoEngine' | 'gemini';
  mode: 'seedream' | 'gemini' | 'grid';
  imageUrl: string;
  prompt: string;
  gridSize?: '2x2' | '3x3';    // Grid 模式特有
  sliceIndex?: number;          // Grid 切片索引
}
```

#### 3.2 场景级 Grid 历史（GridHistoryItem）

Grid 模式专用，保存到 `scene.gridHistory`:

```typescript
{
  timestamp: Date;
  gridSize: '2x2' | '3x3';
  gridUrl: string;                           // 完整 Grid 图片
  slices: string[];                          // 所有切片 URL
  prompt: string;
  assignments: Record<string, number>;       // shotId → sliceIndex
}
```

### 4. State 管理（StoreCallbacks）

为了让工具能够更新 Zustand store，创建了 `StoreCallbacks` 接口：

```typescript
export interface StoreCallbacks {
  updateShot: (shotId: string, updates: Partial<Shot>) => void;
  addGenerationHistory: (shotId: string, item: GenerationHistoryItem) => void;
  addGridHistory: (sceneId: string, item: GridHistoryItem) => void;
}
```

**传递路径**:
```
useAgent.ts
  → 从 useProjectStore 获取方法
  → 创建 storeCallbacks 对象
  → 传递给 ParallelExecutor
    → 传递给 AgentToolExecutor
      → 在工具方法中调用
```

### 5. 资源引用增强（enrichPromptWithAssets）

所有生成方法都使用 `enrichPromptWithAssets` 来：
- 添加角色参考图片
- 添加场景/地点参考图片
- 丰富提示词上下文

## 修改的文件

### 1. [src/components/agent/AgentPanel.tsx](../src/components/agent/AgentPanel.tsx)
**修改内容**:
- 添加图标导入：`Sparkles`, `ImageIcon`, `Grid3x3`
- 添加"快捷操作"区域（lines 160-197）
- 4 个预设按钮的实现
- 条件渲染逻辑

**代码行数**: 231 行

### 2. [src/services/agentTools.ts](../src/services/agentTools.ts)
**修改内容**:
- 添加 `StoreCallbacks` 接口
- 添加 3 个新工具定义到 `AGENT_TOOLS` 数组
- 实现 `generateShotImage()` 方法
- 实现 `batchGenerateSceneImages()` 方法
- 实现 `batchGenerateProjectImages()` 方法
- 实现 `generateSceneGrid()` 私有方法
- 修改 `AgentToolExecutor` 构造函数接受 `storeCallbacks`

**新增代码**: ~300 行

### 3. [src/services/parallelExecutor.ts](../src/services/parallelExecutor.ts)
**修改内容**:
- 添加 `StoreCallbacks` 导入
- 修改 `executeToolsInParallel()` 接受 `storeCallbacks` 参数
- 修改 `ParallelExecutor` 构造函数接受 `storeCallbacks`
- 传递 `storeCallbacks` 给 `AgentToolExecutor`
- 修复错误返回格式（添加 `result: null`）

**修改行数**: ~15 行

### 4. [src/hooks/useAgent.ts](../src/hooks/useAgent.ts)
**修改内容**:
- 导入 `StoreCallbacks`
- 从 `useProjectStore` 获取 `updateShot`, `addGenerationHistory`, `addGridHistory`
- 在 `sendMessage` 中创建 `storeCallbacks` 对象
- 传递给 `ParallelExecutor`
- 更新依赖数组

**修改行数**: ~10 行

## 技术亮点

### 1. 用户友好的交互设计
- 预设按钮降低使用门槛
- 填充输入框而非自动发送，给用户编辑空间
- 只在空白状态显示，不干扰对话流程

### 2. Grid 自动分配
- 智能分析场景内容
- 自动生成多视图 Grid
- 按顺序分配切片到分镜
- 完整保存分配关系供后续参考

### 3. 完整的历史记录
- 分镜级记录每次生成
- 场景级保存 Grid 全局信息
- 支持查看、重用、重新分配

### 4. 资源引用增强
- 自动提取角色和场景资源
- 添加到生成提示词中
- 提高生成结果的一致性

### 5. 状态管理解耦
- 通过 `StoreCallbacks` 接口
- 工具层不直接依赖 Zustand
- 便于测试和维护

## 使用示例

### 示例 1: 快速生成当前场景

1. 打开项目，切换到 Agent 模式
2. 点击"SeeDream 批量生成"
3. （可选）编辑提示词，如添加"漫画风格"
4. 点击发送
5. 等待生成完成

**结果**: 当前场景所有未生成的分镜都有了图片

### 示例 2: Grid 多视图生成

1. 打开一个有 4+ 个分镜的场景
2. 点击"Grid 2x2 自动分配"
3. 点击发送
4. 等待生成完成

**结果**:
- 生成了一张 2x2 Grid 图片
- 前 4 个分镜自动分配了对应切片
- 场景的 `gridHistory` 保存了完整信息

### 示例 3: 全项目批量生成

1. 打开任意场景的 Agent 模式
2. 点击"全项目批量生成"
3. 点击发送
4. 等待处理（可能需要几分钟）

**结果**: 项目中所有未生成的分镜都有了图片

### 示例 4: 自定义命令

用户也可以手动输入更精细的命令：

```
为场景1的前3个分镜生成图片，使用 Gemini 直出模式，提示词：赛博朋克风格，霓虹灯效果
```

或者：

```
使用 Grid 3x3 为当前场景生成多视图，提示词：动漫风格，明亮色彩
```

AI 会理解并调用相应的工具。

## 配置要求

### 环境变量

#### Volcano Engine（SeeDream）
已在 `.env.local` 中配置

#### Gemini API（需要代理）
```env
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

### API 限制

- **SeeDream**: 单次生成 1 张图
- **Gemini 直出**: 需要基础图片（image-to-image）
- **Gemini Grid**:
  - 2x2 = 4 张切片
  - 3x3 = 9 张切片
  - 最大支持 3x3

## 测试建议

### 基本功能测试
1. UI 预设按钮显示和交互
2. SeeDream 单场景批量生成
3. Grid 2x2 自动分配
4. Grid 3x3 自动分配
5. 全项目批量生成

### 边界情况测试
1. 空场景（无分镜）
2. 所有分镜已生成
3. 分镜数 < Grid 大小（如 3 个分镜用 2x2）
4. 分镜数 > Grid 大小（如 10 个分镜用 3x3，只分配前 9 个）

### 错误处理测试
1. 网络断开
2. API 限流
3. 无效的分镜 ID
4. 缺少必要参数

### 性能测试
1. 单场景 10 个分镜批量生成时间
2. 全项目 50+ 个分镜生成时间
3. Grid 生成速度 vs 逐个生成

详细测试计划请参考: [AGENT_PRESET_TEST_RESULTS.md](./AGENT_PRESET_TEST_RESULTS.md)

## 后续优化建议

### 1. 进度实时更新
当前进度在 ThinkingProcess 中显示，可以考虑：
- 在分镜卡片上实时显示生成进度
- 添加进度条动画

### 2. 批量重新生成
支持选中多个已生成的分镜，批量重新生成

### 3. Grid 切片重新分配
在 Grid 历史中提供拖拽重新分配切片的功能

### 4. 更多生成模式
- Stable Diffusion
- DALL-E 3
- Midjourney（如果有 API）

### 5. 生成参数调整
在预设中添加更多参数：
- 图片尺寸
- 质量设置
- 负面提示词
- 种子（seed）

### 6. 模板预设
保存常用的生成配置为模板，快速复用

### 7. A/B 测试
为同一分镜生成多个版本，方便对比选择

## 相关文档

- [Agent 优化功能测试文档](./AGENT_OPTIMIZATION_TEST.md) - Agent 核心优化测试
- [Agent 预设功能测试结果](./AGENT_PRESET_TEST_RESULTS.md) - 本次功能详细测试
- [项目功能列表](../FEATURES.md) - 整体功能说明

## 技术栈

- **框架**: Next.js 15.5.7 + React 19
- **状态管理**: Zustand
- **UI**: TailwindCSS + lucide-react 图标
- **AI**: Gemini API
- **图片生成**: Volcano SeeDream 4.5, Gemini Imagen
- **数据持久化**: IndexedDB (Dexie.js)

## Git 提交建议

### Commit Message
```
feat: 为 Agent 模式添加一键生成预设功能

- 添加 4 个快捷操作按钮：SeeDream批量、Grid 2x2/3x3、全项目生成
- 新增 3 个 Agent 工具：generateShotImage, batchGenerateSceneImages, batchGenerateProjectImages
- 实现 Grid 自动分配逻辑（按顺序分配切片到分镜）
- 集成分镜级和场景级历史记录
- 通过 StoreCallbacks 接口实现状态管理解耦
- 所有生成方法支持资源引用增强（enrichPromptWithAssets）

修改文件：
- src/components/agent/AgentPanel.tsx
- src/services/agentTools.ts
- src/services/parallelExecutor.ts
- src/hooks/useAgent.ts

测试文档：
- test/AGENT_PRESET_IMPLEMENTATION_SUMMARY.md
- test/AGENT_PRESET_TEST_RESULTS.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

**文档版本**: 1.0
**创建日期**: 2025-12-08
**作者**: Claude Code
