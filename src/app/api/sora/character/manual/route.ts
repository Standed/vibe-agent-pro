import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, checkWhitelist } from '@/lib/auth-middleware';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if ('error' in authResult) {
    return authResult.error;
  }
  const whitelistCheck = checkWhitelist(authResult.user);
  if ('error' in whitelistCheck) {
    return whitelistCheck.error;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const characterId = body?.characterId as string | undefined;
    const rawUsername = body?.username as string | undefined;
    const referenceVideoUrl = (body?.referenceVideoUrl as string | undefined)?.trim();

    const username = rawUsername?.trim();
    if (!characterId || !username) {
      return NextResponse.json({ error: 'characterId and username are required' }, { status: 400 });
    }

    const { data: character, error } = await supabase
      .from('characters')
      .select('id,user_id,metadata')
      .eq('id', characterId)
      .single();

    if (error || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    if (character.user_id !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existingMetadata = character.metadata || {};
    const existingIdentity = existingMetadata.soraIdentity || {};
    const effectiveVideoUrl =
      referenceVideoUrl ||
      existingMetadata.soraReferenceVideoUrl ||
      existingIdentity.referenceVideoUrl ||
      '';

    const nextIdentity = {
      ...existingIdentity,
      username,
      referenceVideoUrl: effectiveVideoUrl || '',
      status: 'registered',
    };

    await supabase.from('characters').update({
      metadata: {
        ...existingMetadata,
        soraReferenceVideoUrl: effectiveVideoUrl || null,
        soraIdentity: nextIdentity
      }
    }).eq('id', characterId);

    return NextResponse.json({
      success: true,
      character: {
        id: characterId,
        soraIdentity: nextIdentity,
        soraReferenceVideoUrl: effectiveVideoUrl || null
      }
    });
  } catch (error: any) {
    console.error('[ManualSoraCode] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to write back sora id' }, { status: 500 });
  }
}
