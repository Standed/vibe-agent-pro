import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * 测试任务查询 API 端点
 */

const API_KEY = process.env.RUNNINGHUB_API_KEY || '';
const TASK_ID = "2002676612409843713"; // 从之前的输出中获取

async function testQueryEndpoints() {
    console.log('🔍 测试不同的任务查询端点...\n');

    const endpoints = [
        {
            url: `https://www.runninghub.cn/task/openapi/task-info`,
            method: 'POST',
            body: { taskId: TASK_ID, apiKey: API_KEY }
        },
        {
            url: `https://www.runninghub.cn/task/openapi/query`,
            method: 'POST',
            body: { taskId: TASK_ID, apiKey: API_KEY }
        },
        {
            url: `https://www.runninghub.cn/task/openapi/app/task-info`,
            method: 'POST',
            body: { taskId: TASK_ID, apiKey: API_KEY }
        },
        {
            url: `https://www.runninghub.cn/task/openapi/comfy/task-info`,
            method: 'POST',
            body: { taskId: TASK_ID, apiKey: API_KEY }
        },
        {
            url: `https://www.runninghub.cn/task/openapi/task/status/${TASK_ID}?apiKey=${API_KEY}`,
            method: 'GET'
        }
    ];

    for (const endpoint of endpoints) {
        console.log(`\n📍 测试端点: ${endpoint.url}`);
        console.log(`   方法: ${endpoint.method}`);

        try {
            const options: any = {
                method: endpoint.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Host': 'www.runninghub.cn'
                }
            };

            if (endpoint.method === 'POST' && endpoint.body) {
                options.body = JSON.stringify(endpoint.body);
            }

            const response = await fetch(endpoint.url, options);
            const text = await response.text();

            console.log(`   状态码: ${response.status}`);
            console.log(`   响应: ${text.substring(0, 200)}...`);

            if (response.ok) {
                const data = JSON.parse(text);
                if ((data as any).code === 0) {
                    console.log(`   ✅ 成功！找到了正确的端点！`);
                    console.log(`   完整响应:`, JSON.stringify(data, null, 2));
                    return;
                }
            }
        } catch (error: any) {
            console.log(`   ❌ 错误: ${error.message}`);
        }
    }

    console.log('\n\n⚠️ 所有端点都失败了。可能需要查看 RunningHub API 文档。');
}

testQueryEndpoints();
