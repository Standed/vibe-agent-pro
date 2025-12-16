# Video Agent Pro - AGENTS 指南

AI 驱动的视频分镜生成与编辑工具 | Next.js 15.5.6 + React 19 + TypeScript 5.8.2

---

## 🚀 开发环境提示

### 启动与构建
- **开发模式**: `npm run dev` (启动 Turbopack，支持热重载，端口 3000)
- **⚠️ 不要在开发时运行 `npm run build`** - 这会切换到生产模式，破坏热重载
- **生产构建**: `npm run build` (仅在需要部署或类型检查时运行)
- **代码检查**: `npm run lint` (ESLint 规则检查)

### 核心架构速查

**🆕 请求取消支持 (AbortController)**：
```typescript
// ✅ Agent 对话支持取消（通过 stop() 方法）
const { stop, sendMessage } = useAgent();

// 用户点击停止按钮时
<button onClick={stop}>停止</button>

// 内部实现：
const abortControllerRef = useRef<AbortController | null>(null);
abortControllerRef.current = new AbortController();
await processUserCommand(message, chatHistory, context, abortControllerRef.current.signal);

// 取消时：
abortControllerRef.current.abort(); // 中止所有进行中的请求
```

**数据操作必须通过 `dataService`**：
```typescript
// ✅ 正确
import { dataService } from '@/lib/dataService';
await dataService.saveProject(project);

// ❌ 错误 - 不要直接调用 Supabase
import { supabase } from '@/lib/supabase/client';
await supabase.from('projects').insert(...);
```

**State 更新自动触发防抖保存 (800ms)**：
```typescript
// ✅ 所有 Store actions 自动保存，无需手动调用
updateShot(shotId, { status: 'done' });
addScene({ name: 'Scene 1', ... });
```

**AI API 调用必须通过 API Routes 代理**：
```typescript
// ✅ 正确 - 隐藏 API Key
await fetch('/api/gemini-grid', { method: 'POST', body: ... });

// ❌ 错误 - 直接调用外部 API
await fetch('https://generativelanguage.googleapis.com/...', { ... });
```

**认证 API 调用使用 `authenticatedFetch()`**：
```typescript
// ✅ 正确 - 自动添加 Authorization header
import { authenticatedFetch } from '@/lib/api-client';
await authenticatedFetch('/api/supabase', { ... });

// ❌ 错误 - 缺少认证
await fetch('/api/supabase', { ... });
```

**聊天消息使用独立表存储**：
```typescript
// ✅ 新版 - 云端存储 (chat_messages 表)
await dataService.saveChatMessage({
  id: crypto.randomUUID(),
  userId: user.id,
  projectId: project.id,
  scope: 'project', // 'project' | 'scene' | 'shot'
  role: 'user',
  content: '请生成分镜',
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ❌ 旧版 - 已废弃
addChatMessage({ ... }); // project.chatHistory 字段已弃用
```

**🆕 积分系统（Credits System）**：
```typescript
// ✅ 所有 AI API 调用自动扣除积分
// API Route 会自动调用 authenticateRequest() 和 checkCredits()

// 积分配置（可通过环境变量覆盖）
import { CREDITS_CONFIG, getCreditsCost } from '@/config/credits';

// 各种操作的积分消耗：
- GEMINI_GRID_2X2: 5 积分
- GEMINI_GRID_3X3: 10 积分
- GEMINI_IMAGE: 8 积分
- GEMINI_TEXT: 2 积分
- VOLCANO_VIDEO: 50 积分

// API Route 中的使用示例：
const { user, error } = await authenticateRequest(request);
if (error) return error;

const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
const creditsCheck = checkCredits(user, requiredCredits);
if (!creditsCheck.success) return creditsCheck.error;

// 执行 AI 操作...

await consumeCredits(user.id, requiredCredits, 'generate-grid', 'Grid 生成');
```

### 关键设计决策
- **请求可取消** - 所有 AI 请求支持 AbortController 取消
- **积分系统** - 所有 AI 操作需要消耗积分，管理员免费，VIP 8 折
- **Grid 生成是场景级别的**，不是镜头级别 - 生成后手动分配切片到镜头
- **所有数据修改通过 Zustand Store actions** - 集成 Immer，自动处理不可变性
- **API Keys 隐藏在 Next.js API Routes** - 客户端不直接调用外部 API
- **认证中间件** - API Route 级别的用户认证和积分检查

