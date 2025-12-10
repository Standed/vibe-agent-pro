# Development Guidelines (开发指南)

> **重要提醒**: always response in '简体中文'

---

## Philosophy (哲学理念)

### 1. 渐进式开发（Progressive Development）
- **从简单开始**：先完成核心功能的最简实现，确保可以工作
- **逐步增强**：在可工作的基础上添加更多功能和优化
- **快速迭代**：每个小步骤都要能编译、运行、测试
- **避免完美主义**：不要一开始就追求完美的架构，先让它工作起来

### 2. 从现有代码学习（Learn from Existing Code）
- **搜索先行**：在写新代码前，先搜索项目中是否有类似的实现
- **复用模式**：遵循项目中已有的代码风格和架构模式
- **参考先例**：如果不确定如何实现，找到最相似的已有功能作为参考
- **保持一致性**：新代码应该看起来像是项目原有的一部分

### 3. 实用主义（Pragmatism）
- **解决实际问题**：专注于用户需求，不要过度设计
- **技术债务是可以接受的**：先让功能工作，然后标注 TODO 或技术债务
- **渐进式重构**：不要试图一次性重构整个系统
- **优先级驱动**：高优先级功能 > 代码优雅性

### 4. 清晰的意图（Clear Intent）
- **命名即文档**：变量名、函数名应该清楚表达意图
- **注释解释"为什么"**：代码展示"是什么"，注释说明"为什么"
- **更新计划文档**：完成一个步骤后，立即更新 claude.md 或 FEATURES.md
- **沟通进度**：遇到问题时，清楚地告诉用户当前状态和选项

---

## Process (流程)

### 规划与分阶段

#### 1. 理解需求
- 仔细阅读用户需求
- 明确功能的输入、输出、边界条件
- 如果需求不清晰，**提出具体的澄清问题**

#### 2. 搜索先例
```
使用 Grep 工具搜索：
- 类似的功能实现
- 相关的类型定义
- 类似的 API 调用
- 现有的错误处理模式
```

#### 3. 分解任务
将大任务分解为小步骤，例如：
```
任务：添加 Grid 历史记录
步骤：
1. 扩展 Scene 类型（添加 gridHistory 字段）
2. 修改 Store Action（添加 addGridHistory）
3. 修改 ProPanel（生成时保存历史）
4. 添加历史记录 UI（新 Tab 或 Modal）
5. 实现选择历史版本功能
```

#### 4. 逐步实施
- **一次只改一个文件或一个小功能**
- 每完成一个步骤，确保代码可以编译
- 如果可能，在浏览器中测试
- 更新 claude.md 标记进度

### 实施流程

#### Step 1: 类型定义（如果需要）
```typescript
// src/types/project.ts
// 添加或修改类型定义
```
**检查点**：TypeScript 编译无错误

#### Step 2: Store Action（如果需要）
```typescript
// src/store/useProjectStore.ts
// 添加新的 action
```
**检查点**：TypeScript 编译无错误

#### Step 3: UI 组件
```typescript
// src/components/...
// 实现 UI 逻辑
```
**检查点**：组件可以正常渲染

#### Step 4: 集成测试
- 在浏览器中测试完整流程
- 测试边界情况（空数据、错误等）
- 测试与现有功能的兼容性

#### Step 5: 文档更新
- 更新 claude.md（标记任务完成）
- 更新 FEATURES.md（如果是新功能）
- 添加代码注释（解释复杂逻辑）

### 遇到困难时

#### 如果编译错误
1. 仔细阅读错误信息
2. 检查类型定义是否正确
3. 搜索项目中是否有类似的错误处理

#### 如果功能不工作
1. 添加 console.log 调试
2. 检查数据流（props → state → render）
3. 对比现有的工作实现

#### 如果连续 3 次尝试失败
1. **停止**
2. 重新评估方法
3. 向用户说明情况和可能的替代方案
4. 询问用户是否继续或改变方向

---

## Technical Standards (技术标准)

### 架构原则

#### 1. 数据流
```
User Action → Store Action → State Update → Component Re-render
```
- 所有状态修改通过 Store Actions
- 组件尽量保持无状态（使用 Store）
- 避免直接修改 state（使用 Immer）

#### 2. 组件设计
- **单一职责**：一个组件只做一件事
- **Props 明确**：使用 TypeScript 定义清晰的 Props 接口
- **事件上报**：子组件通过回调函数通知父组件，不直接修改全局状态

