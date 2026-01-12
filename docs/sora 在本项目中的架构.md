# Sora 视频生成 - 架构与流程文档 (v2.3)

本项目已成功集成 Sora2 视频生成能力。当前版本通过"动态比例识别"、"精简 JSON 剧本协议"与**全局 Prompt 后缀**，提升角色一致性与镜头质感，并支持**单任务覆盖多分镜**以及**Pro模式独立创作**。

---

## 1. 核心服务文件

| 服务 | 文件路径 | 职责 |
|------|----------|------|
| **SoraOrchestrator** | `src/services/SoraOrchestrator.ts` | 总导演：角色注册、场景拆分、任务编排 |
| **KaponaiService** | `src/services/KaponaiService.ts` | Sora API 底层封装 (创建视频、查询状态、下载) |
| **CharacterConsistencyService** | `src/services/CharacterConsistencyService.ts` | 角色参考视频生成与注册 |
| **SoraPromptService** | `src/services/SoraPromptService.ts` | Sora 专用提示词生成与角色码注入 |
| **soraCharacterReplace** | `src/utils/soraCharacterReplace.ts` | **[New]** 角色@提及自动替换工具 |

---

## 2. 架构图解

```mermaid
graph TD
    User[User / Agent] -->|Call| Orchestrator[SoraOrchestrator]
    ProUser[Pro Mode] -->|Direct Call| API[Kaponai API]
    
    Orchestrator -->|1. Init| DBService[UnifiedDataService]
    Orchestrator -->|2. Check| CharStatus{Char Registered?}
    
    CharStatus -->|No| CheckRef[Check Ref Image]
    CheckRef -->|Buffer: Detect Ratio| Reg[Kaponai: Create Ref Video]
    noteRef[Interactive Prompt:\n"Faces lens, speaks, white bg"] -.-> Reg
    Reg -->|Get ID| UpdateData[DB: Update soraIdentity]
    CharStatus -->|Yes| SplitLogic
    UpdateData --> SplitLogic
    
    SplitLogic{Scene > 15s?} -->|Yes| Chunk[Split into multiple Tasks\n Greedy Packing]
    SplitLogic -->|No| Pad[Padding Logic\n Min 10s, Max 15s]
    
    Chunk --> ShotConv
    Pad --> ShotConv
    
    ShotConv[convertShotToSoraShot] -->|3. Compile| JSON[Lean JSON Script + global_prompt]
    note[New Protocol:\nShotType + @ID Action + global_prompt] -.-> ShotConv
    
    JSON -->|4. Submit| API
    ProUser -->|Submit| API
    
    API -->|Task IDs| SaveTask[DB: Save Tasks\nsora_tasks(shotIds/shotRanges) + scene.soraGeneration]
    SaveTask --> Return[Return Task IDs]
    SaveTask --> Queue[Timeline Queue\nBatch Refresh + Auto Writeback]
    Queue -->|Completed| R2[R2 Upload + Persist URL]
```

---

## 3. 核心流程

### 3.1 角色注册流程

```
1. 检查角色是否已有 @username
   ↓ (无)
2. 获取角色参考图 → 下载到临时文件
   ↓
3. 检测图片比例 (image-size)
   ↓
4. 生成参考视频 (Kaponai createVideo)
   - model: sora-2
   - seconds: 10
   - size: 根据图片比例选择 1280x720 或 720x1280
   ↓
5. 等待视频完成 (waitForCompletion) ⚠️ 阻塞调用
   ↓
6. 上传到 R2 持久化
   ↓
7. 注册角色 (Kaponai createCharacter)
   ↓
8. 获取 @username → 保存到数据库
```

### 3.2 视频生成流程 (Agent模式)

```
1. 识别场景涉及的角色
   ↓
2. 确保所有角色已注册 (ensureCharactersRegistered)
   ↓
3. 智能拆分场景 (splitShotsIntoChunks)
   - 单段最大 14s，超出则拆分
   ↓
4. 构建 Lean JSON 剧本
   - character_setting: { "@username": { appearance: "..." } }
   - shots: [{ action, camera, dialogue, duration, ... }]
   - global_prompt: "统一质量控制后缀"
   ↓
5. 提交视频任务 (Kaponai createVideo)
   ↓
6. 保存任务 ID 到数据库 (shotIds/shotRanges)
```

### 3.3 Pro模式生成流程 **[New]**

```
1. 用户输入提示词 (支持 @角色名)
   ↓
2. 自动替换角色码 (replaceSoraCharacterCodes)
   - 匹配 @角色名 或 角色全名 → 替换为 @sora_id
   ↓
3. 提交任务 (/api/sora/generate)
   ↓
4. 前端轮询任务状态
   ↓
5. 完成后在聊天显示视频
   ↓
6. 用户点击"应用到分镜" → 绑定到当前分镜
```

