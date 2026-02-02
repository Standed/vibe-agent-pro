/**
 * 全局任务队列服务
 * 
 * 用于限制并发任务数量，避免触发 API 限流
 * 支持优先级队列和任务取消
 */

type Task<T> = () => Promise<T>;

interface QueuedTask<T> {
    id: string;
    task: Task<T>;
    priority: number;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    createdAt: number;
    cancelled: boolean;
}

interface TaskQueueOptions {
    concurrency: number;
    maxQueueSize?: number;
    taskTimeout?: number; // ms
}

class TaskQueueService {
    private queue: QueuedTask<any>[] = [];
    private running = 0;
    private concurrency: number;
    private maxQueueSize: number;
    private taskTimeout: number;
    private taskIdCounter = 0;

    constructor(options: TaskQueueOptions) {
        this.concurrency = options.concurrency;
        this.maxQueueSize = options.maxQueueSize || 100;
        this.taskTimeout = options.taskTimeout || 120000; // 默认 2 分钟
    }

    /**
     * 将任务加入队列
     * @param task 要执行的异步任务
     * @param priority 优先级（数字越大优先级越高）
     * @returns Promise 包含任务结果
     */
    async enqueue<T>(task: Task<T>, priority = 0): Promise<T> {
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error(`Task queue is full (max: ${this.maxQueueSize})`);
        }

        const taskId = `task_${++this.taskIdCounter}_${Date.now()}`;

        return new Promise<T>((resolve, reject) => {
            const queuedTask: QueuedTask<T> = {
                id: taskId,
                task,
                priority,
                resolve,
                reject,
                createdAt: Date.now(),
                cancelled: false,
            };

            // 按优先级插入队列
            const insertIndex = this.queue.findIndex(t => t.priority < priority);
            if (insertIndex === -1) {
                this.queue.push(queuedTask);
            } else {
                this.queue.splice(insertIndex, 0, queuedTask);
            }

            this.processQueue();
        });
    }

    /**
     * 处理队列中的任务
     */
    private async processQueue(): Promise<void> {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const queuedTask = this.queue.shift();
            if (!queuedTask) break;

            // 跳过已取消的任务
            if (queuedTask.cancelled) {
                queuedTask.reject(new Error('Task cancelled'));
                continue;
            }

            this.running++;

            // 设置超时
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Task timeout after ${this.taskTimeout}ms`));
                }, this.taskTimeout);
            });

            Promise.race([queuedTask.task(), timeoutPromise])
                .then(result => {
                    if (!queuedTask.cancelled) {
                        queuedTask.resolve(result);
                    }
                })
                .catch(error => {
                    queuedTask.reject(error);
                })
                .finally(() => {
                    this.running--;
                    this.processQueue();
                });
        }
    }

    /**
     * 获取队列状态
     */
    getStatus(): { queueLength: number; running: number; concurrency: number } {
        return {
            queueLength: this.queue.length,
            running: this.running,
            concurrency: this.concurrency,
        };
    }

    /**
     * 清空队列
     */
    clear(): void {
        for (const task of this.queue) {
            task.cancelled = true;
            task.reject(new Error('Queue cleared'));
        }
        this.queue = [];
    }

    /**
     * 动态调整并发数
     */
    setConcurrency(concurrency: number): void {
        this.concurrency = Math.max(1, concurrency);
        this.processQueue(); // 触发处理（可能有新的并发槽位）
    }
}

// 全局单例实例
// 图片生成队列（并发 5）
export const imageGenerationQueue = new TaskQueueService({
    concurrency: 5,
    maxQueueSize: 50,
    taskTimeout: 180000, // 3 分钟
});

// 视频生成队列（并发 3，视频生成更耗资源）
export const videoGenerationQueue = new TaskQueueService({
    concurrency: 3,
    maxQueueSize: 30,
    taskTimeout: 300000, // 5 分钟
});

// R2 上传队列（并发 5）
export const uploadQueue = new TaskQueueService({
    concurrency: 5,
    maxQueueSize: 100,
    taskTimeout: 60000, // 1 分钟
});

export { TaskQueueService };