#### 3. 文件组织
```
src/
├── components/        # UI 组件
│   ├── layout/       # 布局组件（Sidebar, Panel）
│   ├── canvas/       # 画布相关
│   ├── grid/         # Grid 相关
│   ├── shot/         # 镜头相关
│   └── project/      # 项目相关
├── services/         # 业务逻辑和 API 调用
├── store/            # Zustand 状态管理
├── types/            # TypeScript 类型定义
└── locales/          # 国际化翻译
```

### 代码质量

#### 1. TypeScript 使用
- **严格类型**：避免 `any`，使用具体类型
- **类型复用**：相同结构的类型应该复用
- **类型导入**：从 `src/types/project.ts` 统一导入

#### 2. 命名规范
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

#### 3. 注释规范
```typescript
// ✅ 好的注释（解释"为什么"）
// 使用 Immer 避免直接修改状态，保证 React 可以检测到变化
const newState = produce(state, draft => {});

// ❌ 不好的注释（重复代码）
// 设置 loading 为 true
setLoading(true);
```

### 错误处理

#### 1. API 调用
```typescript
try {
  const result = await apiCall();
  return result;
} catch (error: any) {
  console.error('API 调用失败:', error);
  // 显示用户友好的错误信息
  throw new Error('操作失败，请稍后重试');
}
```

#### 2. 边界情况
- 检查空数组、null、undefined
- 提供默认值
- 显示友好的空状态 UI

#### 3. 用户反馈
- Loading 状态：显示加载指示器
- Success 状态：显示成功提示
- Error 状态：显示具体错误信息

---

## Decision Framework (决策框架)

### 何时重构 vs 何时新写

#### 重构现有代码（如果满足）：
- ✅ 功能类似，只是参数或流程稍有不同
- ✅ 可以通过添加参数或条件分支实现
- ✅ 不会破坏现有功能

#### 新写代码（如果满足）：
- ✅ 功能完全不同
- ✅ 重构会让现有代码过于复杂
- ✅ 需要不同的数据结构

### 何时优化 vs 何时先实现

#### 先实现，后优化（如果满足）：
- ✅ 功能是新的核心需求
- ✅ 性能问题不明显
- ✅ 可以标注 TODO 后续优化

#### 立即优化（如果满足）：
- ✅ 明显的性能瓶颈（如循环嵌套、大数据量）
- ✅ 安全问题（如 XSS、CORS）
- ✅ 用户体验严重受影响

### 何时询问用户

#### 应该询问的情况：
- ❓ 需求有多种合理解释
- ❓ 需要用户做出产品决策（如 UI 布局）
- ❓ 需要额外的 API Key 或配置
- ❓ 可能破坏现有功能

#### 不应询问的情况（自行决定）：
- ✅ 技术实现细节（如用哪个库）
- ✅ 代码组织方式
- ✅ 变量命名
- ✅ 临时的调试代码

---

## Project Integration (项目集成)

### 添加新功能的完整流程

#### 1. 规划阶段
- [ ] 在 claude.md "待实现功能" 部分添加条目
- [ ] 确定是否需要修改类型定义
- [ ] 确定是否需要新的 API 调用
- [ ] 确定是否需要新的 Store Action

#### 2. 实施阶段
- [ ] 修改 `src/types/project.ts`（如果需要）
- [ ] 修改 `src/store/useProjectStore.ts`（如果需要）
- [ ] 实现服务层逻辑（`src/services/`）
- [ ] 实现 UI 组件（`src/components/`）
- [ ] 添加国际化文本（`src/locales/zh.ts`, `en.ts`）

#### 3. 测试阶段
- [ ] 在浏览器中手动测试
- [ ] 测试边界情况（空数据、错误、取消操作）
- [ ] 测试与现有功能的兼容性
- [ ] 检查控制台是否有错误或警告

#### 4. 文档阶段
- [ ] 更新 claude.md（标记任务完成）
- [ ] 更新 FEATURES.md（如果是新功能）
- [ ] 添加代码注释（复杂逻辑）
- [ ] 提交 Git Commit（遵循规范）

### 使用现有服务

#### Gemini API (`geminiService.ts`)
```typescript
import { generateMultiViewGrid } from '@/services/geminiService';

const { fullImage, slices } = await generateMultiViewGrid(
  prompt,
  gridRows,
  gridCols,
  aspectRatio,
  referenceImages
);
```