---

## 4. 关键设计决策

### 4.1 动态比例双轨制 (Dual-Track Aspect Ratio)

| 阶段 | 比例策略 | 目的 |
|------|----------|------|
| **角色注册** | 跟随**输入参考图**比例 | 确保角色特征不畸变 |
| **正片生成** | 跟随**项目全局设置**比例 | 确保成片符合视频规范 |

### 4.2 精简 JSON 协议 (Lean Protocol)

```json
{
  "character_setting": {
    "@abc123": { "appearance": "精灵少女，金色长发..." }
  },
  "shots": [
    {
      "action": "Shot Type: Close-Up. @abc123 凝视远方...",
      "camera": "Static",
      "dialogue": { "role": "@abc123", "text": "这就是命运吗？" },
      "duration": 5,
      "location": "森林",
      "style_tags": "cinematic",
      "time": "Day"
    }
  ],
  "global_prompt": "中文配音，不要增减旁白，无字幕，高清，无配乐，画面无闪烁。请根据这个参考图片里的场景帮我生成动画。"
}
```

### 4.3 质量控制指令

统一在脚本层级注入（`global_prompt`），确保仅追加一次：
> "中文配音，不要增减旁白，无字幕，高清，无配乐，画面无闪烁。请根据这个参考图片里的场景帮我生成动画。"

### 4.4 多镜头任务映射与提示 **[Updated]**

- **映射逻辑**：单个 Sora 任务可覆盖多个分镜。`sora_tasks.shot_ids` 记录覆盖镜头。
- **时间轴显示**：将同一任务渲染为一个连续的视频块（Video Group）。
- **自动绑定 (Agent模式)**：当多镜头任务（如覆盖镜头7-10）完成时，系统会自动将生成的视频 URL 回写到**所有涉及分镜**（Shot 7, 8, 9, 10）的 `video_clip` 字段，并追加到各自的 `generationHistory` 中。
- **手动绑定 (Pro模式)**：Pro 模式生成的视频需用户手动点击“应用到分镜”，目前仅支持应用到当前选中的**单个分镜**，并保存到该分镜的历史记录中。
- **覆盖提示**：当任务完成时，若检测到任务更新时间在最近 1 分钟内，前端会弹出 Toast 提示。对于多镜头任务，提示会明确指出覆盖范围。

### 4.5 视频版本管理 **[New]**

- **历史记录**：无论是 Agent 自动生成还是 Pro 手动应用，所有视频结果都会被保存到对应分镜的 `generationHistory` 字段。
- **回退机制**：用户可以在分镜详情页（Shot Detail Panel）的“生成历史”区域查看所有历史视频，并一键回退/切换版本。
- **多镜头回退**：对于多镜头任务生成的视频，它会分别存在于每个涉及分镜的历史记录中，用户需分别对每个分镜进行回退操作（如果需要完全撤销）。

### 4.6 时长策略

| 场景时长 | 处理方式 |
|----------|----------|
| < 8s 且单镜头 | 生成 10s 视频 |
| 8-15s | 生成 15s 视频 |
| > 15s | Greedy Packing 拆分为多段 |

---

## 5. API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/agent/tools/execute` | POST | Agent 触发 Sora 编排入口 |
| `/api/sora/generate` | POST | Pro模式直接生成入口 |
| `/api/sora/status` | GET | 查询任务状态 |
| `/api/sora/status/batch` | POST | 批量查询/刷新任务状态 |
| `/api/sora/tasks` | GET | **[New v2.5]** 查询分镜已完成视频 |
| `/api/sora/tasks/list` | GET | 查询项目 Sora 任务列表 |
| `/api/sora/tasks/backfill` | POST | 回填任务到 `sora_tasks` |
| `/api/sora/character/register` | POST | 角色注册 (直接/生成+注册) |
| `/api/sora/character/status` | GET | 查询角色注册状态 |
| `/api/sora/character/latest-video` | GET | 获取角色最新参考视频 |
| `/api/sora/character/manual` | POST | 手动写回 Sora 身份 |
| `/api/admin/sora/repair` | POST | 批量修复任务 (补 R2/回写分镜) |
| `/api/cron/check-sora-status` | GET | 定时轮询任务并回写状态 |

---

## 6. ⚠️ Serverless 部署警告

**当前实现在 Vercel Serverless 环境下存在严重限制：**

| 问题 | 位置 | 说明 |
|------|------|------|
| **阻塞调用** | `SoraOrchestrator.ensureCharactersRegistered` | `waitForCompletion` 轮询最长 50 分钟 |
| **Fire-and-Forget 失效** | `/api/sora/character/register` | `void promise` 在函数返回后被丢弃 |
| **文件系统** | `downloadTempFile`, `fs.writeFileSync` | 依赖 `/tmp` 目录，并发下可能耗尽 |

