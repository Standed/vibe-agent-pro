/**
 * usePlanningAgent Hook - 策划页专用 Agent Hook
 * 
 * 提供策划页的 AI 对话功能，专注于分镜生成和优化
 */

import { useState, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import type { ChatMessage } from '@/types/project';

export interface UsePlanningAgentResult {
    isProcessing: boolean;
    sendMessage: (message: string) => Promise<string>;
    generateStoryboard: (script: string) => Promise<any>;
}

export function usePlanningAgent(): UsePlanningAgentResult {
    const { project } = useProjectStore();
    const { user } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);

    /**
     * 发送消息给 Planning Agent
     */
    const sendMessage = useCallback(async (message: string): Promise<string> => {
        if (!project || !user) {
            return '请先登录并打开项目';
        }

        setIsProcessing(true);

        try {
            // 构建上下文
            const context = {
                projectId: project.id,
                projectName: project.metadata.title,
                script: project.script,
                characters: project.characters,
                locations: project.locations,
                scenes: project.scenes?.map(s => ({
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    shotCount: project.shots?.filter(shot => shot.sceneId === s.id).length || 0
                })),
                shotCount: project.shots?.length || 0
            };

            // 调用 Planning API
            const response = await fetch('/api/ai/planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    context
                })
            });

            if (!response.ok) {
                throw new Error(`API 错误: ${response.status}`);
            }

            const data = await response.json();
            const aiResponse = data.response || '抱歉，我暂时无法回复。';

            // 保存消息到云端
            await dataService.addChatMessage({
                userId: user.id,
                projectId: project.id,
                scope: 'project',
                role: 'user',
                content: message,
                timestamp: new Date(),
            });

            await dataService.addChatMessage({
                userId: user.id,
                projectId: project.id,
                scope: 'project',
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date(),
            });

            return aiResponse;
        } catch (error: any) {
            console.error('Planning Agent error:', error);
            return `抱歉，出错了: ${error.message}`;
        } finally {
            setIsProcessing(false);
        }
    }, [project, user]);

    /**
     * 生成完整分镜（一次性）
     */
    const generateStoryboard = useCallback(async (script: string): Promise<any> => {
        if (!project) {
            throw new Error('请先打开项目');
        }

        setIsProcessing(true);

        try {
            // 调用 Storyboard API
            const response = await fetch('/api/storyboard/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateShots',
                    script,
                    artStyle: project.metadata.artStyle
                })
            });

            if (!response.ok) {
                throw new Error(`API 错误: ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('Storyboard generation error:', error);
            throw error;
        } finally {
            setIsProcessing(false);
        }
    }, [project]);

    return {
        isProcessing,
        sendMessage,
        generateStoryboard
    };
}
