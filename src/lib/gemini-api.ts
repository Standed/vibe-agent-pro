import { ProxyAgent, fetch as undiciFetch, Agent } from 'undici';

const GEMINI_API_KEY =
    process.env.GEMINI_AGENT_API_KEY ||
    process.env.GEMINI_TEXT_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

const DEFAULT_BASE_URL = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';

const parseFallbackModels = (): string[] => {
    const raw =
        process.env.GEMINI_STORYBOARD_FALLBACK_MODELS ||
        process.env.GEMINI_FALLBACK_MODELS ||
        '';
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const DEFAULT_MODEL_FALLBACKS = [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
];

const parseStatusCode = (error: unknown): number | null => {
    const message = error instanceof Error ? error.message : String(error || '');
    const match = message.match(/Gemini API Error (\d{3})/);
    return match ? Number(match[1]) : null;
};

const isHighDemandError = (error: unknown): boolean => {
    const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
    return message.includes('high demand') || message.includes('"unavailable"') || message.includes('status":"unavailable"');
};

const shouldRetry = (error: unknown): boolean => {
    const status = parseStatusCode(error);
    if (status === null) return true;
    return status >= 500 || status === 429 || isHighDemandError(error);
};

const buildModelCandidates = (primaryModel: string): string[] => {
    const envFallbacks = parseFallbackModels();
    return Array.from(
        new Set([
            primaryModel,
            ...envFallbacks,
            ...DEFAULT_MODEL_FALLBACKS,
        ].filter(Boolean))
    );
};

const buildApiVersions = (apiVersion: string): string[] => {
    return Array.from(new Set([apiVersion, 'v1beta']));
};

export async function generateContent(model: string, prompt: string, retryCount = 2, apiVersion = 'v1alpha') {
    if (!GEMINI_API_KEY) {
        throw new Error('Missing Gemini API Key');
    }

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

    const sendRequest = async (targetModel: string, version: string) => {
        const url = `${DEFAULT_BASE_URL}/${version}/models/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
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

    const candidates = buildModelCandidates(model);
    const apiVersions = buildApiVersions(apiVersion);

    let lastError: any;
    for (const targetModel of candidates) {
        for (const version of apiVersions) {
            for (let i = 0; i <= retryCount; i++) {
                try {
                    if (targetModel !== model || version !== apiVersion) {
                        console.warn(
                            `[Gemini API] Using fallback route model=${targetModel}, version=${version}, attempt=${i + 1}`
                        );
                    }
                    return await sendRequest(targetModel, version);
                } catch (err) {
                    lastError = err;
                    const status = parseStatusCode(err);
                    const retryable = shouldRetry(err);
                    console.warn(
                        `[Gemini API] model=${targetModel} version=${version} attempt=${i + 1} failed (status=${status ?? 'unknown'}, retryable=${retryable}):`,
                        err
                    );

                    if (i < retryCount && retryable) {
                        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
                        continue;
                    }

                    break;
                }
            }
        }
    }

    throw lastError;
}
