# 聊天存储迁移指南

## 📋 概述

本文档说明如何从旧的 `Project.chatHistory` 迁移到新的独立 `chat_messages` 表存储方案。

---

## 🎯 新架构优势

### 旧方案问题
- ❌ 项目/场景/分镜的对话混在 `Project.chatHistory` 数组中
- ❌ 只能通过 `shotId`/`sceneId` 字段区分，不够清晰
- ❌ 无法单独查询某个场景或分镜的对话历史
- ❌ 大量对话导致 `projects.metadata` 字段过大

### 新方案优势
- ✅ 独立的 `chat_messages` 表
- ✅ 清晰的三级层级：项目/场景/分镜
- ✅ 高效的索引查询
- ✅ 自动 CASCADE 删除
- ✅ 支持分页加载

---

## 🗄️ 数据库 Schema

```sql
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  scene_id UUID,               -- 场景级对话
  shot_id UUID,                -- 分镜级对话
  scope TEXT NOT NULL,         -- 'project' | 'scene' | 'shot'
  role TEXT NOT NULL,          -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  thought TEXT,                -- AI 推理过程
  metadata JSONB DEFAULT '{}', -- gridData, images, model 等
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX idx_chat_project ON chat_messages(project_id, created_at DESC);
CREATE INDEX idx_chat_scene ON chat_messages(scene_id, created_at DESC);
CREATE INDEX idx_chat_shot ON chat_messages(shot_id, created_at DESC);
```

---

## 📦 TypeScript 类型

```typescript
// 新的 ChatMessage 类型
export interface ChatMessage {
  id: string;
  userId: string;

  // 关联关系
  projectId: string;
  sceneId?: string;
  shotId?: string;

  // 对话范围
  scope: 'project' | 'scene' | 'shot';

  // 消息内容
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;

  // 扩展数据
  metadata?: {
    gridData?: GridData;
    images?: string[];
    model?: string;
    toolResults?: Array<{...}>;
  };

  // 时间戳
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 旧版类型（保留兼容性）
export interface LegacyChatMessage {
  // ... 旧字段
}
```

---

## 🔧 API 使用方法

### 1. 保存聊天消息

```typescript
import { dataService } from '@/lib/dataService';
import { v4 as uuidv4 } from 'uuid';

// 项目级对话
await dataService.saveChatMessage({
  id: uuidv4(),
  userId: currentUser.id,
  projectId: project.id,
  scope: 'project',
  role: 'user',
  content: '请帮我生成分镜',
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 场景级对话
await dataService.saveChatMessage({
  id: uuidv4(),
  userId: currentUser.id,
  projectId: project.id,
  sceneId: scene.id,
  scope: 'scene',
  role: 'assistant',
  content: '好的，我来帮你生成这个场景的分镜',
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 分镜级对话（带 Grid 数据）
await dataService.saveChatMessage({
  id: uuidv4(),
  userId: currentUser.id,
  projectId: project.id,
  shotId: shot.id,
  scope: 'shot',
  role: 'assistant',
  content: '我生成了 2x2 的 Grid 图',
  metadata: {
    gridData: {
      fullImage: 'https://...',
      slices: ['url1', 'url2', 'url3', 'url4'],
      gridSize: '2x2',
      // ...
    },
    model: 'gemini-2.0-flash',
  },
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### 2. 获取聊天历史

```typescript
// 获取项目级对话
const projectMessages = await dataService.getChatMessages({
  projectId: project.id,
  scope: 'project',
});

// 获取场景级对话
const sceneMessages = await dataService.getChatMessages({
  projectId: project.id,
  sceneId: scene.id,
  scope: 'scene',
});

// 获取分镜级对话
const shotMessages = await dataService.getChatMessages({
  projectId: project.id,
  shotId: shot.id,
  scope: 'shot',
});

// 获取所有对话（不限 scope）
const allMessages = await dataService.getChatMessages({
  projectId: project.id,
});

// 分页加载（可选）
const messages = await dataService.getChatMessages({
  projectId: project.id,
  limit: 50,
  offset: 0,
});
```

### 3. 删除聊天消息

```typescript
// 删除单条消息
await dataService.deleteChatMessage(messageId);

// 清除项目所有对话
await dataService.clearChatHistory({
  projectId: project.id,
});

// 清除场景所有对话
await dataService.clearChatHistory({
  projectId: project.id,
  sceneId: scene.id,
});

