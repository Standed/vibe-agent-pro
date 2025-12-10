# 商业模式与安全架构方案

## 📊 商业模式对比分析

### 方案 1: 纯 SaaS 云端服务（推荐 ⭐⭐⭐⭐⭐）

**架构:**
```
用户浏览器 → Vercel/Next.js → 后端 API → Supabase/数据库
                                ↓
                         AI服务 (Gemini/Volcano)
                         ↓
                    从用户账户扣积分
```

#### 优势
✅ **安全性最高** - 源码完全在服务器端，用户无法接触
✅ **API Key 安全** - 所有 API 密钥在服务器端，不会泄露
✅ **积分系统可靠** - 完全后端控制，无法篡改
✅ **实时计费精准** - 每次 AI 调用实时扣费
✅ **易于更新** - 无需用户手动更新
✅ **数据分析** - 可以收集用户行为数据优化产品
✅ **防止滥用** - 可以限流、监控异常调用

#### 劣势
❌ **运营成本高** - 需要承担服务器、数据库、带宽费用
❌ **网络依赖** - 用户必须有网络连接
❌ **隐私顾虑** - 用户数据存储在云端
❌ **法律风险** - 需要处理隐私政策、GDPR 等

#### 成本估算
```
初期 (0-1000 用户):
- Vercel Hobby: $0
- Supabase Free: $0
- AI API: 按用户实际使用量收费
总成本: $0-$50/月

成长期 (1000-10000 用户):
- Vercel Pro: $20/月
- Supabase Pro: $25/月
- CDN/Storage: $50-$100/月
- AI API: $500-$2000/月
总成本: $600-$2200/月 (¥4,200-¥15,000)

成熟期 (10000+ 用户):
- 需要升级到企业方案
- 预估 $5000+/月
```

#### 积分定价策略
```
1 积分 ≈ ¥0.1 (10 积分 = ¥1)

AI 调用成本:
- Gemini Grid 生成 (2x2): 约 ¥0.5 → 消耗 5 积分
- Gemini Grid 生成 (3x3): 约 ¥1.0 → 消耗 10 积分
- Volcano SeeDance 视频: 约 ¥2.0 → 消耗 20 积分
- AI 对话 (每条): 约 ¥0.05 → 消耗 0.5 积分

套餐设计:
- 新手包: 100 积分 (¥10) → 实际价值 ¥10
- 标准包: 500 积分 (¥40) → 实际价值 ¥50 (8折)
- 专业包: 2000 积分 (¥120) → 实际价值 ¥200 (6折)
- 企业包: 10000 积分 (¥500) → 实际价值 ¥1000 (5折)
```

---

### 方案 2: 本地 Electron + 云端积分验证（中等推荐 ⭐⭐⭐）

**架构:**
```
Electron 本地应用 → 许可证服务器 (验证积分) → 返回临时 Token
         ↓
    直接调用 AI API (用户自己的 Key 或我们提供的)
```

#### 优势
✅ **离线使用** - 大部分功能可以离线
✅ **性能更好** - 本地运行，响应快
✅ **隐私保护** - 用户数据存储在本地
✅ **降低运营成本** - 不需要为用户存储大量数据

#### 劣势
❌ **安全风险极高** - Electron 应用容易被破解
❌ **源码泄露风险** - asar 文件可以被轻易解包
❌ **API Key 泄露** - 如果把 API Key 打包进去，会被提取
❌ **积分系统脆弱** - 本地验证可能被绕过
❌ **更新困难** - 用户可能不更新，导致漏洞长期存在
❌ **盗版风险高** - 破解版会快速传播

#### Electron 安全问题实例
```javascript
// ❌ 错误做法 - API Key 会被提取
const GEMINI_API_KEY = "AIzaSyC..."; // 用户可以用 asar 解包工具提取

// ❌ 错误做法 - 本地积分验证会被篡改
let userCredits = 100; // 用户可以修改内存或源码

// ❌ 错误做法 - 许可证文件可以被复制
if (fs.existsSync('license.key')) {
  // 用户可以复制 license.key 文件到其他电脑
}
```

---

### 方案 3: Electron + 代理服务器（较好方案 ⭐⭐⭐⭐）

**架构:**
```
Electron 本地应用
    ↓ (所有 AI 请求)
许可证 + 代理服务器 (Node.js/Go)
    ↓ (验证积分并转发)
AI 服务 (Gemini/Volcano)
    ↓
从用户账户扣积分
```

