# Sora2 集成 - 架构与流程文档

本项目已成功集成 Sora2 视频生成能力。集成方案遵循“非侵入式 Adapter 模式”，确保不影响现有系统（如 Seedream/Gemini 生图）的稳定性。

## 1. 核心变更摘要

| 模块 | 变更内容 | 目的 |
| :--- | :--- | :--- |
| **Data Persistence** | `UnifiedDataService` in Orchestrator | **数据持久化 (Fixed)**。Sora 任务 ID 和角色注册信息 (@username) 现已实时写入数据库，防止任务丢失。 |
| **SoraPromptService** | Pipe Structure | **Prompt 结构化优化**。采用 **[Subject] [Action] [Environment] [Camera] [Style]** 结构，并加入防闪烁 (Anti-flicker) 关键词。 |
| **SoraOrchestrator** | Smart Splitting & Padding | **时长策略升级**：<br>1. **自动拆分**：>15s 场景自动拆分为多个任务 (Greedy Packing)。<br>2. **智能补足**：<5s 镜头强制补足至 **10s**，提升可用性。<br>3. **区间限制**：生成时长严格控制在 **10s - 15s** (Sora 2 最佳甜区)。 |
| **Agent Tools** | `generate_scene_video`<br>`batchGenerateProjectVideosSora` | 支持返回任务 ID 数组，适配场景拆分逻辑。 |
| **Image Gen** | Grid / JiMeng / Gemini | 默认支持的生图模式：<br>- **Gemini Grid** (2x2/3x3)<br>- **JiMeng (即梦 4.5)** (Seedream Mode)<br>- **Gemini Direct** |

## 2. 架构图解

```mermaid
graph TD
    User[User / Agent] -->|Call| Orchestrator[SoraOrchestrator]
    Orchestrator -->|1. Init| DBService[UnifiedDataService]
    Orchestrator -->|2. Check| CharStatus{Char Registered?}
    
    CharStatus -->|No| CheckRef[Check Ref Image]
    CheckRef -->|Calc Ratio| Reg[Kaponai: Create Ref Video]
    noteRef[Interactive Prompt:\n"Talks to camera, white bg"] -.-> Reg
    Reg -->|Get ID| UpdateData[DB: Update soraIdentity]
    CharStatus -->|Yes| SplitLogic
    UpdateData --> SplitLogic
    
    SplitLogic{Scene > 15s?} -->|Yes| Chunk[Split into multiple Tasks\n(Greedy Packing)]
    SplitLogic -->|No| Pad[Padding Logic\n(Min 10s, Max 15s)]
    
    Chunk --> PromptGen
    Pad --> PromptGen
    
    PromptGen[SoraPromptService] -->|3. Compile| Prompt[Pipe-Style Video Prompt]
    note[Structure:\nSubject-Action-Env-Cam-Style] -.-> PromptGen
    
    Prompt -->|4. Submit| API[Kaponai API]
    API -->|Task IDs| SaveTask[DB: Save Tasks to Scene]
    SaveTask --> Return[Return Task IDs]
```

## 3. 关键逻辑说明

### 3.1 角色参考视频优化
为了获得最佳的角色一致性，我们在注册角色时采取以下策略：
- **互动式 Prompt**：让角色*“faces the camera and talks naturally”*，捕捉面部动态。
- **白底背景**：强制 *Pure white background*。

### 3.2 时长与拆分策略 (Smart Duration)
针对 Sora 2 模型特性的深度优化：
- **智能拆分 (Splitting)**：若场景总时长超过 **15秒** (Sora 2 极限)，系统会自动将其拆分为多个任务 (Task 1, Task 2...)。
- **智能补足 (Padding)**：若场景总时长极短 (如单个3秒镜头)，系统会强制将其请求时长提升至 **10秒**。这是为了利用 Sora 的能力延展细节，避免生成无效废片，并为后期剪辑留出空间。
- **缓冲策略**：所有计算出的时长额外增加 **2秒** 缓冲 (Clip Buffer)，但总时长严格限制在 `[10s, 15s]` 区间内。

### 3.3 Prompt 结构化 (Pipe Animation Style)
SoraPromptService 现采用严格的分层结构生成 Prompt：
1.  **Subject & Action**: 核心描述，包含 `@username`。
2.  **Environment**: 场景地点描述。
3.  **Camera**: 运镜参数。
4.  **Style**: 包含 `consistent character details`, `no morphing`, `stable footage`, `fluid motion` 等防闪烁与稳定性关键词。

### 3.4 成本控制
- **Sora-2** (10s-15s): **5 积分** (默认使用，性价最高)。
- **Sora-2 Pro**: (已禁用，除非手动开启 Pro 模式，单次 20 积分成本过高)。

## 4. 如何验证

### 自动验证
运行集成测试脚本：
```bash
npx tsx scripts/test-sora-integration.ts
```

### Agency 验证
在 Agent 模式下输入：“帮我把当前场景生成 Sora 视频” 或 “批量生成视频”。
系统将自动处理角色注册、时长计算、任务拆分和数据库保存。请随时检查数据库 `scenes` 表中的 `sora_generation` 字段确认任务状态。
