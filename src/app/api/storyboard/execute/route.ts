import { NextRequest, NextResponse } from 'next/server';
import { StoryboardService } from '@/services/storyboardService';
import { authenticateRequest, checkCredits, checkWhitelist, consumeCredits } from '@/lib/auth-middleware';
import { calculateCredits, getOperationDescription } from '@/config/credits';

export const maxDuration = 120;

// Force dynamic to ensure environment variables are loaded
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const authResult = await authenticateRequest(req);
        if ('error' in authResult) return authResult.error;
        const { user } = authResult;

        const whitelistCheck = checkWhitelist(user);
        if ('error' in whitelistCheck) return whitelistCheck.error;

        const { action, ...args } = await req.json();
        if (!action || !['analyzeScript', 'generateShots', 'generateCharacterDesigns'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const requiredCredits = calculateCredits('GEMINI_TEXT', user.role);
        const operationDesc = getOperationDescription('GEMINI_TEXT');

        const creditsCheck = checkCredits(user, requiredCredits);
        if ('error' in creditsCheck) return creditsCheck.error;

        const service = new StoryboardService();

        let result: any;
        switch (action) {
            case 'analyzeScript':
                result = await service.analyzeScript(args.script);
                break;

            case 'generateShots':
                result = await service.generateStoryboardFromScript(args.script, args.artStyle);
                break;

            case 'generateCharacterDesigns':
                result = await service.generateCharacterDesigns({
                    script: args.script,
                    characterNames: args.characterNames,
                    artStyle: args.artStyle,
                    projectSummary: args.projectSummary,
                    shots: args.shots
                });
                break;
        }

        try {
            const consumeResult = await consumeCredits(
                user.id,
                requiredCredits,
                `storyboard-${action}`,
                `${operationDesc} (${action})`
            );
            if (!consumeResult.success) {
                console.error('[Storyboard] Credits consume failed:', consumeResult.error);
            }
        } catch (consumeError) {
            console.error('[Storyboard] Credits consume exception:', consumeError);
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Storyboard API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
