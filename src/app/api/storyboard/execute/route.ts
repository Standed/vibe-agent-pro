import { NextResponse } from 'next/server';
import { StoryboardService } from '@/services/StoryboardService';

// Force dynamic to ensure environment variables are loaded
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { action, ...args } = await req.json();
        const service = new StoryboardService();

        switch (action) {
            case 'analyzeScript':
                const analysis = await service.analyzeScript(args.script);
                return NextResponse.json(analysis);

            case 'generateShots':
                const shots = await service.generateStoryboardFromScript(args.script, args.artStyle);
                return NextResponse.json(shots);

            case 'generateCharacterDesigns':
                const designs = await service.generateCharacterDesigns({
                    script: args.script,
                    characterNames: args.characterNames,
                    artStyle: args.artStyle,
                    projectSummary: args.projectSummary,
                    shots: args.shots
                });
                return NextResponse.json(designs);

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Storyboard API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
