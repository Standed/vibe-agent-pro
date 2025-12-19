/**
 * Image Proxy API Route
 * 
 * 下载外部图片并转换为 base64，用于跨域图片处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function POST(request: NextRequest) {
    // 验证用户身份
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) {
        return authResult.error;
    }

    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: '缺少图片 URL' }, { status: 400 });
        }

        console.log('[ImageProxy] Fetching image:', url.substring(0, 100));

        // 下载图片
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://jimeng.jianying.com/',
            },
        });

        if (!response.ok) {
            throw new Error(`下载失败: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        console.log('[ImageProxy] Image fetched successfully, size:', arrayBuffer.byteLength);

        return NextResponse.json({
            data: base64,
            mimeType: contentType,
            size: arrayBuffer.byteLength,
        });
    } catch (error: any) {
        console.error('[ImageProxy] Error:', error);
        return NextResponse.json(
            { error: error.message || '图片下载失败' },
            { status: 500 }
        );
    }
}
