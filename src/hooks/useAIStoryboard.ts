import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Project, Shot, ChatMessage } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { dataService } from '@/lib/dataService';
import { addCandidateName, applyCharacterDesigns } from '@/utils/characterDesignUtils';

// 进度步骤类型
export interface StoryboardStep {
    step: number;
    totalSteps: number;
    title: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'error';
}

// 用户友好的步骤描述
const STEP_DESCRIPTIONS = {
    1: { title: '分析剧本', description: '正在理解您的故事创意...' },
    2: { title: '生成分镜', description: '正在设计镜头语言...' },
    3: { title: '组织场景', description: '正在划分场次结构...' },
    4: { title: '构建分镜脚本', description: '正在生成完整分镜...' },
    5: { title: '设计角色形象', description: '正在创建角色设定...' },
};

// Helper for grouping shots (migrated from StoryboardService to avoid client-side instantiation)
function groupShotsIntoScenes(shots: any[]): any[] {
    const scenes: any[] = [];
    let currentScene: any = null;
    shots.forEach(shot => {
        const shotLoc = shot.location || "Unknown";
        if (!currentScene || currentScene.location !== shotLoc) {
            if (currentScene) scenes.push(currentScene);
            currentScene = {
                name: `Scene ${scenes.length + 1} - ${shotLoc}`,
                location: shotLoc,
                shotIds: []
            };
        }
        currentScene.shotIds.push(shot.id);
    });
    if (currentScene) scenes.push(currentScene);
    return scenes;
}

