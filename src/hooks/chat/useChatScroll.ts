/**
 * useChatScroll - 聊天滚动管理 Hook
 * 
 * 职责：
 * 1. 首次进入分镜时自动滚动到底部
 * 2. 图片/视频加载完成后补偿滚动
 * 3. 加载更多时保持滚动位置
 * 4. 新消息到达时智能滚动（用户在底部附近才自动跟随）
 */

import { useRef, useCallback, useLayoutEffect, useEffect } from 'react';

interface UseChatScrollOptions {
    /** 消息列表 */
    messages: any[];
    /** 当前分镜 ID */
    shotId: string | null;
    /** 当前场景 ID */
    sceneId: string | null;
    /** 是否正在加载 */
    isLoading: boolean;
    /** 是否正在加载更多 */
    isLoadingMore: boolean;
}

interface UseChatScrollReturn {
    /** 消息容器 ref */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** 消息底部锚点 ref */
    endRef: React.RefObject<HTMLDivElement | null>;
    /** 媒体（图片/视频）加载完成回调 */
    handleMediaLoaded: () => void;
    /** 加载更多前调用，保存滚动位置 */
    beforeLoadMore: () => void;
    /** 加载更多后调用，恢复滚动位置 */
    afterLoadMore: () => void;
    /** 强制滚动到底部 */
    scrollToBottom: (behavior?: ScrollBehavior) => void;
}

// 判断用户是否在底部附近的阈值（像素）
const NEAR_BOTTOM_THRESHOLD = 150;
// 初始滚动稳定检测间隔
const SCROLL_CHECK_INTERVAL = 80;
// 最大重试次数
const MAX_SCROLL_ATTEMPTS = 25; // 2 秒

export function useChatScroll({
    messages,
    shotId,
    sceneId,
    isLoading,
    isLoadingMore,
}: UseChatScrollOptions): UseChatScrollReturn {
    const containerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    // 滚动上下文标识（分镜+场景）
    const scrollContextRef = useRef<string>('');
    // 是否已完成首次滚动
    const initialScrollDoneRef = useRef(false);
    // 加载更多时保存的滚动位置
    const loadMoreScrollRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
    // 是否正在执行加载更多
    const isLoadingMoreRef = useRef(false);

    /**
     * 滚动到底部
     */
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
        const container = containerRef.current;
        if (!container) return;

        // 使用两种方式确保滚动成功
        container.scrollTop = container.scrollHeight;
        endRef.current?.scrollIntoView({ block: 'end', behavior });
    }, []);

    /**
     * 检查是否在底部附近
     */
    const isNearBottom = useCallback(() => {
        const container = containerRef.current;
        if (!container) return true;

        const { scrollHeight, scrollTop, clientHeight } = container;
        return scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD;
    }, []);

    /**
     * 媒体加载完成回调
     * 在初始加载阶段或用户在底部附近时，自动滚动到底部
     */
    const handleMediaLoaded = useCallback(() => {
        // 加载更多时不处理
        if (isLoadingMoreRef.current) return;

        // 初始加载阶段，每次媒体加载完成都滚到底部
        if (!initialScrollDoneRef.current) {
            scrollToBottom('instant');
            return;
        }

        // 已完成初始加载，仅在底部附近时跟随
        if (isNearBottom()) {
            scrollToBottom('smooth');
        }
    }, [scrollToBottom, isNearBottom]);

    /**
     * 切换分镜/场景时：重置状态并滚动到底部
     */
    useLayoutEffect(() => {
        const contextKey = `${shotId ?? 'none'}:${sceneId ?? 'none'}`;

        if (scrollContextRef.current !== contextKey) {
            scrollContextRef.current = contextKey;
            initialScrollDoneRef.current = false;

            // 立即滚动到底部（使用 queueMicrotask 确保 DOM 已更新）
            queueMicrotask(() => {
                scrollToBottom('instant');
            });
        }
    }, [shotId, sceneId, scrollToBottom]);

    /**
     * 消息变化时：新消息到达时智能滚动
     */
    useLayoutEffect(() => {
        // 跳过加载更多场景
        if (isLoadingMoreRef.current) return;

        // 初始加载阶段，始终滚动到底部
        if (!initialScrollDoneRef.current) {
            scrollToBottom('instant');
            return;
        }

        // 已初始化完成，仅在底部附近时自动跟随
        if (isNearBottom()) {
            requestAnimationFrame(() => {
                scrollToBottom('smooth');
            });
        }
    }, [messages, scrollToBottom, isNearBottom]);

    /**
     * 首次加载完成后的稳定滚动
     * 使用轮询检测 scrollHeight 稳定后标记完成
     */
    useEffect(() => {
        // 已完成或正在加载则跳过
        if (initialScrollDoneRef.current || isLoading || messages.length === 0) {
            return;
        }

        let lastHeight = 0;
        let stableCount = 0;
        let attempts = 0;

        // 先立即滚动一次
        scrollToBottom('instant');

        const checkInterval = setInterval(() => {
            const container = containerRef.current;
            if (!container) {
                clearInterval(checkInterval);
                return;
            }

            const currentHeight = container.scrollHeight;

            // 每次都滚动到底部，确保跟随内容变化
            scrollToBottom('instant');

            if (currentHeight === lastHeight) {
                stableCount++;
            } else {
                stableCount = 0;
                lastHeight = currentHeight;
            }

            attempts++;

            // 高度稳定 4 次（约 320ms）或达到最大尝试次数
            if (stableCount >= 4 || attempts >= MAX_SCROLL_ATTEMPTS) {
                clearInterval(checkInterval);
                initialScrollDoneRef.current = true;
            }
        }, SCROLL_CHECK_INTERVAL);

        return () => clearInterval(checkInterval);
    }, [isLoading, messages.length, scrollToBottom]);

    /**
     * 加载更多：保存滚动位置
     */
    const beforeLoadMore = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        isLoadingMoreRef.current = true;
        loadMoreScrollRef.current = {
            prevHeight: container.scrollHeight,
            prevTop: container.scrollTop,
        };
    }, []);

    /**
     * 加载更多：恢复滚动位置
     */
    const afterLoadMore = useCallback(() => {
        requestAnimationFrame(() => {
            const container = containerRef.current;
            const saved = loadMoreScrollRef.current;

            if (container && saved) {
                const newHeight = container.scrollHeight;
                const heightDiff = newHeight - saved.prevHeight;
                container.scrollTop = saved.prevTop + heightDiff;
            }

            loadMoreScrollRef.current = null;
            isLoadingMoreRef.current = false;
        });
    }, []);

    return {
        containerRef,
        endRef,
        handleMediaLoaded,
        beforeLoadMore,
        afterLoadMore,
        scrollToBottom,
    };
}
