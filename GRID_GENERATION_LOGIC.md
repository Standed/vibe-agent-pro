# 🎬 Grid 生成功能逻辑说明

**最后更新**: 2025-01-02

---

## 📋 功能概述

Grid 生成功能允许你为场景中的多个分镜一次性生成 2x2 或 3x3 的图片网格，然后手动分配每个切片到对应的镜头。

---

## 🔄 完整工作流程

### 1️⃣ 用户操作 (ProPanel.tsx)

用户在 Pro Panel 中:
- 选择场景
- 选择 Grid 大小 (2x2 或 3x3)
- 输入额外的提示词（可选）
- 上传参考图（可选）
- 点击「生成 Grid」

### 2️⃣ 数据聚合 (ProPanel.tsx: 168-317)

系统自动聚合以下信息:

#### A. 场景上下文
```typescript
场景：${targetScene.description}
画风：${project.metadata.artStyle}
```

#### B. 分镜描述
对于场景中的每个未分配镜头，系统会提取:
- **镜头尺寸** (shotSize): 远景、全景、中景、近景、特写等
- **相机运动** (cameraMovement): 静止、推进、拉远、摇移等
- **镜头描述** (description): 具体的场景描述

**示例输出**:
```
分镜要求（4 个镜头）：
1. 中景 - 静止
   宇航员在火星沙漠中行走，背景是红色的岩石和远山
2. 近景 - 推进
   宇航员转头看向远方，头盔反射着阳光
3. 特写 - 静止
   宇航员手部特写，正在调整手腕上的设备
4. 全景 - 摇移
   火星地平线，宇航员的身影在画面右侧
```

#### C. 参考图聚合

系统会从以下来源收集参考图:

1. **用户上传的参考图** (referenceImages)
2. **角色资源库** (从 mainCharacters 关联的角色中提取 referenceImages)
3. **场景/位置资源库** (从 mainScenes 关联的位置中提取 referenceImages)

所有参考图会被转换为 base64 格式并去重。

#### D. 最终增强提示词

```typescript
const enhancedPrompt = `
场景：火星探索任务
画风：科幻写实风格

分镜要求（4 个镜头）：
1. 中景 - 静止
   宇航员在火星沙漠中行走，背景是红色的岩石和远山
2. 近景 - 推进
   宇航员转头看向远方，头盔反射着阳光
3. 特写 - 静止
   宇航员手部特写，正在调整手腕上的设备
4. 全景 - 摇移
   火星地平线，宇航员的身影在画面右侧

额外要求：添加更多细节
`;
```

### 3️⃣ Gemini API 调用 (geminiService.ts: 108-164)

#### A. 构建 Grid 提示词

系统将增强提示词包装在严格的 Grid 布局指令中:

```typescript
const gridPrompt = `MANDATORY LAYOUT: Create a precise 2x2 GRID containing exactly 4 distinct storyboard panels.
  - The output image MUST be a single image divided into a 2 (rows) by 2 (columns) matrix.
  - There must be EXACTLY 2 horizontal rows and 2 vertical columns.
  - Each panel must be completely separated by a thin, distinct, solid black line.
  - DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
  - The grid structure must be perfectly aligned for slicing.

  STORYBOARD CONTENT (Create 4 DIFFERENT shots based on these descriptions):

场景：火星探索任务
画风：科幻写实风格

分镜要求（4 个镜头）：
1. 中景 - 静止
   宇航员在火星沙漠中行走，背景是红色的岩石和远山
2. 近景 - 推进
   宇航员转头看向远方，头盔反射着阳光
3. 特写 - 静止
   宇航员手部特写，正在调整手腕上的设备
4. 全景 - 摇移
   火星地平线，宇航员的身影在画面右侧

额外要求：添加更多细节

  CRITICAL INSTRUCTIONS:
  - Each numbered description corresponds to ONE specific panel in the grid (read left-to-right, top-to-bottom).
  - Each panel MUST match its corresponding shot description EXACTLY (shot size, camera angle, action, characters).
  - DO NOT show the same scene from different angles - each panel is a DIFFERENT shot/scene.
  - If reference images are provided, use them for character/scene consistency across different shots.
  - Maintain consistent art style and lighting mood across all panels while showing different shots.

  Technical Requirements:
  - Cinematic lighting, high fidelity, 8k resolution.
  - Professional color grading and composition.
  - No text, no captions, no UI elements.
  - No watermarks.
  - No broken grid lines.`;
```

