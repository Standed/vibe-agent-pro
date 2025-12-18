# Gemini 模型配置说明

## 📋 模型配置概览

### 当前模型配置（2025-12-18更新）

| 功能模块 | 使用模型 | Temperature | 说明 |
|---------|---------|-------------|------|
| **AI自动分镜（5步流程）** | `gemini-3-pro-preview` | 1.0 | 精确、创造力强 ✨ |
| **Agent推理模式** | `gemini-3-pro-preview` | 0.3 | 精确推理 🎯 |
| **Gemini直出图片** | `gemini-3-pro-image-preview` | 1.0 | 高质量图片生成 🎨 |
| **Gemini Grid多视图** | `gemini-3-pro-image-preview` | 1.0 | 高质量多视图生成 🎨 |
| **Gemini图片编辑** | `gemini-3-pro-image-preview` | 1.0 | 高质量图片编辑 ✏️ |
| **Gemini图片分析** | `gemini-3-pro-preview` | - | 精确分析 👁️ |

---

## 🔧 配置详情

### 1. AI自动分镜（storyboardService.ts）

**使用场景**：
- 用户输入剧本 → AI自动分镜（5步流程）
- 角色设计提取
- 场景分析

**模型配置**：
```typescript
const MODEL_FULL = process.env.GEMINI_STORYBOARD_MODEL || 'gemini-3-pro-preview';
```

**环境变量**：
```env
GEMINI_STORYBOARD_MODEL=gemini-3-pro-preview
```

**为什么使用 Pro**：
- ✅ 推理能力强（适合5步流程）
- ✅ temperature=1.0 提供足够创造力

---

### 2. Agent推理模式（agentService.ts）

**使用场景**：
- Agent对话模式
- 工具调用（Function Calling）
- 多轮对话推理

**模型配置**：
```typescript
const GEMINI_MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview';
generationConfig: {
  temperature: 0.3, // Agent推理需要精确性，使用较低的temperature
  maxOutputTokens: MAX_OUTPUT_TOKENS,
}
```

**环境变量**：
```env
GEMINI_AGENT_MODEL=gemini-3-pro-preview
```

**为什么使用 Pro + 低temperature**：
- ✅ 推理能力强（用户体验好）
- ✅ 支持Function Calling
- 🎯 **temperature=0.3**：Agent推理需要精确的工具调用和逻辑推理，不需要过多创造力

---

### 3. Gemini图片生成（gemini-image, gemini-grid, gemini-edit）

**使用场景**：
- Gemini直出单张图片
- Gemini Grid多视图（2x2, 3x3）
- 图片编辑

**模型配置**：
```typescript
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
generationConfig: {
  temperature: 1.0,
  imageConfig: {
    aspectRatio: '16:9',
    imageSize: '4K', // Grid使用4K，单图使用2K
  }
}
```

**为什么使用 Pro Image**：
- ✅ 图片质量最高
- ✅ 支持多视图Grid生成
- ✅ 专为图片生成优化

---

### 4. Gemini文本生成（gemini-text）

**使用场景**：
- 通用文本生成
- 提示词优化
- 内容分析

**模型配置**：
```typescript
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';
temperature: 1.0
```

**环境变量**：
```env
GEMINI_TEXT_MODEL=gemini-3-pro-preview
```

---

## 🎯 Temperature 配置策略

**不同场景使用不同的 temperature**：

### Temperature = 1.0（高创造力）
**适用场景**：
- ✨ **AI自动分镜**：需要丰富的创意和多样化的分镜设计
- 🎨 **图片生成**：需要创造性的视觉构图和艺术表现
- 📝 **文本创作**：需要创意内容生成

**为什么**：
- 内容创作需要最大化创造力
- 用户期望AI提供创意内容，而非保守输出
- 视觉艺术需要多样化的表现形式

### Temperature = 0.3（精确推理）
**适用场景**：
- 🎯 **Agent推理**：需要精确的工具调用和逻辑推理
- 🔍 **代码生成**：需要准确的语法和结构
- 📊 **数据分析**：需要精确的结果

**为什么**：
- Agent推理需要精确执行工具调用
- Function Calling需要稳定的输出格式
- 逻辑推理不需要过多随机性

---

## 💰 成本对比

