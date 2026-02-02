/**
 * useChatActions
 * 
 * 聊天消息操作回调集合
 * 包括恢复状态、重用图片、应用到分镜
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { ChatPanelMessage, GenerationModel } from '@/types/project';

interface UseChatActionsProps {
    selectedShotId: string | null;
    setInputText: (text: string) => void;
    setSelectedModel: (model: GenerationModel) => void;
    setGridSize: (size: '2x2' | '3x3') => void;
    setIgnoredUrls: React.Dispatch<React.SetStateAction<Set<string>>>;
    setManualReferenceUrls: React.Dispatch<React.SetStateAction<string[]>>;
    updateShot: (shotId: string, updates: any) => void;
}

export function useChatActions({
    selectedShotId,
    setInputText,
    setSelectedModel,
    setGridSize,
    setIgnoredUrls,
    setManualReferenceUrls,
    updateShot,
}: UseChatActionsProps) {

    /**
     * 恢复消息的生成配置和提示词
     */
    const handleRestoreState = useCallback((message: ChatPanelMessage) => {
        const meta = (message as any).metadata;
        let prompt = meta?.basePrompt || meta?.prompt || message.gridData?.prompt || message.content;

        // 清理自动生成的前缀
        if (prompt && (prompt.startsWith('已生成') || prompt.startsWith('Generated'))) {
            if (!meta?.basePrompt && !meta?.prompt && !message.gridData?.prompt) prompt = '';
        }

        // 清理角色/参考图信息
        if (prompt && typeof prompt === 'string') {
            prompt = prompt.split(/【角色信息】|【参考图像】/)[0].trim();
        }

        if (prompt) setInputText(prompt);

        if (message.model) {
            setSelectedModel(message.model);
            if (message.model === 'gemini-grid' && message.gridData?.gridSize) {
                setGridSize(message.gridData.gridSize);
            }
        }
    }, [setInputText, setSelectedModel, setGridSize]);

    /**
     * 将图片添加到参考图列表
     */
    const handleReuseImage = useCallback((url: string) => {
        // 从忽略列表移除
        setIgnoredUrls(prev => {
            const next = new Set(prev);
            next.delete(url);
            return next;
        });

        // 添加到手动参考图
        setManualReferenceUrls(prev => {
            if (prev.includes(url)) return prev;
            return [...prev, url];
        });
    }, [setIgnoredUrls, setManualReferenceUrls]);

    /**
     * 将图片应用到当前分镜
     */
    const handleApplyImageToShot = useCallback(async (url: string) => {
        if (!selectedShotId) {
            toast.error("请先选择一个分镜");
            return;
        }
        updateShot(selectedShotId, { referenceImage: url, status: 'done' });
        toast.success("已应用到当前分镜");
    }, [selectedShotId, updateShot]);

    return {
        handleRestoreState,
        handleReuseImage,
        handleApplyImageToShot,
    };
}
