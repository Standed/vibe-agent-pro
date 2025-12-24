# Sora2 集成 - 架构与流程文档 (v2.0 - 精简协议版)

本项目已成功集成 Sora2 视频生成能力。当前版本通过“动态比例识别”与“精简 JSON 剧本协议”，极大提升了角色一致性与镜头质感。

## 1. 核心变更摘要

| 模块 | 变更内容 | 目的 |
| :--- | :--- | :--- |
| **Dynamic Ratio** | Image Buffer Detection | **动态比例识别**。通过 `image-size` 读取原图 Buffer，自动生成 **16:9** 或 **9:16** 的 10s 参考视频，防止人物变形。 |
| **Lean JSON** | Key-mapped by `@username` | **精简剧本协议**。`character_setting` 移除冗余中文名，仅保留 `@username` 作为唯一 Key；移除 `visual` 冗余字段。 |
| **Action Injection** | Shot Type + narrative | **叙事增强**。在 `action` 字段显式注入 **Shot Type (景别)** 元数据（如：Close-Up），极大增强视觉冲击力。 |
| **Quality Control** | Chinese Mandated Prompts | **中文硬核控质**。在 Prompt 末尾追加“中文配音、无字幕、高清、无闪烁”等强制指令，锁定最高生成质量。 |
| **SoraOrchestrator** | Smart Splitting & Padding | **时长策略**：生成时长严格控制在 **10s - 15s**，>15s 场景自动执行 Greedy Packing 拆分。 |
| **Task Mapping** | `shot_ids` + `shot_ranges` | **合并任务映射**。为合并视频任务保存分镜列表与时间段，便于队列展示和自动回写。 |
| **Task Queue** | Batch refresh + auto writeback | **任务队列**。支持批量刷新状态、自动回写分镜视频、减少前端轮询噪音。 |
| **R2 Persist** | Server-side upload | **R2 持久化**。完成任务自动上传 R2，避免 `kaponai_url` 过期。 |
| **Admin Repair** | Batch repair route | **后台修复**。支持按类型并发修复，补 R2 + 回写分镜。 |

## 2. 架构图解

```mermaid
graph TD
    User[User / Agent] -->|Call| Orchestrator[SoraOrchestrator]
    Orchestrator -->|1. Init| DBService[UnifiedDataService]
    Orchestrator -->|2. Check| CharStatus{Char Registered?}
    
    CharStatus -->|No| CheckRef[Check Ref Image]
    CheckRef -->|Buffer: Detect Ratio| Reg[Kaponai: Create Ref Video]
    noteRef[Interactive Prompt:\n"Faces lens, speaks, white bg"] -.-> Reg
    Reg -->|Get ID| UpdateData[DB: Update soraIdentity]
    CharStatus -->|Yes| SplitLogic
    UpdateData --> SplitLogic
    
    SplitLogic{Scene > 15s?} -->|Yes| Chunk[Split into multiple Tasks\n(Greedy Packing)]
    SplitLogic -->|No| Pad[Padding Logic\n(Min 10s, Max 15s)]
    
    Chunk --> ShotConv
    Pad --> ShotConv
    
    ShotConv[convertShotToSoraShot] -->|3. Compile| JSON[Lean JSON Script]
    note[New Protocol:\nShotType + @ID Action + Quality Suffix] -.-> ShotConv
    
    JSON -->|4. Submit| API[Kaponai API]
    API -->|Task IDs| SaveTask[DB: Save Tasks\nsora_tasks + scene.soraGeneration]
    SaveTask --> Return[Return Task IDs]
    SaveTask --> Queue[Timeline Queue\nBatch Refresh + Auto Writeback]
    Queue -->|Completed| R2[R2 Upload + Persist URL]
```

## 3. 关键逻辑说明

### 3.1 动态比例双轨制 (Dual-Track Aspect Ratio)
系统采用“注册跟随源图，生成跟随项目”的双轨制策略：
1. **角色注册 (Character Registration)**：
   - 严格跟随**输入参考图**的比例。
   - 逻辑：高 > 宽 -> 生成 **9:16 (720x1280)**；宽 >= 高 -> 生成 **16:9 (1280x720)**。
   - 目的：确保 Sora 学习到的角色特征（@username）不发生拉伸畸变，完美还原立绘比例。
2. **正片生成 (Storyboard Generation)**：
   - 严格跟随**项目全局设置**的比例。
   - 逻辑：项目设为 16:9 -> 所有分镜生成 1280x720；项目设为 9:16 -> 生成 720x1280。
   - 目的：Sora 模型会自动将已注册的角色（即使是竖屏学来的）适配进横屏场景中，确保最终成片符合视频规范。

### 3.2 精简 JSON 协议 (Lean Protocol)
废弃了臃肿的模板，采用更符合大模型理解的精简结构：
- **Character Key**: 仅保留 `@username`。
- **Action Fusion**: 将“景别 + 叙事文本 + 质量指令”全部合入 `action` 字段。
- **ID Replacement**: 自动将描述中的“林洛”等中文名替换为专属码，实现多角色一致性。

### 3.3 中文硬核质量控制 (Quality Enforcement)
在每个分镜末尾固定注入以下指令：
> “。中文配音，不要增减旁白，无字幕，高清，无配乐，画面无闪烁。请根据这个参考图片里的场景帮我生成动画。”
这种“强引导”模式在实测中能显著降低 flickering (闪烁) 的发生率，并确保字幕、旁白和配乐不会干扰后期制作。

### 3.4 时长与拆分策略 (Smart Duration)
- **拆分逻辑**：若场景总时长超过 **15秒**，自动拆分为多段任务。
- **补足逻辑**：若时长极短，强制补足至 **10秒**，为剪辑预留空间。

### 3.5 任务追踪与分镜映射 (Task Mapping)
- 合并任务会写入 `sora_tasks.shot_ids` 与 `sora_tasks.shot_ranges`。
- Timeline 可将同一条合并视频自动挂到多个分镜。
- 若无 `shot_ids`，需要手动绑定或后台修复补录。

### 3.6 队列刷新与回写 (Queue Refresh)
- 支持批量状态刷新（Batch API），减少多次请求与提示噪音。
- 任务完成后自动回写 `shots.video_clip` 与 `sora_tasks.r2_url`。

### 3.7 后台修复 (Admin Repair)
- `/api/admin/sora/repair` 支持按类型修复：
  - `character_reference`：补 R2 + 自动注册
  - `shot_generation`：补 R2 + 分镜回写

## 4. 如何验证

### 自动验证 (全链路)
运行全链路集成测试脚本（使用骷髅兵 & 林洛素材）：
```bash
npx tsx scripts/test-sora-full-flow.ts
```

### Agency 验证
在 Agent 模式下输入：“帮我把当前场景生成 Sora 视频” 或 “批量生成视频”。
系统将自动执行：比例分析 -> 角色注册 -> JSON 组装 -> 任务拆分。请检查数据库 `scenes` 表中的 `sora_generation` 字段确认任务状态。

### 任务队列验证
- 打开 Timeline 任务队列，点击“刷新状态”。
- 已完成任务会自动上传 R2 并回写分镜。
