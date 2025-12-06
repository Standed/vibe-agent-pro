# UI 重构完成 - 对话式 Pro 模式

## 📅 更新日期
2025-12-06

## ✨ 新功能概览

### 1. 全新对话式界面
- **类似主流 AI 工具的对话体验** - 参考 ChatGPT、Claude 等主流 AI 工具的交互方式
- **消息气泡显示** - 用户和 AI 的对话以气泡形式展示,清晰易读
- **实时滚动** - 新消息自动滚动到底部,保持最佳阅读体验

### 2. 三种生成模式
- **SeeDream (火山引擎)** - 高质量单图生成,适合精细化创作
- **Gemini 直出** - Gemini 单张图片直接生成,无 Grid 切片
- **Gemini Grid** - Gemini 多视图生成,支持 2x2 (4视图) 和 3x3 (9视图)

### 3. 历史记录快速选择 🆕
- **左侧历史记录栏** - 显示当前选中镜头的所有生成历史
- **一键重用提示词** - 点击历史记录即可快速加载之前使用的提示词
- **缩略图预览** - 每条历史记录包含生成图片的缩略图
- **模型和时间信息** - 显示使用的模型和生成时间,便于追溯

### 4. 参考图上传
- **拖拽上传** - 支持点击或拖拽上传参考图片
- **多图上传** - 可以同时上传多张参考图
- **实时预览** - 上传的图片即时显示,可随时删除

### 5. 资源库自动引用
- **智能识别** - 在提示词中提及角色或场景名称,系统自动引用资源库中的参考图
- **参考图标记** - 自动添加 "(第一个参考图)"、"(第二个参考图)" 等标记
- **Toast 提示** - 显示正在使用的资源信息 (角色、场景)

## 🎯 使用场景

### 场景 1: 快速迭代单个镜头
1. 在左侧边栏选择一个镜头
2. 在 Pro 模式对话框中输入提示词
3. 选择 **SeeDream** 或 **Gemini 直出** 模式
4. 点击发送,查看生成结果
5. 如果不满意,点击历史记录重新调整提示词

### 场景 2: 批量生成场景视图
1. 选择一个场景 (不选择具体镜头)
2. 选择 **Gemini Grid** 模式
3. 设置 Grid 大小 (2x2 或 3x3)
4. 输入整体场景描述
5. 系统自动生成多视图,可分配给不同镜头

### 场景 3: 使用历史记录优化
1. 查看左侧历史记录栏
2. 找到之前生成的满意结果
3. 点击该历史记录,自动加载提示词
4. 稍作调整后重新生成,保持风格一致性

## 📂 文件结构

### 新增文件
- `src/components/layout/ChatPanel.tsx` - 基础对话面板 (已弃用)
- `src/components/layout/ChatPanelWithHistory.tsx` - 带历史记录的对话面板 (当前使用)
- `src/services/geminiService.ts` - 新增 `generateSingleImage` 函数 (Gemini 直出)

### 修改文件
- `src/components/layout/RightPanel.tsx` - 更新为使用 ChatPanelWithHistory
- `src/services/geminiService.ts` - 添加 Gemini 单图生成功能

### 保留文件 (暂未删除,可能需要参考)
- `src/components/layout/ProPanel.tsx` - 旧版 Pro 面板 (已不使用)

## 🔧 技术实现

### 1. Gemini 直出功能
```typescript
// src/services/geminiService.ts
export const generateSingleImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  referenceImages: ReferenceImageData[] = []
): Promise<string>
```

### 2. 历史记录管理
- 使用 `selectedShot.generationHistory` 获取历史记录
- 按时间倒序显示,最新的在最上面
- 点击历史项调用 `handleUseHistoryItem` 函数加载提示词

### 3. 对话消息结构
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: string[];
  model?: GenerationModel;
  gridData?: { fullImage: string; slices: string[] };
}
```

## 🎨 UI 特性

### 响应式设计
- 历史记录栏宽度: 256px (固定)
- 对话区域自适应剩余宽度
- 历史记录可隐藏/显示,节省空间

### 视觉反馈
- 用户消息: 蓝色气泡,右对齐
- AI 消息: 灰色气泡,左对齐
- 生成中: 显示加载动画
- 历史记录悬停: 高亮边框

### 键盘快捷键
- **Enter** - 发送消息
- **Shift + Enter** - 换行

## 📊 性能优化

### 图片处理
- 使用 `FileReader` API 异步转换图片为 base64
- 历史记录图片使用 `aspect-video` 保持纵横比
- 懒加载历史记录图片

### 状态管理
- 消息列表状态独立管理,不影响全局 store
- 自动滚动使用 `scrollIntoView({ behavior: 'smooth' })`
- 上传图片使用临时 URL,避免内存泄漏

## 🚀 后续计划

### 待优化项
1. **Agent 模式重构** - 参考 Pro 模式,创建对话式 Agent 界面
2. **历史记录分页** - 当历史记录过多时,分页加载
3. **导出对话** - 支持导出完整对话历史为 JSON/Markdown
4. **多模型对比** - 同时使用多个模型生成,横向对比结果

### 已知问题
- Grid 模式需要选择场景,如果未选择会提示警告
- Gemini 直出暂不支持 Grid 切片功能
- 历史记录图片较多时可能影响加载速度

## 📝 测试建议

### 功能测试
1. 测试三种生成模式是否正常工作
2. 测试历史记录快速选择功能
3. 测试参考图上传和显示
4. 测试资源库自动引用功能

### UI 测试
1. 测试对话界面的响应式布局
2. 测试历史记录栏的显示/隐藏
3. 测试消息气泡的样式和排版
4. 测试加载状态和错误提示

### 性能测试
1. 测试大量历史记录的渲染性能
2. 测试多图上传的处理速度
3. 测试对话列表的滚动性能

---

## 🎉 总结

全新的对话式 Pro 模式提供了更加现代、简洁、易用的 AI 图片生成体验。结合历史记录快速选择功能,用户可以高效地迭代优化创作内容,大幅提升工作效率。

**核心优势**:
- ✅ 符合主流 AI 工具的使用习惯
- ✅ 三种生成模式灵活切换
- ✅ 历史记录一键重用,提升迭代效率
- ✅ 自动引用资源库,保持风格一致性
- ✅ 简洁现代的 UI 设计

**下一步**: 继续完善 Agent 模式,并进行全面测试后提交到 GitHub。