| 模型 | 相对成本 | 速度 | 适用场景 |
|------|---------|------|---------|
| `gemini-3-pro-preview` | 💰💰 中 | ⚡ 中 | 文本、推理、分析 |
| `gemini-3-pro-image-preview` | 💰💰💰 高 | ⚡ 慢 | 图片生成、编辑 |

**成本说明**：
- 文本/推理任务统一使用 Pro 模型（稳定可用）
- 保留图片生成使用 Pro Image → **保证质量**

---

## 📝 配置文件位置

### 服务层（Service Layer）
```
src/services/
├── storyboardService.ts     # AI自动分镜
├── agentService.ts           # Agent推理
└── geminiService.ts          # 图片生成辅助
```

### API路由层（API Routes）
```
src/app/api/
├── gemini-text/route.ts      # 文本生成
├── gemini-generate/route.ts  # 通用生成
├── gemini-analyze/route.ts   # 图片分析
├── gemini-image/route.ts     # 单图生成
├── gemini-grid/route.ts      # Grid多视图
└── gemini-edit/route.ts      # 图片编辑
```

---

## 🔄 环境变量配置

可以通过环境变量覆盖默认模型（按功能区分，灵活配置）：

```env
# AI自动分镜（5步流程）
GEMINI_STORYBOARD_MODEL=gemini-3-pro-preview

# Agent推理模式（工具调用）
GEMINI_AGENT_MODEL=gemini-3-pro-preview

# 通用文本生成
GEMINI_TEXT_MODEL=gemini-3-pro-preview

# 图片分析
GEMINI_ANALYZE_MODEL=gemini-3-pro-preview

# 图片生成（Gemini直出、Grid多视图、图片编辑）
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

**灵活配置示例**：
```env
# 假设未来Flash模型可用，可以这样分配：
GEMINI_STORYBOARD_MODEL=gemini-3-flash-preview  # 分镜用Flash（快速）
GEMINI_AGENT_MODEL=gemini-3-pro-preview         # Agent用Pro（精确）
GEMINI_TEXT_MODEL=gemini-3-flash-preview        # 文本用Flash（经济）
GEMINI_ANALYZE_MODEL=gemini-3-flash-preview     # 分析用Flash（快速）
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview   # 图片用Pro Image（质量）
```

---

## ✅ 验证清单

部署后验证以下功能：

- [ ] AI自动分镜正常工作（使用Pro模型）
- [ ] Agent对话响应精确（使用Pro模型，temperature=0.3）
- [ ] Gemini直出图片质量高（使用Pro Image模型）
- [ ] Gemini Grid生成正常（使用Pro Image模型）
- [ ] 分镜创作有足够创造力（temperature=1.0）

---

## 🐛 常见问题

### Q: 为什么选择Pro模型而不是Flash？
**A**:
- Flash模型（gemini-3-flash-preview）目前在谷歌云上还未正式发布
- Pro模型（gemini-3-pro-preview）稳定可用，推理能力强
- 图片生成需要Pro Image模型才能保证质量

### Q: Temperature=1.0会导致输出不稳定吗？
**A**:
- 对于文本生成，1.0提供最大创造力，适合内容创作
- 对于图片生成，1.0提供更丰富的视觉创意
- 如果需要更稳定的输出，可以在API调用时覆盖temperature参数

### Q: 如何调整模型配置？
**A**:
1. **推荐方式**：在 `.env.local` 中按功能设置独立的环境变量（优先级最高）
   ```env
   # 分别配置不同功能的模型
   GEMINI_STORYBOARD_MODEL=gemini-3-pro-preview
   GEMINI_AGENT_MODEL=gemini-3-pro-preview
   GEMINI_TEXT_MODEL=gemini-3-pro-preview
   GEMINI_ANALYZE_MODEL=gemini-3-pro-preview
   GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
   ```
2. **代码层兜底**：项目中的默认值（`|| 'gemini-3-pro-preview'`）仅作为后备，不建议直接修改硬编码
3. **灵活配置**：不同功能可以使用不同模型，例如Agent用Pro保证精确性，分镜用Flash提升速度（当Flash可用时）

---

**更新时间**: 2025-12-18
**版本**: v1.0
**维护者**: Claude Code + 西羊石团队
