
const { GoogleGenAI } = require('@google/genai');

async function testGeminiKey(apiKey) {
    console.log(`Testing API Key: ${apiKey.substring(0, 10)}...`);
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.0-flash-exp'; // Using a standard model

    try {
        const response = await ai.models.generateContent({
            model,
            contents: 'Hello, are you working?',
        });
        console.log('✅ Success! Response:', JSON.stringify(response, null, 2));
        return true;
    } catch (error) {
        console.log('❌ Failed.');
        console.log('Error Name:', error.name);
        console.log('Error Message:', error.message);
        if (error.status) console.log('Status:', error.status);
        return false;
    }
}

async function runTests() {
    const key1 = 'AIzaSyBHEPY2ARK3HXslYSaD_30miGCxuB6p2TM';
    const key2 = 'AIzaSyCtVXiL3in1wozNiAGqrj0ZMhi_5A4UFtQ';

    console.log('--- Testing Key 1 ---');
    await testGeminiKey(key1);

    console.log('\n--- Testing Key 2 ---');
    await testGeminiKey(key2);
}

runTests();
