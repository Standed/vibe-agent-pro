'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Character } from '@/types/project';

export type SoraStatus = 'none' | 'pending' | 'generating' | 'registering' | 'registered' | 'failed';

export interface UseSoraCharacterOptions {
    initialCharacter?: Character | null;
    name?: string;
    description?: string;
    appearance?: string;
    referenceImages?: string[];
    userId?: string;
    /**
     * 当需要先持久化角色时调用此函数
     * 返回持久化后的角色，失败返回 null
     */
    persistCharacter?: () => Promise<Character | null>;
}

export interface UseSoraCharacterReturn {
    // 状态
    soraStatus: SoraStatus;
    soraUsername: string;
    soraReferenceVideoUrl: string;
    isSoraProcessing: boolean;
    isRefreshing: boolean;
    isWritingSoraCode: boolean;
    currentTaskId: string | undefined;
    videoDuration: number | null;
    segmentStart: string;
    segmentEnd: string;
    hasSoraCode: boolean;
    savedCharacterId: string | null;

    // 状态设置器
    setSoraUsername: (value: string) => void;
    setSoraReferenceVideoUrl: (value: string) => void;
    setSoraStatus: (value: SoraStatus) => void;
    setIsSoraProcessing: (value: boolean) => void;
    setSegmentStart: (value: string) => void;
    setSegmentEnd: (value: string) => void;
    setSavedCharacterId: (value: string | null) => void;

    // 操作方法
    handleSoraRegister: () => Promise<void>;
    handleManualRefresh: () => Promise<void>;
    handleManualSoraCodeWriteback: () => Promise<void>;
    resolveVideoDuration: (url: string) => Promise<number | null>;
    writebackSoraCode: (options: {
        characterId: string;
        username: string;
        referenceVideoUrl?: string;
        silent?: boolean;
        retries?: number;
    }) => Promise<boolean>;

    // 用于保存时的数据
    getSoraIdentityForSave: () => Character['soraIdentity'] | null;
    lastWrittenSoraUsernameRef: React.MutableRefObject<string>;

    // 额外导出（供组件内遗留代码使用）
    setCurrentTaskId: (value: string | undefined) => void;
    setIsWritingSoraCode: (value: boolean) => void;
    setIsRefreshing: (value: boolean) => void;
    setVideoDuration: (value: number | null) => void;
    pollingTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
    pollingCountRef: React.MutableRefObject<number>;
    pollingStoppedRef: React.MutableRefObject<boolean>;
    videoPreviewRef: React.MutableRefObject<HTMLVideoElement | null>;
    startPolling: (taskId: string) => void;
    stopPolling: () => void;
    pollTaskStatus: (taskId: string, showError?: boolean) => Promise<boolean>;
}

const MAX_POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 30000;

