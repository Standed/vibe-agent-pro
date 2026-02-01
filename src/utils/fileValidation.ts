import { toast } from 'sonner';

/**
 * Validates a file for image type and size limit.
 * @param file The file to validate
 * @param maxSize Max size in bytes (default: 10MB)
 * @returns boolean true if valid, false otherwise
 */
export function validateImageFile(file: File, maxSize: number = 10 * 1024 * 1024): boolean {
    if (!file.type.startsWith('image/')) {
        toast.error(`文件 ${file.name} 不是图片`);
        return false;
    }
    if (file.size > maxSize) {
        toast.error(`文件 ${file.name} 超过 10MB 限制`);
        return false;
    }
    return true;
}