#### B. 调用 /api/gemini-grid

```typescript
const data = await postJson<{ fullImage: string }>('/api/gemini-grid', {
  prompt: gridPrompt,
  gridRows: 2,
  gridCols: 2,
  aspectRatio: '16:9',
  referenceImages: [
    { mimeType: 'image/png', data: 'base64...' },
    { mimeType: 'image/jpeg', data: 'base64...' }
  ]
});
```

### 4️⃣ 服务器端处理 (api/gemini-grid/route.ts)

服务器端:
1. 验证 API Key 和参数
2. 通过代理 (ProxyAgent) 调用 Google Gemini API
3. 接收返回的 Grid 图片 (base64 格式)
4. 返回给客户端

**关键配置**:
```typescript
// .env.local
GEMINI_API_KEY=AIzaSyBXkBdwuGy90VIyvFrhpuRQbIOXeJ1AcHA
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

### 5️⃣ 图片切片 (geminiService.ts: 42-97)

系统使用 Canvas API 将完整的 Grid 图片切分为独立的面板:

```typescript
const sliceImageGrid = (base64Data: string, rows: number, cols: number): Promise<string[]> => {
  // 1. 加载完整图片
  // 2. 计算每个切片的宽度和高度
  // 3. 使用 Canvas drawImage() 提取每个面板
  // 4. 返回独立的 base64 图片数组
};
```

**输出**:
```typescript
{
  fullImage: "data:image/png;base64,iVBORw0KG...",  // 完整的 Grid 图片
  slices: [
    "data:image/png;base64,panel1...",              // 左上
    "data:image/png;base64,panel2...",              // 右上
    "data:image/png;base64,panel3...",              // 左下
    "data:image/png;base64,panel4..."               // 右下
  ]
}
```

### 6️⃣ 手动分配 (ProPanel.tsx: 319-326)

系统显示 Grid 预览弹窗，用户可以:
- 查看完整的 Grid 图片
- 查看每个切片
- 手动将每个切片分配到对应的镜头
- 将未使用的切片收藏到资源库

---

## 🐛 之前的问题

### 问题描述

Grid 生成成功，但生成的图片与分镜描述不匹配，显示的是相同主题的不同角度（例如，4 个不同角度的宇航员），而不是 4 个不同的镜头。

### 根本原因

在 [geminiService.ts:119-137](src/services/geminiService.ts#L119-L137) 中，之前的提示词包含了错误的指令:

```typescript
// ❌ 之前的错误提示词
const gridPrompt = `...
  Subject Content: "${prompt}"

  Styling Instructions:
  - Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).
  - Maintain perfect consistency of the character/object across all panels.
  ...`;
```

这个提示词是为**角色三视图/参考图**设计的，而不是为**分镜故事板**设计的。

它告诉 Gemini:
- ❌ 显示"相同主题的不同角度"
- ❌ "保持角色/物体的完美一致性"

但分镜故事板需要:
- ✅ 显示"不同的镜头/场景"
- ✅ 每个面板匹配对应的分镜描述

---

## ✅ 修复方案

### 修改内容

在 [geminiService.ts:119-143](src/services/geminiService.ts#L119-L143) 中，将提示词改为分镜故事板专用:

```typescript
// ✅ 修复后的正确提示词
const gridPrompt = `MANDATORY LAYOUT: Create a precise ${gridType} GRID containing exactly ${totalViews} distinct storyboard panels.
  ...

  STORYBOARD CONTENT (Create ${totalViews} DIFFERENT shots based on these descriptions):

${prompt}

  CRITICAL INSTRUCTIONS:
  - Each numbered description corresponds to ONE specific panel in the grid (read left-to-right, top-to-bottom).
  - Each panel MUST match its corresponding shot description EXACTLY (shot size, camera angle, action, characters).
  - DO NOT show the same scene from different angles - each panel is a DIFFERENT shot/scene.
  - If reference images are provided, use them for character/scene consistency across different shots.
  - Maintain consistent art style and lighting mood across all panels while showing different shots.
  ...`;
