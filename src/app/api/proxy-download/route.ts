import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const filename = searchParams.get('filename') || 'download.png';

    if (!url) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Fetch failed: ${res.status}`);
        }

        const headers = new Headers(res.headers);
        headers.set('Content-Disposition', `attachment; filename="${filename}"`);
        headers.delete('Content-Length');
        // Ensure we don't expose sensitive headers if any
        headers.delete('Authorization');

        // Create a new response with the body stream
        return new NextResponse(res.body, {
            status: 200,
            headers,
        });
    } catch (err: any) {
        console.error('Proxy download error:', err);
        return new NextResponse(err.message || 'Internal Server Error', { status: 500 });
    }
}
