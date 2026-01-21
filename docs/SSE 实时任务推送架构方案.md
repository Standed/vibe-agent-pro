# SSE 实时任务推送架构方案

> 版本: v1.0 | 更新日期: 2026-01-21

## 背景

当前系统使用 **5秒轮询** 机制刷新 Sora 任务状态，存在以下问题：
- 高频请求消耗 Vercel 函数调用配额
- 实时性不足（最多延迟 5 秒）
- 手动刷新按钮有时失效

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                                                                  │
│  ┌──────────────┐      ┌─────────────────┐                     │
│  │ TimelineView │ ←──── │  useSoraSSE()  │                     │
│  │ Task Queue   │      │     Hook        │                     │
│  └──────────────┘      └────────┬────────┘                     │
│                                 │ EventSource                   │
│                                 │ (持久连接)                    │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
               ═══════════════════╪═══════════════════
                                  │ SSE Stream
                                  │
┌─────────────────────────────────▼───────────────────────────────┐
│                          BACKEND                                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │            /api/sora/sse  (SSE Endpoint)               │    │
│  │                                                        │    │
│  │  • 验证 JWT Token                                      │    │
│  │  • 查询项目任务列表                                     │    │
│  │  • 建立 SSE 流（Keep-Alive）                           │    │
│  │  • 每 5-10s 轮询 Kaponai 状态                          │    │
│  │  • 推送增量更新事件                                     │    │
│  └────────────────────────────────────────────────────────┘    │
│                      │                                          │
│          ┌───────────┴───────────┐                             │
│          ▼                       ▼                             │
│  ┌──────────────┐      ┌──────────────┐                       │
│  │ Kaponai API  │      │  Supabase    │                       │
│  │ (状态查询)    │      │ (sora_tasks) │                       │
│  └──────────────┘      └──────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 事件协议

### SSE 事件格式

```typescript
interface SoraSSEEvent {
    type: 'init' | 'task_update' | 'task_complete' | 'task_failed' | 'heartbeat';
    timestamp: string;
    payload?: {
        taskId: string;
        status: 'queued' | 'processing' | 'completed' | 'failed';
        progress: number;
        videoUrl?: string;
        r2Url?: string;
        error?: string;
    };
    tasks?: SoraTask[];  // 仅 init 事件
}
```

### 事件类型说明

| 事件类型 | 触发时机 | 用途 |
|----------|----------|------|
| `init` | 连接建立时 | 发送完整任务列表 |
| `task_update` | 任务状态/进度变化 | 增量更新单个任务 |
| `task_complete` | 视频生成完成 | 通知并更新视频URL |
| `task_failed` | 任务失败 | 显示错误信息 |
| `heartbeat` | 每 30s | 保持连接活跃 |

## 后端实现方案

### API 路由: `/api/sora/sse/route.ts`

```typescript
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. 鉴权
    const authResult = await authenticateRequest(req);
    if ('error' in authResult) return authResult.error;
    
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) return new Response('projectId required', { status: 400 });
    
    // 2. 创建 SSE 响应流
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (data: SoraSSEEvent) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };
            
            // 3. 发送初始任务列表
            const tasks = await getProjectTasks(projectId);
            send({ type: 'init', timestamp: new Date().toISOString(), tasks });
            
            // 4. 轮询检查 + 推送更新
            const checkInterval = setInterval(async () => {
                try {
                    const pendingTasks = tasks.filter(t => 
                        t.status !== 'completed' && t.status !== 'failed'
                    );
                    
                    if (pendingTasks.length === 0) {
                        send({ type: 'heartbeat', timestamp: new Date().toISOString() });
                        return;
                    }
                    
                    // 批量查询 Kaponai
                    const updates = await batchCheckKaponaiStatus(pendingTasks);
                    
                    for (const update of updates) {
                        if (update.changed) {
                            const eventType = update.status === 'completed' ? 'task_complete' 
                                            : update.status === 'failed' ? 'task_failed' 
                                            : 'task_update';
                            send({
                                type: eventType,
                                timestamp: new Date().toISOString(),
                                payload: update
                            });
                        }
                    }
                } catch (error) {
                    console.error('[SSE] Check error:', error);
                }
            }, 5000);
            
            // 5. 清理（连接断开时）
            req.signal.addEventListener('abort', () => {
                clearInterval(checkInterval);
                controller.close();
            });
        }
    });
    
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}
```

## 前端实现方案

### Hook: `useSoraSSE.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { SoraTask } from '@/types/project';

export function useSoraSSE(projectId: string | undefined) {
    const [tasks, setTasks] = useState<SoraTask[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const connect = useCallback(() => {
        if (!projectId) return;
        
        const eventSource = new EventSource(`/api/sora/sse?projectId=${projectId}`);
        
        eventSource.onopen = () => {
            setConnected(true);
            setError(null);
        };
        
        eventSource.onmessage = (event) => {
            const data: SoraSSEEvent = JSON.parse(event.data);
            
            switch (data.type) {
                case 'init':
                    setTasks(data.tasks || []);
                    break;
                    
                case 'task_update':
                case 'task_complete':
                case 'task_failed':
                    if (data.payload) {
                        setTasks(prev => prev.map(task => 
                            task.id === data.payload!.taskId
                                ? { ...task, ...data.payload }
                                : task
                        ));
                    }
                    break;
            }
        };
        
        eventSource.onerror = () => {
            setConnected(false);
            setError('Connection lost, reconnecting...');
            eventSource.close();
            
            // 3秒后重连
            setTimeout(connect, 3000);
        };
        
        return () => eventSource.close();
    }, [projectId]);
    
    useEffect(() => {
        const cleanup = connect();
        return cleanup;
    }, [connect]);
    
    return { tasks, connected, error };
}
```

## Vercel 部署注意事项

### 超时限制

| 计划 | 函数超时 | SSE 影响 |
|------|----------|----------|
| Hobby | 60s | 每 60s 自动断开重连 |
| Pro | 300s | 每 300s 自动断开重连 |
| Enterprise | 900s | 较长保持连接 |

> 前端使用 EventSource 会 **自动重连**，对用户透明。

### 并发连接

- Vercel 无硬性连接数限制
- 建议：**每用户每项目** 最多 1 个 SSE 连接
- 离开页面时及时 `close()` 连接

## 迁移方案

### 阶段 1：共存模式

1. 新增 `/api/sora/sse` 端点
2. 新增 `useSoraSSE` Hook
3. 在 `TimelineView` 中**可选启用** SSE（Feature Flag）
4. 保留原有轮询作为 fallback

### 阶段 2：逐步替换

1. SSE 稳定后，禁用定时轮询
2. 仅在 SSE 断开时触发单次 API 查询
3. 移除 `refreshAllTasks` 定时调用

### 阶段 3：全面 SSE

1. 移除轮询相关代码
2. SSE 成为唯一实时更新通道

## 开发工作量

| 任务 | 预估时间 |
|------|----------|
| 后端 SSE 端点实现 | 3-4 小时 |
| 前端 Hook 实现 | 2 小时 |
| TimelineView 集成 | 1 小时 |
| 测试 & 调试 | 2 小时 |
| **总计** | **~1 天** |

## 相关文件

- 后端：`src/app/api/sora/sse/route.ts` (新增)
- 前端 Hook：`src/hooks/useSoraSSE.ts` (新增)
- 集成组件：`src/components/layout/TimelineView.tsx`
- 现有轮询：`src/hooks/useSoraTaskManager.ts`

---

> 待实现，优先级：中
