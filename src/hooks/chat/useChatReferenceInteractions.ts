import { useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import { toast } from 'sonner';
import { SHOT_TO_CHAT } from '@/components/chat/dragTypes';
import { validateImageFile } from '@/utils/fileValidation';
import type { ActiveReference } from './useAutoReference';
import type { FrameImage } from './useStartEndFrames';
import type { VideoReferencesHook } from './useVideoReferences';
import type { GenerationModel } from '@/types/project';

interface UseChatReferenceInteractionsProps {
    selectedModel: GenerationModel;
    viduMode: 'img2video' | 'start-end2video' | 'reference2video';
    activeReferences: ActiveReference[];
    setDroppedReferences: React.Dispatch<React.SetStateAction<ActiveReference[]>>;
    setIgnoredUrls: React.Dispatch<React.SetStateAction<Set<string>>>;
    setIsShotRefDeleted: (deleted: boolean) => void;
    videoRefs: VideoReferencesHook;
    startEndFrames: {
        frames: { startFrame: FrameImage | null; endFrame: FrameImage | null };
        setStartFrame: (frame: FrameImage | null) => void;
        setEndFrame: (frame: FrameImage | null) => void;
    };
}

export function useChatReferenceInteractions({
    selectedModel,
    viduMode,
    activeReferences,
    setDroppedReferences,
    setIgnoredUrls,
    setIsShotRefDeleted,
    videoRefs,
    startEndFrames,
}: UseChatReferenceInteractionsProps) {
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            let files = Array.from(e.target.files);
            const MAX_IMAGES = 10;
            const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

            // Vidu 首尾帧模式：不在这里处理，由 StartEndFrameSelector 处理
            if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
                toast.info('请点击首帧或尾帧区域上传图片');
                return;
            }

            // Vidu 图生视频模式：单图替换
            if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
                const file = files[0];
                if (!file) return;

                if (!validateImageFile(file)) return;

                const hasExisting = videoRefs.viduImg2VideoRef !== null;

                videoRefs.setViduImg2Video({
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file
                });
                setIsShotRefDeleted(false);

                if (files.length > 1) {
                    toast.warning('Vidu 图生视频只支持 1 张图片，已选择第一张');
                } else if (hasExisting) {
                    toast.success('已替换参考图');
                }
                return;
            }

            // Sora 视频模式：单图替换
            if (selectedModel === 'sora-video') {
                const file = files[0];
                if (!file) return;

                if (!validateImageFile(file)) return;

                const hasExisting = videoRefs.soraRef !== null;

                videoRefs.setSora({
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file
                });

                if (files.length > 1) {
                    toast.warning('Sora 仅支持 1 张参考图，已选择第一张');
                } else if (hasExisting) {
                    toast.success('已替换参考图');
                }
                return;
            }

            // Vidu 参考生视频模式：最多 7 张，递增添加
            if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
                const MAX_REF_IMAGES = videoRefs.MAX_VIDU_REFS;
                const currentCount = videoRefs.getViduReferenceCount();
                const remaining = MAX_REF_IMAGES - currentCount;

                if (remaining <= 0) {
                    toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                    return;
                }

                const filesToAdd = files.slice(0, remaining);
                const validFiles = filesToAdd.filter(file => validateImageFile(file));

                if (validFiles.length > 0) {
                    let addedCount = 0;
                    validFiles.forEach(file => {
                        const url = URL.createObjectURL(file);
                        if (videoRefs.addViduReference({ url, source: 'manual_upload', label: file.name, file })) {
                            addedCount++;
                        }
                    });

                    if (addedCount > 0) {
                        toast.success(`已添加 ${addedCount} 张参考图 (${currentCount + addedCount}/${MAX_REF_IMAGES})`);
                    }
                }

                if (files.length > remaining) {
                    toast.warning(`已达到上限，忽略了 ${files.length - remaining} 张图片`);
                }
                return;
            }

            // 其他模式：多图上传
            // Count existing uploaded images in activeReferences
            const currentUploadedCount = activeReferences.filter(r => r.source === 'manual_upload').length;

            // 检查数量限制
            if (currentUploadedCount + files.length > MAX_IMAGES) {
                toast.error(`最多只能上传 ${MAX_IMAGES} 张参考图`);
                return;
            }

            const validFiles = files.filter(file => validateImageFile(file));

            if (validFiles.length > 0) {
                const newRefs: ActiveReference[] = validFiles.map(file => ({
                    url: URL.createObjectURL(file),
                    source: 'manual_upload',
                    label: file.name,
                    file: file
                }));
                setDroppedReferences((prev) => [...prev, ...newRefs]);
            }
        }
        e.target.value = '';
    }, [
        activeReferences,
        selectedModel,
        viduMode,
        setDroppedReferences,
        setIsShotRefDeleted,
        videoRefs
    ]);

    const extractUrlFromItem = (item: any, itemType: symbol | string) => {
        if (itemType === NativeTypes.URL) {
            const url = item?.url || (Array.isArray(item?.urls) ? item.urls[0] : undefined);
            return typeof url === 'string' ? url : null;
        }
        if (itemType === NativeTypes.TEXT) {
            const text = item?.text || '';
            const match = typeof text === 'string' ? text.match(/https?:\/\/\S+/) : null;
            return match ? match[0] : null;
        }
        return null;
    };

    const [{ isOver }, drop] = useDrop({
        accept: [SHOT_TO_CHAT, NativeTypes.FILE, NativeTypes.URL, NativeTypes.TEXT],
        drop: (item: any, monitor) => {
            if (monitor.didDrop()) return;
            const itemType = monitor.getItemType();
            const externalUrl = itemType ? extractUrlFromItem(item, itemType) : null;

            // ========== Vidu Start-End 模式特殊处理 ==========
            // 智能填充到空槽位：首帧优先，然后尾帧
            if (selectedModel === 'vidu-video' && viduMode === 'start-end2video') {
                const fillToEmptySlot = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const frame: FrameImage = { url, source, label, file };
                    const { startFrame, endFrame } = startEndFrames.frames;

                    if (!startFrame) {
                        startEndFrames.setStartFrame(frame);
                        toast.success('已设置为首帧');
                    } else if (!endFrame) {
                        startEndFrames.setEndFrame(frame);
                        toast.success('已设置为尾帧');
                    } else {
                        toast.warning('首尾帧已满，请先删除再添加');
                    }
                };

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length >= 2) {
                        // 多张图片：第一张->首帧，第二张->尾帧
                        const processFile = (file: File): FrameImage | null => {
                            if (!validateImageFile(file)) return null;
                            return {
                                url: URL.createObjectURL(file),
                                source: 'manual_upload' as const,
                                label: file.name,
                                file,
                            };
                        };
                        const frame1 = processFile(files[0]);
                        const frame2 = processFile(files[1]);
                        if (frame1) startEndFrames.setStartFrame(frame1);
                        if (frame2) startEndFrames.setEndFrame(frame2);
                        if (frame1 || frame2) {
                            toast.success('已自动设置首尾帧');
                        }
                        if (files.length > 2) {
                            toast.warning('首尾帧模式最多 2 张图片，已忽略多余图片');
                        }
                        return;
                    }
                    // 单张图片：智能填充到空槽位
                    if (files && files.length === 1) {
                        const file = files[0];
                        if (!validateImageFile(file)) return;
                        fillToEmptySlot(URL.createObjectURL(file), 'manual_upload', file.name, file);
                        return;
                    }
                }
                // Shot 拖拽：智能填充到空槽位
                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    fillToEmptySlot(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }
                if (externalUrl) {
                    fillToEmptySlot(externalUrl, 'manual_upload', '外部链接');
                    return;
                }
                return;
            }

            // ========== Vidu Img2Video 模式 - 单图替换 ==========
            if (selectedModel === 'vidu-video' && viduMode === 'img2video') {
                const processAndReplace = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const hasExisting = videoRefs.viduImg2VideoRef !== null;

                    // 使用独立状态
                    videoRefs.setViduImg2Video({ url, source, label, file });

                    if (hasExisting) {
                        toast.success('Vidu 图生视频只支持 1 张图片，已替换');
                    }
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    processAndReplace(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const file = files[0];
                        if (!validateImageFile(file)) return;
                        if (files.length > 1) {
                            toast.warning('Vidu 图生视频只支持 1 张图片，已选择第一张');
                        }
                        processAndReplace(URL.createObjectURL(file), 'manual_upload', file.name, file);
                    }
                }
                if (externalUrl) {
                    processAndReplace(externalUrl, 'manual_upload', '外部链接');
                }
                return;
            }

            // ========== Vidu Reference2Video 模式 - 最多 7 张递增 ==========
            if (selectedModel === 'vidu-video' && viduMode === 'reference2video') {
                const MAX_REF_IMAGES = videoRefs.MAX_VIDU_REFS;

                const addReference = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File): boolean => {
                    // 检查是否已存在
                    if (videoRefs.viduReferenceRefs.some(r => r.url === url)) {
                        toast.warning('该图片已添加');
                        return false;
                    }

                    if (!videoRefs.canAddViduReference()) {
                        toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                        return false;
                    }

                    videoRefs.addViduReference({ url, source, label, file });
                    return true;
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    if (addReference(item.imageUrl, 'shot_ref', '分镜参考图')) {
                        toast.success(`已添加参考图 (${videoRefs.getViduReferenceCount() + 1}/${MAX_REF_IMAGES})`);
                    }
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const currentCount = videoRefs.getViduReferenceCount();
                        const remaining = MAX_REF_IMAGES - currentCount;

                        if (remaining <= 0) {
                            toast.warning(`参考生视频最多支持 ${MAX_REF_IMAGES} 张参考图`);
                            return;
                        }

                        let addedCount = 0;
                        const filesToAdd = Array.from(files as FileList).slice(0, remaining);

                        for (const file of filesToAdd) {
                            if (!validateImageFile(file)) continue;
                            const url = URL.createObjectURL(file);
                            if (addReference(url, 'manual_upload', file.name, file)) {
                                addedCount++;
                            }
                        }

                        if (addedCount > 0) {
                            toast.success(`已添加 ${addedCount} 张参考图`);
                        }
                        if (files.length > remaining) {
                            toast.warning(`已达到上限，忽略了 ${files.length - remaining} 张图片`);
                        }
                    }
                }
                if (externalUrl) {
                    if (addReference(externalUrl, 'manual_upload', '外部链接')) {
                        toast.success(`已添加参考图 (${videoRefs.getViduReferenceCount() + 1}/${MAX_REF_IMAGES})`);
                    }
                }
                return;
            }

            // ========== Sora 视频模式 - 单图替换 ==========
            if (selectedModel === 'sora-video') {
                const processAndReplace = (url: string, source: 'shot_ref' | 'manual_upload', label: string, file?: File) => {
                    const hasExisting = videoRefs.soraRef !== null;

                    // 使用独立状态
                    videoRefs.setSora({ url, source, label, file });

                    if (hasExisting) {
                        toast.success('Sora 视频生成只支持 1 张参考图，已替换');
                    }
                };

                if (itemType === SHOT_TO_CHAT && item.imageUrl) {
                    processAndReplace(item.imageUrl, 'shot_ref', '分镜参考图');
                    return;
                }

                if (itemType === NativeTypes.FILE) {
                    const files = item.files;
                    if (files && files.length > 0) {
                        const file = files[0];
                        if (!validateImageFile(file)) return;
                        if (files.length > 1) {
                            toast.warning('Sora 仅支持 1 张参考图，已选择第一张');
                        }
                        processAndReplace(URL.createObjectURL(file), 'manual_upload', file.name, file);
                    }
                }
                if (externalUrl) {
                    processAndReplace(externalUrl, 'manual_upload', '外部链接');
                }
                return;
            }

            // ========== 默认处理 (其他模式) ==========
            // 1. Handle Shot Drop
            if (itemType === SHOT_TO_CHAT) {
                if (!item.imageUrl) return;

                // FIX: Remove from ignoredUrls if it was previously removed
                setIgnoredUrls(prev => {
                    const next = new Set(prev);
                    next.delete(item.imageUrl);
                    return next;
                });

                setDroppedReferences(prev => {
                    if (prev.some(r => r.url === item.imageUrl)) return prev;
                    return [...prev, {
                        url: item.imageUrl,
                        source: 'shot_ref',
                        label: '分镜参考图',
                        entityName: 'Shot Reference'
                    }];
                });
                return;
            }

            // 2. Handle Native File Drop
            if (itemType === NativeTypes.FILE) {
                const files = item.files;
                if (files && files.length > 0) {
                    let fileList = Array.from(files as FileList);
                    const MAX_IMAGES = 10;
                    const MAX_SIZE_PER_IMAGE = 10 * 1024 * 1024;  // 10MB per image

                    // Count existing
                    const currentUploadedCount = activeReferences.filter(r => r.source === 'manual_upload').length;

                    // 检查数量限制
                    if (currentUploadedCount + fileList.length > MAX_IMAGES) {
                        toast.error(`最多只能上传 ${MAX_IMAGES} 张参考图`);
                        return;
                    }

                    const validFiles = fileList.filter(file => validateImageFile(file));

                    if (validFiles.length > 0) {
                        const newRefs: ActiveReference[] = validFiles.map(file => ({
                            url: URL.createObjectURL(file),
                            source: 'manual_upload',
                            label: file.name,
                            file: file
                        }));
                        setDroppedReferences((prev) => [...prev, ...newRefs]);
                    }
                }
            }

            // 3. Handle External URL/Text Drop
            if (externalUrl) {
                setIgnoredUrls(prev => {
                    const next = new Set(prev);
                    next.delete(externalUrl);
                    return next;
                });
                setDroppedReferences(prev => {
                    if (prev.some(r => r.url === externalUrl)) return prev;
                    return [...prev, {
                        url: externalUrl,
                        source: 'manual_upload',
                        label: '外部链接'
                    }];
                });
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    return {
        handleFileUpload,
        drop,
        isOver,
    };
}
