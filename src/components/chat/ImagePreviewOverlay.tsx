'use client';

import { createPortal } from 'react-dom';
import DraggableImage from '@/components/shot/DraggableImage';

interface ImagePreviewOverlayProps {
    imageUrl: string | null;
    onClose: () => void;
}

export const ImagePreviewOverlay: React.FC<ImagePreviewOverlayProps> = ({
    imageUrl,
    onClose
}) => {
    if (!imageUrl || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 cursor-pointer backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="relative max-w-7xl max-h-[90vh] flex flex-col items-center">
                <DraggableImage
                    imageUrl={imageUrl}
                    sourceType="grid" // Or 'chat' or 'history' - 'grid' fits well for generated images
                    className="relative cursor-default"
                >
                    <img
                        src={imageUrl}
                        alt="Preview"
                        className="max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        draggable={false} // Important: let DraggableImage handle drag
                    />
                </DraggableImage>
                <div className="mt-4 text-white/50 text-sm font-medium px-4 py-2 bg-black/50 rounded-full backdrop-blur-md">
                    按住图片拖拽到左侧分镜列表以应用 • 点击空白处关闭
                </div>
            </div>
        </div>,
        document.body
    );
};
