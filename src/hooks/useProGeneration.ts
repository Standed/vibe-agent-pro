import { useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { generateMultiViewGrid, fileToBase64, editImageWithGemini, urlsToReferenceImages } from '@/services/geminiService';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { jimengService } from '@/services/jimengService';
import { storageService } from '@/lib/storageService';
import { logger } from '@/lib/logService';
import { dataService } from '@/lib/dataService';
import { validateGenerationConfig } from '@/utils/promptSecurity';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';
import { getUserCredits, getGridCost } from '@/lib/supabase/credits';
import { AspectRatio, ImageSize, GridHistoryItem, GenerationHistoryItem, Shot, BatchMode, AIModel } from '@/types/project';

interface UseProGenerationProps {
    prompt: string;
    setPrompt: (prompt: string) => void;
    gridSize: '2x2' | '3x3';
    aspectRatio: AspectRatio;
    setAspectRatio: (ratio: AspectRatio) => void;
    referenceImages: File[];
    selectedModel: AIModel;
    jimengModel: string;
    jimengVideoModel: string;
    editModel: 'seedream' | 'gemini';
    batchMode: BatchMode;
    batchScope: 'scene' | 'project';
    setShowBatchConfig: (show: boolean) => void;
    setGridResult: (result: any) => void;
    setGenerationType: (type: any) => void;
}

export const useProGeneration = ({
    prompt,
    setPrompt,
    gridSize,
    aspectRatio,
    setAspectRatio,
    referenceImages,
    selectedModel,
    jimengModel,
    jimengVideoModel,
    editModel,
    batchMode,
    batchScope,
    setShowBatchConfig,
    setGridResult,
    setGenerationType,
}: UseProGenerationProps) => {
    const { user } = useAuth();
    const {
        project,
        currentSceneId,
        selectedShotId,
        updateShot,
        addGridHistory,
        saveFavoriteSlices,
        addGenerationHistory
    } = useProjectStore();

    const [isGenerating, setIsGenerating] = useState(false);

    const shots = project?.shots || [];
    const scenes = project?.scenes || [];
    const selectedShot = shots.find((s) => s.id === selectedShotId);

    const requireAuthForAI = () => {
        if (!user) {
            toast.error('请先登录以使用 AI 功能', {
                action: {
                    label: '去登录',
                    onClick: () => {
                        window.location.href = '/auth/login';
                    },
                },
            });
            return false;
        }
        return true;
    };

    const handleGenerateSingleImage = async () => {
        if (!prompt.trim()) {
            toast.error('请输入提示词');
            return;
        }

        if (!requireAuthForAI()) return;

        // 🔒 安全验证
        const validation = validateGenerationConfig({ prompt });
        if (!validation.isValid) {
            toast.error('提示词包含不安全内容', {
                description: validation.errors.join('\n')
            });
            return;
        }

        setIsGenerating(true);
        try {
            const selectedShot = project?.shots.find(s => s.id === selectedShotId);
            const { enrichedPrompt, referenceImageUrls } = enrichPromptWithAssets(
                prompt,
                project,
                selectedShot?.description
            );

            const projectAspectRatio = project?.settings.aspectRatio || AspectRatio.WIDE;
            let finalImageUrl = '';

            if (selectedModel === 'jimeng') {
                const sessionid = localStorage.getItem('jimeng_session_id');
                if (!sessionid) {
                    toast.error('请先在设置中配置即梦 sessionid');
                    setIsGenerating(false);
                    return;
                }

                toast.info('正在通过即梦生成图片...', { description: `模型: ${jimengModel}` });
                const genResult = await jimengService.generateImage({
                    prompt: enrichedPrompt,
                    model: jimengModel,
                    aspectRatio: projectAspectRatio,
                    sessionid
                });

                const historyId = genResult.data?.aigc_data?.submit_id;
                if (!historyId) throw new Error('即梦任务提交失败');

                const pollResult = await jimengService.pollTask(historyId, sessionid);
                finalImageUrl = pollResult.url;
            } else {
                const volcanoService = new VolcanoEngineService();
                let finalReferenceImages: string[] = [];

                if (referenceImages.length > 0) {
                    finalReferenceImages = referenceImages as unknown as string[];
                } else if (referenceImageUrls && referenceImageUrls.length > 0) {
                    finalReferenceImages = referenceImageUrls;
                }

                finalImageUrl = await volcanoService.generateSingleImage(
                    enrichedPrompt,
                    projectAspectRatio,
                    finalReferenceImages
                );
            }

            if (selectedShotId) {
                updateShot(selectedShotId, {
                    referenceImage: finalImageUrl,
                    status: 'done',
                });

                // 后台上传 R2 (如果是 base64)
                if (finalImageUrl.startsWith('data:')) {
                    storageService.uploadBase64ToR2(
                        finalImageUrl,
                        `projects/${project?.id}/shots/${selectedShotId}`,
                        `gen_${Date.now()}.png`,
                        user?.id || 'anonymous'
                    ).then((r2Url) => {
                        updateShot(selectedShotId, { referenceImage: r2Url });
                        addGenerationHistory(selectedShotId, {
                            id: `gen_${Date.now()}`,
                            type: 'image',
                            timestamp: new Date(),
                            result: r2Url,
                            prompt: prompt,
                            parameters: { model: selectedModel === 'jimeng' ? jimengModel : 'SeeDream', aspectRatio: projectAspectRatio },
                            status: 'success',
                        });
                    });
                } else {
                    // 直接是 URL (即梦返回的通常是 URL)
                    addGenerationHistory(selectedShotId, {
                        id: `gen_${Date.now()}`,
                        type: 'image',
                        timestamp: new Date(),
                        result: finalImageUrl,
                        prompt: prompt,
                        parameters: { model: selectedModel === 'jimeng' ? jimengModel : 'SeeDream', aspectRatio: projectAspectRatio },
                        status: 'success',
                    });
                }
            }

            toast.success('图片生成成功！');
        } catch (error: any) {
            console.error('Generation error:', error);
            toast.error('生成失败', { description: error.message });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateGrid = async (selectedSceneId: string) => {
        console.log('[ProPanel] ========== handleGenerateGrid CALLED ==========');

        if (!requireAuthForAI()) return;

        if (!prompt.trim()) {
            toast.error('请输入提示词');
            return;
        }

        const validation = validateGenerationConfig({ prompt });
        if (!validation.isValid) {
            toast.error('提示词包含不安全内容', {
                description: validation.errors.join('\n')
            });
            return;
        }

        if (!selectedSceneId) {
            toast.warning('请先选择一个场景');
            return;
        }

        if (user) {
            const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
            const requiredCredits = getGridCost(rows, cols);
            const currentCredits = await getUserCredits();

            if (currentCredits < requiredCredits) {
                toast.error('积分不足', {
                    description: `生成 ${gridSize} Grid 需要 ${requiredCredits} 积分，当前余额：${currentCredits} 积分`,
                    duration: 5000,
                });
                return;
            }

            toast.info(`将消耗 ${requiredCredits} 积分`, {
                description: `当前余额：${currentCredits} 积分`,
            });
        }

        setIsGenerating(true);
        try {
            const targetScene = scenes.find((scene) => scene.id === selectedSceneId);

            if (!targetScene) {
                toast.error('未找到选中的场景');
                return;
            }

            const sceneShots = shots.filter((s) => s.sceneId === targetScene.id);
            const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
            const totalSlices = rows * cols;

            const sortedSceneShots = [...sceneShots].sort((a, b) => (a.order || 0) - (b.order || 0));
            const unassignedShots = sortedSceneShots.filter((shot) => !shot.referenceImage);

            if (unassignedShots.length === 0) {
                toast.warning('该场景所有镜头都已分配图片', {
                    description: '如需重新生成，请先删除镜头的现有图片'
                });
                return;
            }

            const targetShots: typeof sceneShots = [];
            for (const shot of unassignedShots) {
                if (targetShots.length >= totalSlices) break;
                targetShots.push(shot);
            }
            if (targetShots.length < totalSlices) {
                for (const shot of sortedSceneShots) {
                    if (targetShots.length >= totalSlices) break;
                    if (targetShots.find((s) => s.id === shot.id)) continue;
                    targetShots.push(shot);
                }
            }

            if (targetShots.length < totalSlices) {
                const confirmed = confirm(
                    `当前场景只有 ${targetShots.length} 个未分配镜头，但 Grid 大小为 ${gridSize}（${totalSlices} 个切片）。\n\n` +
                    `生成的 Grid 将只为这 ${targetShots.length} 个镜头提供切片，剩余切片可收藏备用。\n\n是否继续？`
                );
                if (!confirmed) {
                    return;
                }
            }

            let enhancedPrompt = '';
            if (targetScene.description) {
                enhancedPrompt += `场景：${targetScene.description}\n`;
            }
            if (project?.metadata.artStyle) {
                enhancedPrompt += `画风：${project.metadata.artStyle}\n`;
            }

            if (targetShots.length > 0) {
                enhancedPrompt += `\n分镜要求（${targetShots.length} 个镜头）：\n`;
                targetShots.forEach((shot, idx) => {
                    if (gridSize === '3x3') {
                        enhancedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}`;
                        if (shot.description) {
                            const briefDesc = shot.description.length > 50
                                ? shot.description.substring(0, 50) + '...'
                                : shot.description;
                            enhancedPrompt += ` - ${briefDesc}`;
                        }
                        enhancedPrompt += '\n';
                    } else {
                        enhancedPrompt += `${idx + 1}. ${shot.shotSize} - ${shot.cameraMovement}\n`;
                        if (shot.description) {
                            enhancedPrompt += `   ${shot.description}\n`;
                        }
                    }
                });
            }

            if (prompt.trim()) {
                enhancedPrompt += `\n额外要求：${prompt}`;
            }

            const assetCharacters = new Set<string>();
            const assetScenes = new Set<string>();
            targetShots.forEach((shot) => {
                shot.mainCharacters?.forEach((c) => assetCharacters.add(c));
                shot.mainScenes?.forEach((s) => assetScenes.add(s));
            });
            const assetNameHints = [
                assetCharacters.size ? `角色: ${Array.from(assetCharacters).join(', ')}` : '',
                assetScenes.size ? `场景: ${Array.from(assetScenes).join(', ')}` : '',
            ]
                .filter(Boolean)
                .join('\n');

            const { enrichedPrompt, referenceImageUrls, referenceImageMap, usedCharacters, usedLocations } = enrichPromptWithAssets(
                [enhancedPrompt, assetNameHints].filter(Boolean).join('\n'),
                project
            );

            const finalPrompt = enrichedPrompt;

            if (usedCharacters.length > 0 || usedLocations.length > 0) {
                const assetInfo: string[] = [];
                if (usedCharacters.length > 0) {
                    assetInfo.push(`角色: ${usedCharacters.map((c) => c.name).join(', ')}`);
                }
                if (usedLocations.length > 0) {
                    assetInfo.push(`场景: ${usedLocations.map((l) => l.name).join(', ')}`);
                }
                toast.info('正在使用参考图保持一致性', {
                    description: assetInfo.join(' | ')
                });
            }

            const refImagesFromUpload = await Promise.all(
                referenceImages.map(async (file) => {
                    const base64 = await fileToBase64(file);
                    return {
                        mimeType: file.type,
                        data: base64,
                    };
                })
            );

            const refUrlSet = new Set<string>();
            const addUrls = (urls?: string[]) => {
                if (urls && urls.length > 0) {
                    refUrlSet.add(urls[0]);
                }
            };

            targetShots.forEach((shot) => {
                shot.mainCharacters?.forEach((name) => {
                    const c = project?.characters.find((ch) => ch.name === name);
                    addUrls(c?.referenceImages);
                });
                shot.mainScenes?.forEach((name) => {
                    const l = project?.locations.find((loc) => loc.name === name);
                    addUrls(l?.referenceImages);
                });
            });

            referenceImageUrls.forEach((url) => refUrlSet.add(url));

            const orderedAssetUrls = referenceImageMap.map((ref) => ref.imageUrl);
            const extraUrls = Array.from(refUrlSet).filter((url) => !orderedAssetUrls.includes(url));
            const MAX_ASSET_URLS = 10;
            const finalAssetUrls = [...orderedAssetUrls, ...extraUrls].slice(0, MAX_ASSET_URLS);
            const refImagesFromAssets = await urlsToReferenceImages(finalAssetUrls);

            const refImages = [...refImagesFromAssets, ...refImagesFromUpload];

            const refCaptions: string[] = [];
            finalAssetUrls.forEach(url => {
                const assetRef = referenceImageMap.find(r => r.imageUrl === url);
                if (assetRef) {
                    refCaptions.push(`${assetRef.type === 'character' ? 'Character' : 'Location'}: ${assetRef.name}`);
                } else {
                    refCaptions.push('Reference Image');
                }
            });
            refImagesFromUpload.forEach(() => {
                refCaptions.push('User uploaded reference');
            });

            const result = await generateMultiViewGrid(
                finalPrompt,
                rows,
                cols,
                aspectRatio,
                ImageSize.K4,
                refImages,
                refCaptions
            );

            if (!result || !result.fullImage || !result.slices || result.slices.length === 0) {
                throw new Error('Grid 生成结果无效');
            }

            addGridHistory(targetScene.id, {
                id: `grid_${Date.now()}`,
                timestamp: new Date(),
                fullGridUrl: result.fullImage,
                slices: result.slices,
                gridSize,
                prompt: finalPrompt,
                aspectRatio,
            });

            if (user) {
                const creditsConsumed = getGridCost(rows, cols);
                await logger.logAIGeneration(
                    `grid-${rows}x${cols}`,
                    creditsConsumed,
                    true,
                    { sceneId: targetScene.id, sceneName: targetScene.name }
                );
            }

            let fullImageUrl = result.fullImage;
            let sliceUrls = result.slices;

            try {
                toast.info('正在上传图片到云存储...', { duration: 2000 });
                const { storageService } = await import('@/lib/storageService');
                const folder = `projects/${project?.id || 'temp'}/grids`;

                fullImageUrl = await storageService.uploadBase64ToR2(
                    result.fullImage,
                    folder,
                    `grid_full_${Date.now()}.png`
                );

                sliceUrls = await storageService.uploadBase64ArrayToR2(
                    result.slices,
                    folder
                );

                toast.success('图片上传成功！');
            } catch (uploadError: any) {
                console.warn('[ProPanel] ⚠️ R2 upload failed, using base64 fallback:', uploadError);
                toast.warning('图片上传失败，使用本地存储');
                fullImageUrl = result.fullImage;
                sliceUrls = result.slices;
            }

            const gridResultData = {
                fullImage: fullImageUrl,
                slices: sliceUrls,
                sceneId: targetScene.id,
                gridRows: rows,
                gridCols: cols,
            };

            setTimeout(() => {
                setGridResult(gridResultData);
            }, 0);

            if (user && project) {
                try {
                    const now = new Date();
                    await dataService.saveChatMessage({
                        id: crypto.randomUUID(),
                        userId: user.id,
                        projectId: project.id,
                        sceneId: targetScene.id,
                        scope: 'scene',
                        role: 'user',
                        content: `生成 ${gridSize} Grid: ${finalPrompt}`,
                        timestamp: now,
                        createdAt: now,
                        updatedAt: now,
                        metadata: {
                            gridData: {
                                fullImage: fullImageUrl,
                                slices: sliceUrls,
                                sceneId: targetScene.id,
                                gridRows: rows,
                                gridCols: cols,
                                gridSize,
                                aspectRatio,
                                prompt: finalPrompt,
                            },
                        },
                    });

                    await dataService.saveChatMessage({
                        id: crypto.randomUUID(),
                        userId: user.id,
                        projectId: project.id,
                        sceneId: targetScene.id,
                        scope: 'scene',
                        role: 'assistant',
                        content: `已生成 ${gridSize} Grid，共 ${sliceUrls.length} 个切片。请在预览窗口中分配到分镜。`,
                        timestamp: now,
                        createdAt: now,
                        updatedAt: now,
                        metadata: {
                            gridData: {
                                fullImage: fullImageUrl,
                                slices: sliceUrls,
                                sceneId: targetScene.id,
                                gridRows: rows,
                                gridCols: cols,
                                gridSize,
                                aspectRatio,
                                prompt: finalPrompt,
                            },
                        },
                    });
                } catch (error) {
                    console.error('[ProPanel] ⚠️ 保存聊天记录失败:', error);
                }
            }
        } catch (error: any) {
            console.error('Grid generation error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Grid 生成失败';

            if (user) {
                const [rows, cols] = gridSize === '2x2' ? [2, 2] : [3, 3];
                const creditsConsumed = getGridCost(rows, cols);
                await logger.logAIGeneration(
                    `grid-${rows}x${cols}`,
                    creditsConsumed,
                    false,
                    { error: errorMessage, sceneId: selectedSceneId }
                );
            }

            toast.error('Grid 生成失败', {
                description: `${errorMessage}\n\n请检查：\n1. Gemini API 配置是否正确\n2. 提示词是否完整\n3. API 密钥是否有效`
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGridAssignment = (gridResult: any, assignments: Record<string, string>, favoriteSlices?: string[]) => {
        if (!gridResult) return;

        Object.entries(assignments).forEach(([shotId, imageUrl]) => {
            updateShot(shotId, {
                referenceImage: imageUrl,
                fullGridUrl: gridResult.fullImage,
                status: 'done',
            });

            const historyItem: GenerationHistoryItem = {
                id: `gen_${Date.now()}_${shotId}`,
                type: 'image',
                timestamp: new Date(),
                result: imageUrl,
                prompt: prompt,
                parameters: {
                    model: 'Gemini Grid',
                    gridSize: gridSize,
                    aspectRatio: aspectRatio,
                    fullGridUrl: gridResult.fullImage,
                },
                status: 'success',
            };
            addGenerationHistory(shotId, historyItem);
        });

        const gridHistory: GridHistoryItem = {
            id: `grid_${Date.now()}`,
            timestamp: new Date(),
            fullGridUrl: gridResult.fullImage,
            slices: gridResult.slices,
            gridSize,
            prompt,
            aspectRatio,
            assignments,
        };
        addGridHistory(gridResult.sceneId, gridHistory);

        if (favoriteSlices && favoriteSlices.length > 0) {
            saveFavoriteSlices(gridResult.sceneId, favoriteSlices);
        }

        const assignedCount = Object.keys(assignments).length;
        const favoriteCount = favoriteSlices?.length || 0;

        let message = `已为 ${assignedCount} 个镜头分配图片`;
        if (favoriteCount > 0) {
            message += `，${favoriteCount} 个切片已收藏`;
        }

        toast.success('Grid 分配成功！', {
            description: message
        });
        setGridResult(null);
    };

    const handleSelectGridHistory = (historyItem: GridHistoryItem, selectedSceneId: string) => {
        const [rows, cols] = historyItem.gridSize === '2x2' ? [2, 2] : [3, 3];
        setGridResult({
            fullImage: historyItem.fullGridUrl,
            slices: historyItem.slices,
            sceneId: selectedSceneId,
            gridRows: rows,
            gridCols: cols,
        });
    };

    const handleGenerateVideo = async () => {
        if (!requireAuthForAI()) return;

        if (!prompt.trim()) {
            toast.error('请输入提示词');
            return;
        }

        const validation = validateGenerationConfig({
            prompt,
            videoPrompt: prompt
        });
        if (!validation.isValid) {
            toast.error('提示词包含不安全内容', {
                description: validation.errors.join('\n')
            });
            return;
        }

        if (!selectedShot) {
            toast.warning('请先选择一个镜头');
            return;
        }

        const hasImage = selectedShot.referenceImage || (selectedShot.gridImages && selectedShot.gridImages.length > 0);

        if (!hasImage) {
            toast.warning('请先生成图片', {
                description: '视频生成需要先有参考图片'
            });
            return;
        }

        if (user) {
            const requiredCredits = 20;
            const currentCredits = await getUserCredits();

            if (currentCredits < requiredCredits) {
                toast.error('积分不足', {
                    description: `生成视频需要 ${requiredCredits} 积分，当前余额：${currentCredits} 积分`,
                    duration: 5000,
                });
                return;
            }

            toast.info(`将消耗 ${requiredCredits} 积分`, {
                description: `当前余额：${currentCredits} 积分`,
            });
        }

        setIsGenerating(true);
        const loadingToast = toast.loading('正在提交视频生成任务，预计需要 2-3 分钟...');

        try {
            const imageUrl = selectedShot.gridImages?.[0] || selectedShot.referenceImage || '';
            const videoPrompt = prompt || selectedShot.description || '镜头运动，平稳流畅';
            let videoUrl = '';

            if (selectedModel === 'jimeng') {
                const sessionid = localStorage.getItem('jimeng_session_id');
                if (!sessionid) {
                    toast.error('请先在设置中配置即梦 sessionid');
                    setIsGenerating(false);
                    toast.dismiss(loadingToast);
                    return;
                }

                toast.info('正在通过即梦生成视频...', { description: `模型: ${jimengVideoModel}`, id: loadingToast });
                const genResult = await jimengService.generateVideo({
                    prompt: videoPrompt,
                    model: jimengVideoModel,
                    imageUrl: imageUrl,
                    sessionid
                });

                const historyId = genResult.data?.aigc_data?.submit_id;
                if (!historyId) throw new Error('即梦任务提交失败');

                const pollResult = await jimengService.pollTask(historyId, sessionid);
                videoUrl = pollResult.url;
            } else {
                const volcanoService = new VolcanoEngineService();
                const videoTask = await volcanoService.generateSceneVideo(
                    videoPrompt,
                    imageUrl
                );

                updateShot(selectedShotId!, { status: 'processing' });

                videoUrl = await volcanoService.waitForVideoCompletion(
                    videoTask.id,
                    (status) => {
                        console.log('视频生成状态:', status);
                    }
                );
            }

            updateShot(selectedShotId!, {
                videoClip: videoUrl,
                status: 'done',
            });

            const historyItem: GenerationHistoryItem = {
                id: `gen_${Date.now()}`,
                type: 'video',
                timestamp: new Date(),
                result: videoUrl,
                prompt: videoPrompt,
                parameters: {
                    model: selectedModel === 'jimeng' ? jimengVideoModel : 'VolcanoEngine I2V',
                    referenceImages: [imageUrl],
                },
                status: 'success',
            };
            addGenerationHistory(selectedShotId!, historyItem);

            if (user) {
                const creditsConsumed = 20;
                await logger.logAIGeneration(
                    'video',
                    creditsConsumed,
                    true,
                    { shotId: selectedShotId, shotSize: selectedShot.shotSize }
                );
            }

            toast.success('视频生成成功！', {
                id: loadingToast,
                description: user ? `视频已保存到镜头 | 已消耗 20 积分` : '视频已保存到镜头'
            });
        } catch (error) {
            console.error('Video generation error:', error);
            updateShot(selectedShotId!, { status: 'error' });

            const errorMessage = error instanceof Error ? error.message : '未知错误';

            if (user) {
                await logger.logAIGeneration(
                    'video',
                    20,
                    false,
                    { error: errorMessage, shotId: selectedShotId }
                );
            }

            toast.error('视频生成失败', {
                id: loadingToast,
                description: `${errorMessage}\n\n请检查：\n1. Volcano Engine API 配置是否正确\n2. 模型 endpoint_id 是否已创建\n3. API 密钥是否有效`
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerate = async (item: GenerationHistoryItem) => {
        if (!selectedShotId) return;

        setPrompt(item.prompt);

        if (item.type === 'image') {
            setGenerationType('single');
            if (item.parameters.aspectRatio) {
                setAspectRatio(item.parameters.aspectRatio as AspectRatio);
            }
            toast.info('已加载历史参数', {
                description: '请点击"生成单图"按钮重新生成'
            });
        } else if (item.type === 'video') {
            setGenerationType('video');
            toast.info('已加载历史参数', {
                description: '请点击"生成视频"按钮重新生成'
            });
        }
    };

    const handleDownload = (item: GenerationHistoryItem) => {
        const link = document.createElement('a');
        link.href = item.result;
        link.download = `${item.type}_${item.id}.${item.type === 'image' ? 'png' : 'mp4'}`;
        link.click();
    };

    const handleFavorite = (item: GenerationHistoryItem) => {
        toast.info('收藏功能即将上线！');
    };

    const handleDubbing = (item: GenerationHistoryItem) => {
        toast.info('配音功能即将上线！');
    };

    const handleApplyHistory = (item: GenerationHistoryItem) => {
        if (!selectedShotId) return;

        if (item.type === 'image') {
            updateShot(selectedShotId, {
                referenceImage: item.result,
                fullGridUrl: item.parameters.fullGridUrl as string | undefined,
                status: 'done',
            });
            toast.success('已应用此版本图片');
        } else if (item.type === 'video') {
            updateShot(selectedShotId, {
                videoClip: item.result,
                status: 'done',
            });
            toast.success('已应用此版本视频');
        }
    };

    const handleEditImage = async () => {
        if (!prompt.trim()) {
            toast.error('请输入编辑提示词');
            return;
        }

        if (!selectedShotId || !selectedShot?.referenceImage) {
            toast.error('请先选择有图片的镜头');
            return;
        }

        const validation = validateGenerationConfig({ prompt });
        if (!validation.isValid) {
            toast.error('提示词包含不安全内容', {
                description: validation.errors.join('\n')
            });
            return;
        }

        setIsGenerating(true);
        const loadingToast = toast.loading(`使用 ${editModel === 'gemini' ? 'Gemini' : 'SeeDream'} 编辑图片中...`);

        try {
            const projectAspectRatio = project?.settings.aspectRatio || AspectRatio.WIDE;
            let editedImageUrl: string;

            if (editModel === 'gemini') {
                editedImageUrl = await editImageWithGemini(
                    selectedShot.referenceImage,
                    prompt,
                    projectAspectRatio
                );
            } else {
                const volcanoService = new VolcanoEngineService();
                editedImageUrl = await volcanoService.editImage(
                    selectedShot.referenceImage,
                    prompt,
                    projectAspectRatio
                );
            }

            updateShot(selectedShotId, {
                referenceImage: editedImageUrl,
                status: 'done',
            });

            const historyItem: GenerationHistoryItem = {
                id: `gen_${Date.now()}`,
                type: 'image',
                timestamp: new Date(),
                result: editedImageUrl,
                prompt: prompt,
                parameters: {
                    model: editModel === 'gemini' ? 'Gemini Image Edit' : 'SeeDream Edit',
                    aspectRatio: projectAspectRatio,
                    originalImage: selectedShot.referenceImage,
                },
                status: 'success',
            };
            addGenerationHistory(selectedShotId, historyItem);

            toast.success('图片编辑成功！', {
                id: loadingToast,
            });
        } catch (error) {
            console.error('Image edit error:', error);
            const errorMessage = error instanceof Error ? error.message : '图片编辑失败';
            toast.error('图片编辑失败', {
                id: loadingToast,
                description: `${errorMessage}\n\n请检查：\n1. API 配置是否正确\n2. 图片格式是否支持\n3. 提示词是否有效`
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBatchGenerate = async (selectedSceneId: string) => {
        if (batchScope === 'scene' && !selectedSceneId) {
            toast.warning('请先选择一个场景');
            return;
        }

        setIsGenerating(true);

        let targetShots: Shot[] = [];

        if (batchScope === 'scene') {
            const targetScene = scenes.find(s => s.id === selectedSceneId);
            if (!targetScene) {
                toast.error('请先选择一个场景');
                setIsGenerating(false);
                return;
            }

            const unassignedShots = shots.filter(s => s.sceneId === selectedSceneId && !s.referenceImage);

            if (unassignedShots.length === 0) {
                const confirmAll = confirm('该场景所有镜头都已有图片。是否重新生成所有镜头的图片？');
                if (!confirmAll) {
                    setIsGenerating(false);
                    return;
                }
                targetShots = shots.filter(s => s.sceneId === selectedSceneId);
            } else {
                targetShots = unassignedShots;
            }
        } else {
            const unassignedShots = shots.filter(s => !s.referenceImage);

            if (unassignedShots.length === 0) {
                const confirmAll = confirm('项目中所有镜头都已有图片。是否重新生成所有镜头的图片？');
                if (!confirmAll) {
                    setIsGenerating(false);
                    return;
                }
                targetShots = shots;
            } else {
                targetShots = unassignedShots;
            }
        }

        const modeLabel = batchMode === 'grid' ? 'Grid (Gemini)' : batchMode === 'jimeng' ? '即梦 (Jimeng)' : 'SeeDream (火山引擎)';
        const scopeLabel = batchScope === 'scene' ? '当前场景' : '整个项目';
        const initialToast = toast.info(`开始批量生成 ${targetShots.length} 个镜头...`, {
            description: `${scopeLabel} | 使用 ${modeLabel} 模式`
        });

        try {
            const volcanoService = new VolcanoEngineService();
            let successCount = 0;
            let failCount = 0;
            let currentToast = initialToast;

            for (let i = 0; i < targetShots.length; i++) {
                const shot = targetShots[i];
                try {
                    toast.loading(`正在生成 [${i + 1}/${targetShots.length}] 镜头 #${shot.order}`, {
                        id: currentToast,
                        description: `预计还需 ${Math.ceil((targetShots.length - i) * 3)} 秒`
                    });

                    updateShot(shot.id, { status: 'generating' as any });

                    let shotPrompt = shot.description || 'Cinematic shot';
                    const shotScene = scenes.find(s => s.id === shot.sceneId);
                    if (shotScene?.description) shotPrompt = `Scene: ${shotScene.description}. ` + shotPrompt;
                    if (project?.metadata.artStyle) shotPrompt += `. Style: ${project.metadata.artStyle}`;

                    const assetNameHints: string[] = [];
                    if (shot.mainCharacters?.length) assetNameHints.push(`角色: ${shot.mainCharacters.join(', ')}`);
                    if (shot.mainScenes?.length) assetNameHints.push(`场景: ${shot.mainScenes.join(', ')}`);

                    const { enrichedPrompt, referenceImageUrls, referenceImageMap } = enrichPromptWithAssets(
                        [shotPrompt, assetNameHints.join(' | ')].filter(Boolean).join('\n'),
                        project,
                        shot.description
                    );
                    shotPrompt = enrichedPrompt;

                    const orderedAssetUrls = referenceImageMap.map((ref) => ref.imageUrl);
                    const extraUrls = referenceImageUrls.filter((url) => !orderedAssetUrls.includes(url));
                    const finalAssetUrls = [...orderedAssetUrls, ...extraUrls];

                    if (batchMode === 'grid') {
                        const refImages = finalAssetUrls.length > 0
                            ? await urlsToReferenceImages(finalAssetUrls)
                            : [];

                        const result = await generateMultiViewGrid(
                            shotPrompt,
                            2, 2,
                            project?.settings.aspectRatio || AspectRatio.WIDE,
                            ImageSize.K4,
                            refImages
                        );

                        updateShot(shot.id, {
                            referenceImage: result.slices[0],
                            fullGridUrl: result.fullImage,
                            gridImages: result.slices,
                            status: 'done'
                        });

                        const folder = `projects/${project?.id}/grids`;
                        Promise.all([
                            storageService.uploadBase64ToR2(result.fullImage, folder, `grid_full_${Date.now()}.png`, user?.id || 'anonymous'),
                            storageService.uploadBase64ArrayToR2(result.slices, folder, user?.id || 'anonymous')
                        ]).then(([fullGridUrl, slices]) => {
                            updateShot(shot.id, {
                                referenceImage: slices[0],
                                fullGridUrl: fullGridUrl,
                                gridImages: slices,
                                status: 'done'
                            });

                            addGenerationHistory(shot.id, {
                                id: `gen_${Date.now()}`,
                                type: 'image',
                                timestamp: new Date(),
                                result: slices[0],
                                prompt: shotPrompt,
                                parameters: {
                                    model: 'Gemini Grid',
                                    gridSize: '2x2',
                                    fullGridUrl: fullGridUrl
                                },
                                status: 'success'
                            });
                        }).catch(err => {
                            console.error('Grid background upload failed:', err);
                            addGenerationHistory(shot.id, {
                                id: `gen_${Date.now()}`,
                                type: 'image',
                                timestamp: new Date(),
                                result: result.slices[0],
                                prompt: shotPrompt,
                                parameters: {
                                    model: 'Gemini Grid (Local)',
                                    gridSize: '2x2',
                                    fullGridUrl: result.fullImage
                                },
                                status: 'success'
                            });
                        });
                    } else if (batchMode === 'jimeng') {
                        const sessionid = localStorage.getItem('jimeng_session_id');
                        if (!sessionid) throw new Error('未配置即梦 sessionid');

                        const genResult = await jimengService.generateImage({
                            prompt: shotPrompt,
                            model: jimengModel,
                            aspectRatio: project?.settings.aspectRatio || AspectRatio.WIDE,
                            sessionid
                        });

                        const historyId = genResult.data?.aigc_data?.submit_id;
                        if (!historyId) throw new Error('即梦任务提交失败');

                        const pollResult = await jimengService.pollTask(historyId, sessionid);
                        const imageUrl = pollResult.url;

                        updateShot(shot.id, {
                            referenceImage: imageUrl,
                            status: 'done'
                        });

                        addGenerationHistory(shot.id, {
                            id: `gen_${Date.now()}`,
                            type: 'image',
                            timestamp: new Date(),
                            result: imageUrl,
                            prompt: shotPrompt,
                            parameters: {
                                model: jimengModel,
                                aspectRatio: project?.settings.aspectRatio
                            },
                            status: 'success'
                        });
                    } else {
                        try {
                            const base64Url = await volcanoService.generateSingleImage(
                                shotPrompt,
                                project?.settings.aspectRatio
                            );

                            updateShot(shot.id, {
                                referenceImage: base64Url,
                                status: 'done'
                            });

                            storageService.uploadBase64ToR2(
                                base64Url,
                                `projects/${project?.id}/shots/${shot.id}`,
                                `gen_${Date.now()}.png`,
                                user?.id || 'anonymous'
                            ).then((r2Url) => {
                                updateShot(shot.id, {
                                    referenceImage: r2Url,
                                    status: 'done'
                                });

                                addGenerationHistory(shot.id, {
                                    id: `gen_${Date.now()}`,
                                    type: 'image',
                                    timestamp: new Date(),
                                    result: r2Url,
                                    prompt: shotPrompt,
                                    parameters: {
                                        model: 'SeeDream',
                                        aspectRatio: project?.settings.aspectRatio
                                    },
                                    status: 'success'
                                });
                            }).catch(err => {
                                console.error(`Shot ${shot.id} background upload failed:`, err);
                                addGenerationHistory(shot.id, {
                                    id: `gen_${Date.now()}`,
                                    type: 'image',
                                    timestamp: new Date(),
                                    result: base64Url,
                                    prompt: shotPrompt,
                                    parameters: {
                                        model: 'SeeDream (Local)',
                                        aspectRatio: project?.settings.aspectRatio
                                    },
                                    status: 'success'
                                });
                            });
                        } catch (seedreamError: any) {
                            const isModelNotOpen = seedreamError.message?.includes('ModelNotOpen') ||
                                seedreamError.message?.includes('404');

                            if (isModelNotOpen) {
                                toast.warning(`SeeDream 模型未激活，降级使用 Gemini Grid`, {
                                    description: `镜头 #${shot.order}`
                                });

                                const refImages = finalAssetUrls.length > 0
                                    ? await urlsToReferenceImages(finalAssetUrls)
                                    : [];

                                const result = await generateMultiViewGrid(
                                    shotPrompt,
                                    2, 2,
                                    project?.settings.aspectRatio || AspectRatio.WIDE,
                                    ImageSize.K4,
                                    refImages
                                );

                                updateShot(shot.id, {
                                    referenceImage: result.slices[0],
                                    fullGridUrl: result.fullImage,
                                    gridImages: result.slices,
                                    status: 'done'
                                });

                                addGenerationHistory(shot.id, {
                                    id: `gen_${Date.now()}`,
                                    type: 'image',
                                    timestamp: new Date(),
                                    result: result.slices[0],
                                    prompt: shotPrompt,
                                    parameters: {
                                        model: 'Gemini Grid (降级)',
                                        gridSize: '2x2',
                                        fullGridUrl: result.fullImage
                                    },
                                    status: 'success'
                                });
                            } else {
                                throw seedreamError;
                            }
                        }
                    }

                    successCount++;
                } catch (error: any) {
                    console.error(`Failed to generate for shot ${shot.id}:`, error);
                    const errorMsg = error.message || '生成失败';
                    toast.error(`镜头 #${shot.order} 生成失败`, {
                        description: errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg
                    });
                    updateShot(shot.id, { status: 'error' });
                    failCount++;
                }
            }

            toast.success('批量生成完成', {
                id: currentToast,
                description: `✅ 成功: ${successCount} 个 | ❌ 失败: ${failCount} 个`
            });
        } catch (e) {
            console.error(e);
            toast.error('批量生成过程中断');
        } finally {
            setIsGenerating(false);
            setShowBatchConfig(false);
        }
    };

    return {
        isGenerating,
        handleGenerateSingleImage,
        handleGenerateGrid,
        handleGridAssignment,
        handleSelectGridHistory,
        handleGenerateVideo,
        handleRegenerate,
        handleDownload,
        handleFavorite,
        handleDubbing,
        handleApplyHistory,
        handleEditImage,
        handleBatchGenerate,
    };
};
