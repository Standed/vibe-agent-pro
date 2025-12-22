import { useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { addCandidateName, applyCharacterDesigns } from '@/utils/characterDesignUtils';

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
    const { project, addScene, addShot, updateCharacter, addCharacter } = useProjectStore();
    const [isGenerating, setIsGenerating] = useState(false);

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

    const handleAIStoryboard = async () => {
        if (!project?.script || !project.script.trim()) {
            toast.error('请先输入剧本内容');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('AI 分镜生成中...', {
            description: '第 1/5 步：正在分析剧本...',
        });

        try {
            // 1. Analyze script
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: '第 1/5 步：正在分析剧本（提取角色、场景、画风）...',
            });
            const analysis = await apiCall('analyzeScript', { script: project.script });

            // 2. Generate shots
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: '第 2/5 步：正在生成分镜脚本（根据8大原则拆分镜头）...',
            });
            const generatedShots = await apiCall('generateShots', {
                script: project.script,
                artStyle: project.metadata.artStyle
            });

            // 3. Group shots
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: `第 3/5 步：正在组织场景（已生成 ${generatedShots.length} 个镜头）...`,
            });
            const sceneGroups = groupShotsIntoScenes(generatedShots);

            // 4. Add scenes/shots
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: `第 4/5 步：正在添加场景和镜头（共 ${sceneGroups.length} 个场景）...`,
            });
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

            // 5. Generate Characters
            const candidateMap = new Map<string, string>();
            project.characters.forEach((c) => addCandidateName(candidateMap, c.name));
            generatedShots.forEach((shot: any) => {
                (shot.mainCharacters || []).forEach((name: string) => addCandidateName(candidateMap, name));
            });
            (analysis?.characters || []).forEach((name: string) => addCandidateName(candidateMap, name));
            const characterCandidates = Array.from(candidateMap.values());

            if (characterCandidates.length > 0) {
                try {
                    toast.loading('AI 分镜生成中...', {
                        id: toastId,
                        description: `第 5/5 步：正在生成角色形象设计（共 ${characterCandidates.length} 个角色）...`,
                    });

                    const characterDesigns = await apiCall('generateCharacterDesigns', {
                        script: project.script,
                        characterNames: characterCandidates,
                        artStyle: project.metadata.artStyle,
                        projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
                        shots: generatedShots,
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
                        toast.loading('AI 分镜生成中...', {
                            id: toastId,
                            description: `第 5/5 步：正在补充完善角色设计（剩余 ${firstPass.missing.length} 个角色）...`,
                        });
                        try {
                            const retryDesigns = await apiCall('generateCharacterDesigns', {
                                script: project.script,
                                characterNames: firstPass.missing,
                                artStyle: project.metadata.artStyle,
                                projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
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

            toast.success('AI 分镜生成完成', {
                id: toastId,
                description: `已生成 ${sceneGroups.length} 个场景，${generatedShots.length} 个镜头`
            });

        } catch (error: any) {
            console.error('Failed to generate storyboard:', error);
            toast.error('AI 分镜生成失败', {
                id: toastId,
                description: error.message || '未知错误'
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return { isGenerating, handleAIStoryboard };
};
