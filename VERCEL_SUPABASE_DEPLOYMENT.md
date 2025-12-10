# Vercel + Supabase 部署方案

## 📊 方案概述

将 Video Agent Pro 部署到 Vercel (前端) + Supabase (数据库存储) 的云端方案。

### 优势
✅ 无需服务器维护
✅ 全球 CDN 加速
✅ 自动扩缩容
✅ HTTPS 默认支持
✅ 团队协作便利
✅ 数据云端同步

### 劣势
❌ 需要改造数据存储层 (从 IndexedDB 到 Supabase)
❌ 依赖网络连接
❌ 大文件存储成本较高
❌ API 调用限制
❌ 数据隐私需注意

## 💰 成本估算

### Vercel 费用

#### Hobby Plan (个人开发者) - **免费**
- ✅ 无限网站部署
- ✅ 100 GB 带宽/月
- ✅ 6000 分钟构建时间/月
- ✅ 自定义域名支持
- ⚠️ 单团队成员
- ⚠️ 无商业使用

**适用场景**: 个人项目、原型验证、小规模测试

#### Pro Plan - **$20/月** (约 ¥145/月)
- ✅ 1 TB 带宽/月
- ✅ 24000 分钟构建时间/月
- ✅ 密码保护
- ✅ 分析功能
- ✅ 商业使用许可
- ✅ 无限团队成员

**适用场景**: 小型团队、商业项目、中等流量

### Supabase 费用

#### Free Tier - **免费**
- ✅ 500 MB 数据库空间
- ✅ 1 GB 文件存储
- ✅ 50 MB 文件上传限制
- ✅ 2 GB 传输流量
- ✅ 500K Edge Function 调用
- ⚠️ 项目 7 天不活跃会暂停 (可手动恢复)

**适用场景**: 测试、演示、个人小项目

#### Pro Plan - **$25/月** (约 ¥180/月)
- ✅ 8 GB 数据库空间
- ✅ 100 GB 文件存储
- ✅ 5 GB 文件上传限制
- ✅ 250 GB 传输流量
- ✅ 2M Edge Function 调用
- ✅ 每日自动备份 (保留 7 天)
- ✅ 无暂停政策
- ✅ 99.9% SLA

**适用场景**: 生产环境、多用户、商业项目

#### Team Plan - **$599/月** (约 ¥4,300/月)
- ✅ 更大存储和带宽
- ✅ 30 天备份保留
- ✅ 优先支持
- ✅ 团队协作功能

**适用场景**: 企业级应用、大规模用户

### 总成本估算

| 方案 | Vercel | Supabase | 总计 (月) | 适用场景 |
|-----|--------|----------|----------|---------|
| **免费方案** | $0 | $0 | **$0** | 个人测试、演示 |
| **入门方案** | $0 | $25 | **$25** (¥180) | 个人项目、小团队 |
| **专业方案** | $20 | $25 | **$45** (¥323) | 商业项目、中等规模 |
| **企业方案** | $20 | $599 | **$619** (¥4,443) | 大型企业、高流量 |

## 🏗️ 架构改造

### 当前架构 (本地版)
```
┌─────────────────────┐
│   Next.js Frontend  │
│   (React 19)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   IndexedDB         │
│   (本地浏览器存储)    │
└─────────────────────┘
```

### 目标架构 (云端版)
```
┌─────────────────────┐
│   Vercel            │
│   Next.js Frontend  │
│   (Static + SSR)    │
└──────────┬──────────┘
           │
           │ HTTPS/WebSocket
           ▼
┌─────────────────────┐
│   Supabase          │
│  ┌──────────────┐   │
│  │ PostgreSQL   │   │  ← 项目数据
│  └──────────────┘   │
│  ┌──────────────┐   │
│  │ Storage      │   │  ← 图片/视频
│  └──────────────┘   │
│  ┌──────────────┐   │
│  │ Edge Funcs   │   │  ← API 中间件
│  └──────────────┘   │
│  ┌──────────────┐   │
│  │ Auth         │   │  ← 用户认证
│  └──────────────┘   │
└─────────────────────┘
```

## 📝 需要的改造工作

### 1. 数据库模式设计

创建 Supabase 表结构 (替代 IndexedDB):

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 项目表
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  art_style TEXT,
  settings JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 场景表
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER,
  grid_history JSONB,
  saved_grid_slices JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 镜头表
CREATE TABLE shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  order_index INTEGER,
  shot_size TEXT,
  camera_movement TEXT,
  duration NUMERIC,
  description TEXT,
  dialogue TEXT,
  narration TEXT,
  reference_image TEXT,  -- Storage URL
  video_clip TEXT,       -- Storage URL
  grid_images JSONB,
  generation_history JSONB,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 启用行级安全策略 (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;

-- 策略: 用户只能访问自己的数据
CREATE POLICY "Users can access own projects"
  ON projects FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access own scenes"
  ON scenes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access own shots"
  ON shots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN projects ON projects.id = scenes.project_id
      WHERE scenes.id = shots.scene_id
      AND projects.user_id = auth.uid()
    )
  );
```

### 2. 文件存储策略

```typescript
// 图片/视频上传到 Supabase Storage
const uploadFile = async (file: File, path: string) => {
  const { data, error } = await supabase.storage
    .from('media')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) throw error;

  // 获取公开 URL
  const { data: urlData } = supabase.storage
    .from('media')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};