export function useSoraCharacter(options: UseSoraCharacterOptions): UseSoraCharacterReturn {
    const {
        initialCharacter,
        name = '',
        description = '',
        appearance = '',
        referenceImages = [],
        userId,
        persistCharacter,
    } = options;

    // 核心状态
    const [soraStatus, setSoraStatus] = useState<SoraStatus>(
        (initialCharacter?.soraIdentity?.status as SoraStatus) || 'none'
    );
    const [soraUsername, setSoraUsername] = useState(initialCharacter?.soraIdentity?.username || '');
    const [soraReferenceVideoUrl, setSoraReferenceVideoUrl] = useState<string>(
        initialCharacter?.soraReferenceVideoUrl || initialCharacter?.soraIdentity?.referenceVideoUrl || ''
    );
    const [isSoraProcessing, setIsSoraProcessing] = useState(
        initialCharacter?.soraIdentity?.status === 'generating' ||
        initialCharacter?.soraIdentity?.status === 'registering' ||
        false
    );
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isWritingSoraCode, setIsWritingSoraCode] = useState(false);
    const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(
        initialCharacter?.soraIdentity?.taskId
    );
    const [savedCharacterId, setSavedCharacterId] = useState<string | null>(
        initialCharacter?.id || null
    );

    // 视频片段选择
    const [videoDuration, setVideoDuration] = useState<number | null>(null);
    const [segmentStart, setSegmentStart] = useState('1');
    const [segmentEnd, setSegmentEnd] = useState('3');

    // Refs
    const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pollingCountRef = useRef(0);
    const pollingStoppedRef = useRef(false);
    const lastWrittenSoraUsernameRef = useRef(initialCharacter?.soraIdentity?.username || '');
    const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

    const hasSoraCode = soraUsername.trim().length > 0;

    // 工具函数
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const parseSeconds = (value: string): number | null => {
        if (!value) return null;
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        return num;
    };

    const resolveVideoDuration = useCallback(async (url: string): Promise<number | null> => {
        const current = videoPreviewRef.current?.duration;
        if (current && !Number.isNaN(current)) return current;

        return await new Promise<number | null>((resolve) => {
            const temp = document.createElement('video');
            temp.preload = 'metadata';
            temp.src = url;
            temp.onloadedmetadata = () => resolve(temp.duration);
            temp.onerror = () => resolve(null);
        });
    }, []);

    // 停止轮询
    const stopPolling = useCallback(() => {
        if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
        }
        pollingTimerRef.current = null;
    }, []);

    // 轮询任务状态
    const pollTaskStatus = useCallback(async (taskId: string, showError = false): Promise<boolean> => {
        try {
            const res = await fetch(`/api/sora/character/status?taskId=${taskId}`);
            if (!res.ok) {
                if (showError) {
                    const text = await res.text();
                    toast.error(`刷新失败: ${text || res.status}`);
                }
                return false;
            }

            const data = await res.json();

            if (data.status === 'completed' && data.videoUrl) {
                setSoraReferenceVideoUrl(data.videoUrl);
                const resolvedUsername = (data.username || '').trim();
                if (resolvedUsername) {
                    setSoraStatus('registered');
                    setSoraUsername(resolvedUsername);
                    setIsSoraProcessing(false);
                    stopPolling();
                    toast.success('Sora 角色参考视频生成并注册成功！');
                    return true;
                }
                setSoraStatus('registering');
                setSoraUsername('');
                setIsSoraProcessing(true);
                return false;
            }

            if (data.status === 'failed') {
                setSoraStatus('failed');
                setIsSoraProcessing(false);
                stopPolling();
                toast.error('Sora 任务失败: ' + (data.error || '未知错误'));
                return true;
            }

            if (data.status === 'registering') {
                if (data.videoUrl) setSoraReferenceVideoUrl(data.videoUrl);
                setSoraStatus('registering');
                setSoraUsername('');
                setIsSoraProcessing(true);
                return false;
            }

            return false;
        } catch (e) {
            console.error('Polling error', e);
            if (showError) toast.error('刷新失败，请稍后重试');
            return false;
        }
    }, [stopPolling]);

    // 开始轮询
    const startPolling = useCallback((taskId: string) => {
        stopPolling();
        setIsSoraProcessing(true);
        pollingCountRef.current = 0;
        pollingStoppedRef.current = false;

        void pollTaskStatus(taskId);

        pollingTimerRef.current = setInterval(async () => {
            pollingCountRef.current += 1;
            if (pollingCountRef.current > MAX_POLL_ATTEMPTS) {
                stopPolling();
                if (!pollingStoppedRef.current) {
                    pollingStoppedRef.current = true;
                    toast.info('已暂停自动刷新，可点击"刷新状态"手动更新');
                }
                setIsSoraProcessing(false);
                setSoraStatus('none');
                return;
            }

            await pollTaskStatus(taskId);
        }, POLL_INTERVAL_MS);
    }, [pollTaskStatus, stopPolling]);

    // Sora 码写回
    const writebackSoraCode = useCallback(async (writeOptions: {
        characterId: string;
        username: string;
        referenceVideoUrl?: string;
        silent?: boolean;
        retries?: number;
    }): Promise<boolean> => {
        const { characterId, username, referenceVideoUrl, silent = false, retries = 0 } = writeOptions;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                const res = await fetch('/api/sora/character/manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId,
                        username,
                        referenceVideoUrl: referenceVideoUrl || undefined
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    if (res.status === 404 && attempt < retries) {
                        await sleep(800);
                        continue;
                    }
                    throw new Error(data.error || '写回失败');
                }

                const nextUsername = data?.character?.soraIdentity?.username || username;
                const nextVideoUrl = data?.character?.soraReferenceVideoUrl || referenceVideoUrl || '';
                setSoraUsername(nextUsername);
                setSoraReferenceVideoUrl(nextVideoUrl);
                setSoraStatus('registered');
                setIsSoraProcessing(false);
                setSavedCharacterId(characterId);
                lastWrittenSoraUsernameRef.current = nextUsername;
                if (!silent) {
                    toast.success('Sora ID 已写回');
                }
                return true;
            } catch (error: any) {
                if (attempt < retries) {
                    await sleep(800);
                    continue;
                }
                if (!silent) {
                    toast.error(error.message || '写回失败');
                }
                return false;
            }
        }
        return false;
    }, []);

    // 手动 Sora 码写回
    const handleManualSoraCodeWriteback = useCallback(async () => {
        const normalized = soraUsername.trim();
        if (!normalized) {
            toast.error('请输入 Sora 角色码');
            return;
        }

        let effectiveCharacterId = savedCharacterId || initialCharacter?.id || null;
        if (!effectiveCharacterId && persistCharacter) {
            const persisted = await persistCharacter();
            if (!persisted) return;
            effectiveCharacterId = persisted.id;
        }

        if (!effectiveCharacterId) {
            toast.error('请先保存角色');
            return;
        }

        setIsWritingSoraCode(true);
        await writebackSoraCode({
            characterId: effectiveCharacterId,
            username: normalized,
            referenceVideoUrl: soraReferenceVideoUrl || undefined,
            silent: false,
            retries: 0
        });
        setIsWritingSoraCode(false);
    }, [soraUsername, savedCharacterId, initialCharacter?.id, persistCharacter, soraReferenceVideoUrl, writebackSoraCode]);

    // Sora 注册
    const handleSoraRegister = useCallback(async () => {
        let effectiveCharacterId = savedCharacterId || initialCharacter?.id || null;
        if (!effectiveCharacterId && persistCharacter) {
            const persisted = await persistCharacter();
            if (!persisted) return;
            effectiveCharacterId = persisted.id;
        }

        if (!effectiveCharacterId) {
            toast.error('请先保存角色');
            return;
        }

        if (hasSoraCode) {
            toast.success('已填写 Sora 角色码，将以此为准');
            return;
        }

        if (soraReferenceVideoUrl) {
            // Manual registration with existing video
            if (!name) {
                toast.error('请输入名称');
                return;
            }
            const startSeconds = parseSeconds(segmentStart);
            const endSeconds = parseSeconds(segmentEnd);
            if (startSeconds === null || endSeconds === null) {
                toast.error('请输入有效的时间段（秒）');
                return;
            }
            if (startSeconds < 0 || endSeconds <= startSeconds) {
                toast.error('结束时间必须大于开始时间');
                return;
            }
            const duration = await resolveVideoDuration(soraReferenceVideoUrl);
            if (duration && endSeconds > duration + 0.01) {
                toast.error(`结束时间不能超过视频时长 ${duration.toFixed(2)}s`);
                return;
            }

            const timestamps = `${startSeconds},${endSeconds}`;
            setIsSoraProcessing(true);
            try {
                const res = await fetch('/api/sora/character/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        character: {
                            id: effectiveCharacterId,
                            name,
                            description,
                            appearance,
                            referenceImages: referenceImages,
                            soraReferenceVideoUrl: soraReferenceVideoUrl,
                            metadata: { soraIdentity: { status: 'none' } }
                        },
                        timestamps,
                        mode: 'register_direct',
                        userId: userId,
                        projectId: initialCharacter?.projectId
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                setSoraUsername(data.character.soraIdentity.username);
                setSoraStatus('registered');
                toast.success('Sora ID 注册成功！');
            } catch (e: any) {
                toast.error(e.message);
            } finally {
                setIsSoraProcessing(false);
            }
            return;
        }

        if (referenceImages.length === 0) {
            toast.error('请至少上传一张参考图');
            return;
        }

        setIsSoraProcessing(true);
        setSoraStatus('generating');

        try {
            const mode = soraReferenceVideoUrl ? 'register_direct' : 'generate_and_register';

            if (mode === 'generate_and_register' && referenceImages.length === 0) {
                setIsSoraProcessing(false);
                toast.error('生成视频需要至少 1 张参考图');
                return;
            }

            const res = await fetch('/api/sora/character/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: effectiveCharacterId,
                    character: {
                        id: effectiveCharacterId,
                        name,
                        description,
                        appearance,
                        referenceImages: referenceImages.length ? referenceImages : [],
                        soraReferenceVideoUrl
                    },
                    projectId: initialCharacter?.projectId,
                    mode
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (mode === 'register_direct') {
                setSoraStatus('registered');
                setSoraUsername(data.character.soraIdentity.username);
                setIsSoraProcessing(false);
                toast.success(`注册成功: ${data.character.soraIdentity.username}`);
            } else {
                setSoraStatus('generating');
                toast.success('已开始生成参考视频并自动注册...');
                if (data.task?.id) {
                    setCurrentTaskId(data.task.id);
                    startPolling(data.task.id);
                }
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err.message);
            setIsSoraProcessing(false);
            setSoraStatus('failed');
        }
    }, [
        savedCharacterId,
        initialCharacter?.id,
        initialCharacter?.projectId,
        persistCharacter,
        hasSoraCode,
        soraReferenceVideoUrl,
        name,
        description,
        appearance,
        referenceImages,
        userId,
        segmentStart,
        segmentEnd,
        resolveVideoDuration,
        startPolling
    ]);

    // 手动刷新
    const handleManualRefresh = useCallback(async () => {
        const characterId = savedCharacterId || initialCharacter?.id;
        if (!characterId) {
            toast.error('请先保存角色再刷新');
            return;
        }

        setIsRefreshing(true);
        try {
            if (currentTaskId) {
                await pollTaskStatus(currentTaskId, true);
                return;
            }

            const res = await fetch(`/api/sora/character/latest-video?characterId=${characterId}`);
            if (!res.ok) {
                const text = await res.text();
                toast.error(`刷新失败: ${text || res.status}`);
                return;
            }
            const data = await res.json();
            if (!data?.success) {
                if (data?.reason === 'no_completed_task') {
                    toast.info('暂无已完成的参考视频');
                } else if (data?.reason === 'video_url_missing') {
                    toast.info('已完成任务但视频地址缺失');
                } else {
                    toast.info('暂无可用视频');
                }
                return;
            }
            if (data.videoUrl) {
                setSoraReferenceVideoUrl(data.videoUrl);
                setCurrentTaskId(data.taskId || undefined);
                if (data.username) {
                    setSoraUsername(data.username);
                    setSoraStatus('registered');
                    setIsSoraProcessing(false);
                } else {
                    setSoraStatus('none');
                    setIsSoraProcessing(false);
                }
                toast.success('已刷新最新视频');
            }
        } catch (error) {
            console.error('Manual refresh failed:', error);
            toast.error('刷新失败，请稍后重试');
        } finally {
            setIsRefreshing(false);
        }
    }, [savedCharacterId, initialCharacter?.id, currentTaskId, pollTaskStatus]);

    // 获取保存时的 Sora 身份数据
    const getSoraIdentityForSave = useCallback((): Character['soraIdentity'] | null => {
        const validStatuses: SoraStatus[] = ['pending', 'generating', 'registering', 'registered', 'failed'];
        const normalizedSoraUsername = soraUsername.trim();

        if (normalizedSoraUsername) {
            return {
                username: normalizedSoraUsername,
                referenceVideoUrl: soraReferenceVideoUrl || '',
                status: 'registered' as any,
                taskId: currentTaskId || initialCharacter?.soraIdentity?.taskId
            };
        } else if (validStatuses.includes(soraStatus)) {
            return {
                username: soraUsername || '',
                referenceVideoUrl: soraReferenceVideoUrl || '',
                status: soraStatus as any,
                taskId: currentTaskId || initialCharacter?.soraIdentity?.taskId
            };
        }

        return null;
    }, [soraUsername, soraReferenceVideoUrl, soraStatus, currentTaskId, initialCharacter?.soraIdentity?.taskId]);

    // 轮询 Effect
    useEffect(() => {
        const activeStates: SoraStatus[] = ['generating', 'registering', 'pending'];
        if (activeStates.includes(soraStatus) && currentTaskId) {
            startPolling(currentTaskId);
        } else {
            stopPolling();
        }
        return () => stopPolling();
    }, [soraStatus, currentTaskId, startPolling, stopPolling]);

    // 视频 URL 变化时重置片段选择
    useEffect(() => {
        if (!soraReferenceVideoUrl) {
            setVideoDuration(null);
            return;
        }
        setVideoDuration(null);
        setSegmentStart('1');
        setSegmentEnd('3');
    }, [soraReferenceVideoUrl]);

    // 同步 savedCharacterId
    useEffect(() => {
        setSavedCharacterId(initialCharacter?.id || null);
    }, [initialCharacter?.id]);

    // 同步 lastWrittenSoraUsernameRef
    useEffect(() => {
        lastWrittenSoraUsernameRef.current = initialCharacter?.soraIdentity?.username || '';
    }, [initialCharacter?.id, initialCharacter?.soraIdentity?.username]);

    return {
        // 状态
        soraStatus,
        soraUsername,
        soraReferenceVideoUrl,
        isSoraProcessing,
        isRefreshing,
        isWritingSoraCode,
        currentTaskId,
        videoDuration,
        segmentStart,
        segmentEnd,
        hasSoraCode,
        savedCharacterId,

        // 状态设置器
        setSoraUsername,
        setSoraReferenceVideoUrl,
        setSoraStatus,
        setIsSoraProcessing,
        setSegmentStart,
        setSegmentEnd,
        setSavedCharacterId,

        // 操作方法
        handleSoraRegister,
        handleManualRefresh,
        handleManualSoraCodeWriteback,
        resolveVideoDuration,
        writebackSoraCode,

        // 用于保存时的数据
        getSoraIdentityForSave,
        lastWrittenSoraUsernameRef,

        // 额外导出（供组件内遗留代码使用）
        setCurrentTaskId,
        setIsWritingSoraCode,
        setIsRefreshing,
        setVideoDuration,
        pollingTimerRef,
        pollingCountRef,
        pollingStoppedRef,
        videoPreviewRef,
        startPolling,
        stopPolling,
        pollTaskStatus,
    };
}
