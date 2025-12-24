# Sora 视频生成 - 架构与流程文档 (v2.1)

本项目已成功集成 Sora2 视频生成能力。当前版本通过"动态比例识别"与"精简 JSON 剧本协议"，极大提升了角色一致性与镜头质感。

---

## 1. 核心服务文件

| 服务 | 文件路径 | 职责 |
|------|----------|------|
| **SoraOrchestrator** | `src/services/SoraOrchestrator.ts` | 总导演：角色注册、场景拆分、任务编排 |
| **KaponaiService** | `src/services/KaponaiService.ts` | Sora API 底层封装 (创建视频、查询状态、下载) |
| **CharacterConsistencyService** | `src/services/CharacterConsistencyService.ts` | 角色参考视频生成与注册 |
| **SoraPromptService** | `src/services/SoraPromptService.ts` | Sora 专用提示词生成与角色码注入 |

---

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
    
    SplitLogic{Scene > 15s?} -->|Yes| Chunk[Split into multiple Tasks\n Greedy Packing]
    SplitLogic -->|No| Pad[Padding Logic\n Min 10s, Max 15s]
    
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

### 3.2 视频生成流程

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
   ↓
5. 提交视频任务 (Kaponai createVideo)
   ↓
6. 保存任务 ID 到数据库
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
  ]
}
```

### 4.3 质量控制指令

Prompt 末尾自动注入：
> "中文配音，不要增减旁白，无字幕，高清，无配乐，画面无闪烁。请根据这个参考图片里的场景帮我生成动画。"

### 4.4 时长策略

| 场景时长 | 处理方式 |
|----------|----------|
| < 8s 且单镜头 | 生成 10s 视频 |
| 8-15s | 生成 15s 视频 |
| > 15s | Greedy Packing 拆分为多段 |

---

## 5. API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/sora/generate` | POST | 提交视频生成任务 |
| `/api/sora/status` | GET | 查询任务状态 |
| `/api/sora/character/register` | POST | 角色注册 (直接/生成+注册) |
| `/api/sora/character/status` | GET | 查询角色注册状态 |
| `/api/sora/character/latest-video` | GET | 获取角色最新参考视频 |
| `/api/admin/sora/repair` | POST | 批量修复任务 (补 R2/回写分镜) |

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

## 7. 如何验证

### 全链路测试
```bash
npx tsx scripts/test-sora-full-flow.ts
```

### Agent 验证
在 Agent 模式下输入：
- "帮我把当前场景生成 Sora 视频"
- "批量生成视频"

### 数据库验证
检查以下表/字段：
- `sora_tasks` 表 - 任务状态
- `scenes.sora_generation` - 场景生成状态
- `characters.metadata.soraIdentity` - 角色注册状态

---

**最后更新**: 2025-12-24
**版本**: v2.1
