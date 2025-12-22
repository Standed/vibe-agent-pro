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
    API -->|Task IDs| SaveTask[DB: Save Tasks to Scene]
    SaveTask --> Return[Return Task IDs]
```

## 3. 关键逻辑说明

### 3.1 动态比例识别 (Ratio Alignment)
为了避免 Sora 在生成 10s 参考视频时出现人物拉伸，系统会：
1. 下载角色原图并转化为 `Buffer`。
2. 使用 `image-size` 识别其宽高比。
3. 若 **高 > 宽** 则生成 `720x1280`，反之生成 `1280x720`。
4. 确保注册进系统的识别码（@username）拥有最精准的原始特征。

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

## 4. 如何验证

### 自动验证 (全链路)
运行全链路集成测试脚本（使用骷髅兵 & 林洛素材）：
```bash
npx tsx scripts/test-sora-full-flow.ts
```

### Agency 验证
在 Agent 模式下输入：“帮我把当前场景生成 Sora 视频” 或 “批量生成视频”。
系统将自动执行：比例分析 -> 角色注册 -> JSON 组装 -> 任务拆分。请检查数据库 `scenes` 表中的 `sora_generation` 字段确认任务状态。
