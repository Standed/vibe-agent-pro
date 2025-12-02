# Vibe Agent Pro - Claude 项目管理文档

> 本文档用于 Claude Code 加载项目上下文、追踪开发进度、记录技术决策

---

## 📋 项目概述

**项目名称**: Vibe Agent Pro  
**版本**: v0.2.0  
**技术栈**: Next.js 15.5.6 + React 19 + TypeScript 5.8.2 + Zustand + Tailwind CSS  
**AI 服务**: Google Gemini 2.0 Flash + Volcano Engine (SeeDream, SeeDance, Doubao)

### 项目定位
AI 驱动的视频分镜生成与编辑工具，提供 Agent 对话模式和 Pro 精细控制双模式工作流。

---

## 🏗️ 核心架构

### 数据层级关系

```
Project (项目)
├── Metadata (元数据：标题、描述、画风)
├── Characters[] (角色列表)
│   ├── id, name, description, appearance
│   └── referenceImages[] (参考图/三视图)
├── Locations[] (场景/位置列表)
│   ├── id, name, type (interior/exterior)
│   └── referenceImages[]
├── AudioAssets[] (音频资源)
│   ├── id, name, type (music/voice/sfx)
│   └── url (Data URL)
├── Scenes[] (场景列表) ⭐ 重要层级
│   ├── id, name, location, description
│   ├── shotIds[] (包含的镜头ID列表)
│   ├── position (canvas上的位置)
│   └── gridHistory[] (Grid生成历史记录 - 待实现)
├── Shots[] (镜头列表)
│   ├── id, sceneId, order
│   ├── shotSize, cameraMovement, duration
│   ├── description, dialogue, narration
│   ├── referenceImage (分配的Grid切片或单图)
│   ├── gridImages[] (Grid生成的所有切片)
│   ├── fullGridUrl (完整Grid图)
│   ├── videoClip (生成的视频URL)
│   └── status (draft/processing/done/error)
└── Timeline[] (时间轴轨道)
    ├── Video Track (视频轨道)
    └── Audio Track (音频轨道)
```

### 关键概念说明

#### 1. Scene (场景) vs Shot (镜头)
- **Scene 是容器**：一个场景包含多个镜头（shotIds[]）
- **Grid 生成是场景级别的**：
  - 用户选择一个场景
  - 生成 2x2(4视图) 或 3x3(9视图) 的 Grid
  - Grid 切片后手动分配给该场景下的各个镜头
- **Shot 是具体执行单元**：存储分配到的切片图、视频等

#### 2. Grid 生成工作流
```
1. Pro 模式 → 选择"Grid 多视图"
2. 选择目标场景（Scene Selector）
3. 设置 Grid 大小（2x2 或 3x3）
4. 输入提示词 + 上传参考图（可选）
5. 调用 Gemini API 生成完整 Grid 图
6. 前端 Canvas 切片为独立图片
7. 显示 GridPreviewModal
8. 用户手动点击切片分配给镜头
9. 确认后更新 Shot.referenceImage
```

#### 3. Agent 模式 vs Pro 模式
- **Agent 模式**：项目级别的 AI 对话，不针对具体镜头（需调整）
- **Pro 模式**：手动控制所有参数（场景、Grid、提示词、比例等）

---

## ✅ 已实现功能

### 核心功能
- [x] 项目创建与管理（IndexedDB 持久化）
- [x] AI 分镜生成（剧本 → 场景 + 镜头）
- [x] 角色管理 + AI 三视图生成（1/3 面部特写 + 2/3 正侧背视图）
- [x] 场景/位置管理 + 参考图上传
- [x] 音频资源上传（music/voice/sfx 分类）
- [x] Grid 多视图生成（Gemini API，2x2/3x3）
- [x] Grid 切片预览与手动分配（GridPreviewModal）
- [x] 单图生成（SeeDream 4.0）
- [x] 视频生成（SeeDance 1.0 Pro，图生视频）
- [x] **场景选择器**（Pro 模式 Grid 生成前选择场景）
- [x] 无限画布（缩放、平移、场景卡片）
- [x] Timeline 时间轴界面（3种状态，视频/音频轨道）
- [x] Agent 对话模式（Doubao Pro 流式输出）

### UI/UX
- [x] Cinema Dark 主题（紫色强调色）
- [x] 左侧栏（剧本/角色/场景/音频 标签页）
- [x] 右侧面板（Agent/Pro 模式切换）
- [x] 模态框工作流（角色、场景、音频、Grid 预览）

