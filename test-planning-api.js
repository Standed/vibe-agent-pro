const fetch = require('node-fetch');

async function testPlanningAPI() {
    const url = 'http://localhost:3000/api/ai/planning';
    const payload = {
        message: '你好，帮我完善一下剧本',
        context: {
            script: '一个关于时间旅行的故事',
            characters: [],
            locations: []
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testPlanningAPI();