export const useAIStoryboard = () => {
    const { project, addScene, addShot, updateCharacter, addCharacter, addLocation } = useProjectStore();
    const { user } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStep, setCurrentStep] = useState<StoryboardStep | null>(null);

    // 更新进度步骤
    const updateStep = useCallback((step: number, status: 'running' | 'completed' | 'error' = 'running', extraInfo?: string) => {
        const desc = STEP_DESCRIPTIONS[step as keyof typeof STEP_DESCRIPTIONS] || { title: '处理中', description: '' };
        setCurrentStep({
            step,
            totalSteps: 5,
            title: desc.title,
            description: extraInfo || desc.description,
            status,
        });
    }, []);

    const apiCall = async (action: string, args: any) => {
        const res = await fetch('/api/storyboard/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...args })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server Error');
        return data;
    };

    const handleAIStoryboard = useCallback(async (scriptOverride?: string) => {
        const activeProject = project;
        const script = ((scriptOverride ?? activeProject?.script) || '').trim();
        if (!script) {
            toast.error('请先输入剧本内容');
            return;
        }

        setIsGenerating(true);

        try {
            // 1. Analyze script
            updateStep(1, 'running');
            const analysis = await apiCall('analyzeScript', { script });
            updateStep(1, 'completed');

            // 2. Generate shots
            updateStep(2, 'running');
            const generatedShots = await apiCall('generateShots', {
                script,
                artStyle: activeProject?.metadata.artStyle
            });
            updateStep(2, 'completed', `已生成 ${generatedShots.length} 个镜头`);

            // 3. Group shots
            updateStep(3, 'running');
            const sceneGroups = groupShotsIntoScenes(generatedShots);
            updateStep(3, 'completed', `已划分 ${sceneGroups.length} 个场景`);

            // 4. Auto-create missing Location assets (before adding scenes)
            const existingLocationNames = new Set((activeProject?.locations || []).map(l => l.name));
            const uniqueLocations = new Set(sceneGroups.map((g: any) => g.location));
            uniqueLocations.forEach((locationName: string) => {
                if (!existingLocationNames.has(locationName)) {
                    const newLocation = {
                        id: crypto.randomUUID(),
                        name: locationName,
                        type: locationName.includes('室内') || locationName.includes('内部') ? 'interior' as const : 'exterior' as const,
                        description: '',
                        referenceImages: []
                    };
                    addLocation(newLocation);
                    console.log(`[useAIStoryboard] Auto-created Location: ${locationName}`);
                }
            });

            // 5. Add scenes/shots
            updateStep(4, 'running');
            sceneGroups.forEach((sceneGroup: any, idx: number) => {
                const scene = {
                    id: crypto.randomUUID(),
                    name: sceneGroup.name,
                    location: sceneGroup.location,
                    description: '',
                    shotIds: [],
                    position: { x: idx * 300, y: 100 },
                    order: idx + 1,
                    status: 'draft' as const,
                    created: new Date(),
                    modified: new Date(),
                };

                addScene(scene);
                sceneGroup.shotIds.forEach((shotId: string, sIdx: number) => {
                    const shot = generatedShots.find((s: any) => s.id === shotId);
                    if (shot) {
                        addShot({
                            ...shot,
                            sceneId: scene.id,
                            status: 'draft',
                            order: sIdx + 1
                        } as any);
                    }
                });
            });
            updateStep(4, 'completed');

            // 5. Generate Characters
            const candidateMap = new Map<string, string>();
            activeProject?.characters.forEach((c) => addCandidateName(candidateMap, c.name));
            generatedShots.forEach((shot: any) => {
                (shot.mainCharacters || []).forEach((name: string) => addCandidateName(candidateMap, name));
            });
            (analysis?.characters || []).forEach((name: string) => addCandidateName(candidateMap, name));
            const characterCandidates = Array.from(candidateMap.values());

            if (characterCandidates.length > 0) {
                try {
                    updateStep(5, 'running', `正在 design ${characterCandidates.length} 个角色形象...`);

                    const characterDesigns = await apiCall('generateCharacterDesigns', {
                        script,
                        characterNames: characterCandidates,
                        artStyle: activeProject?.metadata.artStyle,
                        projectSummary: `${activeProject?.metadata.title || ''} ${activeProject?.metadata.description || ''}`.trim(),
                        shots: generatedShots,
                        // Pass existing characters' descriptions as context to avoid conflicts
                        existingContext: activeProject?.characters.map(c => `${c.name}: ${c.description || ''}`).join('\n')
                    });

                    // First pass
                    const firstPass = applyCharacterDesigns(
                        characterCandidates,
                        characterDesigns,
                        project.characters,
                        updateCharacter,
                        addCharacter,
                        project.metadata.artStyle
                    );

                    // Second pass for missing
                    if (firstPass.missing.length > 0) {
                        updateStep(5, 'running', `正在补充 ${firstPass.missing.length} 个角色设计...`);
                        try {
                            const retryDesigns = await apiCall('generateCharacterDesigns', {
                                script,
                                characterNames: firstPass.missing,
                                artStyle: activeProject?.metadata.artStyle,
                                projectSummary: `${activeProject?.metadata.title || ''} ${activeProject?.metadata.description || ''}`.trim(),
                                shots: generatedShots,
                            });
                            applyCharacterDesigns(
                                firstPass.missing,
                                retryDesigns,
                                project.characters,
                                updateCharacter,
                                addCharacter,
                                project.metadata.artStyle
                            );
                        } catch (e) {
                            console.error('Retry failed', e);
                        }
                    }

                } catch (error) {
                    console.error('Character generation failed', error);
                    toast.error('角色形象生成失败，但分镜已生成');
                }
            }
            updateStep(5, 'completed');

            toast.success('✨ AI 分镜生成完成！');
            setCurrentStep(null); // 清除进度状态

            // ⭐ 保存一条总结消息到聊天历史，记录策划过程
            if (project) {
                const summaryMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    userId: user?.id || (project as any).userId || '',
                    projectId: project.id,
                    scope: 'project',
                    role: 'assistant',
                    content: `✨ **AI 导演已完成策划！**\n\n我已根据剧本为您生成了：\n- **${sceneGroups.length}** 个场景\n- **${generatedShots.length}** 个镜头\n- **${characterCandidates.length}** 个角色形象设计\n\n您现在可以在左侧面板查看并编辑这些内容。`,
                    metadata: { channel: 'planning' },
                    timestamp: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                try {
                    await dataService.saveChatMessage(summaryMessage);
                } catch (error) {
                    console.warn('保存策划总结消息失败:', error);
                }
            }

        } catch (error: any) {
            console.error('Failed to generate storyboard:', error);
            toast.error('AI 分镜生成失败: ' + (error.message || '未知错误'));
            updateStep(currentStep?.step || 1, 'error', error.message);
        } finally {
            setIsGenerating(false);
        }
    }, [project, addScene, addShot, updateCharacter, addCharacter, updateStep, currentStep, user?.id]);

    return {
        isGenerating,
        currentStep,
        handleAIStoryboard
    };
};