---

## ❌ 待实现功能（按优先级）

### 🔴 高优先级

#### 1. Grid 生成历史记录 ⚠️ 用户需求
**需求描述**：
- 每个场景的 Grid 生成应该保存历史版本
- 点击镜头时，Pro 模式应该显示该场景的所有 Grid 生成历史
- 用户可以查看和选择之前生成的版本

**实现方案**：
```typescript
// 1. 扩展 Scene 类型
interface Scene {
  // ... 现有字段
  gridHistory?: GridHistoryItem[];
}

interface GridHistoryItem {
  id: string;
  timestamp: Date;
  prompt: string;
  gridSize: '2x2' | '3x3';
  aspectRatio: AspectRatio;
  fullImage: string;
  slices: string[];
  assignments: Record<string, string>; // shotId -> sliceUrl
}

// 2. Pro 模式添加"历史记录"Tab
// 3. 每次生成 Grid 时保存到 scene.gridHistory
// 4. GridPreviewModal 添加"保存到历史"选项
```

**文件影响**：
- `src/types/project.ts` - 扩展 Scene 类型
- `src/components/layout/ProPanel.tsx` - 添加历史记录 UI
- `src/store/useProjectStore.ts` - 添加 addGridHistory action

---

#### 2. Agent 模式调整为项目级别 ⚠️ 架构问题
**当前问题**：
- Agent 模式当前可能关联到具体镜头，应该是项目级别的对话

**实现方案**：
- Agent 对话历史存储在 `Project.agentHistory`
- 不依赖 selectedShotId
- Agent 可以询问项目信息、批量操作等
- 移除 Agent 与 Shot 的关联

**文件影响**：
- `src/components/layout/AgentPanel.tsx`
- `src/types/project.ts` - 添加 Project.agentHistory

---

#### 3. Timeline 实际播放功能
- [ ] 播放/暂停逻辑实现
- [ ] Playhead 同步
- [ ] 视频片段预览（基于 videoClip URL）
- [ ] 音频轨道播放

#### 4. 镜头拖拽到 Timeline
- [ ] 从画布拖拽 Shot 到 Timeline 添加 Clip
- [ ] Timeline Clip 拖拽排序
- [ ] Clip 时长调整（拖拽边缘）

#### 5. 视频导出功能
- [ ] 合成所有 videoClip
- [ ] 音频混合
- [ ] 转场效果应用
- [ ] 导出为 MP4

---

### 🟡 中优先级

#### 6. 场景拖拽重排（Canvas）
- [ ] 拖拽场景卡片调整位置
- [ ] 保存 position 到 Scene.position

#### 7. 项目列表页面
- [ ] 显示所有项目（从 IndexedDB 加载）
- [ ] 删除、重命名项目
- [ ] 最近打开排序

#### 8. TTS 音频生成
- [ ] 集成火山引擎 TTS
- [ ] 为 Shot.dialogue 生成语音
- [ ] 添加到 audioAssets

---

### 🟢 低优先级

#### 9. 批量操作
- [ ] 批量生成所有镜头的 Grid
- [ ] 批量生成视频

#### 10. Electron 打包
- [ ] 桌面应用打包

---

## 🔧 当前技术债务

### 1. Scene 与 Shot 的关系不够清晰
**问题**：
- Scene.shotIds 存储了 shotId 列表
- 但 Shot.sceneId 也存储了场景 ID
- 两者需要保持同步，容易出错

**改进建议**：
- 统一使用 Shot.sceneId
- Scene 不存储 shotIds，通过 shots.filter(s => s.sceneId === sceneId) 获取

### 2. Grid 生成历史缺失
见"待实现功能 #1"

### 3. Agent 模式定位不清
见"待实现功能 #2"

### 4. Timeline 功能不完整
- UI 已完成，但播放逻辑未实现
- Clip 拖拽、时长调整未实现

---

## 🔑 API 配置说明

### Gemini API
```env
NEXT_PUBLIC_GEMINI_API_KEY=AIzaSyBHEPY2ARK3HXslYSaD_30miGCxuB6p2TM
```
**用途**：Grid 多视图生成（使用 `gemini-3-pro-image-preview` 模型）