#### Volcano Engine API (`volcanoEngineService.ts`)
```typescript
import { VolcanoEngineService } from '@/services/volcanoEngineService';

const volcanoService = new VolcanoEngineService();
const imageUrl = await volcanoService.generateSingleImage(prompt, size);
const videoUrl = await volcanoService.generateVideo(imageUrl, prompt);
```

#### Store Actions (`useProjectStore.ts`)
```typescript
const { updateShot, addScene, deleteShot } = useProjectStore();

updateShot(shotId, { referenceImage: newImageUrl });
addScene({ name: 'Scene 1', description: '...' });
```

---

## Quality Gates (质量门槛)

### 提交代码前检查清单

#### 编译检查
- [ ] `npm run build` 无错误
- [ ] TypeScript 类型检查通过
- [ ] 无 ESLint 警告

#### 功能检查
- [ ] 主要功能流程可以正常工作
- [ ] 边界情况（空数据、错误）有合理处理
- [ ] 不会破坏现有功能

#### 代码质量
- [ ] 无 `any` 类型（除非确实必要）
- [ ] 无 `console.log`（除非是有意的调试日志）
- [ ] 命名清晰，符合项目规范
- [ ] 复杂逻辑有注释说明

#### 文档检查
- [ ] claude.md 或 FEATURES.md 已更新
- [ ] 复杂逻辑有代码注释
- [ ] Git Commit Message 清晰

### 定义完成（Definition of Done）

一个功能被认为"完成"当且仅当：
1. ✅ 代码可以编译且无错误
2. ✅ 功能在浏览器中可以正常工作
3. ✅ 边界情况有合理处理
4. ✅ 文档已更新（claude.md / FEATURES.md）
5. ✅ 代码已提交到 Git

---

## Important Reminders (重要提醒)

### ⚠️ 绝对不要（NEVER）
- ❌ 使用 `--no-verify` 跳过 Git Hooks
- ❌ 禁用测试而不是修复它们
- ❌ 提交无法编译的代码
- ❌ 在不确定的情况下做出假设 - 应该验证现有代码
- ❌ 将文档复制到多个位置
- ❌ 因为"只是小改动"而跳过文档更新
- ❌ 提交代码而不更新相关文档
- ❌ 为实验性功能编写大量文档
- ❌ 创建会与代码脱节的独立文档仓库

### ✅ 始终（ALWAYS）
- ✅ 增量提交可工作的代码
- ✅ 随时更新计划文档
- ✅ 从现有实现中学习
- ✅ 3 次失败后停止并重新评估
- ✅ 在同一个 PR 中更新文档和代码
- ✅ 提交前测试所有代码示例
- ✅ 链接到现有文档而不是复制
- ✅ 将文档放在它所记录的内容附近
- ✅ 以审查代码的严格程度审查文档
- ✅ 立即删除或更新过时的文档
- ✅ **所有回复使用简体中文**

### 🎯 核心原则
1. **渐进式开发** - 从简单开始，逐步增强
2. **从现有代码学习** - 搜索先例，保持一致
3. **实用主义** - 先让它工作，再让它完美
4. **清晰沟通** - 及时更新进度和文档

---

## Documentation Principles
### Core Beliefs
- **Single Source of Truth (SSOT)** - One canonical location for each piece of information
- **Documentation as Code** - Treat docs with same rigor as code
- **Proximity over centralization** - Keep docs close to what they document
- **Minimal but sufficient** - Write only what's necessary, but write it well
### DRY for Documentation
- Use links/references instead of copying content
- Extract common content to shared includes
- Generate documentation from code when possible (API docs, schemas)
- One concept = one location = multiple references
### Documentation Layers
Each project should have clear separation:
1. **README.md** - What it is, quick start, basic examples
2. **ARCHITECTURE.md** - High-level design, key decisions, why
3. **API/Reference docs** - Generated from code comments
4. **Guides** - How-to for common tasks
5. **ADRs** (Architecture Decision Records) - Historical context for major decisions
### Documentation Workflow
1. **When writing code**:
   - Update inline documentation (comments for "why")
   - Update README if public API changes
   - Update guides if workflows change
   - Create ADR for architectural decisions
2. **Documentation in PRs**:
   - Include doc changes with code changes
   - Treat doc review as seriously as code review
   - Test examples and commands actually work
   - Update version-specific docs
