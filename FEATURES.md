# Vibe Agent Pro - 功能实现清单

## 🎯 核心功能状态

### ✅ 已完成功能

#### 1. 画布系统 (InfiniteCanvas)
- **缩放功能**：50%-200% 缩放，实时显示百分比
- **平移功能**：鼠标拖拽画布（cursor-grab）
- **浮动工具栏**：ZoomIn/ZoomOut 按钮，点击百分比重置
- **场景卡片展示**：Grid 布局展示所有场景和镜头
- **镜头状态指示**：done/processing/error 状态颜色标识
- **点状网格背景**：radial-gradient 渲染，完全匹配 finalAgent 参考

#### 2. Grid 多视图生成 (ProPanel + Gemini API)
- **真实 API 集成**：使用 Google Gemini 2.0 Flash
- **2x2 / 3x3 Grid**：支持 4视图 和 9视图 生成
- **画面比例选择**：16:9、4:3、21:9、1:1、3:4、9:16
- **参考图片上传**：支持多张参考图片
- **风格预设**：电影级、动画、写实、赛博朋克
- **实时进度显示**：生成中状态和 Loader 动画
- **Canvas 图片分割**：客户端分割 Grid，节省 API 调用

#### 3. 视频生成 (ProPanel + Volcano Engine)
- **真实 API 集成**：使用火山引擎 SeeDance 模型
- **图生视频**：基于 Grid 图片生成 4-6 秒视频
- **异步任务处理**：提交任务后轮询等待完成
- **进度追踪**：实时更新镜头状态
- **错误处理**：详细的错误提示和配置检查

#### 4. AI Agent 对话系统 (AgentPanel)
- **真实 AI 对话**：集成火山引擎 Doubao 模型
- **流式输出**：打字机效果，实时显示回复
- **上下文感知**：AI 知道当前项目、场景、镜头信息
- **意图识别**：自动识别用户指令（Grid/视频/风格调整等）
- **实际操作执行**：Agent 可以真正调用 Grid/Video 生成 API
- **动态快捷指令**：根据项目状态生成相关快捷操作
- **自动滚动**：新消息自动滚动到底部

#### 5. AI 分镜生成 (LeftSidebar + Storyboard Service)
- **AI 剧本分析**：使用 Doubao 分析剧本
- **自动场景拆分**：根据 8 大核心原则拆分场景
- **镜头生成**：为每个场景生成详细镜头信息
- **完整提示词系统**：327 行专业分镜提示词
- **视觉描述标准**：画风、环境、角色、动作、情绪、光影、镜头语言、特效

#### 6. 角色与场景管理
- **角色信息录入**：名称、描述、外观特征、画风
- **AI 生成角色三视图**：1/3 面部特写 + 2/3 正侧背视图
  - 纯白背景、官方美术设定集风格
  - 使用火山引擎 SeeDream 生成
  - 自动添加到角色参考图库
- **参考图片上传**：支持多张参考图片
- **角色列表展示**：缩略图预览、删除功能
- **场景管理**：室内/室外类型、描述、参考图片

#### 7. 音频资源管理
- **音频文件上传**：支持所有音频格式
- **类型分类**：音乐 (music)、语音 (voice)、音效 (sfx)
- **文件转换**：自动转为 Data URL 存储
- **音频列表**：展示、删除功能
- **预留接口**：为 Timeline 音频轨道准备

#### 8. Grid 切片预览与分配 (GridPreviewModal)
- **完整 Grid 预览**：显示生成的完整 Grid 图
- **切片展示**：自动切分为 4 或 9 个独立镜头图
- **手动分配**：点击切片图为对应镜头分配图片
- **智能建议**：自动预分配前 N 个切片给前 N 个镜头
- **确认机制**：用户确认后才更新镜头数据
- **镜头信息**：显示镜头编号、景别、运镜、描述

#### 9. Timeline 时间轴编辑器
- **三种状态**：collapsed/default/expanded
- **时间标尺**：5 秒间隔标记
- **视频轨道**：显示所有镜头 clip，支持缩略图
- **音频轨道**：预留音频轨道接口
- **播放控制**：播放/暂停、跳转、时间码显示
- **播放头指示器**：紫色播放头，实时位置显示
- **导出按钮**：预留导出视频功能入口

#### 10. 双模式架构 (Agent + Pro)
- **Agent 模式**：对话式 AI 创作，自动执行操作
- **Pro 模式**：手动参数控制，精细调整
- **模式切换**：一键切换，状态独立
- **当前镜头详情**：显示编号、景别、运镜、时长、状态、描述

