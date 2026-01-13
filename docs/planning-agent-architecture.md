# 策划模式 AI 意图识别架构

> 本文档描述策划模式（Planning Mode）中的 AI 意图识别架构设计。

## 架构概览

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│  本地快速预检 (planningIntentService)        │
│  - 关键词匹配判断是否需要 AI                   │
│  - 简单操作直接处理（如纯查询）                │
└─────────────────┬───────────────────────────┘
                  │ 需要 AI 处理
                  ▼
┌─────────────────────────────────────────────┐
│  AI 意图识别 (planningAgentService)          │
│  - Gemini Function Calling                   │
│  - 上下文压缩优化 Token 消耗                  │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  工具执行层                                  │
│  - 危险操作触发确认弹窗                       │
│  - 调用 Store 方法执行操作                    │
└─────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 职责 |
|-----|------|
| `planningToolDefinitions.ts` | 策划模式工具定义（JSON Schema） |
| `planningAgentService.ts` | AI 意图识别服务（调用 Gemini） |
| `planningIntentService.ts` | 本地快速预检 + 降级方案 |
| `PlanningView.tsx` | 集成并编排上述服务 |

## 工具定义

### 危险操作（需确认）
- `deleteScenes` - 删除场景
- `deleteShots` - 删除镜头
- `deleteCharacters` - 删除角色
- `deleteLocations` - 删除地点

### 安全操作
- `queryAssets` - 查询资产
- `modifyScene` - 修改场景
- `modifyShot` - 修改镜头
- `addScene` - 添加场景
- `addCharacter` - 添加角色

## 上下文优化策略

为减少 Token 消耗：
1. **压缩上下文**：只发送 ID、名称、编号，不发送详细描述
2. **本地预检**：简单操作不调用 AI
3. **使用 Flash 模型**：`gemini-2.0-flash-lite` 更快更便宜

## 降级策略

当 AI 服务不可用时：
1. 回退到 `planningIntentService.ts` 的正则匹配
2. 给用户友好提示，引导使用 UI 操作
