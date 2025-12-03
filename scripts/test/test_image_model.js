
const { GoogleGenAI } = require('@google/genai');

async function testGeminiImageModel() {
    const apiKey = 'AIzaSyCtVXiL3in1wozNiAGqrj0ZMhi_5A4UFtQ'; // Using the verified key
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3-pro-image-preview';

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
