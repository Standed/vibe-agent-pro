import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { VolcanoEngineService } from '@/services/volcanoEngineService';
import { storageService } from '@/lib/storageService';
import { JimengModel } from '@/components/jimeng/JimengOptions';

interface UseThreeViewGenerationProps {
    name: string;
    description: string;
    appearance: string;
    userId?: string;
    setReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
    setPreviewImage: (url: string | null) => void;
    setSoraStatus: (status: any) => void;
    setSelectedRefIndex: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseThreeViewGenerationReturn {
    generationPrompt: string;
    setGenerationPrompt: (value: string) => void;
    aspectRatio: '21:9' | '16:9';
    setAspectRatio: (value: '21:9' | '16:9') => void;
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
    setReferenceImages,
    setPreviewImage,
    setSoraStatus,
    setSelectedRefIndex
}: UseThreeViewGenerationProps): UseThreeViewGenerationReturn {
    const [generationPrompt, setGenerationPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<'21:9' | '16:9'>('21:9');
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
            let base64Url = '';
            // Use a temp folder for generated assets so they can be cleaned up if not used
            const folder = `projects/temp/characters/${userId || 'anonymous'}`;

            if (genMode === 'seedream') {
                const volcanoService = VolcanoEngineService.getInstance();
                base64Url = await volcanoService.generateSingleImage(prompt, aspectRatio);
            } else if (genMode === 'jimeng') {
                const { jimengService } = await import('@/services/jimengService');
                const sessionid = localStorage.getItem('jimeng_session_id');
                if (!sessionid) throw new Error('请先在设置中配置即梦 Session ID');

                const genResult = await jimengService.generateImage({
                    prompt,
                    model: jimengModel,
                    aspectRatio,
                    sessionid
                });

                const historyId = genResult.data?.aigc_data?.history_record_id;
                if (!historyId) throw new Error('即梦任务提交失败');

                const pollResult = await jimengService.pollTask(historyId, sessionid);
                const imageUrl = pollResult.url || (pollResult.urls && pollResult.urls[0]);
                if (!imageUrl) throw new Error('即梦未返回图片');

                const proxyResp = await fetch('/api/image-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: imageUrl }),
                });

                if (!proxyResp.ok) throw new Error('图片下载失败');
                const { data: base64Data, mimeType } = await proxyResp.json();
                base64Url = `data:${mimeType};base64,${base64Data}`;

                // Upload generated image to R2 so we hava a persistent URL
                // Convert Base64 to Blob/File
                const res = await fetch(base64Url);
                const blob = await res.blob();
                const file = new File([blob], `generated_ref_${Date.now()}.png`, { type: mimeType });

                const { url: persistentUrl } = await storageService.uploadFile(file, folder, userId || 'anonymous');

                setReferenceImages(prev => [persistentUrl, ...prev]);
                setPreviewImage(persistentUrl);
                setSoraStatus('none');
                // setSelectedRefIndex logic: if it was empty, select 0. 
                // Since we prepend, the new image is at 0.
                // We can safely set it to 0.
                setSelectedRefIndex(0);

                toast.success(`三视图生成成功并保存！`);

            } else { // gemini
                const { generateCharacterThreeView } = await import('@/services/geminiService');

                const imageUrl = await generateCharacterThreeView(prompt, 'Anime', [], aspectRatio);
                if (!imageUrl) throw new Error('Gemini 未返回图片');

                base64Url = imageUrl;

                const res = await fetch(base64Url);
                const blob = await res.blob();
                const file = new File([blob], `generated_ref_${Date.now()}.png`, { type: 'image/png' });
                const { url: persistentUrl } = await storageService.uploadFile(file, folder, userId || 'anonymous');

                setReferenceImages(prev => [persistentUrl, ...prev]);
                setPreviewImage(persistentUrl);
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
    }, [name, generationPrompt, genMode, jimengModel, aspectRatio, userId, setReferenceImages, setPreviewImage, setSoraStatus, setSelectedRefIndex]);

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
