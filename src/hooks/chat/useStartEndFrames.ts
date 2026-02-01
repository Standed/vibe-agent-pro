import { useState, useCallback } from 'react';

export interface FrameImage {
    url: string;
    source: 'shot_ref' | 'manual_upload' | 'history_ref' | 'default';
    label?: string;
    file?: File;
}

export interface StartEndFramesState {
    startFrame: FrameImage | null;
    endFrame: FrameImage | null;
}

/**
 * 通用首尾帧管理 Hook
 * 支持 Vidu、Runway 等多个视频平台的首尾帧功能
 */
export function useStartEndFrames(defaultStartFrame?: FrameImage) {
    const [frames, setFrames] = useState<StartEndFramesState>({
        startFrame: defaultStartFrame || null,
        endFrame: null,
    });

    const setStartFrame = useCallback((frame: FrameImage | null) => {
        setFrames(prev => ({ ...prev, startFrame: frame }));
    }, []);

    const setEndFrame = useCallback((frame: FrameImage | null) => {
        setFrames(prev => ({ ...prev, endFrame: frame }));
    }, []);

    const clearFrames = useCallback(() => {
        setFrames({ startFrame: null, endFrame: null });
    }, []);

    const resetToDefault = useCallback(() => {
        setFrames({
            startFrame: defaultStartFrame || null,
            endFrame: null,
        });
    }, [defaultStartFrame]);

    const validate = useCallback(() => {
        const errors: string[] = [];

        if (!frames.startFrame) {
            errors.push('请设置首帧图片');
        }
        if (!frames.endFrame) {
            errors.push('请设置尾帧图片');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }, [frames]);

    const getFrameUrls = useCallback((): [string, string] | null => {
        if (!frames.startFrame || !frames.endFrame) return null;
        return [frames.startFrame.url, frames.endFrame.url];
    }, [frames]);

    return {
        frames,
        setStartFrame,
        setEndFrame,
        clearFrames,
        resetToDefault,
        validate,
        getFrameUrls,
    };
}
