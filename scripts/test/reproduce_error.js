
const { GoogleGenAI } = require('@google/genai');

async function testGemini() {
    const apiKey = 'INVALID_KEY_FOR_TESTING';
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash';

    try {
        console.log('Attempting to generate content with invalid key...');
        const response = await ai.models.generateContent({
            model,
            contents: 'Hello',
        });
        console.log('Success (unexpected):', response);
    } catch (error) {
        console.log('Caught error:');
        console.log('Name:', error.name);
        console.log('Message:', error.message);
        console.log('Status:', error.status);
        console.log('StatusText:', error.statusText);
        console.log('Full error object:', JSON.stringify(error, null, 2));
    }
}

testGemini();
