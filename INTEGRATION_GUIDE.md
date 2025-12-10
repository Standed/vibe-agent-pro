# 数据存储集成指南

## 📊 系统架构说明

我已经为你创建了一个**统一的数据访问层**，可以根据用户登录状态自动切换存储后端：

```
┌─────────────────────────────────────────┐
│         应用代码                         │
│   (使用 dataService 统一接口)           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Unified Data Service               │
│      (自动选择存储后端)                   │
└────────────┬────────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────┐  ┌──────────┐
│ IndexedDB│  │ Supabase │
│ (游客)   │  │ (登录)   │
└──────────┘  └──────────┘
```

### 存储策略

| 用户状态 | 数据存储 | 文件存储 | 同步 |
|---------|---------|---------|-----|
| **未登录（游客）** | IndexedDB（本地浏览器） | Base64 Data URL | ❌ 不同步 |
| **已登录** | Supabase（云端） | Supabase Storage | ✅ 云端同步 |

### 自动切换机制

```typescript
// 应用代码不需要关心存储在哪里，统一使用 dataService
import { dataService } from '@/lib/dataService';

// 保存项目（自动选择存储后端）
await dataService.saveProject(project);

// 加载项目（自动选择存储后端）
const project = await dataService.loadProject(id);

// 如果用户登录 → 自动使用 Supabase
// 如果用户未登录 → 自动使用 IndexedDB
```

## 🔄 核心服务说明

### 1. 数据服务 (`dataService`)

位置：[src/lib/dataService.ts](src/lib/dataService.ts)

**功能：**
- 统一的数据访问接口
- 自动选择存储后端（Supabase 或 IndexedDB）
- 支持项目、场景、镜头、角色、音频的 CRUD 操作

**使用示例：**

```typescript
import { dataService } from '@/lib/dataService';

// 检查当前模式
const isCloud = await dataService.isCloudMode();
console.log(isCloud ? '云端模式' : '本地模式');

// 项目操作
await dataService.saveProject(project);
const projects = await dataService.getAllProjects();
const project = await dataService.loadProject(id);
await dataService.deleteProject(id);

// 场景操作
await dataService.saveScene(projectId, scene);
await dataService.deleteScene(sceneId);

// 镜头操作
await dataService.saveShot(sceneId, shot);
await dataService.deleteShot(shotId);

// 角色操作
await dataService.saveCharacter(projectId, character);
await dataService.deleteCharacter(characterId);

// 音频资源操作
await dataService.saveAudioAsset(projectId, audio);
await dataService.deleteAudioAsset(audioId);
```

### 2. 文件存储服务 (`storageService`)

位置：[src/lib/storageService.ts](src/lib/storageService.ts)

**功能：**
- 自动选择文件存储方式
- 登录用户：上传到 Supabase Storage
- 游客：转换为 Base64 Data URL

**使用示例：**

```typescript
import { storageService } from '@/lib/storageService';

// 上传文件（自动选择存储方式）
const file = event.target.files[0];
const result = await storageService.uploadFile(file, 'projects/xxx/images');
console.log('文件URL:', result.url);

// 批量上传
const files = event.target.files;
const results = await storageService.uploadFiles(Array.from(files), 'projects/xxx/grids');

// 删除文件
await storageService.deleteFile(imageUrl);

// 检查文件类型
const isDataURL = storageService.isDataURL(url); // true/false
const isSupabaseURL = storageService.isSupabaseURL(url); // true/false

// 获取当前存储类型
const type = await storageService.getStorageType(); // 'supabase' | 'local'
```

### 3. 数据迁移服务 (`migrationService`)

位置：[src/lib/migrationService.ts](src/lib/migrationService.ts)

**功能：**
- 将本地 IndexedDB 数据迁移到 Supabase
- 自动上传所有 Data URL 文件到云端
- 支持进度回调

**使用示例：**

