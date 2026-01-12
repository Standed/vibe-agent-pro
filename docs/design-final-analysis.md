# design-final 批注深度分析（结合现有代码）

> 目标：不改 `docs/design-final.md` 内容，逐条消化批注，并给出与现有代码一致的落地建议  
> 依据：`docs/design-final.md` + 现有实现（`src/app/page.tsx`、`src/components/layout/LeftSidebarNew.tsx`、`src/components/canvas/InfiniteCanvas.tsx`、`src/components/chat/ChatPanel.tsx`、`src/services/agentToolDefinitions.ts`、`supabase/schema.sql`）  
> 日期：2025-12-31

---

## 1. 已与现有代码对齐的部分

| 设计方向 | 现有代码支撑 | 备注 |
|---|---|---|
| 对话为核心 | `RightPanel` + `AgentPanel` + `ChatPanel` | 已具备 Agent/Pro 双模式切换 |
| 结构化资产 | `projects/scenes/shots/characters` | `supabase/schema.sql` 与 `types/project.ts` 已具备层级 |
| 分层对话 | `chat_messages` | `ChatPanel` 按 project/scene/shot 读取 |
| 三视图 + Sora | `AddCharacterDialog` | 已有三视图生成 + Sora 参考视频/ID |
| 画布为中心 | `InfiniteCanvas` | 按场景组织镜头，支持预览/编辑 |

---

## 2. 批注逐条分析与落地建议

### 2.1 首页创建流程（3.1 批注）

**批注**：创建项目后是否进入新 tab，并自动填充风格/画风？  
**现状**：`src/app/page.tsx` 通过 `NewProjectDialog` 弹窗创建项目，创建后直接 `router.push(/project/:id)`。  
**建议**：
- 保持弹窗创建（低摩擦），但创建后跳转**策划页**而不是画布页（需要新增策划路由）。  
- “主流画风可选”可在 `NewProjectDialog` 增加常用风格 chips，不强迫用户选择。  

### 2.2 进入画布确认逻辑（3.2 批注）

**批注**：有些抽象片不需要角色/资产，是否必须检查？  
**现状**：暂无进入画布确认逻辑，项目创建后直接进入画布。  
**建议（软约束）**：
- **最低条件**：存在剧本或至少 1 个场景 + 1 个镜头。  
- **可跳过**：角色/场景资产不强制，但提示“当前为抽象创作，后续一致性可能受限”。  
- **按钮文案**：未满足时显示“继续进入（不完整）”，满足时显示“进入画布”。  

### 2.3 画布美感与左侧小图标栏（3.3 批注）

**批注**：希望像 Tapnow 的美感，左侧小巧 icon 导航。  
**现状**：`LeftSidebarNew` 为 320px 大面板 + 顶部 Tab。  
**建议**：
- 引入 48px icon rail（只做布局和动效优化，不改数据结构）。  
- 左侧面板可折叠，默认 260px 宽，保持现有 Tab 内容不变。  

### 2.4 镜头详情入口与“点击预览+应用”

**批注**：点击预览+应用，引用 `ShotDetailPanel`。  
**现状**：主流程使用 `ShotEditor` 弹层；`ShotDetailPanel` 未挂主流程。  
**建议**：
- 继续沿用 `ShotEditor` 作为主入口，避免并行两套详情 UI。  
- 在 `ShotEditor` 与 `ChatPanel` 统一“预览 + 应用”按钮语义。  

### 2.5 画布图拖拽到对话（3.3 批注）

**批注**：拖拽到聊天框上方“上传图片区”。  
**现状**：`ChatPanel` 已支持文件拖拽，但不支持画布 URL/shotId。  
**建议**：
- 画布拖拽数据格式：`text/uri-list` + `application/x-shot-id`  
- `ChatPanel` drop 时识别 URL 并加入 `manualReferenceUrls`  
- 整个聊天区可作为 drop zone，并高亮提示

### 2.6 Slash/Skill 优先级（4.2 批注）

**批注**：优先集成四个核心能力，不要主观臆想。  
**现状**：Agent 工具已有批量生成图/视频接口（见 `src/services/agentToolDefinitions.ts`），但没有 Jimeng 批量工具。  

**可直接映射的指令（Agent）**：

| 指令 | Tool 映射 | 备注 |
|---|---|---|
| `/generate-all` (Gemini 直出) | `batchGenerateProjectImages` mode=gemini | 已支持 |
| `/grid-all 2x2` | `batchGenerateProjectImages` mode=grid gridSize=2x2 | 已支持 |
| `/sora-all` | `batchGenerateProjectVideosSora` | 已支持 |
| `/jimeng-all` | 目前缺工具 | 需新增批量 Jimeng tool |

**结论**：前三项可直接落地；Jimeng 批量需要扩展 Agent 工具或暂时放在 Pro。

### 2.7 草稿模式入口（6.2 批注）

**批注**：纵向链条不一定对；入口是独立模式/画布切换/分镜内进入？  
**现状**：无草稿模式，仅主画布。  

**三种入口方案对比**：

| 入口方式 | 优点 | 风险 |
|---|---|---|
| 独立页面 | 概念清晰 | 脱离项目上下文 |
| 画布内切换 | 上下文连续 | 复杂度上升 |
| 分镜内进入 | 目标明确 | 仅局部探索，不适合全局灵感 |

**建议**：优先“画布内切换”，并支持“从分镜进入草稿”，避免割裂。  

### 2.8 侧边栏优化（7.2 批注）

**批注**：Tapnow 风格小图标栏是否可行？  
**现状**：`LeftSidebarNew` 宽度固定、场景默认展开。  
**建议**：
- 加 icon rail（48px）  
- 主面板默认折叠场景  
- 提供“紧凑模式”开关

### 2.9 Phase 优先级调整（9 批注）

**批注**：Phase 1 应优先封装已有 Agent 能力为 Skills/指令。  
**现状**：Agent 能力已有，但 UI 未封装为指令集合。  
**建议**：
- P0 增加“指令面板/快捷按钮”，优先覆盖 4 个核心指令  
- Phase 1 保持 UI 闭环，技能系统先做轻量封装

---

## 3. 结论与关键决策建议

1. **首页创建后应进入策划页**（而非直接画布）  
2. **进入画布确认逻辑采用软约束**（可跳过角色/资产）  
3. **优先实现四个核心批量指令**，Jimeng 批量需要补 tool  
4. **草稿模式建议画布内切换 + 分镜入口**  
5. **侧边栏先做 icon rail + 折叠/紧凑模式**（不动数据层）

---

## 4. 需要你最终拍板的问题

1. 首页创建后默认进入策划页，是否确认？  
2. 进入画布弹窗的最低检查条件是否仅“剧本或至少 1 场景 + 1 镜头”？  
3. 草稿模式入口优先级是否同意“画布内切换为主”？  
4. Jimeng 批量生成是否需要加入 Agent 工具（或先放 Pro 模式）？

