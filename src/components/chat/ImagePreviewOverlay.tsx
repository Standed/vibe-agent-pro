'use client';

import { createPortal } from 'react-dom';
import DraggableImage from '@/components/shot/DraggableImage';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadFile } from '@/utils/download';
import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ImagePreviewOverlayProps {
    images: string[];
    initialIndex: number;
    onClose: () => void;
}

export const ImagePreviewOverlay: React.FC<ImagePreviewOverlayProps> = ({
    images,
    initialIndex,
    onClose
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const containerRef = useRef<HTMLDivElement>(null);

    // Ensure index is valid if props change (though typically this component mounts fresh)
    useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex]);

    // Auto-focus container on mount to enable keyboard navigation
    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const currentUrl = images[currentIndex];

    const handlePrev = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        setCurrentIndex((prevIndex) => (prevIndex === 0 ? images.length - 1 : prevIndex - 1));
    };

    const handleNext = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        setCurrentIndex((prevIndex) => (prevIndex === images.length - 1 ? 0 : prevIndex + 1));
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-4 cursor-pointer backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                ref={containerRef}
                className="relative w-full h-full max-w-7xl max-h-[90vh] flex flex-col items-center justify-center group outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') handlePrev(e);
                    if (e.key === 'ArrowRight') handleNext(e);
                    if (e.key === 'Escape') onClose();
                }}>

                {/* Navigation Buttons */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={handlePrev}
                            className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50"
                        >
                            <ChevronLeft size={32} />
                        </button>
                        <button
                            onClick={handleNext}
                            className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50"
                        >
                            <ChevronRight size={32} />
                        </button>
                    </>
                )}

                <DraggableImage
                    imageUrl={currentUrl}
                    sourceType="grid"
                    className="relative cursor-default flex items-center justify-center w-full h-full"
                >
                    <img
                        key={currentUrl} // Key forces re-render for animation if needed, or simple switch
                        src={currentUrl}
                        alt={`Preview ${currentIndex + 1}/${images.length}`}
                        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl transition-opacity duration-200"
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                    />
                </DraggableImage>

                {/* Actions Bar */}
                <div
                    className="absolute bottom-4 flex items-center gap-3 px-4 py-2 bg-black/60 rounded-full backdrop-blur-md text-white/90 text-sm font-medium transition-all border border-white/10"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="text-white/50 pr-2 border-r border-white/20">
                        {currentIndex + 1} / {images.length}
                    </span>
                    <button
                        onClick={() => downloadFile(currentUrl, `preview_image_${Date.now()}`)}
                        className="flex items-center gap-1.5 hover:text-white transition-colors p-1"
                        title="下载当前图片"
                    >
                        <Download size={16} />
                        <span>下载</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 hover:text-white transition-colors p-1 pl-2 border-l border-white/20"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