```typescript
import { migrationService } from '@/lib/migrationService';

// 检查是否有本地数据
const hasData = await migrationService.hasLocalData();

if (hasData) {
  // 获取本地项目数量
  const count = await migrationService.getLocalProjectCount();
  console.log(`有 ${count} 个本地项目`);

  // 开始迁移
  const result = await migrationService.migrateToCloud((progress) => {
    console.log(`进度: ${progress.current}/${progress.total}`);
    console.log(`状态: ${progress.status}`);
    console.log(`当前项目: ${progress.currentProject}`);
  });

  if (result.success) {
    console.log('迁移成功！');

    // 可选：清除本地数据
    await migrationService.clearLocalData();
  } else {
    console.error('迁移失败:', result.error);
  }
}
```

## 🛠️ 集成到现有代码

### 步骤 1: 更新 `src/app/layout.tsx`

添加 `AuthProvider` 包裹整个应用：

```typescript
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AuthProvider>
          {children}
          <Toaster position="top-center" />
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 步骤 2: 替换现有的数据访问代码

**原来的代码：**
```typescript
import { saveProject, loadProject, getAllProjects } from '@/lib/db';

// 保存项目
await saveProject(project);

// 加载项目
const project = await loadProject(id);

// 获取所有项目
const projects = await getAllProjects();
```

**新代码：**
```typescript
import { dataService } from '@/lib/dataService';

// 保存项目（自动选择后端）
await dataService.saveProject(project);

// 加载项目
const project = await dataService.loadProject(id);

// 获取所有项目
const projects = await dataService.getAllProjects();
```

### 步骤 3: 更新文件上传逻辑

**原来的代码：**
```typescript
// 直接转换为 Data URL
const reader = new FileReader();
reader.onload = () => {
  const dataUrl = reader.result as string;
  // 使用 dataUrl...
};
reader.readAsDataURL(file);
```

**新代码：**
```typescript
import { storageService } from '@/lib/storageService';

// 自动选择存储方式
const result = await storageService.uploadFile(file, `projects/${projectId}/images`);
const imageUrl = result.url; // 可能是 Supabase URL 或 Data URL
```

### 步骤 4: 添加迁移提示（可选）

在首页或设置页面添加迁移提示：

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { migrationService } from '@/lib/migrationService';
import { toast } from 'sonner';

export default function MigrationPrompt() {
  const { user } = useAuth();
  const [hasLocalData, setHasLocalData] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (user) {
      checkLocalData();
    }
  }, [user]);

  const checkLocalData = async () => {
    const hasData = await migrationService.hasLocalData();
    setHasLocalData(hasData);
  };

  const handleMigrate = async () => {
    setMigrating(true);

    const result = await migrationService.migrateToCloud((progress) => {
      if (progress.status === 'migrating') {
        toast.info(`正在迁移: ${progress.currentProject} (${progress.current}/${progress.total})`);
      }
    });

    if (result.success) {
      toast.success('数据迁移成功！');
      setHasLocalData(false);
    } else {
      toast.error('迁移失败: ' + result.error);
    }

    setMigrating(false);
  };

  if (!user || !hasLocalData) {
    return null;
  }

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
      <h3 className="text-yellow-400 font-medium mb-2">发现本地数据</h3>
      <p className="text-zinc-300 text-sm mb-3">
        检测到你有本地保存的项目数据，是否迁移到云端？迁移后可以跨设备访问。
      </p>
      <button
        onClick={handleMigrate}
        disabled={migrating}
        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors disabled:opacity-50"
      >
        {migrating ? '迁移中...' : '立即迁移'}
      </button>
    </div>
  );
}
```

## 📝 积分系统集成

### 在 AI 调用前检查积分

**示例：Grid 生成**

