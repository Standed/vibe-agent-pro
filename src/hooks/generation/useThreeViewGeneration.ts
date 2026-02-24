import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { storageService } from '@/lib/storageService';
import type { R2PathContext } from '@/lib/r2-path';
import { JimengModel } from '@/components/jimeng/JimengOptions';

interface UseThreeViewGenerationProps {
    name: string;
    description: string;
    appearance: string;
    userId?: string;
    projectId?: string;
    characterId?: string;
    setReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
    setPreviewImage: (url: string | null) => void;
    setSoraStatus: (status: any) => void;
    setSelectedRefIndex: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseThreeViewGenerationReturn {
    generationPrompt: string;
    setGenerationPrompt: (value: string) => void;
    aspectRatio: '21:9' | '16:9' | '9:16';
    setAspectRatio: (value: '21:9' | '16:9' | '9:16') => void;
    genMode: 'seedream' | 'gemini' | 'jimeng';
    setGenMode: (value: 'seedream' | 'gemini' | 'jimeng') => void;
    jimengModel: JimengModel;
    setJimengModel: (value: JimengModel) => void;
    isGenerating: boolean;
    handleGenerateThreeView: () => Promise<void>;
}

export function useThreeViewGeneration({
    name,
    description,
    appearance,
    userId,
    projectId,
    characterId,
    setReferenceImages,
    setPreviewImage,
    setSoraStatus,
    setSelectedRefIndex
}: UseThreeViewGenerationProps): UseThreeViewGenerationReturn {
    const [generationPrompt, setGenerationPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<'21:9' | '16:9' | '9:16'>('21:9');
    const [genMode, setGenMode] = useState<'seedream' | 'gemini' | 'jimeng'>('jimeng');
    const [jimengModel, setJimengModel] = useState<JimengModel>('jimeng-4.5');
    const [isGenerating, setIsGenerating] = useState(false);

    // 默认拼装提示词
    useEffect(() => {
        if (generationPrompt.trim()) return;
        const parts: string[] = [];
        if (description.trim()) parts.push(`角色描述/性格：${description}`);
        if (appearance.trim()) parts.push(`外貌特征：${appearance}`);
        parts.push('生成全身三视图以及一张面部特写。(最左边占满 1/3 的位置是超大的面部特写，右边 2/3 放正视图、侧视图、后视图)，纯白背景。');
        setGenerationPrompt(parts.join('\n'));
    }, [description, appearance, generationPrompt]);

    const handleGenerateThreeView = useCallback(async () => {
        if (!name.trim()) {
            toast.error('请先输入角色名称');
            return;
        }
        const prompt = generationPrompt.trim();
        if (!prompt) {
            toast.error('请完善三视图提示词');
            return;
        }

        setIsGenerating(true);
        try {
            const uploadContext: R2PathContext = {
                projectId,
                scope: 'characters',
                entityId: characterId || 'character',
                assetType: 'reference',
                model: genMode
            };

            if (genMode === 'seedream') {
                const volcanoService = VolcanoEngineService.getInstance();
                const imageUrl = await volcanoService.generateSingleImage(prompt, aspectRatio, [], uploadContext);
                let finalUrl = imageUrl;
                if (finalUrl.startsWith('data:')) {
                    finalUrl = await storageService.uploadBase64ToR2(finalUrl, uploadContext, `three_view_${Date.now()}.png`, userId || 'anonymous');
                }
                setReferenceImages(prev => [finalUrl, ...prev]);
                // setPreviewImage(finalUrl); // Disable auto-popup
                setSoraStatus('none');
                setSelectedRefIndex(0);
                toast.success('三视图生成成功！');
            } else if (genMode === 'jimeng') {
                const { jimengService } = await import('@/services/jimengService');
                const sessionid = localStorage.getItem('jimeng_session_id');
                if (!sessionid) throw new Error('请先在设置中配置即梦 Session ID');

                const genResult = await jimengService.generateImage({
                    prompt,
                    model: jimengModel,
                    aspectRatio,
                    sessionid,
                    uploadContext
                });

                const historyId = genResult.data?.aigc_data?.history_record_id;
                if (!historyId) throw new Error('即梦任务提交失败');

                const pollResult = await jimengService.pollTask(historyId, sessionid, 60, uploadContext);
                const imageUrl = pollResult.url || (pollResult.urls && pollResult.urls[0]);
                if (!imageUrl) throw new Error('即梦未返回图片');

                setReferenceImages(prev => [imageUrl, ...prev]);
                // setPreviewImage(imageUrl);
                setSoraStatus('none');
                setSelectedRefIndex(0);

                toast.success(`三视图生成成功并保存！`);

            } else { // gemini
                const { generateCharacterThreeView } = await import('@/services/geminiService');

                const imageUrl = await generateCharacterThreeView(prompt, 'Anime', [], aspectRatio);
                if (!imageUrl) throw new Error('Gemini 未返回图片');

                let finalUrl = imageUrl;
                if (finalUrl.startsWith('data:')) {
                    finalUrl = await storageService.uploadBase64ToR2(finalUrl, uploadContext, `three_view_${Date.now()}.png`, userId || 'anonymous');
                }

                setReferenceImages(prev => [finalUrl, ...prev]);
                // setPreviewImage(finalUrl); // Disable auto-popup
                setSoraStatus('none');
                setSelectedRefIndex(0);

                toast.success('Gemini 生成成功！');
            }

        } catch (error: any) {
            console.error('Generation failed:', error);
            toast.error(error.message || '生成失败，请重试');
        } finally {
            setIsGenerating(false);
        }
    }, [name, generationPrompt, genMode, jimengModel, aspectRatio, userId, projectId, characterId, setReferenceImages, setPreviewImage, setSoraStatus, setSelectedRefIndex]);

    return {
        generationPrompt,
        setGenerationPrompt,
        aspectRatio,
        setAspectRatio,
        genMode,
        setGenMode,
        jimengModel,
        setJimengModel,
        isGenerating,
        handleGenerateThreeView
    };
}
