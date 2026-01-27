import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import { ChatPanelMessage, GenerationModel, AspectRatio } from '@/types/project';
import { useSoraVideoMessages } from '@/hooks/sora/useSoraVideoMessages';
import { constructBaseShotPrompt } from '@/utils/promptConstruction';

export function useChatHistory(
    projectId: string | undefined,
    selectedShotId: string | null,
    currentSceneId: string | null,
    setInputText: (text: string) => void
) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatPanelMessage[]>([]);

    // Load video messages from sora_tasks
    const { videoMessages } = useSoraVideoMessages(projectId, selectedShotId || undefined);

    // Initial Load Logic
    useEffect(() => {
        const loadHistory = async () => {
            const pendingRequestRef = useProjectStore.getState().generationRequest;
            const project = useProjectStore.getState().project;

            if (!project || !user) {
                setMessages([]);
                return;
            }

            try {
                let filters: Parameters<typeof dataService.getChatMessages>[0];

                if (selectedShotId) {
                    filters = { projectId: project.id, scope: 'shot', shotId: selectedShotId };
                } else if (currentSceneId) {
                    filters = { projectId: project.id, scope: 'scene', sceneId: currentSceneId };
                } else {
                    filters = { projectId: project.id, scope: 'project' };
                }

                const loadedMessages = await dataService.getChatMessages(filters, user?.id);
                const filteredMessages = loadedMessages.filter(msg => msg.metadata?.channel !== 'planning');

                const converted: ChatPanelMessage[] = filteredMessages.map((msg) => ({
                    id: msg.id,
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: new Date(msg.createdAt),
                    images: msg.metadata?.images as string[] | undefined,
                    referenceImages: msg.metadata?.referenceImages as string[] | undefined,
                    model: msg.metadata?.model as GenerationModel | undefined,
                    shotId: msg.shotId,
                    sceneId: msg.sceneId,
                    gridData: msg.metadata?.gridData as ChatPanelMessage['gridData'] | undefined,
                    videoUrl: msg.metadata?.videoUrl as string | undefined,
                    metadata: {
                        ...msg.metadata,
                        prompt: msg.metadata?.prompt,
                        basePrompt: msg.metadata?.basePrompt
                    }
                }));

                // Inject Generation History if a shot is selected
                if (selectedShotId) {
                    const latestShot = await dataService.getShot(selectedShotId);
                    const currentShot = latestShot || project?.shots?.find(s => s.id === selectedShotId);
                    if (currentShot && currentShot.generationHistory && currentShot.generationHistory.length > 0) {
                        const historyMessages: ChatPanelMessage[] = currentShot.generationHistory.map(h => {
                            const params = (h.parameters || {}) as any;

                            if (h.type === 'video') {
                                const existingVideoMsg = converted.find(m =>
                                    m.videoUrl === h.result ||
                                    m.metadata?.videoUrl === h.result
                                );
                                if (existingVideoMsg) return null;

                                return {
                                    id: h.id,
                                    role: 'assistant' as const,
                                    content: 'Sora 视频生成完成',
                                    timestamp: new Date(h.timestamp),
                                    videoUrl: h.result,
                                    shotId: selectedShotId,
                                    metadata: {
                                        type: 'sora_video_complete',
                                        videoUrl: h.result,
                                        prompt: h.prompt || params.prompt || '',
                                        model: 'sora',
                                        taskId: params.taskId,
                                        source: 'generation_history'
                                    }
                                };
                            }

                            const existingMsg = converted.find(m => m.images?.includes(h.result));
                            if (existingMsg) return null;

                            const isGrid = params.model === 'gemini-grid' || params.gridSize || Array.isArray(params.slices);
                            const gridSize = params.gridSize as '2x2' | '3x3' | undefined;
                            const gridRows = params.gridRows || (gridSize === '3x3' ? 3 : gridSize === '2x2' ? 2 : (Array.isArray(params.slices) && params.slices.length === 9 ? 3 : 2));
                            const gridCols = params.gridCols || (gridSize === '3x3' ? 3 : gridSize === '2x2' ? 2 : (Array.isArray(params.slices) && params.slices.length === 9 ? 3 : 2));
                            const promptText = h.prompt || params.prompt || '';

                            const msg: ChatPanelMessage = {
                                id: h.id,
                                role: 'assistant',
                                content: promptText ? `已生成: ${promptText}` : (isGrid ? 'Agent Generated Grid' : 'Agent Generated Image'),
                                timestamp: new Date(h.timestamp),
                                images: [h.result],
                                model: (isGrid ? 'gemini-grid' : params.model) as GenerationModel,
                                shotId: selectedShotId,
                                gridData: isGrid ? {
                                    fullImage: (params.fullGridUrl as string) || h.result,
                                    slices: (params.slices as string[]) || [],
                                    gridRows,
                                    gridCols,
                                    gridSize: gridSize || (gridRows === 3 ? '3x3' : '2x2'),
                                    prompt: promptText,
                                    aspectRatio: project.settings.aspectRatio || AspectRatio.WIDE,
                                    sceneId: currentShot.sceneId
                                } : undefined,
                                metadata: {
                                    prompt: promptText,
                                    model: params.model
                                }
                            };
                            return msg;
                        }).filter((m): m is ChatPanelMessage => m !== null);

                        converted.push(...historyMessages);
                    }
                }

                converted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                setMessages(converted);

                // Set Input Text
                const currentRequest = useProjectStore.getState().generationRequest;
                if (!pendingRequestRef && !currentRequest) {
                    if (converted.length > 0) {
                        const lastUserMsg = [...converted].reverse().find(m => m.role === 'user');
                        if (lastUserMsg) {
                            const meta = (lastUserMsg as any).metadata;
                            let prompt = meta?.basePrompt || meta?.prompt || lastUserMsg.content;
                            if (prompt && typeof prompt === 'string') {
                                prompt = prompt.split(/【角色信息】|【参考图像】/)[0].trim();
                            }
                            setInputText(prompt);
                        } else {
                            // Fallback to default if no user message found
                            if (selectedShotId && project?.shots) {
                                const currentShot = project.shots.find(s => s.id === selectedShotId);
                                if (currentShot) {
                                    const promptParts = constructBaseShotPrompt(project, currentShot);
                                    const defaultPrompt = promptParts
                                        .join('\n')
                                        .split('\n')
                                        .map(part => part.trim())
                                        .filter(Boolean)
                                        .join('，');
                                    setInputText(defaultPrompt);
                                } else {
                                    setInputText('');
                                }
                            }
                        }
                    } else {
                        if (selectedShotId && project?.shots) {
                            const currentShot = project.shots.find(s => s.id === selectedShotId);
                            if (currentShot) {
                                // Default Prompt Logic (Same as Agent)
                                const promptParts = constructBaseShotPrompt(project, currentShot);
                                // Compact prompt parts same as generationTools
                                const defaultPrompt = promptParts
                                    .join('\n')
                                    .split('\n')
                                    .map(part => part.trim())
                                    .filter(Boolean)
                                    .join('，');
                                setInputText(defaultPrompt);
                            } else {
                                setInputText('');
                            }
                        } else {
                            setInputText('');
                        }
                    }
                }

            } catch (error) {
                console.error('[ChatPanel] Load history failed:', error);
                setMessages([]);
            }
        };

        loadHistory();
    }, [projectId, selectedShotId, currentSceneId, user, setInputText]);

    // Merge Video Messages
    useEffect(() => {
        if (videoMessages.length === 0) return;

        setMessages(prev => {
            const newVideoMessages = videoMessages.filter(vm => {
                const msg = vm as unknown as ChatPanelMessage;
                let isRelevant = false;
                if (selectedShotId) {
                    isRelevant = msg.shotId === selectedShotId;
                } else if (currentSceneId) {
                    isRelevant = msg.sceneId === currentSceneId;
                } else {
                    isRelevant = !msg.shotId && !msg.sceneId;
                }
                if (!isRelevant) return false;

                return !prev.some(m =>
                    m.id === vm.id ||
                    m.metadata?.taskId === vm.metadata.taskId ||
                    m.videoUrl === vm.videoUrl
                );
            }) as ChatPanelMessage[];

            if (newVideoMessages.length === 0) return prev;
            const merged = [...prev, ...newVideoMessages];
            merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            return merged;
        });
    }, [videoMessages, selectedShotId, currentSceneId]);

    // Realtime Subscription
    useEffect(() => {
        if (!projectId) return;

        const unsubscribe = dataService.subscribeToChatMessages(projectId, (msg) => {
            let isRelevant = false;
            if (selectedShotId) {
                isRelevant = msg.scope === 'shot' && msg.shotId === selectedShotId;
            } else if (currentSceneId) {
                isRelevant = msg.scope === 'scene' && msg.sceneId === currentSceneId;
            } else {
                isRelevant = msg.scope === 'project';
            }

            if (isRelevant) {
                const newMessage: ChatPanelMessage = {
                    id: msg.id,
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: new Date(msg.createdAt),
                    images: msg.metadata?.images,
                    referenceImages: msg.metadata?.referenceImages,
                    model: msg.metadata?.model as GenerationModel | undefined,
                    shotId: msg.shotId,
                    sceneId: msg.sceneId,
                    gridData: msg.metadata?.gridData,
                    videoUrl: msg.metadata?.videoUrl,
                    metadata: msg.metadata
                };

                setMessages(prev => {
                    if (prev.some(m => m.id === newMessage.id)) return prev;
                    const next = [...prev, newMessage];
                    next.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                    return next;
                });
            }
        });

        return () => {
            unsubscribe();
        };
    }, [projectId, selectedShotId, currentSceneId]);

    const deleteMessage = async (messageId: string) => {
        // 1. Optimistic Update
        setMessages(prev => prev.filter(m => m.id !== messageId));

        try {
            // 2. Try deleting from Chat Messages (DB)
            // If it's a UUID, it's likely a chat message
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId);

            if (isUuid) {
                await dataService.deleteChatMessage(messageId);
            } else {
                // 3. Fallback: Check if it's in Shot Generation History
                const project = useProjectStore.getState().project;
                if (selectedShotId && project?.shots) {
                    const shot = project.shots.find((s) => s.id === selectedShotId);
                    if (shot && shot.generationHistory) {
                        const existsInHistory = shot.generationHistory.some(h => h.id === messageId);
                        if (existsInHistory) {
                            const newHistory = shot.generationHistory.filter(h => h.id !== messageId);
                            await dataService.saveShot(shot.sceneId, { ...shot, generationHistory: newHistory });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to delete message:', error);
            // Revert on failure? Strict consistency might not be needed for quick delete
        }
    };

    return { messages, setMessages, deleteMessage };
}