```typescript
import { consumeCredits, getGridCost, hasEnoughCredits } from '@/lib/supabase/credits';
import { toast } from 'sonner';

async function generateGrid(params: GridParams) {
  // 1. 检查用户是否登录
  const isCloud = await dataService.isCloudMode();

  if (isCloud) {
    // 2. 计算所需积分
    const requiredCredits = getGridCost(params.gridRows, params.gridCols);

    // 3. 检查积分是否足够
    const hasCredits = await hasEnoughCredits(requiredCredits);

    if (!hasCredits) {
      toast.error(`积分不足！需要 ${requiredCredits} 积分`);
      return;
    }

    // 4. 先消费积分
    const result = await consumeCredits({
      amount: requiredCredits,
      operationType: `generate-grid-${params.gridRows}x${params.gridCols}`,
      description: `生成 ${params.gridRows}x${params.gridCols} Grid`,
    });

    if (!result.success) {
      toast.error(result.error || '积分扣除失败');
      return;
    }

    toast.success(`消耗 ${requiredCredits} 积分，剩余 ${result.creditsAfter} 积分`);
  }

  // 5. 调用 AI API
  try {
    const gridData = await generateMultiViewGrid(/* ... */);
    // 成功！
  } catch (error) {
    // 失败了，可以考虑退还积分（需要实现 refund 功能）
    toast.error('生成失败');
  }
}
```

### 显示积分余额

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { getUserCredits } from '@/lib/supabase/credits';

export function CreditsBadge() {
  const { user, profile } = useAuth();
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (profile) {
      setCredits(profile.credits);
    }
  }, [profile]);

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-full">
      <span className="text-sm text-zinc-400">积分</span>
      <span className="text-lg font-bold text-purple-400">{credits}</span>
    </div>
  );
}
```

## 🎯 积分定价规则

当前在 [src/lib/supabase/credits.ts](src/lib/supabase/credits.ts:42) 中定义的积分价格：

```typescript
'generate-grid-2x2': 5,      // 2x2 Grid 生成
'generate-grid-3x3': 10,     // 3x3 Grid 生成
'generate-video': 20,        // 视频生成
'generate-character': 5,     // 角色生成
'chat-message': 0.5,         // AI 对话（每条）
'enhance-prompt': 0.5,       // 提示词优化
'analyze-asset': 1,          // 资源分析
```

你可以根据实际 API 成本调整这些价格。

## ⚙️ 环境变量配置

确保 `.env.local` 包含以下配置：

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...（公开密钥）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...（服务端密钥，保密！）

# Gemini API（已有）
NEXT_PUBLIC_GEMINI_API_KEY=...

# Volcano Engine API（已有）
NEXT_PUBLIC_VOLCANO_API_KEY=...
NEXT_PUBLIC_VOLCANO_BASE_URL=...
NEXT_PUBLIC_SEEDREAM_MODEL_ID=...
NEXT_PUBLIC_SEEDANCE_MODEL_ID=...
NEXT_PUBLIC_DOUBAO_MODEL_ID=...
```

## 🔗 相关文档

- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Supabase 完整配置指南
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Vercel 部署指南
- [BUSINESS_MODEL_SECURITY.md](BUSINESS_MODEL_SECURITY.md) - 商业模式和安全

## ✅ 完整集成检查清单

- [ ] 在 `layout.tsx` 中添加 `AuthProvider`
- [ ] 替换所有 `import { ... } from '@/lib/db'` 为 `import { dataService } from '@/lib/dataService'`
- [ ] 更新文件上传逻辑使用 `storageService`
- [ ] 在 AI 调用前添加积分检查
- [ ] 添加积分余额显示组件
- [ ] 添加数据迁移提示（可选）
- [ ] 配置 `.env.local` 环境变量
- [ ] 在 Supabase 中执行 SQL 架构
- [ ] 创建 Storage buckets
- [ ] 创建管理员账号
- [ ] 测试登录/注册
- [ ] 测试项目创建（云端模式）
- [ ] 测试数据迁移

## 🚀 下一步

1. **立即可以做的**：
   - 配置 Supabase 项目（参考 SUPABASE_SETUP.md）
   - 配置环境变量
   - 更新 layout.tsx 添加 AuthProvider
   - 测试登录功能

2. **需要我帮助的**：
   - 替换现有代码中的数据访问逻辑
   - 集成积分系统到 AI 调用
   - 创建迁移提示界面
   - 部署到 Vercel

需要我继续帮你完成哪一步？
