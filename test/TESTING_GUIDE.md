# 测试执行指南

## 快速开始

### 1. 启动开发服务器
```bash
cd /Users/shitengda/Downloads/docker/n8n/vibeAgent/finalAgent/vibe-agent-pro
npm run dev
```

访问: http://localhost:3000

---

## 核心功能测试步骤（按优先级）

### 优先级 1：验证 Bug 修复 ⚠️

#### 测试 1.1: 分镜脚本显示修复
```
1. 打开浏览器，访问 http://localhost:3000/project/project_1764746845663
2. 点击左侧边栏"分镜脚本"标签
3. 检查是否显示正确的镜头数量（不应该是 0）
4. 展开/折叠每个场景，确认镜头列表正常显示
```

**预期**: 所有镜头正常显示，不再出现"0 个分镜"的问题

**验证方式**: 目视检查 + 浏览器控制台（打开 DevTools -> Console，检查是否有错误）

---

### 优先级 2：新功能测试 🆕

#### 测试 2.1: 角色三视图生成
```
步骤：
1. 点击左侧边栏"资源"标签
2. 点击"添加角色"按钮
3. 填写角色信息：
   名称: 测试角色
   描述: 25岁男性，程序员
   外貌: 短发，戴眼镜
4. 点击"AI 生成三视图"按钮
5. 等待生成完成（约 10-30 秒）
6. 检查生成的图片
```

**预期结果**:
- 生成按钮在输入名称后可点击
- 生成过程显示加载动画
- 生成的图片为 21:9 横屏
- 图片包含：左侧大面部特写 + 右侧三视图
- 图片添加到参考图列表
- Toast 提示"三视图生成成功！"

**失败处理**:
- 如果报错"SeeDream 模型未激活"：检查 .env.local 中的 VOLCANO API 配置
- 如果报错"API Key 无效"：检查 API Key 是否正确

---

#### 测试 2.2: AI 分镜 + 角色识别
```
步骤：
1. 创建新项目（点击首页"新建项目"）
2. 填写项目信息：
   名称: 测试项目
   画风: 2D动漫风格
   画面比例: 16:9
3. 进入项目后，点击"剧本"标签
4. 粘贴测试剧本（见下方）
5. 点击"AI 自动分镜"按钮
6. 等待生成完成（约 30-60 秒）
7. 查看生成的分镜
```

**测试剧本**:
```
室内 - 咖啡厅 - 白天

李明坐在靠窗的位置，盯着笔记本电脑屏幕。他的眼睛布满血丝，显然一夜没睡。

王医生推门而入，环顾四周，看到李明后走过去。

王医生：李明，你昨晚又通宵了？

李明抬起头，勉强挤出一个笑容。

李明：有个 bug 一直没找到，就......

王医生坐下，关切地看着他。

王医生：你这样下去身体会垮的。来，先喝杯咖啡。
```

**预期结果**:
- 生成 5-8 个镜头
- 每个镜头有详细的视觉描述
- 对话正确提取到 dialogue 字段
- 镜头包含景别、运镜等信息

**验证角色识别**（需要浏览器控制台）:
```javascript
// 打开浏览器 DevTools -> Console
// 执行以下代码查看镜头数据

// 获取项目数据
const projectStore = window.__NEXT_DATA__?.props?.pageProps?.fallback?.project;

// 或者直接在 React DevTools 中查看 useProjectStore 的状态

// 查看某个 shot 的数据
console.log('Shot 数据:', project.shots[0]);
console.log('主要角色:', project.shots[0].mainCharacters);
console.log('主要场景:', project.shots[0].mainScenes);
```

**预期**: `mainCharacters` 应该包含 `["李明", "王医生"]`，`mainScenes` 应该包含 `["咖啡厅"]`

---

#### 测试 2.3: 参考图标记系统
```
步骤：
1. 先创建角色资源（如上测试 2.1）
2. 或上传角色参考图（点击"点击上传图片"）
3. 创建场景地点资源（在"资源"标签页）
4. 在分镜中生成图片时，打开浏览器控制台
5. 在 Network 面板查看 API 请求
```

**验证方式**:
1. 打开 DevTools -> Network 面板
2. 筛选 XHR/Fetch 请求
3. 找到 `generateContent` 或 `images/generations` 请求
4. 查看 Request Payload

**预期**:
- 提示词包含【角色信息】、【场景信息】、【参考图像】部分
- 参考图标记格式：`(第一个参考图)`, `(第二个参考图)`
- Gemini Grid 请求包含 `parts` 数组，其中有 `inlineData` 对象（参考图的 base64）