### 文件快速定位
| 功能 | 文件路径 |
|------|---------|
| 项目状态 | `src/store/useProjectStore.ts` |
| 数据服务 | `src/lib/dataService.ts` |
| 类型定义 | `src/types/project.ts` |
| Gemini API | `src/services/geminiService.ts` |
| Agent 对话 | `src/hooks/useAgent.ts` |
| 聊天消息 | `src/components/layout/ChatPanelWithHistory.tsx` |
| 积分系统 | `src/config/credits.ts`, `src/lib/supabase/credits.ts` |
| 认证中间件 | `src/lib/auth-middleware.ts` |
| API 客户端 | `src/lib/api-client.ts` (authenticatedFetch) |
| API 网关 | `src/app/api/supabase/route.ts` |

---

## 🧪 测试说明

### 构建前检查
```bash
# 1. TypeScript 类型检查 (必须通过)
npm run build

# 2. ESLint 代码检查
npm run lint
```

### 手动测试核心功能
启动开发服务器后，测试以下流程：
- [ ] 创建新项目（填写名称、概要、画风、画面比例）
- [ ] 输入剧本，点击 "AI 自动分镜"
- [ ] 添加角色，生成三视图
- [ ] 选择场景，生成 Grid (2x2 或 3x3)
- [ ] 手动分配 Grid 切片到镜头
- [ ] 生成视频（基于镜头的参考图）
- [ ] Agent 模式对话（项目级）
- [ ] Pro 模式对话（shot/scene/project 三级 scope）
- [ ] 刷新页面，检查数据持久化
- [ ] 检查浏览器控制台无错误

### 常见问题快速修复

**Supabase API 401 错误**:
```typescript
// 确保使用 authenticatedFetch()
import { authenticatedFetch } from '@/lib/api-client';
```

**Gemini API 超时**:
```bash
# 检查环境变量
cat .env.local | grep GEMINI

# 增加超时时间（默认 240 秒）
# 在 .env.local 添加:
NEXT_PUBLIC_GEMINI_IMG_TIMEOUT_MS=300000
```

**State 更新不触发 re-render**:
```typescript
// ✅ 使用 Store action（自动处理不可变性）
updateShot(shotId, { status: 'done' });

// ❌ 直接修改（不会触发 re-render）
project.shots[0].status = 'done';
```

**数据保存不持久**:
```typescript
// 等待防抖完成（800ms）或手动保存
await saveProject();
```

---

## 📋 PR/Commit 规范

### Commit Message 格式
```
<type>: <subject>

types:
- feat: 新功能
- fix: 修复 bug
- refactor: 重构
- docs: 文档更新
- style: 代码格式
- test: 测试

示例:
feat: 添加 Grid 历史记录功能
fix: 修复聊天消息重复保存问题
refactor: 优化 dataService 重试逻辑
```

### 提交前检查清单
- [ ] `npm run build` 通过（无 TypeScript 错误）
- [ ] `npm run lint` 通过（无 ESLint 警告）
- [ ] 在浏览器中手动测试主要功能流程
- [ ] 检查控制台无错误或警告
- [ ] 数据持久化正常（刷新页面后数据仍存在）
- [ ] 边界情况处理（空数据、网络错误、超时）
- [ ] 无 `console.log` 调试代码（除非是有意的日志）
- [ ] 无 `any` 类型（除非确实必要）
- [ ] Commit message 清晰（遵循规范）

### ⚠️ 绝对不要
- ❌ 使用 `--no-verify` 跳过 Git Hooks
- ❌ 禁用测试而不是修复它们
- ❌ 提交无法编译的代码
- ❌ 直接调用 Supabase client，绕过 `dataService`
- ❌ 在客户端直接调用外部 AI API
- ❌ 使用 `project.chatHistory` 字段（已废弃）
- ❌ 直接修改 state，不使用 Store actions

---

## 🔧 环境变量配置

创建 `.env.local` 文件：
```env
# Gemini API (Grid 多视图生成)
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Volcano Engine API
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_api_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxxx-xxxxx
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxxx-xxxxx
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxxx-xxxxx

# Supabase (云端数据库)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 📚 更多文档

- **详细开发指南**: [CLAUDE.md](./CLAUDE.md) - 开发流程和规范
- **功能清单**: [FEATURES.md](./FEATURES.md) - 所有功能列表
- **用户文档**: [README.md](./README.md) - 用户使用指南
- **聊天迁移**: [CHAT_STORAGE_MIGRATION.md](./CHAT_STORAGE_MIGRATION.md) - 聊天历史云端迁移指南
- **数据库 Schema**: [supabase/schema.sql](./supabase/schema.sql) - 完整数据库结构

---

**最后更新**: 2025-12-17
**版本**: v0.4.0
