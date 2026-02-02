/**
 * useChatModals
 * 
 * 聊天面板模态框状态统一管理
 */

import { useState } from 'react';
import { ChatPanelMessage } from '@/types/project';

export interface SliceSelectorData {
    gridData: ChatPanelMessage['gridData'];
    shotId?: string;
    currentSliceIndex?: number;
}

export interface PreviewState {
    images: string[];
    index: number;
}

export function useChatModals() {
    // 图片预览状态
    const [previewState, setPreviewState] = useState<PreviewState | null>(null);

    // 切片选择器状态
    const [sliceSelectorData, setSliceSelectorData] = useState<SliceSelectorData | null>(null);

    // 快捷方法
    const openPreview = (images: string[], index: number = 0) => {
        setPreviewState({ images, index });
    };

    const closePreview = () => {
        setPreviewState(null);
    };

    const openSliceSelector = (data: SliceSelectorData) => {
        setSliceSelectorData(data);
    };

    const closeSliceSelector = () => {
        setSliceSelectorData(null);
    };

    return {
        // 状态
        previewState,
        sliceSelectorData,
        // Setters
        setPreviewState,
        setSliceSelectorData,
        // 快捷方法
        openPreview,
        closePreview,
        openSliceSelector,
        closeSliceSelector,
    };
}