#### 11. 项目管理
- **IndexedDB 存储**：使用 Dexie.js 实现本地持久化
- **Zustand 状态管理**：全局状态管理 + Immer 中间件
- **自动保存**：项目修改自动保存到 IndexedDB
- **项目创建**：从首页创建新项目

### 🔧 API 配置完成

#### Gemini API (Grid 生成)
```env
NEXT_PUBLIC_GEMINI_API_KEY=AIzaSyBHEPY2ARK3HXslYSaD_30miGCxuB6p2TM
```

#### Volcano Engine API (视频生成 + AI 对话)
```env
NEXT_PUBLIC_VOLCANO_API_KEY=4400e6ae-ef35-4487-a5bf-1c94fe5f5bbd
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 模型配置（需要在火山方舟控制台创建推理接入点）
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-20250103-xxxxx  # 图片生成
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-20250103-xxxxx  # 视频生成
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-20250103-xxxxx    # AI 对话
```

### ⚙️ 技术栈

- **框架**：Next.js 15.5.6 with App Router + Turbopack
- **前端**：React 19, TypeScript 5.8.2
- **样式**：Tailwind CSS 3.4 (自定义 Cine 主题)
- **状态管理**：Zustand + Immer 中间件
- **数据库**：Dexie.js (IndexedDB)
- **AI 模型**：
  - Google Gemini 2.0 Flash (Grid 生成)
  - 火山引擎 SeeDream 4.0 (图片生成)
  - 火山引擎 SeeDance 1.0 (视频生成)
  - 火山引擎 Doubao (AI 对话)

### 📋 待完成功能

#### 高优先级
1. **场景选择器优化**：Pro 模式 Grid 生成前选择目标场景
2. **镜头拖拽到 Timeline**：从画布拖拽镜头到时间轴
3. **Timeline 实际播放**：视频预览播放功能
4. **视频导出**：合成所有镜头并导出最终视频
5. **TTS 音频生成**：语音合成功能

#### 中优先级
6. **场景拖拽重排**：画布上拖拽场景卡片调整位置
7. **Timeline clip 调整**：拖拽调整 clip 起始时间和时长
8. **项目列表页面**：显示所有项目，支持删除/重命名

#### 低优先级
9. **Electron 打包**：打包成桌面应用
10. **批量处理**：批量生成所有镜头的 Grid/Video
11. **模板系统**：预设风格模板
12. **导出配置**：分辨率、帧率、码率等高级设置

---

## 🚀 快速开始

### 1. 安装依赖
```bash
cd /Users/shitengda/Downloads/docker/n8n/vibeAgent/finalAgent/vibe-agent-pro
npm install
```

### 2. 配置 API 密钥

编辑 `.env.local` 文件：

#### Gemini API (已配置)
无需修改，Grid 生成已可用。

#### Volcano Engine API
1. 登录火山方舟控制台：https://console.volcengine.com/ark
2. 进入「推理接入」页面
3. 创建三个推理接入点：
   - SeeDream 4.0 (选择 doubao-seedream-4.0)
   - SeeDance 1.0 Pro (选择 doubao-seedance-1.0-pro)
   - Doubao Pro 32k (选择 doubao-pro-32k)
4. 复制生成的 endpoint_id (格式：ep-xxxxxx-xxxxx)
5. 填写到 `.env.local` 对应的环境变量

### 3. 启动开发服务器
```bash
npm run dev
```

访问：http://localhost:3000

---

## 📖 使用指南

### 创建项目
1. 在首页点击「创建新项目」
2. 输入项目名称和描述
3. 点击创建进入项目编辑页面

### AI 分镜生成
1. 点击左侧「剧本」tab
2. 输入或粘贴剧本内容
3. 点击「AI 生成分镜」
4. AI 自动分析并生成场景和镜头

### Grid 多视图生成
**方式1：Pro 模式（手动）**
1. 在画布中点击选择一个镜头
2. 右侧切换到「Pro」模式
3. 选择「Grid 多视图」
4. 设置 Grid 大小 (2x2 或 3x3)
5. 设置画面比例
6. 输入提示词 (或使用风格预设)
7. 点击「生成 Grid」

**方式2：Agent 模式（AI 对话）**
1. 在画布中点击选择一个镜头
2. 右侧切换到「Agent」模式
3. 输入指令：「生成这个镜头的 Grid」
4. AI 自动执行生成