**解决方案**：
1. 使用容器化部署 (Railway, Zeabur, Cloud Run)
2. 或引入任务队列 (Inngest, QStash) 重构长时任务

---

## 7. 数据同步机制 **[New v2.4]**

### 7.1 Agent 生成视频 → Pro 模式显示

**问题**：Agent 模式生成的 Sora 视频通过 Cron 任务回写数据库，但 Pro 模式的聊天记录不会自动同步。

**解决方案**：

1. **Cron 任务插入消息**（主动）
   - 文件：`src/app/api/cron/check-sora-status/route.ts`
   - 当 Sora 任务完成时，自动往对应分镜的 Pro 模式聊天插入 `sora_video_complete` 消息。

2. **ChatPanel 自动补充**（兜底）
   - 文件：`src/components/chat/ChatPanel.tsx`
   - 加载 Pro 聊天时，检测分镜是否有 `videoClip` 但无对应消息，自动注入视频消息。

3. **ShotDetailPanel 远程刷新**
   - 文件：`src/store/useProjectStore.ts` → `refreshShot` action
   - 文件：`src/lib/dataService.ts` → `getShot` 方法
   - 组件挂载时从数据库拉取最新分镜数据。

### 7.2 状态规范化

Kaponai API 返回的 `status` 可能为 `'in_progress'`，但 Supabase 的 `sora_tasks` 表只允许：
- `pending`, `processing`, `completed`, `failed`

**映射规则**（`dataService.saveSoraTask`）：
- `'generating'` → `'processing'`
- `'in_progress'` → `'processing'`

---

## 8. 聊天 Markdown 支持 **[New v2.4]**

- **Agent 模式**：`src/components/agent/AgentPanel.tsx`
- **Pro 模式**：`src/components/chat/ChatBubble.tsx`

AI 助手回复使用 `react-markdown` + `remark-gfm` 渲染，支持：
- 粗体、斜体、删除线
- 代码块（含高亮）
- 列表、表格
- 链接

---

## 9. 如何验证

### 全链路测试
```bash
npx tsx scripts/test-sora-full-flow.ts
```

### Agent 验证
在 Agent 模式下输入：
- "帮我把当前场景生成 Sora 视频"
- "批量生成视频"

### Pro 模式验证
1. 切换到 Pro 模式，选择 "Sora 视频"
2. 输入包含 "@角色名" 的提示词
3. 验证是否自动替换为 Sora 码
4. 生成完成后点击 "应用到分镜"
5. **重新进入 Pro 模式，验证视频是否自动显示在聊天中**

### 数据库验证
检查以下表/字段：
- `sora_tasks` 表 - 任务状态和 `shot_ids`
- `shots.generation_history` - 分镜生成历史
- `scenes.sora_generation` - 场景生成状态
- `characters.metadata.soraIdentity` - 角色注册状态
- `chat_messages` - Pro 模式视频消息 (`metadata.type: 'sora_video_complete'`)

---

## 10. v2.5 新增内容

### 10.1 视频历史实时加载 Hook

**问题**：Cron Job 每天只执行一次（`vercel.json` 配置为 `0 0 * * *`），视频完成后需要等到第二天才能在 Pro 模式看到。

**解决方案**：

| 组件 | 路径 | 职责 |
|------|------|------|
| **useSoraVideoMessages** | `src/hooks/useSoraVideoMessages.ts` | 直接查询 sora_tasks，不依赖 Cron |
| **/api/sora/tasks** | `src/app/api/sora/tasks/route.ts` | 服务端查询接口 |

**Hook 使用示例**：
```typescript
const { videoMessages, loading, error, refresh } = useSoraVideoMessages(projectId, shotId);
```

**API 参数**：
- `projectId` (必须) - 项目 ID
- `shotId` (可选) - 按分镜过滤

### 10.2 状态刷新时更新历史

`TimelineView.tsx` 的 `applyStatusUpdate` 函数现在会：
1. 检测任务完成时，创建新的 `generation_history` 条目
2. 同时更新数据库和前端状态
3. 确保"刷新状态"后立即可见于 Pro 模式

### 10.3 架构图

```mermaid
graph TD
    subgraph "实时视频历史加载"
        A[ChatPanel 加载] --> B[useSoraVideoMessages Hook]
        B --> C[/api/sora/tasks]
        C --> D[查询 sora_tasks where status=completed]
        D --> E[返回 videoMessages]
        E --> F[合并到消息列表]
    end
    
    subgraph "Cron 备份机制"
        G[check-sora-status Cron] --> H[检测任务完成]
        H --> I[写入 generation_history]
        H --> J[插入 chat_messages]
    end
```

---

**最后更新**: 2026-01-12
**版本**: v2.5