```

### 关键改进

1. **明确指出这是分镜故事板** - "storyboard panels" 而不是 "multi-view grid"
2. **强调每个面板是不同的镜头** - "DIFFERENT shots" 而不是 "same subject from different angles"
3. **一对一映射** - 每个编号描述对应一个特定面板
4. **严格匹配要求** - 必须精确匹配镜头尺寸、相机角度、动作和角色
5. **参考图用途说明** - 用于角色/场景一致性，而不是复制相同场景

---

## 🎯 预期效果

### 修复前
输入 4 个不同的分镜描述 → 生成 4 个相同主题的不同角度图片 ❌

**示例**:
```
1. 中景 - 宇航员行走
2. 近景 - 宇航员转头
3. 特写 - 手部调整设备
4. 全景 - 火星地平线
```
→ 生成: 宇航员正面、侧面、背面、动作视图（都是相同的姿势）

### 修复后
输入 4 个不同的分镜描述 → 生成 4 个匹配描述的不同镜头 ✅

**示例**:
```
1. 中景 - 宇航员行走
2. 近景 - 宇航员转头
3. 特写 - 手部调整设备
4. 全景 - 火星地平线
```
→ 生成:
1. 中景镜头：宇航员在火星沙漠中行走
2. 近景镜头：宇航员转头看向远方
3. 特写镜头：手部调整设备的细节
4. 全景镜头：火星地平线与宇航员身影

---

## 🧪 测试建议

### 测试场景

创建一个包含 4 个不同镜头的场景，例如:

1. **镜头 1**: 远景 - 静止 - "太空飞船降落在火星表面"
2. **镜头 2**: 中景 - 推进 - "宇航员从飞船舱门走出"
3. **镜头 3**: 近景 - 静止 - "宇航员惊讶地看着火星风景"
4. **镜头 4**: 特写 - 静止 - "宇航员头盔上反射的火星景色"

### 验证要点

- ✅ 每个面板显示不同的镜头场景
- ✅ 镜头尺寸匹配（远景、中景、近景、特写）
- ✅ 相机运动体现在构图中
- ✅ 参考图中的角色/场景风格保持一致
- ✅ 整体画风和光照氛围协调
- ✅ Grid 布局整齐，可以正确切片

---

## 📊 技术架构总结

```
用户输入
  ↓
ProPanel.tsx (聚合场景、分镜、参考图)
  ↓
enhancedPrompt (场景描述 + 分镜列表 + 额外要求)
  ↓
geminiService.ts (包装为 Grid 提示词 + 布局指令)
  ↓
/api/gemini-grid (服务器端调用 Gemini API)
  ↓
Google Gemini API (生成完整 Grid 图片)
  ↓
sliceImageGrid (客户端切片为独立面板)
  ↓
Grid 预览弹窗 (用户手动分配)
  ↓
IndexedDB 持久化存储
```

---

## 🔧 相关配置

### 环境变量 (.env.local)

```bash
# Gemini API Key
GEMINI_API_KEY=AIzaSyBXkBdwuGy90VIyvFrhpuRQbIOXeJ1AcHA

# Gemini 图片生成模型
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview

# 代理配置（中国大陆必需）
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

### 超时配置

```typescript
// geminiService.ts
const GEMINI_TIMEOUT_MS = parseTimeout(
  process.env.NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS || process.env.GEMINI_IMG_TIMEOUT_MS,
  180000  // 默认 180 秒
);
```

---

## 🚀 后续优化建议

### 1. 智能提示词增强

自动分析分镜描述，提取关键元素:
- 角色名称 → 映射到角色资源库
- 场景名称 → 映射到场景资源库
- 动作关键词 → 增强动态表现

### 2. 参考图权重控制

允许用户指定参考图的影响权重:
- 高权重：严格遵循参考图风格
- 中权重：参考但允许变化
- 低权重：仅作为灵感

### 3. Grid 预设模板

提供常用的 Grid 配置模板:
- 动作序列 (连续动作分解)
- 表情变化 (同一角色不同表情)
- 环境探索 (不同角度观察场景)
- 分镜故事板 (不同镜头组合)

### 4. 批量 Grid 生成

支持为整个项目批量生成多个 Grid:
- 按场景分组
- 自动分配切片到镜头
- 进度跟踪和错误重试

---

**修复状态**: ✅ 已完成
**测试状态**: ⏳ 待用户验证
**下次检查**: 用户反馈后
