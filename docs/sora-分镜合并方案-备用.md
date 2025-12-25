# Sora 视频与分镜对应关系 - 备用方案与现状

> 此文档为备用方案的延伸记录。当前已上线“轻量多镜头任务映射”，更复杂的 `video_clips` 方案仍作为备选。

## 现状 (已落地)

- **多镜头任务**：Sora 单任务可覆盖多个分镜，任务保存到 `sora_tasks`，字段包含 `shot_ids` 与 `shot_ranges`。
- **时间轴合并显示**：时间轴将同一任务的视频合并为一个连续块展示。
- **写回策略**：单镜头任务会写回 `shots.video_clip`；多镜头任务仅保留在任务队列与映射中。
- **显式指定分镜**：Agent 工具支持 `generateShotsVideo(shotIds/shotIndexes/globalShotIndexes)` 触发指定分镜生成。

## 问题背景

潜在需求：**一个 Sora 视频可以覆盖多个分镜**，并支持更细粒度的视频片段管理与绑定。

---

## 备选方案

### 数据模型

```typescript
// 新增：视频片段(Clip)概念
interface VideoClip {
  id: string;
  shotIds: string[];        // 覆盖的分镜 ID 列表
  videoUrl: string;         // R2 视频 URL
  soraTaskId: string;       // Sora 任务 ID
  duration: number;         // 视频实际时长
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// Shot 增加字段
interface Shot {
  ...
  videoClipId?: string;     // 关联的视频片段 ID
}
```

### UI 交互设计

#### 分镜选择器（批量生成时）
```
┌────────────────────────────────────────────────┐
│  选择要生成视频的分镜                           │
├────────────────────────────────────────────────┤
│  ☑ Scene 1                                     │
│    ☑ Shot 1-3 (合并为一个视频)                 │
│    ☐ Shot 4-5                                  │
│  ☑ Scene 2                                     │
│    ☑ Shot 1-2 (合并为一个视频)                 │
└────────────────────────────────────────────────┘
```

#### 分镜合并规则
- **自动合并**：连续分镜如果总时长 ≤ 10s，自动合并为一个视频
- **手动合并**：用户可以手动选择哪些分镜合并
- **单独生成**：用户可以选择单个分镜独立生成

---

## 实现步骤

### Phase 1：数据模型更新
1. 在 Supabase 新增 `video_clips` 表
2. 更新 `shots` 表，添加 `video_clip_id` 字段
3. 更新 TypeScript 类型定义

### Phase 2：批量生成逻辑
1. 修改 `BatchSoraService`，支持按视频片段提交任务
2. 实现自动合并算法（连续分镜 + 时长限制）
3. 视频下载后更新 `video_clips` 表

### Phase 3：Timeline 显示
1. `Timeline.tsx` 按 `video_clip_id` 分组显示
2. 同一视频片段的分镜显示为一个连续条带
3. 点击播放时从对应时间点开始

### Phase 4：Agent 工具更新
1. 添加 `selectShotsForVideo` 工具，让用户通过 Agent 指定分镜
2. 添加 `mergeShotsToClip` 工具，合并分镜为视频片段

---

## 风险评估

| 问题 | 风险等级 | 说明 |
|------|----------|------|
| 过度设计 | 高 | 目前用户只通过 Agent 生成视频，不需要复杂 UI |
| 数据迁移 | 中 | 新增表和字段需要迁移现有数据 |
| 影响现有功能 | 中 | 可能破坏现有视频生成和显示逻辑 |
| 开发成本 | 高 | 需要修改多个核心模块 |

---

## 决定

**暂不实施 `video_clips` 方案**，继续保留轻量实现：
- 以 `sora_tasks.shot_ids / shot_ranges` 作为多镜头映射
- 时间轴合并展示一个视频块
- 单镜头任务自动写回 `shots.video_clip`

后续如有明确需求再考虑实施。