```

### 3. 数据访问层改造

创建 `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 项目操作
export const projectService = {
  async createProject(project: Omit<Project, 'id'>) {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async updateProject(id: string, updates: Partial<Project>) {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteProject(id: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// 场景操作
export const sceneService = {
  async createScene(scene: Omit<Scene, 'id'>) { /* ... */ },
  async getScenesByProject(projectId: string) { /* ... */ },
  // ...
};

// 镜头操作
export const shotService = {
  async createShot(shot: Omit<Shot, 'id'>) { /* ... */ },
  async getShotsByScene(sceneId: string) { /* ... */ },
  // ...
};
```

### 4. 用户认证

```typescript
// src/components/auth/AuthProvider.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查当前会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 5. 环境变量配置

创建 `.env.local`:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Volcano Engine (已有)
NEXT_PUBLIC_VOLCANO_API_KEY=...
NEXT_PUBLIC_VOLCANO_BASE_URL=...

# Google Gemini (已有)
NEXT_PUBLIC_GEMINI_API_KEY=...
```

## 🚀 部署步骤

### 步骤 1: 创建 Supabase 项目

1. 访问 https://supabase.com
2. 创建新项目
3. 记录项目 URL 和 anon key
4. 执行上述 SQL 脚本创建表结构
5. 创建 Storage bucket: `media` (公开访问)

### 步骤 2: 修改代码

1. 安装 Supabase 客户端:
```bash
npm install @supabase/supabase-js
```

2. 替换 `src/lib/db.ts` 使用 Supabase
3. 更新 `useProjectStore` 使用 Supabase API
4. 添加用户认证组件

### 步骤 3: 部署到 Vercel

1. 推送代码到 GitHub
2. 访问 https://vercel.com
3. 导入 GitHub 仓库
4. 配置环境变量 (Supabase URL, Key)
5. 点击 Deploy

### 步骤 4: 数据迁移 (可选)

如果用户已有本地数据:

```typescript
// 迁移脚本
async function migrateLocalToCloud() {
  // 1. 从 IndexedDB 读取所有项目
  const localProjects = await getAllProjects();

  // 2. 上传到 Supabase
  for (const project of localProjects) {
    await projectService.createProject(project);

    // 迁移场景和镜头
    for (const scene of project.scenes) {
      await sceneService.createScene({ ...scene, projectId: project.id });
      // ...
    }
  }

  alert('迁移完成！');
}
```

## ⚖️ 方案对比

### Electron 桌面版 vs Vercel + Supabase 云端版

| 特性 | Electron 桌面版 | Vercel + Supabase 云端版 |
|-----|---------------|------------------------|
| **部署成本** | ¥0 (一次性开发) | ¥180-¥323/月 |
| **数据存储** | 本地 IndexedDB | 云端 PostgreSQL |
| **数据隐私** | ⭐⭐⭐⭐⭐ 完全本地 | ⭐⭐⭐ 存储在云端 |
| **跨设备同步** | ❌ 不支持 | ✅ 自动同步 |
| **网络要求** | ❌ 可离线使用 | ✅ 需要网络连接 |
| **更新方式** | 自动更新 | 自动部署 |
| **多人协作** | ❌ 不支持 | ✅ 原生支持 |
| **文件存储** | 无限制 (本地硬盘) | 受套餐限制 |
| **性能** | ⭐⭐⭐⭐⭐ 本地运行 | ⭐⭐⭐⭐ 网络延迟 |
| **用户体验** | 需要下载安装 | 浏览器直接访问 |

## 💡 推荐方案

### 方案 A: 双线部署 (推荐)

**同时提供 Electron 桌面版 + Web 云端版**

优势:
- 满足不同用户需求
- 桌面版:专业用户、离线使用、隐私敏感
- Web 版:轻度用户、快速体验、团队协作
- 代码可复用 90%+

实施:
1. 保留 Electron 打包配置
2. 添加 Supabase 集成 (可选启用)
3. 部署 Web 版到 Vercel

成本:
- 桌面版: ¥0
- Web 版: ¥180-¥323/月

### 方案 B: 纯 Electron (当前方案)

**适合场景**:
- 用户隐私至上
- 离线使用需求
- 无团队协作需求
- 预算有限

成本: **¥0/月**

### 方案 C: 纯云端 (Vercel + Supabase)

**适合场景**:
- 团队协作为主
- 跨设备访问
- 快速迭代
- 不介意云存储

成本: **¥180-¥323/月**

## 🎯 结论

### 对于 Video Agent Pro 项目

**建议选择方案 A (双线部署)**:

1. **Phase 1 (当前)**: 继续完善 Electron 桌面版
   - 成本: ¥0
   - 用户群: 专业创作者

2. **Phase 2 (3-6 个月后)**: 添加 Web 云端版
   - 成本: Vercel Hobby (¥0) + Supabase Free (¥0)
   - 用户群: 体验用户、团队协作
   - 升级路径: 根据实际使用量决定是否升级付费套餐

3. **Phase 3 (1 年后)**: 根据数据决策
   - 如果 Web 版用户多 → 升级 Supabase Pro (¥180/月)
   - 如果桌面版用户多 → 保持桌面版为主

### 初期成本估算 (Phase 2)

```
月成本: ¥0 (使用免费套餐)
限制:
- Supabase: 500MB 数据库 + 1GB 文件
- Vercel: 100GB 流量
- 适合: 100-500 测试用户
```

---

**总结**: 建议先专注完善 Electron 版本，待产品成熟后再考虑添加云端版本。如需快速验证市场，可先用免费套餐部署 Web 版本进行测试。
