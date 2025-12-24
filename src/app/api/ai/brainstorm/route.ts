import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Use the configured text model, fallback to a sensible default if not set
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(request: NextRequest) {
    try {
        const { input } = await request.json();

        if (!input || !input.trim()) {
            return NextResponse.json({ error: 'Input is required' }, { status: 400 });
        }

        if (!GEMINI_API_KEY) {
            console.error('Missing GEMINI_API_KEY');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const systemPrompt = `
      You are a professional film director and visual planner.
      Your task is to generate a comprehensive video project proposal based on the user's raw idea.
      
      User Input: "${input}"
      
      Please return a strictly valid JSON object (no markdown, no extra text) with the following fields:
      1. title: A catchy, creative title for the project. MUST be in the SAME language as the User Input.
      2. description: A professional project summary (2-3 sentences) expanding on the user's idea. MUST be in the SAME language as the User Input.
      3. artStyle: A VERY CONCISE art style description (1-3 keywords maximum). Examples: "Cyberpunk", "Studio Ghibli", "Film Noir", "Watercolor".
      
      JSON keys must differ exactly as specified.
    `;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: systemPrompt }]
                    }
                ],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API Error:', response.status, errorText);
            throw new Error(`AI Service Error: ${response.status}`);
        }

        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!resultText) {
            throw new Error('Empty response from AI');
        }

        let parsedResult;
        try {
            parsedResult = JSON.parse(resultText);
        } catch (e) {
            // Fallback cleanup if model returns markdown ticks
            const cleanText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            parsedResult = JSON.parse(cleanText);
        }

        return NextResponse.json(parsedResult);

    } catch (error: any) {
        console.error('Brainstorm API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
