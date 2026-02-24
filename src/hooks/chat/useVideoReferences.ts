import { useState, useCallback, useEffect } from 'react';
import type { ActiveReference } from './useAutoReference';
import type { FrameImage } from './useStartEndFrames';

const canRevokeRefUrl = (ref?: ActiveReference | null) => {
    return !!ref && ref.source === 'manual_upload' && typeof ref.url === 'string' && ref.url.startsWith('blob:');
};

const revokeRefUrl = (ref?: ActiveReference | null) => {
    if (!canRevokeRefUrl(ref)) return;
    try {
        URL.revokeObjectURL(ref!.url);
    } catch {
        // ignore revoke failures
    }
};

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
        setViduImg2VideoRef(prev => {
            if (prev && prev.url !== ref?.url) {
                revokeRefUrl(prev);
            }
            return ref;
        });
    }, []);

    const clearViduImg2Video = useCallback(() => {
        setViduImg2VideoRef(prev => {
            revokeRefUrl(prev);
            return null;
        });
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
        setViduReferenceRefs(prev => {
            const removed = prev.filter(r => r.url === ref.url);
            removed.forEach(r => revokeRefUrl(r));
            return prev.filter(r => r.url !== ref.url);
        });
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
        setViduReferenceRefs(prev => {
            prev.forEach(r => revokeRefUrl(r));
            return [];
        });
    }, []);

    const replaceViduReferences = useCallback((refs: ActiveReference[]) => {
        const nextRefs = refs.slice(0, MAX_VIDU_REFS);
        setViduReferenceRefs(prev => {
            const nextUrlSet = new Set(nextRefs.map(r => r.url));
            prev.forEach(r => {
                if (!nextUrlSet.has(r.url)) revokeRefUrl(r);
            });
            return nextRefs;
        });
    }, []);

    // ========== Sora ==========
    const setSora = useCallback((ref: ActiveReference | null) => {
        setSoraRef(prev => {
            if (prev && prev.url !== ref?.url) {
                revokeRefUrl(prev);
            }
            return ref;
        });
    }, []);

    const clearSora = useCallback(() => {
        setSoraRef(prev => {
            revokeRefUrl(prev);
            return null;
        });
    }, []);

    // ========== Utility Functions ==========
    const getViduReferenceCount = useCallback(() => {
        return viduReferenceRefs.length;
    }, [viduReferenceRefs.length]);

    const canAddViduReference = useCallback(() => {
        return viduReferenceRefs.length < MAX_VIDU_REFS;
    }, [viduReferenceRefs.length]);

    useEffect(() => {
        return () => {
            revokeRefUrl(viduImg2VideoRef);
            revokeRefUrl(soraRef);
            viduReferenceRefs.forEach(r => revokeRefUrl(r));
        };
    }, [viduImg2VideoRef, soraRef, viduReferenceRefs]);

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