3. **Documentation placement**:
   - Code comments: Why (not what - code shows what)
   - README: Quick start, installation, basic usage
   - Separate docs: Detailed guides, architecture
   - Wiki/External: Only for frequently changing operational info
### Documentation Quality Gates
#### Definition of Done for Documentation
- [ ] Single source for this information (no duplicates)
- [ ] Placed in appropriate layer (README vs guide vs reference)
- [ ] All code examples tested and working
- [ ] Links verified (no broken references)
- [ ] Version clearly indicated if version-specific
- [ ] Updated in same commit as code changes
#### Testing Documentation
- Run all code examples to verify they work
- Check all internal links resolve correctly
- Verify commands with actual execution
- Test setup instructions on clean environment
### Documentation Anti-Patterns
**Avoid**:
- Duplicating information in multiple files
- Documenting obvious code behavior
- Creating "docs" folder that gets out of sync
- Writing extensive docs for unstable features
- Explaining "what" when code is self-explanatory
**Prefer**:
- Self-documenting code with clear naming
- Minimal comments explaining "why" and "gotchas"
- Generated documentation from code
- Living documents in version control
- Examples over lengthy explanations
### Decision Framework for Documentation
When deciding what to document, ask:
1. **Can code be self-explanatory?** - Improve naming first
2. **Will this change frequently?** - Minimize or generate it
3. **Is this discoverable?** - Ensure proper placement
4. **Can users infer this?** - Only document non-obvious parts
5. **Does this duplicate?** - Link instead
### Version Control for Documentation
- All docs in same repo as code (proximity)
- Docs versioned with code releases
- CHANGELOG.md for user-facing changes
- Mark deprecated features clearly with removal timeline
- Archive old version docs, don't delete
### Documentation Checklist
Add to your PR template:
```markdown
## Documentation Changes
- [ ] Code comments updated (for "why" not "what")
- [ ] README updated if public API changed
- [ ] All code examples tested and working
- [ ] No duplicate information created
- [ ] Appropriate documentation layer chosen
- [ ] Version/deprecation clearly marked if applicable
```
## Important Reminders
**NEVER**:
- Use `--no-verify` to bypass commit hooks
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Make assumptions - verify with existing code
- Copy-paste documentation to multiple locations
- Skip updating docs because "it's just a small change"
- Commit code without updating related documentation
- Write extensive documentation for experimental features
- Create separate doc repos that drift from code
**ALWAYS**:
- Commit working code incrementally
- Update plan documentation as you go
- Learn from existing implementations
- Stop after 3 failed attempts and reassess
- Update docs in the same PR as code changes
- Test all code examples before committing
- Link to existing documentation instead of duplicating
- Place docs close to what they document
- Review documentation with same rigor as code
- Delete or update outdated documentation immediately

# Video Agent Pro - Claude 项目管理文档

> 本文档用于 Claude Code 加载项目上下文、追踪开发进度、记录技术决策

---

## 📋 项目概述

**项目名称**: Video Agent Pro
**版本**: v0.3.0
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
- [x] **新建项目对话框**（项目名称、概要、画风、画面比例选择）
- [x] **全局画面比例设置**（16:9, 9:16, 1:1, 4:3, 21:9）
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
- [x] **分镜详情面板**（参考 oiioii 风格，大图预览 + 编辑 + 历史）

### UI/UX
- [x] Cinema Dark 主题（紫色强调色）+ Light 主题
- [x] **新版左侧栏**（剧本/分镜脚本/资源 三标签页）
  - [x] 剧本标签页：项目概要 + 剧本编辑 + AI 自动分镜
  - [x] 分镜脚本标签页：场景分组 + 分镜卡片列表 + 缩略图预览
  - [x] 资源标签页：角色/场景地点/音频管理
- [x] **右侧分镜详情面板**（点击分镜显示，oiioii 风格）
  - [x] 大图/视频预览区
  - [x] 快速操作按钮（重生成、编辑、下载）
  - [x] 基本信息编辑（景别、运镜、时长、描述）
  - [x] 高级选项（对话、旁白）
  - [x] 生成历史记录
- [x] 右侧面板（Agent/Pro 模式切换）
- [x] 模态框工作流（角色、场景、音频、Grid 预览）
- [x] **国际化支持**（中/英文切换）

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

