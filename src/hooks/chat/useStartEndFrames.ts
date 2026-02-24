import { useState, useCallback, useEffect } from 'react';

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

const canRevokeFrame = (frame?: FrameImage | null) =>
    !!frame && frame.source === 'manual_upload' && typeof frame.url === 'string' && frame.url.startsWith('blob:');

const revokeFrameUrl = (frame?: FrameImage | null) => {
    if (!canRevokeFrame(frame)) return;
    try {
        URL.revokeObjectURL(frame!.url);
    } catch {
        // ignore revoke failures
    }
};

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
        setFrames(prev => {
            if (prev.startFrame && prev.startFrame.url !== frame?.url) {
                revokeFrameUrl(prev.startFrame);
            }
            return { ...prev, startFrame: frame };
        });
    }, []);

    const setEndFrame = useCallback((frame: FrameImage | null) => {
        setFrames(prev => {
            if (prev.endFrame && prev.endFrame.url !== frame?.url) {
                revokeFrameUrl(prev.endFrame);
            }
            return { ...prev, endFrame: frame };
        });
    }, []);

    const clearFrames = useCallback(() => {
        setFrames(prev => {
            revokeFrameUrl(prev.startFrame);
            revokeFrameUrl(prev.endFrame);
            return { startFrame: null, endFrame: null };
        });
    }, []);

    const resetToDefault = useCallback(() => {
        setFrames(prev => {
            const nextStartFrame = defaultStartFrame || null;
            if (prev.startFrame && prev.startFrame.url !== nextStartFrame?.url) {
                revokeFrameUrl(prev.startFrame);
            }
            revokeFrameUrl(prev.endFrame);
            return {
                startFrame: nextStartFrame,
                endFrame: null,
            };
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

    useEffect(() => {
        return () => {
            revokeFrameUrl(frames.startFrame);
            revokeFrameUrl(frames.endFrame);
        };
    }, [frames.startFrame, frames.endFrame]);

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
