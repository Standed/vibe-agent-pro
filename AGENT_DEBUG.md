# Agent 调试指南

## 问题：Agent 卡在"正在查找场景 3..."

### 可能的原因：

1. **Gemini API 超时** - API 调用没有设置超时，可能永久挂起
2. **API 密钥问题** - GEMINI_API_KEY 未配置或无效
3. **网络问题** - 无法连接到 Gemini API
4. **工具返回数据过大** - 导致后续 API 调用失败

### 调试步骤：

1. **检查浏览器控制台**
   - 打开 Chrome DevTools (F12)
   - 查看 Console 标签页是否有错误
   - 查看 Network 标签页，找到对 Gemini API 的请求
   - 检查请求状态（是否pending、失败、或超时）

2. **检查环境变量**
   ```bash
   # 在 .env.local 中确认：
   NEXT_PUBLIC_GEMINI_API_KEY=your_actual_key_here
   ```

3. **测试 API 可达性**
   - 在浏览器控制台运行：
   ```javascript
   fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=YOUR_KEY', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
     })
   }).then(r => r.json()).then(console.log).catch(console.error);
   ```

### 临时解决方案：

如果 Gemini API 不可用，可以暂时使用 Pro 模式的批量生成功能：
1. 切换到 Pro 模式
2. 选择场景 3
3. 点击"批量生成"按钮
4. 选择生成范围："当前场景"
5. 选择模式：SeeDream 或 Grid
6. 开始生成
