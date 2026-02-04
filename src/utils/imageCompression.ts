/**
 * 智能图片压缩工具
 * 目标：在保持高还原度的前提下，将图片体积控制在 10MB 以内（R2 上传友好）
 * 优化策略：
 * 1. 等比缩放到 2048px 以内
 * 2. 优先使用 WebP 格式（更好的压缩比和质量）
 * 3. 如果超过 10MB，渐进式降低质量
 * 4. 后端会二次压缩给 Gemini（2048px + JPEG 90%），前端无需激进压缩
 */

// 10MB 限制（R2 上传友好，用户要求高质量）
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
// 高质量设置
const DEFAULT_MAX_WIDTH = 2048;
const DEFAULT_QUALITY = 0.92;

export async function compressImage(
    base64OrUrl: string,
    maxWidth = DEFAULT_MAX_WIDTH,
    quality = DEFAULT_QUALITY,
    preferFormat: 'webp' | 'jpeg' | 'png' = 'webp'
): Promise<string> {
    // 如果不是 base64 或 blob，直接返回（可能是 URL）
    if (!base64OrUrl.startsWith('data:image') && !base64OrUrl.startsWith('blob:')) {
        return base64OrUrl;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let { width, height } = img;

            // 计算缩放比例（等比缩放到 maxWidth 以内）
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
            canvas.width = Math.round(width);
            canvas.height = Math.round(height);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('无法创建 Canvas 上下文'));
                return;
            }

            // 使用高质量插值
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 绘制图片
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 根据格式选择压缩方式
            let mimeType: string;
            if (preferFormat === 'webp') {
                mimeType = 'image/webp';
            } else if (preferFormat === 'png') {
                mimeType = 'image/png';
            } else {
                mimeType = 'image/jpeg';
            }

            let compressedBase64 = canvas.toDataURL(mimeType, quality);

            // 检查结果大小（Base64 大约是原始大小的 4/3）
            const sizeInBytes = (compressedBase64.length * 3) / 4;

            // 只有超过 10MB 才继续压缩
            if (sizeInBytes > MAX_FILE_SIZE_BYTES) {
                console.warn(`[ImageCompression] 图片过大 (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB)，尝试降低质量...`);
                // 降低质量并使用 WebP
                compressedBase64 = canvas.toDataURL('image/webp', quality * 0.9);

                const newSize = (compressedBase64.length * 3) / 4;
                if (newSize > MAX_FILE_SIZE_BYTES) {
                    // 继续递归压缩（缩小尺寸 + 降低质量）
                    console.warn('[ImageCompression] 继续二次压缩...');
                    resolve(compressImage(compressedBase64, maxWidth * 0.85, quality * 0.9, 'webp'));
                    return;
                }
            }

            resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = base64OrUrl;
    });
}

/**
 * 将 File 对象压缩为 Base64
 * 用于需要 Base64 格式的场景（如即时预览）
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

/**
 * 将 File 对象压缩为新的 File（保持 File 类型，用于上传）
 * @param file 原始文件
 * @param onProgress 进度回调 (0-100)
 */
// 快速路径阈值：3MB 以下跳过压缩直接上传
const FAST_PATH_SIZE = 3 * 1024 * 1024;

export async function compressFileForUpload(
    file: File,
    onProgress?: (percent: number) => void
): Promise<File> {
    // 快速路径：3MB 以下直接返回（避免不必要的压缩耗时）
    if (file.size <= FAST_PATH_SIZE) {
        onProgress?.(100);
        return file;
    }

    // 如果文件小于 10MB，也直接返回
    if (file.size <= MAX_FILE_SIZE_BYTES) {
        onProgress?.(100);
        return file;
    }

    console.log(`[ImageCompression] 文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，开始压缩...`);

    const base64 = await compressFileToBase64(file);

    // 将 base64 转回 Blob/File
    const response = await fetch(base64);
    const blob = await response.blob();

    // 确定文件扩展名
    const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg';
    const newFileName = file.name.replace(/\.[^.]+$/, `.${ext}`);

    const compressedFile = new File([blob], newFileName, { type: blob.type });
    console.log(`[ImageCompression] 压缩完成: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);

    onProgress?.(100);
    return compressedFile;
}
