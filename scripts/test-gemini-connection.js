const { ProxyAgent, fetch } = require('undici');
const https = require('https');

// 读取环境变量 (简单模拟)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBXkBdwuGy90VIyvFrhpuRQbIOXeJ1AcHA'; // 硬编码备用，以防 env 加载失败
const PROXY_URL = process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const MODEL = 'gemini-3-pro-image-preview';

console.log('--- Testing Gemini API Connection ---');
console.log(`Proxy: ${PROXY_URL}`);
console.log(`Model: ${MODEL}`);

async function testConnection() {
    try {
        const agent = new ProxyAgent(PROXY_URL);

        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: "Explain how to check internet connection in 10 words." }]
            }],
            generationConfig: {
                temperature: 0.1
            }
        };

        console.log('Sending request...');
        const startTime = Date.now();

        // 使用文本生成接口测试连接性（比图片快）
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                dispatcher: agent
            }
        );

        const endTime = Date.now();
        console.log(`Response Status: ${resp.status} ${resp.statusText}`);
        console.log(`Time taken: ${endTime - startTime}ms`);

        if (!resp.ok) {
            console.error('Response Text:', await resp.text());
        } else {
            const data = await resp.json();
            console.log('Success! Response data preview:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
        }

    } catch (error) {
        console.error('Connection Failed:', error);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
    }
}

testConnection();