// 清除分镜所有对话
await dataService.clearChatHistory({
  projectId: project.id,
  shotId: shot.id,
});
```

---

## 🔄 迁移步骤

### 步骤 1：执行数据库迁移

在 Supabase SQL Editor 中执行 `supabase/schema.sql` 中的新 `chat_messages` 表定义：

```bash
# 1. 打开 Supabase Dashboard
# 2. 进入 SQL Editor
# 3. 复制并执行 schema.sql 中第 9 节的内容（chat_messages 表）
```

### 步骤 2：数据迁移（可选）

如果有旧数据需要迁移，可以编写迁移脚本：

```typescript
// scripts/migrate-chat-history.ts
async function migrateChatHistory(project: Project) {
  if (!project.chatHistory || project.chatHistory.length === 0) {
    return;
  }

  for (const oldMsg of project.chatHistory) {
    const newMsg: ChatMessage = {
      id: oldMsg.id,
      userId: project.user_id,
      projectId: project.id,
      sceneId: oldMsg.sceneId,
      shotId: oldMsg.shotId,
      scope: oldMsg.shotId ? 'shot' : oldMsg.sceneId ? 'scene' : 'project',
      role: oldMsg.role,
      content: oldMsg.content,
      thought: oldMsg.thought,
      metadata: {
        gridData: oldMsg.gridData,
        images: oldMsg.images,
        model: oldMsg.model,
        toolResults: oldMsg.toolResults,
      },
      timestamp: oldMsg.timestamp,
      createdAt: oldMsg.timestamp,
      updatedAt: new Date(),
    };

    await dataService.saveChatMessage(newMsg);
  }

  console.log(`✅ 迁移完成: ${project.metadata.title}`);
}
```

### 步骤 3：更新组件

#### AgentPanel 组件示例

```typescript
// src/components/agent/AgentPanel.tsx
import { dataService } from '@/lib/dataService';
import { ChatMessage } from '@/types/project';

export function AgentPanel() {
  const { project } = useProjectStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 加载项目级对话
  useEffect(() => {
    if (!project) return;

    dataService.getChatMessages({
      projectId: project.id,
      scope: 'project',
    }).then(setMessages);
  }, [project?.id]);

  // 发送消息
  const handleSend = async (content: string) => {
    const userMsg: ChatMessage = {
      id: uuidv4(),
      userId: currentUser.id,
      projectId: project.id,
      scope: 'project',
      role: 'user',
      content,
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dataService.saveChatMessage(userMsg);
    setMessages(prev => [...prev, userMsg]);

    // 调用 AI 生成回复...
    const aiResponse = await callAIService(content);

    const aiMsg: ChatMessage = {
      id: uuidv4(),
      userId: currentUser.id,
      projectId: project.id,
      scope: 'project',
      role: 'assistant',
      content: aiResponse.content,
      thought: aiResponse.thought,
      metadata: { model: 'doubao-pro' },
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dataService.saveChatMessage(aiMsg);
    setMessages(prev => [...prev, aiMsg]);
  };

  return (
    <div>
      {messages.map(msg => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
```

### 步骤 4：清理旧代码（逐步进行）

```typescript
// ⚠️ 逐步移除对 Project.chatHistory 的引用
// 1. 先确保新的聊天存储工作正常
// 2. 然后移除组件中对 chatHistory 的读取
// 3. 最后可以考虑移除 Project.chatHistory 字段（保留用于向后兼容）
```

---

## 🧪 测试清单

- [ ] 创建新项目，发送项目级对话
- [ ] 创建场景，发送场景级对话
- [ ] 创建分镜，发送分镜级对话
- [ ] 查询不同 scope 的对话历史
- [ ] 删除场景，确认对话自动删除（CASCADE）
- [ ] 删除项目，确认所有对话自动删除
- [ ] 测试分页加载大量对话
- [ ] 测试 metadata 中的 gridData 存储和读取

---

## ⚠️ 注意事项

1. **向后兼容**：`Project.chatHistory` 字段保留，但标记为 `@deprecated`
2. **RLS 策略**：新的 `chat_messages` 表已配置 RLS，用户只能访问自己的消息
3. **级联删除**：删除项目/场景/分镜会自动删除相关对话
4. **索引优化**：已为常用查询创建索引，性能良好
5. **未来扩展**：metadata 字段支持存储任意 JSON 数据，方便扩展

---

## 📚 相关文档

- [supabase/schema.sql](./supabase/schema.sql) - 数据库 Schema
- [src/types/project.ts](./src/types/project.ts) - TypeScript 类型定义
- [src/lib/dataService.ts](./src/lib/dataService.ts) - 数据服务 API
- [CLAUDE.md](./CLAUDE.md) - 项目整体架构

---

**创建日期**: 2025-12-12
**维护者**: Claude Code + 西羊石团队