### Volcano Engine API
```env
NEXT_PUBLIC_VOLCANO_API_KEY=4400e6ae-ef35-4487-a5bf-1c94fe5f5bbd
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 需要在火山方舟控制台创建推理接入点
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxxx-xxxxx  # 图片生成
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxxx-xxxxx  # 视频生成
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxxx-xxxxx    # AI 对话
```

**获取 endpoint_id**：
1. 访问 https://console.volcengine.com/ark
2. 进入「推理接入」页面
3. 创建对应模型的推理接入点
4. 复制 endpoint_id（格式：ep-xxxxxx-xxxxx）

---

## 📝 最近变更日志

### 2025-01-03 v0.2.0
- ✅ 添加场景选择器（Pro 模式 Grid 生成前）
- ✅ Grid 生成改为基于场景而非镜头
- ✅ 自动提示 Grid 大小与镜头数量匹配
- ✅ 角色三视图生成功能（1/3 面部特写 + 2/3 视图）
- ✅ GridPreviewModal 切片预览与手动分配
- ✅ 音频上传功能（music/voice/sfx）

### 2025-01-03 v0.1.0
- ✅ 画布缩放和平移功能
- ✅ Gemini API 集成 Grid 生成
- ✅ Volcano Engine 视频生成
- ✅ AI Agent 对话系统（流式输出）
- ✅ AI 分镜生成（8 大核心原则）
- ✅ Timeline 时间轴编辑器

---

## 🎯 下一步工作计划

### 第一阶段：完善核心功能（本周）
1. ✅ ~~场景选择器~~（已完成）
2. ⏳ Grid 生成历史记录
3. ⏳ Agent 模式调整为项目级别

### 第二阶段：Timeline 交互（下周）
1. 镜头拖拽到 Timeline
2. Timeline clip 调整
3. Timeline 播放功能

### 第三阶段：导出功能（未来）
1. 视频导出
2. TTS 音频生成
3. 项目列表页面

---

## 🐛 已知问题

### 1. 自动选择场景逻辑可能导致 Re-render
**位置**: `ProPanel.tsx:40-42`
```typescript
if (currentScene && selectedSceneId !== currentScene.id) {
  setSelectedSceneId(currentScene.id);
}
```
**影响**: 可能触发无限循环
**建议**: 使用 useEffect 包裹

### 2. Scene.shotIds 与 Shot.sceneId 同步问题
**描述**: 两个字段需要手动保持一致
**影响**: 删除 Shot 时需要同时更新 Scene.shotIds
**建议**: 统一为单一数据源（Shot.sceneId）

---

## 📚 重要文件索引

### 组件
- `src/components/layout/ProPanel.tsx` - Pro 模式控制面板（Grid/单图/视频生成）
- `src/components/layout/AgentPanel.tsx` - Agent 对话面板
- `src/components/layout/LeftSidebar.tsx` - 左侧栏（剧本/角色/场景/音频）
- `src/components/grid/GridPreviewModal.tsx` - Grid 切片预览与分配
- `src/components/canvas/InfiniteCanvas.tsx` - 无限画布
- `src/components/layout/Timeline.tsx` - 时间轴编辑器

### 服务
- `src/services/geminiService.ts` - Gemini API（Grid 生成）
- `src/services/volcanoEngineService.ts` - Volcano Engine API（图片/视频/对话）
- `src/services/storyboardService.ts` - AI 分镜生成
- `src/services/agentService.ts` - Agent 对话逻辑

### 状态管理
- `src/store/useProjectStore.ts` - 项目全局状态（Zustand + Immer）

### 类型定义
- `src/types/project.ts` - 所有类型定义

---

## 💡 开发建议

### 添加新功能时
1. 先在 `claude.md` "待实现功能" 部分记录
2. 评估是否需要扩展类型（src/types/project.ts）
3. 评估是否需要新的 Store Action（src/store/useProjectStore.ts）
4. 实现组件逻辑
5. 更新 `FEATURES.md` 和 `claude.md`

### Git Commit 规范
```
<type>: <subject>

types:
- feat: 新功能
- fix: 修复 bug
- refactor: 重构
- docs: 文档更新
- style: 代码格式
- test: 测试
```

---

## 🔗 相关文档

- [README.md](./README.md) - 项目说明与使用指南
- [FEATURES.md](./FEATURES.md) - 详细功能清单
- [package.json](./package.json) - 依赖包管理
- [.env.local](./env.example) - 环境变量配置

---

**最后更新**: 2025-01-03  
**维护者**: Claude Code + 西羊石团队