### 视频生成
**前提：镜头必须已有 Grid 图片**

**方式1：Pro 模式**
1. 选择已有 Grid 的镜头
2. 切换到「Pro」模式
3. 选择「视频生成」
4. 输入视频运镜提示词
5. 点击「生成视频」
6. 等待 2-3 分钟完成

**方式2：Agent 模式**
1. 选择已有 Grid 的镜头
2. 切换到「Agent」模式
3. 输入指令：「生成视频」
4. AI 自动执行

### 画布操作
- **缩放**：点击左上角 ZoomIn/ZoomOut 按钮
- **重置缩放**：点击百分比数字
- **平移**：按住鼠标左键拖拽画布

### Timeline 操作
- **展开/收起**：点击 Timeline 标题栏
- **播放/暂停**：点击播放按钮（预留功能）
- **导出视频**：点击「导出视频」按钮（预留功能）

---

## 🐛 常见问题

### Grid 生成失败
**原因**：Gemini API 配置错误或网络问题
**解决**：
1. 检查 `.env.local` 中的 `NEXT_PUBLIC_GEMINI_API_KEY`
2. 确保网络可以访问 Google API
3. 查看浏览器 Console 错误信息

### 视频生成失败
**原因**：Volcano Engine API 配置不完整
**解决**：
1. 检查 `.env.local` 中的三个 endpoint_id 是否已填写
2. 确认在火山方舟控制台已创建对应的推理接入点
3. 检查 API Key 是否正确且有效
4. 确保镜头已有 Grid 图片

### Agent 对话没有响应
**原因**：Doubao 模型未配置
**解决**：
1. 在火山方舟控制台创建 Doubao 推理接入点
2. 将 endpoint_id 填写到 `NEXT_PUBLIC_DOUBAO_MODEL_ID`
3. 刷新页面重试

### 项目数据丢失
**原因**：浏览器清除了 IndexedDB
**解决**：
1. 避免使用浏览器的「清除数据」功能
2. 定期导出项目数据（功能待开发）

---

## 📝 更新日志

### v0.2.0 (2025-01-03)
- ✅ 实现角色 AI 生成三视图功能（1/3 面部特写 + 2/3 正侧背视图）
- ✅ 创建 GridPreviewModal 组件，支持 Grid 切片预览与手动分配
- ✅ Pro 模式 Grid 生成集成预览模态框
- ✅ 实现音频上传功能（music/voice/sfx 分类）
- ✅ 完善角色、场景、音频资源管理UI
- ✅ 优化用户工作流：生成前角色/场景准备 → Grid 生成 → 手动分配切片

### v0.1.0 (2025-01-03)
- ✅ 实现画布缩放和平移功能
- ✅ 集成 Gemini API 实现 Grid 生成
- ✅ 集成 Volcano Engine 实现视频生成
- ✅ 实现 AI Agent 对话系统（流式输出）
- ✅ 实现 AI 分镜生成（8 大核心原则）
- ✅ 实现 Timeline 时间轴编辑器
- ✅ 移除所有 mock 响应，使用真实 AI 交互
- ✅ 修复所有 TypeScript 类型错误
- ✅ 完善 API 配置说明文档

---

## 🎨 设计系统

### 配色方案 (Cinema Dark)
- **主背景**：#09090b (cine-black)
- **次背景**：#0c0c0e (cine-dark)
- **面板**：#18181b (cine-panel)
- **边框**：#27272a (cine-border)
- **强调色**：#a855f7 (cine-accent, 紫色)
- **强调色 hover**：#9333ea (cine-accent-hover)
- **文本灰**：#a1a1aa (cine-text-muted)

### 字体
- **无衬线**：Inter, system-ui, sans-serif
- **等宽**：JetBrains Mono, Consolas, monospace

---

## 📚 参考文档

- [火山方舟大模型文档](https://www.volcengine.com/docs/82379)
- [Gemini API 文档](https://ai.google.dev/docs)
- [Next.js 15 文档](https://nextjs.org/docs)
- [Zustand 文档](https://zustand-demo.pmnd.rs/)
- [Dexie.js 文档](https://dexie.org/)

---

## 👨‍💻 开发者

本项目由 Claude Code 辅助开发，基于以下参考项目整合：
- **finalAgent**：UI/UX 设计参考
- **directordeck**：Grid 生成功能参考
- **long_video_gen**：视频生成流程参考
- **提示词.txt**：AI 分镜拆分规则参考