---

#### 测试 2.4: Gemini Grid 生成
```
步骤：
1. 选择一个镜头
2. 在右侧 Pro 面板点击"Grid 生成"
3. 确认 Grid Size: 2x2
4. 输入提示词（可以包含之前创建的角色名）
5. 点击"生成 Grid"
6. 等待生成完成
7. 查看 Grid Preview 弹窗
```

**预期结果**:
- 生成 1 张完整的 2x2 Grid 图片
- 自动切片为 4 张独立图片
- 可以分配切片到不同镜头
- 可以保存为收藏切片

**如果有参考图**:
- 打开 Network 面板查看请求
- 请求中应该包含 base64 编码的参考图数据

---

### 优先级 3：回归测试（确保旧功能未破坏）

#### 测试 3.1: 基本编辑功能
```
- [ ] 镜头点击选择
- [ ] 镜头删除
- [ ] 场景折叠/展开
- [ ] 场景名称编辑
- [ ] 场景删除
```

#### 测试 3.2: 图片生成功能
```
- [ ] SeeDream 单图生成
- [ ] Gemini Grid 生成
- [ ] 批量生成场景
- [ ] 批量下载素材
```

---

## 常见问题排查

### 问题 1: "0 个分镜" 仍然出现
**排查**:
1. 打开浏览器控制台，查看是否有错误
2. 检查 `project.scenes` 和 `project.shots` 数据
3. 验证 `scene.shotIds` 和 `shot.sceneId` 是否匹配

**解决**:
- 刷新页面
- 清除浏览器缓存
- 检查代码是否最新（git pull）

---

### 问题 2: API 生成失败
**排查**:
1. 检查 `.env.local` 配置
2. 验证 API Key 是否有效
3. 检查网络连接
4. 查看浏览器 Network 面板的错误响应

**解决**:
```bash
# 检查环境变量
cat .env.local

# 应该包含:
NEXT_PUBLIC_GEMINI_API_KEY=your_key_here
NEXT_PUBLIC_VOLCANO_API_KEY=your_key_here
NEXT_PUBLIC_SEEDREAM_MODEL_ID=your_model_id
```

---

### 问题 3: 参考图未传递给 API
**排查**:
1. 确认已创建角色/场景资源
2. 确认参考图已上传/生成
3. 确认提示词中包含角色/场景名称
4. 检查 Network 面板的请求 payload

**验证**:
- Gemini Grid 请求应该包含 `parts` 数组
- `parts` 中应该有 `inlineData` 对象（如果有参考图）

---

## 性能监控

### 打开性能监控
```javascript
// 在浏览器控制台执行
performance.mark('test-start');

// 执行测试操作...

performance.mark('test-end');
performance.measure('test-duration', 'test-start', 'test-end');
console.log(performance.getEntriesByType('measure'));
```

### 内存监控
```javascript
// 查看当前内存使用
console.log(performance.memory);
```

---

## 测试完成后

### 1. 填写测试结果
编辑 `test/TEST_PLAN.md`，在每个测试项前打勾 `[x]`

### 2. 记录问题
如果发现问题，记录在 `TEST_PLAN.md` 的"发现的问题"部分

### 3. 更新 Todo List
根据测试结果更新 todo list

### 4. 准备提交
测试通过后，准备提交到 GitHub

---

## 自动化测试（可选）

如果需要自动化测试，可以使用以下工具：

### Playwright E2E 测试
```bash
npm install -D @playwright/test
npx playwright install
```

### Jest 单元测试
```bash
npm install -D jest @testing-library/react @testing-library/jest-dom
```

但目前优先进行手动测试，确保功能正常后再考虑自动化。

---

## 测试报告模板

```markdown
# 测试报告

**测试日期**: 2025-12-06
**测试人员**: [Your Name]
**测试环境**:
- 浏览器: Chrome 120
- OS: macOS 14
- Node: v20.x

## 测试结果

### 通过的测试 (X/10)
- [x] 分镜脚本显示修复
- [x] 角色三视图生成
- [ ] AI 分镜 + 角色识别
- ...

### 失败的测试
1. **问题**: XXX
   - **重现步骤**: ...
   - **错误信息**: ...
   - **影响**: 高/中/低

### 性能指标
- 页面加载时间: XX秒
- API 响应时间: XX秒
- 内存使用: XXX MB

### 建议
...
```
