import { useState, useCallback } from 'react';
import type { ActiveReference } from './useAutoReference';
import type { FrameImage } from './useStartEndFrames';

/**
 * 视频参考图状态管理 Hook
 * 为不同视频模式提供独立的参考图状态
 */
export function useVideoReferences() {
    // Vidu 图生视频（单图）
    const [viduImg2VideoRef, setViduImg2VideoRef] = useState<ActiveReference | null>(null);

    // Vidu 参考生视频（最多7张）
    const [viduReferenceRefs, setViduReferenceRefs] = useState<ActiveReference[]>([]);

    // Sora（单图）
    const [soraRef, setSoraRef] = useState<ActiveReference | null>(null);

    // ========== Vidu Img2Video ==========
    const setViduImg2Video = useCallback((ref: ActiveReference | null) => {
        setViduImg2VideoRef(ref);
    }, []);

    const clearViduImg2Video = useCallback(() => {
        setViduImg2VideoRef(null);
    }, []);

    // ========== Vidu Reference2Video ==========
    const MAX_VIDU_REFS = 7;

    const addViduReference = useCallback((ref: ActiveReference): boolean => {
        let added = false;
        setViduReferenceRefs(prev => {
            if (prev.length >= MAX_VIDU_REFS) return prev;
            if (prev.some(r => r.url === ref.url)) return prev;
            added = true;
            return [...prev, ref];
        });
        return added;
    }, []);

    const removeViduReference = useCallback((ref: ActiveReference) => {
        setViduReferenceRefs(prev => prev.filter(r => r.url !== ref.url));
    }, []);

    const moveViduReference = useCallback((fromIndex: number, toIndex: number) => {
        setViduReferenceRefs(prev => {
            const result = [...prev];
            const [removed] = result.splice(fromIndex, 1);
            result.splice(toIndex, 0, removed);
            return result;
        });
    }, []);

    const clearViduReferences = useCallback(() => {
        setViduReferenceRefs([]);
    }, []);

    const replaceViduReferences = useCallback((refs: ActiveReference[]) => {
        setViduReferenceRefs(refs.slice(0, MAX_VIDU_REFS));
    }, []);

    // ========== Sora ==========
    const setSora = useCallback((ref: ActiveReference | null) => {
        setSoraRef(ref);
    }, []);

    const clearSora = useCallback(() => {
        setSoraRef(null);
    }, []);

    // ========== Utility Functions ==========
    const getViduReferenceCount = useCallback(() => {
        return viduReferenceRefs.length;
    }, [viduReferenceRefs.length]);

    const canAddViduReference = useCallback(() => {
        return viduReferenceRefs.length < MAX_VIDU_REFS;
    }, [viduReferenceRefs.length]);

    return {
        // State
        viduImg2VideoRef,
        viduReferenceRefs,
        soraRef,

        // Vidu Img2Video
        setViduImg2Video,
        clearViduImg2Video,

        // Vidu Reference2Video
        addViduReference,
        removeViduReference,
        moveViduReference,
        clearViduReferences,
        replaceViduReferences,
        getViduReferenceCount,
        canAddViduReference,
        MAX_VIDU_REFS,

        // Sora
        setSora,
        clearSora,
    };
}

export type VideoReferencesHook = ReturnType<typeof useVideoReferences>;
