import { ProxyAgent, fetch as undiciFetch, Agent } from 'undici';

const GEMINI_API_KEY =
    process.env.GEMINI_AGENT_API_KEY ||
    process.env.GEMINI_TEXT_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

const DEFAULT_BASE_URL = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';

export async function generateContent(model: string, prompt: string, retryCount = 2, apiVersion = 'v1alpha') {
    if (!GEMINI_API_KEY) {
        throw new Error('Missing Gemini API Key');
    }

    const url = `${DEFAULT_BASE_URL}/${apiVersion}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    let dispatcher: any;
    if (process.env.HTTP_PROXY) {
        try {
            dispatcher = new ProxyAgent(process.env.HTTP_PROXY);
            console.log(`[Gemini API] 🔌 Using Proxy: ${process.env.HTTP_PROXY}`);
        } catch (e) {
            console.error('[Gemini API] ❌ Failed to create ProxyAgent:', e);
        }
    }

    if (!dispatcher) {
        dispatcher = new Agent({ connect: { family: 4 } });
        console.log('[Gemini API] 🌐 Direct connection (IPv4 forced)');
    }

    const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
    });

    const sendRequest = async () => {
        // @ts-ignore
        const response = await undiciFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            dispatcher
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Gemini API Error ${response.status}: ${text}`);
        }
        return response.json();
    };

    let lastError: any;
    for (let i = 0; i <= retryCount; i++) {
        try {
            return await sendRequest();
        } catch (err) {
            lastError = err;
            console.warn(`[Gemini API] Attempt ${i + 1} failed:`, err);
            // Wait before retry
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw lastError;
}