### 2025-12-03 v0.3.0 - UI/UX 大升级 ⭐️
**三栏布局重构 + oiioii 风格分镜详情面板**

#### 新增功能
- ✅ **新建项目对话框**
  - 项目名称、概要、画风输入
  - 画面比例选择器（16:9, 9:16, 1:1, 4:3, 21:9）
  - 根据比例自动设置分辨率
  - 精美的 UI 设计，支持亮色/暗色主题

- ✅ **全局画面比例设置**
  - 在 ProjectSettings 中添加 aspectRatio 字段
  - 统一应用于整个项目的所有分镜
  - 自动匹配分辨率配置

- ✅ **新版左侧边栏**（三标签页设计）
  - **剧本标签页**：
    - 项目概要信息（名称、画面比例、画风）
    - 剧本文本编辑区
    - AI 自动分镜按钮
  - **分镜脚本标签页** ⭐️ 最常用：
    - 显示总镜头数统计
    - 按场景分组显示（可折叠）
    - 分镜卡片：缩略图 + 编号 + 景别 + 时长 + 描述
    - 点击分镜 → 右侧显示详情面板
    - 当前选中的分镜紫色高亮
  - **资源标签页**：
    - 角色列表（可添加）
    - 场景地点列表（可添加）
    - 音频管理（标注"后期功能"）

- ✅ **右侧分镜详情面板**（参考 oiioii 风格）
  - **大图/视频预览区**（占据主要空间）
  - **快速操作按钮**：
    - 重新生成、编辑、下载
  - **基本信息编辑**：
    - 景别、运镜、时长、视觉描述
    - 支持编辑/查看两种模式
  - **高级选项**（可折叠）：
    - 对话、旁白
  - **生成历史**（可折叠）：
    - 显示历史版本缩略图
    - 点击切换使用不同版本

#### 交互优化
- 点击画布中的分镜节点 → 右侧自动切换到详情面板
- 点击左侧分镜卡片 → 右侧自动切换到详情面板 + 画布同步选中
- 返回按钮 → 关闭详情面板，回到 Agent/Pro 模式

#### 文件改动
**新增文件**：
- `src/components/project/NewProjectDialog.tsx` - 新建项目对话框
- `src/components/shot/ShotDetailPanel.tsx` - 分镜详情面板
- `src/components/layout/LeftSidebarNew.tsx` - 新版左侧边栏

**修改文件**：
- `src/types/project.ts` - 添加全局 aspectRatio
- `src/store/useProjectStore.ts` - 更新创建项目逻辑
- `src/app/page.tsx` - 集成新建项目对话框
- `src/app/project/[id]/page.tsx` - 使用新左侧边栏
- `src/components/layout/RightPanel.tsx` - 集成分镜详情面板

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
- `src/components/layout/LeftSidebar.tsx` - 旧版左侧栏（已废弃）
- `src/components/layout/LeftSidebarNew.tsx` - **新版左侧栏**（剧本/分镜脚本/资源 三标签页）
- `src/components/layout/RightPanel.tsx` - 右侧面板（Agent/Pro 模式 + 分镜详情）
- `src/components/project/NewProjectDialog.tsx` - **新建项目对话框**
- `src/components/shot/ShotDetailPanel.tsx` - **分镜详情面板**（oiioii 风格）
- `src/components/grid/GridPreviewModal.tsx` - Grid 切片预览与分配
- `src/components/canvas/InfiniteCanvas.tsx` - 无限画布
- `src/components/layout/Timeline.tsx` - 时间轴编辑器
- `src/components/settings/SettingsPanel.tsx` - 设置面板（主题切换、语言切换）

### 服务
- `src/services/geminiService.ts` - Gemini API（Grid 生成）
- `src/services/volcanoEngineService.ts` - Volcano Engine API（图片/视频/对话）
- `src/services/storyboardService.ts` - AI 分镜生成
- `src/services/agentService.ts` - Agent 对话逻辑

### 状态管理
- `src/store/useProjectStore.ts` - 项目全局状态（Zustand + Immer）

### 类型定义
- `src/types/project.ts` - 所有类型定义

### 国际化
- `src/locales/zh.ts` - 中文翻译
- `src/locales/en.ts` - 英文翻译
- `src/components/providers/I18nProvider.tsx` - 国际化 Provider

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

**最后更新**: 2025-12-03
**维护者**: Claude Code + 西羊石团队
