/**
 * R2 并发上传控制工具
 * 限制同时上传数量，避免请求过多导致失败
 */

type Task<T> = () => Promise<T>;

interface UploadQueueOptions {
    concurrency: number;
    onProgress?: (completed: number, total: number) => void;
}

/**
 * 创建并发控制队列
 */
export function createUploadQueue(options: UploadQueueOptions = { concurrency: 3 }) {
    const { concurrency, onProgress } = options;

    return async function runAll<T>(tasks: Task<T>[]): Promise<T[]> {
        const results: T[] = [];
        let completed = 0;
        let index = 0;

        const runTask = async (): Promise<void> => {
            while (index < tasks.length) {
                const currentIndex = index++;
                try {
                    results[currentIndex] = await tasks[currentIndex]();
                    completed++;
                    onProgress?.(completed, tasks.length);
                } catch (error) {
                    // 保留错误但继续处理其他任务
                    console.error(`[UploadQueue] Task ${currentIndex} failed:`, error);
                    throw error;
                }
            }
        };

        // 启动 concurrency 个工作线程
        const workers = Array(Math.min(concurrency, tasks.length))
            .fill(null)
            .map(() => runTask());

        await Promise.all(workers);
        return results;
    };
}

/**
 * 限制并发执行
 * @param limit 最大并发数
 */
export function pLimit(limit: number) {
    const queue: (() => void)[] = [];
    let activeCount = 0;

    const next = () => {
        activeCount--;
        if (queue.length > 0) {
            queue.shift()!();
        }
    };

    const run = async <T>(fn: () => Promise<T>): Promise<T> => {
        activeCount++;
        try {
            return await fn();
        } finally {
            next();
        }
    };

    const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            const runWithResolve = () => {
                run(fn).then(resolve).catch(reject);
            };

            if (activeCount < limit) {
                runWithResolve();
            } else {
                queue.push(runWithResolve);
            }
        });
    };

    return <T>(fn: () => Promise<T>): Promise<T> => enqueue(fn);
}

/**
 * R2 图片批量上传（带并发控制）
 */
export async function uploadImagesWithLimit<T>(
    items: T[],
    uploadFn: (item: T) => Promise<string>,
    options: { concurrency?: number; onProgress?: (completed: number, total: number) => void } = {}
): Promise<string[]> {
    const { concurrency = 3, onProgress } = options;
    const limit = pLimit(concurrency);
    let completed = 0;

    const tasks = items.map(item =>
        limit(async () => {
            const result = await uploadFn(item);
            completed++;
            onProgress?.(completed, items.length);
            return result;
        })
    );

    return Promise.all(tasks);
}