#### 工作流程
1. 用户在 Electron 应用中登录账号
2. 应用获取临时访问 Token (有效期 1 小时)
3. 所有 AI 调用必须通过代理服务器
4. 代理服务器验证 Token、检查积分、调用 AI、扣除积分
5. 返回结果给 Electron 应用

#### 优势
✅ **API Key 安全** - 所有 API Key 在服务器端
✅ **积分系统可靠** - 服务器端验证，无法篡改
✅ **离线基础功能** - 编辑、预览等功能可以离线
✅ **防止滥用** - 服务器端限流和监控
✅ **运营成本适中** - 只需要一个轻量级代理服务器

#### 劣势
❌ **AI 功能需要网络** - 生成 Grid、视频需要联网
❌ **仍有破解风险** - 虽然降低了，但不能完全防止
❌ **需要维护服务器** - 代理服务器的运维成本

#### 成本估算
```
代理服务器:
- 轻量级 VPS (2核4G): ¥50-¥100/月
- CDN/防火墙: ¥50/月
- 数据库 (用户账户): ¥100/月
总成本: ¥200-¥300/月
```

---

## 🔒 Electron 安全加固方案

如果选择 Electron 方案，必须实施以下安全措施：

### 1. 代码混淆与加密

```bash
npm install --save-dev javascript-obfuscator webpack-obfuscator
```

**webpack 配置:**
```javascript
// next.config.ts
const JavaScriptObfuscator = require('webpack-obfuscator');

module.exports = {
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.plugins.push(
        new JavaScriptObfuscator({
          rotateStringArray: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false
        })
      );
    }
    return config;
  }
};
```

### 2. ASAR 加密

```javascript
// 使用 asar 加密打包
"scripts": {
  "pack:secure": "asar pack out app.asar --unpack-dir \"**/*.node\""
}
```

**再加一层自定义加密:**
```javascript
// electron/encrypt-asar.js
const fs = require('fs');
const crypto = require('crypto');

function encryptAsar(inputPath, outputPath, key) {
  const algorithm = 'aes-256-cbc';
  const cipher = crypto.createCipher(algorithm, key);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);
  input.pipe(cipher).pipe(output);
}

// 启动时解密
function decryptAsar(encryptedPath, key) {
  const algorithm = 'aes-256-cbc';
  const decipher = crypto.createDecipher(algorithm, key);
  // ...
}
```

### 3. 许可证验证系统

**在线验证架构:**
```typescript
// electron/license.ts
import { app } from 'electron';
import crypto from 'crypto';

interface LicenseResponse {
  valid: boolean;
  credits: number;
  expiresAt: string;
  userId: string;
}

class LicenseManager {
  private licenseServerUrl = 'https://your-license-server.com';
  private machineId: string;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    // 生成机器唯一标识
    this.machineId = this.generateMachineId();
  }

  private generateMachineId(): string {
    // 基于硬件信息生成唯一 ID
    const { execSync } = require('child_process');
    let hwInfo = '';

    try {
      if (process.platform === 'darwin') {
        hwInfo = execSync('system_profiler SPHardwareDataType').toString();
      } else if (process.platform === 'win32') {
        hwInfo = execSync('wmic csproduct get uuid').toString();
      } else {
        hwInfo = execSync('cat /etc/machine-id').toString();
      }
    } catch (error) {
      // Fallback
      hwInfo = app.getPath('userData');
    }

    return crypto.createHash('sha256').update(hwInfo).digest('hex');
  }

  async validateLicense(email: string, password: string): Promise<LicenseResponse> {
    try {
      const response = await fetch(`${this.licenseServerUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          machineId: this.machineId,
          appVersion: app.getVersion()
        })
      });

      if (!response.ok) {
        throw new Error('License validation failed');
      }

      const data: LicenseResponse = await response.json();

      // 缓存 Token
      this.cachedToken = data.token;
      this.tokenExpiresAt = Date.now() + 3600000; // 1 小时

      return data;
    } catch (error) {
      console.error('License validation error:', error);
      throw error;
    }
  }

  async checkCredits(): Promise<number> {
    if (!this.cachedToken || Date.now() >= this.tokenExpiresAt) {
      throw new Error('Token expired, please login again');
    }

    const response = await fetch(`${this.licenseServerUrl}/api/user/credits`, {
      headers: {
        'Authorization': `Bearer ${this.cachedToken}`
      }
    });

    const data = await response.json();
    return data.credits;
  }

  async consumeCredits(amount: number, operation: string): Promise<boolean> {
    if (!this.cachedToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.licenseServerUrl}/api/user/consume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.cachedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount,
        operation,
        machineId: this.machineId,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error('Insufficient credits');
    }

    return true;
  }

  // 防止多开
  async registerSession(): Promise<void> {
    await fetch(`${this.licenseServerUrl}/api/session/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.cachedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        machineId: this.machineId,
        sessionId: crypto.randomBytes(16).toString('hex')
      })
    });
  }

  // 心跳保持会话
  startHeartbeat(): NodeJS.Timer {
    return setInterval(async () => {
      try {
        await fetch(`${this.licenseServerUrl}/api/session/heartbeat`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.cachedToken}` }
        });
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, 60000); // 每分钟一次
  }
}

