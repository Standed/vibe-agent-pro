
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
    const key1 = process.env.GEMINI_TEXT_API_KEY || process.env.GEMINI_API_KEY;
    const key2 = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;

    if (!key1 || !key2) {
        throw new Error('Set GEMINI_TEXT_API_KEY/GEMINI_IMAGE_API_KEY or GEMINI_API_KEY before running this test.');
    }

    console.log('--- Testing Key 1 ---');
    await testGeminiKey(key1);

    console.log('\n--- Testing Key 2 ---');
    await testGeminiKey(key2);
}

runTests();
