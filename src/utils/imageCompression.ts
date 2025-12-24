/**
 * 智能图片压缩工具
 * 目标：在保持高质量（2048px, 0.9 质量）的前提下，将图片体积控制在 Vercel Payload 限制内（< 4.5MB）
 */

export async function compressImage(
    base64OrUrl: string,
    maxWidth = 2048,
    quality = 0.9
): Promise<string> {
    // 如果不是 base64 或者是很短的字符串（可能是占位符），直接返回
    if (!base64OrUrl.startsWith('data:image') && !base64OrUrl.startsWith('blob:')) {
        return base64OrUrl;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let { width, height } = img;

            // 计算缩放比例
            if (width > maxWidth || height > maxWidth) {
                if (width > height) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                } else {
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('无法创建 Canvas 上下文'));
                return;
            }

            // 绘制并压缩
            ctx.drawImage(img, 0, 0, width, height);

            // 转换为 JPEG 格式以获得更好的压缩比
            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

            // 检查结果大小，如果仍然超过 3.5MB (预留空间给其他 payload)，则进一步降低质量
            if (compressedBase64.length > 3.5 * 1024 * 1024) {
                console.warn('[ImageCompression] 图片仍然过大，尝试二次压缩...');
                resolve(compressImage(compressedBase64, maxWidth * 0.75, quality * 0.8));
            } else {
                resolve(compressedBase64);
            }
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = base64OrUrl;
    });
}

/**
 * 将 File 对象压缩为 Base64
 */
export async function compressFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            try {
                const compressed = await compressImage(base64);
                resolve(compressed);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
