
const { GoogleGenAI } = require('@google/genai');

async function testGeminiImageModel() {
    const apiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Set GEMINI_IMAGE_API_KEY or GEMINI_API_KEY before running this test.');
    }
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3.1-flash-image-preview';

    console.log(`Testing model: ${model}`);

    try {
        const response = await ai.models.generateContent({
            model,
            contents: {
                parts: [{ text: 'A futuristic city skyline' }],
            },
            config: {
                imageConfig: {
                    aspectRatio: '16:9',
                    imageSize: '4K',
                },
            },
        });

        console.log('✅ Success! Response:', JSON.stringify(response, null, 2));
    } catch (error) {
        console.log('❌ Failed.');
        console.log('Error Name:', error.name);
        console.log('Error Message:', error.message);
        if (error.status) console.log('Status:', error.status);
        console.log('Full error:', JSON.stringify(error, null, 2));
    }
}

testGeminiImageModel();