export const licenseManager = new LicenseManager();
```

### 4. API 代理层设计

**所有 AI 请求必须经过代理服务器:**

```typescript
// electron/main.ts
import { ipcMain } from 'electron';
import { licenseManager } from './license';

// 注册 IPC 处理器
ipcMain.handle('generate-grid', async (event, params) => {
  try {
    // 1. 验证登录状态
    const credits = await licenseManager.checkCredits();

    // 2. 检查积分是否足够
    const requiredCredits = params.gridSize === '2x2' ? 5 : 10;
    if (credits < requiredCredits) {
      throw new Error('Insufficient credits');
    }

    // 3. 调用代理服务器 (不是直接调用 Gemini)
    const response = await fetch('https://your-proxy.com/api/generate-grid', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${licenseManager.cachedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      throw new Error('Generation failed');
    }

    const result = await response.json();

    // 4. 代理服务器已经扣除积分，无需本地处理

    return result;
  } catch (error) {
    console.error('Grid generation error:', error);
    throw error;
  }
});
```

**代理服务器实现 (Node.js/Express):**

```typescript
// proxy-server/src/index.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// JWT 验证中间件
const authenticateToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// 生成 Grid API
app.post('/api/generate-grid', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { prompt, gridSize, aspectRatio } = req.body;

    // 1. 检查用户积分
    const user = await db.query('SELECT credits FROM users WHERE id = ?', [userId]);
    const requiredCredits = gridSize === '2x2' ? 5 : 10;

    if (user.credits < requiredCredits) {
      return res.status(402).json({ error: 'Insufficient credits' });
    }

    // 2. 调用 Gemini API (API Key 在服务器端，安全)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    // 3. 扣除积分
    await db.query(
      'UPDATE users SET credits = credits - ? WHERE id = ?',
      [requiredCredits, userId]
    );

    // 4. 记录日志
    await db.query(
      'INSERT INTO usage_logs (user_id, operation, credits_used, created_at) VALUES (?, ?, ?, NOW())',
      [userId, 'generate-grid', requiredCredits]
    );

    // 5. 返回结果
    res.json({
      success: true,
      result: result.response.text(),
      creditsRemaining: user.credits - requiredCredits
    });

  } catch (error) {
    console.error('Grid generation error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

app.listen(3001, () => {
  console.log('Proxy server running on port 3001');
});
```

### 5. 防止多开和共享账号

```typescript
// proxy-server/src/middleware/session.ts
import redis from 'redis';

const redisClient = redis.createClient();

export const checkConcurrentSessions = async (req, res, next) => {
  const { userId, machineId } = req.user;
  const sessionKey = `session:${userId}`;

  // 检查当前活跃会话
  const activeSessions = await redisClient.get(sessionKey);

  if (activeSessions) {
    const sessions = JSON.parse(activeSessions);

    // 允许最多 2 个设备同时登录
    if (sessions.length >= 2 && !sessions.includes(machineId)) {
      return res.status(403).json({
        error: 'Maximum concurrent sessions reached',
        message: '您的账号已在其他设备登录，请先退出其他设备'
      });
    }
  }

  // 更新会话列表
  const newSessions = activeSessions
    ? JSON.parse(activeSessions).filter(id => id !== machineId)
    : [];
  newSessions.push(machineId);

  await redisClient.set(sessionKey, JSON.stringify(newSessions), 'EX', 3600);

  next();
};
```

---

## 🎯 推荐方案总结

### 阶段 1: MVP 测试（0-6 个月）

**推荐: 纯 SaaS 云端服务**

理由:
1. **最小化安全风险** - 无需担心破解和盗版
2. **快速迭代** - 可以随时更新功能
3. **成本可控** - 使用免费套餐，用户少时几乎零成本
4. **数据驱动** - 可以分析用户行为优化产品

实施步骤:
```
1. 部署到 Vercel (免费)
2. 使用 Supabase Free (免费)
3. 实现用户注册/登录
4. 实现积分充值系统 (接入支付宝/微信支付)
5. 所有 AI 调用走后端 API Routes
6. 设置合理的积分消耗规则
```

---

### 阶段 2: 产品成熟（6-12 个月）

**推荐: SaaS 主线 + Electron 辅助**

理由:
1. SaaS 版本作为主要收入来源
2. Electron 版本作为企业客户的私有部署方案
3. Electron 版本收费更高（买断制），覆盖开发和支持成本

定价策略:
```
SaaS 版本:
- 免费版: 50 积分/月 (体验)
- 标准版: ¥49/月 (500 积分/月)
- 专业版: ¥199/月 (3000 积分/月)
- 企业版: ¥999/月 (无限积分 + 专属支持)

Electron 版本:
- 个人许可: ¥999/年 (包含 2000 积分/月)
- 团队许可: ¥4999/年 (5 席位，包含 10000 积分/月)
- 私有部署: ¥29999 (一次性，需要自己提供 API Key)
```

---

### 阶段 3: 规模化（12 个月后）

**推荐: 混合架构**

1. **SaaS 主业务** - 个人用户、小团队
2. **私有部署方案** - 大企业、政府（安全要求高）
3. **API 服务** - 开放 API 给第三方开发者

---

## 🛡️ 最终安全建议

### 如果必须做 Electron 版本

1. **不要把 API Key 打包进去**
   - 所有 AI 调用必须经过你的代理服务器
   - 代理服务器验证用户身份和积分

2. **使用硬件绑定**
   - 基于机器 ID 生成许可证
   - 限制一个账号最多激活 2-3 台设备

3. **定期在线验证**
   - 每次启动验证许可证
   - 每小时刷新一次 Token
   - 3 天未联网自动锁定功能

4. **代码混淆**
   - 使用 webpack-obfuscator
   - 使用 UPX 压缩可执行文件
   - 使用 V8 字节码编译

5. **法律手段**
   - 软件协议中明确禁止破解
   - 发现盗版及时发送律师函
   - 在破解论坛积极维权

### 现实情况

**即使做了所有安全措施，Electron 应用仍然可能被破解**

- 没有绝对安全的客户端应用
- 破解者可以修改内存、Hook 函数
- AI 编程确实降低了破解门槛

**最佳策略:**
- 核心价值放在云端（AI 服务调用）
- 本地应用只是界面
- 即使源码泄露，没有你的服务器也无法使用 AI 功能

---

## 💰 成本收益分析

### SaaS 方案

```
月成本: ¥1000-¥5000 (服务器 + AI API)
月收入: 100 用户 × ¥49 = ¥4900
毛利润: ¥4900 - ¥1000 = ¥3900
毛利率: 80%
```

### Electron + 代理方案

```
月成本: ¥300 (代理服务器) + ¥0-¥5000 (AI API，取决于用户使用量)
月收入: 50 用户 × ¥999/12 = ¥4162
毛利润: 不稳定，取决于用户使用量
毛利率: 50-70%
风险: 盗版流行会严重影响收入
```

---

## ✅ 最终建议

**强烈推荐先做 SaaS 版本**

1. **更安全** - 源码不会泄露
2. **更赚钱** - 订阅制有持续收入
3. **更省心** - 无需担心破解和盗版
4. **更灵活** - 可以快速调整定价和功能

**Electron 版本可以作为补充**
- 针对企业客户的私有部署需求
- 定价要高很多（覆盖风险）
- 必须使用代理服务器架构
- 接受一定的盗版损失

**时间规划:**
- Month 1-3: 完善产品功能
- Month 4-6: 上线 SaaS 版本，验证市场
- Month 7-9: 如果有需求，开发 Electron 版本
- Month 10-12: 优化和扩展

你觉得这个方案如何？我可以帮你实现具体的某个部分。
