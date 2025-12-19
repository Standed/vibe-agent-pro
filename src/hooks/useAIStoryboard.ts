import { useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { analyzeScript, generateStoryboardFromScript, groupShotsIntoScenes, generateCharacterDesigns, CharacterDesign } from '@/services/storyboardService';
import { addCandidateName, applyCharacterDesigns } from '@/utils/characterDesignUtils';

export const useAIStoryboard = () => {
    const { project, addScene, addShot, updateCharacter, addCharacter } = useProjectStore();
    const [isGenerating, setIsGenerating] = useState(false);

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
            // 1. Analyze script for metadata
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: '第 1/5 步：正在分析剧本（提取角色、场景、画风）...',
            });
            const analysis = await analyzeScript(project.script);

            // 2. Generate storyboard shots with project art style
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: '第 2/5 步：正在生成分镜脚本（根据8大原则拆分镜头）...',
            });
            const generatedShots = await generateStoryboardFromScript(
                project.script,
                project.metadata.artStyle // 传入用户设置的画风
            );

            // 3. Group shots into scenes
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: `第 3/5 步：正在组织场景（已生成 ${generatedShots.length} 个镜头）...`,
            });
            const sceneGroups = await groupShotsIntoScenes(generatedShots);

            // 4. Add scenes and shots to store
            toast.loading('AI 分镜生成中...', {
                id: toastId,
                description: `第 4/5 步：正在添加场景和镜头（共 ${sceneGroups.length} 个场景）...`,
            });
            sceneGroups.forEach((sceneGroup, idx) => {
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

                // Add shots for this scene
                sceneGroup.shotIds.forEach((shotId) => {
                    const shot = generatedShots.find(s => s.id === shotId);
                    if (shot) {
                        addShot({ ...shot, sceneId: scene.id });
                    }
                });
            });

            // 5. 根据分镜/剧本收集角色名单，并单独向 Gemini 生成角色设定
            // 构建角色候选（归一化去重，优先使用已有角色名称作为主名）
            const candidateMap = new Map<string, string>();
            // 1) 已有角色（确保不会生成重复）
            project.characters.forEach((c) => addCandidateName(candidateMap, c.name));
            // 2) 分镜 main_characters
            generatedShots.forEach((shot) => {
                (shot.mainCharacters || []).forEach((name) => addCandidateName(candidateMap, name));
            });
            // 3) 剧本分析角色
            (analysis?.characters || []).forEach((name: string) => addCandidateName(candidateMap, name));
            const characterCandidates = Array.from(candidateMap.values());

            let characterDesigns: Record<string, CharacterDesign> = {};
            if (characterCandidates.length > 0) {
                try {
                    toast.loading('AI 分镜生成中...', {
                        id: toastId,
                        description: `第 5/5 步：正在生成角色形象设计（共 ${characterCandidates.length} 个角色）...`,
                    });
                    const allNames = characterCandidates;
                    characterDesigns = await generateCharacterDesigns({
                        script: project.script,
                        characterNames: allNames,
                        artStyle: project.metadata.artStyle,
                        projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
                        shots: generatedShots,
                    });

                    console.log('📋 首次角色设计生成结果:', {
                        请求角色数: allNames.length,
                        返回设计数: Object.keys(characterDesigns).length,
                        角色列表: allNames,
                        设计key: Object.keys(characterDesigns),
                    });

                    // 首次回填
                    const firstPass = applyCharacterDesigns(
                        allNames,
                        characterDesigns,
                        project.characters,
                        updateCharacter,
                        addCharacter,
                        project.metadata.artStyle
                    );
                    console.log('📝 首次回填结果:', {
                        更新数量: firstPass.updated,
                        缺失数量: firstPass.missing.length,
                        缺失角色: firstPass.missing,
                    });

                    // 针对缺失的角色进行二次尝试（可能是模型漏写或未覆盖）
                    if (firstPass.missing.length > 0) {
                        console.warn('⚠️ 检测到角色设定缺失，开始二次尝试生成:', firstPass.missing);
                        toast.loading('AI 分镜生成中...', {
                            id: toastId,
                            description: `第 5/5 步：正在补充完善角色设计（剩余 ${firstPass.missing.length} 个角色）...`,
                        });

                        try {
                            const retryDesigns = await generateCharacterDesigns({
                                script: project.script,
                                characterNames: firstPass.missing,
                                artStyle: project.metadata.artStyle,
                                projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
                                shots: generatedShots,
                            });

                            console.log('📋 二次角色设计生成结果:', {
                                请求角色数: firstPass.missing.length,
                                返回设计数: Object.keys(retryDesigns).length,
                                设计key: Object.keys(retryDesigns),
                            });

                            const secondPass = applyCharacterDesigns(
                                firstPass.missing,
                                retryDesigns,
                                project.characters,
                                updateCharacter,
                                addCharacter,
                                project.metadata.artStyle
                            );
                            console.log('📝 二次回填结果:', {
                                更新数量: secondPass.updated,
                                仍缺失数量: secondPass.missing.length,
                                仍缺失角色: secondPass.missing,
                            });

                            // 合并计数
                        } catch (retryError) {
                            console.error('❌ 二次生成角色设计失败:', retryError);
                            // 不阻断流程，仅记录
                        }
                    }
                } catch (error) {
                    console.error('Failed to generate character designs:', error);
                    toast.error('角色形象生成失败，但分镜已生成');
                }
            }

            toast.success('AI 分镜生成完成', {
                id: toastId,
                description: `已生成 ${sceneGroups.length} 个场景，${generatedShots.length} 个镜头`
            });

        } catch (error) {
            console.error('Failed to generate storyboard:', error);
            toast.error('AI 分镜生成失败', {
                id: toastId,
                description: error instanceof Error ? error.message : '未知错误'
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        isGenerating,
        handleAIStoryboard
    };
};
