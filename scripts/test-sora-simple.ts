import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * 简化的 Sora 测试脚本
 * 目的：测试 RunningHub API 的正确调用方式
 */

const API_KEY = process.env.RUNNINGHUB_API_KEY || '';
const BASE_URL = 'https://www.runninghub.cn/task/openapi';

// WebApp IDs
const APP_ID_CHAR_REF = "2001563656125071361"; // 上传角色
const APP_ID_SORA_I2V = "1973555366057390081"; // 图生视频

async function testImageUpload() {
    console.log('📤 测试图片上传...\n');

    // 尝试使用图片 URL 直接作为 fieldValue（某些平台支持）
    const testImageUrl = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

    // 测试方案 1：尝试直接使用 URL
    console.log('方案 1: 尝试直接使用图片 URL...');
    const payload1 = {
        webappId: APP_ID_CHAR_REF,
        apiKey: API_KEY,
        nodeInfoList: [
            {
                nodeId: "15",
                fieldName: "image",
                fieldValue: testImageUrl // 直接使用 URL
            },
            {
                nodeId: "14",
                fieldName: "prompt",
                fieldValue: "测试图片URL"
            }
        ]
    };

    try {
        const response1 = await fetch(`${BASE_URL}/ai-app/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Host': 'www.runninghub.cn'
            },
            body: JSON.stringify(payload1),
        });

        const data1 = await response1.json();
        console.log('响应:', JSON.stringify(data1, null, 2));

        if ((data1 as any).code === 0) {
            console.log('✅ 成功！直接使用 URL 可行');
            return testImageUrl;
        } else {
            console.log('❌ 直接使用 URL 失败\n');
        }
    } catch (error: any) {
        console.error('错误:', error.message);
    }

    // 测试方案 2：下载图片并转换为 base64 data URL
    console.log('\n方案 2: 尝试使用 base64 data URL...');
    try {
        const imageResponse = await fetch(testImageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;

        const payload2 = {
            webappId: APP_ID_CHAR_REF,
            apiKey: API_KEY,
            nodeInfoList: [
                {
                    nodeId: "15",
                    fieldName: "image",
                    fieldValue: dataUrl
                },
                {
                    nodeId: "14",
                    fieldName: "prompt",
                    fieldValue: "测试base64"
                }
            ]
        };

        const response2 = await fetch(`${BASE_URL}/ai-app/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Host': 'www.runninghub.cn'
            },
            body: JSON.stringify(payload2),
        });

        const data2 = await response2.json();
        console.log('响应:', JSON.stringify(data2, null, 2));

        if ((data2 as any).code === 0) {
            console.log('✅ 成功！使用 base64 data URL 可行');
            return dataUrl;
        } else {
            console.log('❌ 使用 base64 data URL 失败');
        }
    } catch (error: any) {
        console.error('错误:', error.message);
    }

    throw new Error('所有图片上传方案都失败了');
}

async function main() {
    console.log('🚀 RunningHub Sora 简化测试\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!API_KEY || API_KEY.includes('your_api_key')) {
        console.error('❌ 错误: 未设置 RUNNINGHUB_API_KEY');
        process.exit(1);
    }

    try {
        // 步骤 1: 测试图片上传
        const imageValue = await testImageUpload();
        console.log(`\n✅ 获取到图片值: ${imageValue.substring(0, 50)}...\n`);

        // 注意：后续步骤需要等待实际的图片上传成功后才能继续
        console.log('⚠️ 注意：如果图片上传不成功，后续步骤将无法进行');
        console.log('建议：先在 RunningHub 网页界面手动上传图片，获取 hash 值后再测试');

    } catch (error: any) {
        console.error('\n❌ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
