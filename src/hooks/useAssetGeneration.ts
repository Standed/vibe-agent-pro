import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Shot, Character, Location } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { addCandidateName, applyCharacterDesigns } from '@/utils/characterDesignUtils';

// 资产生成进度步骤类型
export interface AssetGenerationStep {
    step: number;
    totalSteps: number;
    title: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'error';
}

// 用户友好的步骤描述
const ASSET_STEP_DESCRIPTIONS = {
    1: { title: '分析分镜结构', description: '正在分析场景和镜头...' },
    2: { title: '生成场景资产', description: '正在为场景生成AI描述...' },
    3: { title: '提取角色信息', description: '正在识别剧本中的角色...' },
    4: { title: '设计角色形象', description: '正在创建角色设定...' },
};

/**
 * 资产生成Hook
 * 用于从已有的分镜数据中提取并生成角色和场景资产
 */
export const useAssetGeneration = () => {
    const { project, addCharacter, updateCharacter, addLocation } = useProjectStore();
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStep, setCurrentStep] = useState<AssetGenerationStep | null>(null);

    // 更新进度步骤
    const updateStep = useCallback((step: number, status: 'running' | 'completed' | 'error' = 'running', extraInfo?: string) => {
        const desc = ASSET_STEP_DESCRIPTIONS[step as keyof typeof ASSET_STEP_DESCRIPTIONS] || { title: '处理中', description: '' };
        setCurrentStep({
            step,
            totalSteps: 4,
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

    /**
     * 从镜头数据生成场景资产
     */
    const generateLocationsFromShots = useCallback(async (
        shots: Shot[],
        script: string,
        artStyle?: string
    ) => {
        if (!project) return;

        updateStep(2, 'running');

        // 提取所有唯一的场景名称
        const existingLocationNames = new Set((project.locations || []).map(l => l.name));
        const uniqueLocations = Array.from(new Set(shots.map(shot => shot.location || '').filter(Boolean)));
        const newLocationNames = uniqueLocations.filter(name => !existingLocationNames.has(name));

        if (newLocationNames.length === 0) {
            updateStep(2, 'completed', '所有场景资产已存在');
            return;
        }

        updateStep(2, 'running', `正在为 ${newLocationNames.length} 个场景生成 AI 描述...`);

        try {
            const locationDescriptions = await apiCall('generateLocationDescriptions', {
                script,
                locationNames: newLocationNames,
                artStyle
            });

            newLocationNames.forEach((locationName) => {
                const locationType = locationName.includes('室内') || locationName.includes('内部') ? 'interior' as const : 'exterior' as const;
                const aiDescription = locationDescriptions[locationName];
                const description = aiDescription || (artStyle
                    ? `${artStyle}风格的${locationType === 'interior' ? '室内' : '室外'}场景。${locationName}`
                    : `${locationType === 'interior' ? '室内' : '室外'}场景。${locationName}`);

                const newLocation: Location = {
                    id: crypto.randomUUID(),
                    name: locationName,
                    type: locationType,
                    description,
                    referenceImages: []
                };
                addLocation(newLocation);
                console.log(`[useAssetGeneration] Auto-created Location: ${locationName}`);
            });

            updateStep(2, 'completed', `已生成 ${newLocationNames.length} 个场景资产`);
            toast.success(`已生成 ${newLocationNames.length} 个场景资产`);
        } catch (error) {
            console.error('Failed to generate location descriptions', error);
            // Fallback: 简单创建场景资产
            newLocationNames.forEach((locationName) => {
                const locationType = locationName.includes('室内') || locationName.includes('内部') ? 'interior' as const : 'exterior' as const;
                const newLocation: Location = {
                    id: crypto.randomUUID(),
                    name: locationName,
                    type: locationType,
                    description: `${locationName} (AI 描述生成失败)`,
                    referenceImages: []
                };
                addLocation(newLocation);
            });
            updateStep(2, 'completed', `已创建 ${newLocationNames.length} 个场景资产 (AI描述失败)`);
            toast.warning(`已创建 ${newLocationNames.length} 个场景资产，但AI描述生成失败`);
        }
    }, [project, addLocation, updateStep]);

    /**
     * 从剧本和镜头数据生成角色资产 (使用AI分析)
     */
    const generateCharactersFromContext = useCallback(async (
        script: string,
        shots: Shot[],
        artStyle?: string
    ) => {
        if (!project) return;

        updateStep(3, 'running', '正在使用AI分析角色...');

        // 使用AI分析提取角色(类似AI分镜的方式)
        let aiAnalyzedCharacters: string[] = [];

        try {
            // 构建用于分析的文本:剧本 + 所有对白
            const dialogueText = shots
                .map(shot => shot.dialogue)
                .filter(Boolean)
                .join('\n');
            const analysisText = script ? `${script}\n\n对白:\n${dialogueText}` : `对白:\n${dialogueText}`;

            // 调用AI分析
            const analysis = await apiCall('analyzeScript', {
                script: analysisText
            });

            aiAnalyzedCharacters = analysis.characters || [];
            console.log('[useAssetGeneration] AI分析到的角色:', aiAnalyzedCharacters);
        } catch (error) {
            console.warn('[useAssetGeneration] AI角色分析失败,尝试备用方案', error);
        }

        // 从多个来源提取角色候选
        const candidateMap = new Map<string, string>();
        project.characters.forEach((c) => addCandidateName(candidateMap, c.name));

        // 1. 优先:从AI分析结果提取
        aiAnalyzedCharacters.forEach((name: string) => addCandidateName(candidateMap, name));

        // 2. 从mainCharacters字段提取
        shots.forEach((shot: any) => {
            (shot.mainCharacters || []).forEach((name: string) => addCandidateName(candidateMap, name));
        });

        // 3. 备用:从对白中正则提取角色名 (格式: "角色名: 对白内容")
        if (candidateMap.size === 0) {
            console.log('[useAssetGeneration] 使用正则备用方案提取角色');
            shots.forEach((shot) => {
                if (shot.dialogue) {
                    const matches = shot.dialogue.match(/^([^:：]+)[：:]/);
                    if (matches && matches[1]) {
                        const characterName = matches[1].trim();
                        if (characterName.length > 0 && characterName.length < 10) {
                            addCandidateName(candidateMap, characterName);
                        }
                    }
                }
            });
        }

        const characterCandidates = Array.from(candidateMap.values());

        console.log('[useAssetGeneration] 最终提取到的角色候选:', characterCandidates);

        if (characterCandidates.length === 0) {
            updateStep(3, 'completed', '分镜中未发现角色信息');
            toast.info('分镜脚本中未发现明确的角色信息，您可以手动添加角色');
            return;
        }

        updateStep(4, 'running', `正在设计 ${characterCandidates.length} 个角色形象...`);

        try {
            const characterDesigns = await apiCall('generateCharacterDesigns', {
                script,
                characterNames: characterCandidates,
                artStyle,
                projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
                shots,
                existingContext: project.characters.map(c => `${c.name}: ${c.description || ''}`).join('\n')
            });

            // 第一轮应用角色设计
            const firstPass = applyCharacterDesigns(
                characterCandidates,
                characterDesigns,
                project.characters || [],
                updateCharacter,
                addCharacter,
                artStyle
            );

            // 第二轮补充缺失的角色
            if (firstPass.missing.length > 0) {
                updateStep(4, 'running', `正在补充 ${firstPass.missing.length} 个角色设计...`);
                try {
                    const retryDesigns = await apiCall('generateCharacterDesigns', {
                        script,
                        characterNames: firstPass.missing,
                        artStyle,
                        projectSummary: `${project.metadata.title || ''} ${project.metadata.description || ''}`.trim(),
                        shots,
                    });
                    applyCharacterDesigns(
                        firstPass.missing,
                        retryDesigns,
                        project.characters || [],
                        updateCharacter,
                        addCharacter,
                        artStyle
                    );
                } catch (e) {
                    console.error('Retry character generation failed', e);
                }
            }

            updateStep(4, 'completed', `已生成 ${characterCandidates.length} 个角色资产`);
            toast.success(`已生成 ${characterCandidates.length} 个角色形象设计`);
        } catch (error) {
            console.error('Character generation failed', error);
            updateStep(4, 'error', '角色形象生成失败');
            toast.error('角色形象生成失败，您可以手动添加角色');
        }
    }, [project, addCharacter, updateCharacter, updateStep]);

    /**
     * 为导入的分镜脚本生成所有缺失的资产
     */
    const generateAssetsForImportedStoryboard = useCallback(async () => {
        if (!project || !project.shots || project.shots.length === 0) {
            toast.error('项目中没有镜头数据');
            return;
        }

        setIsGenerating(true);
        updateStep(1, 'running');

        try {
            const script = project.script || '';
            const artStyle = project.metadata.artStyle;
            const shots = project.shots;

            updateStep(1, 'completed', `发现 ${shots.length} 个镜头`);

            // 生成场景资产
            await generateLocationsFromShots(shots, script, artStyle);

            // 生成角色资产
            // ⭐ 检查是否已有角色,如果有则跳过,避免重复生成
            if (project.characters && project.characters.length > 0) {
                console.log('[useAssetGeneration] 项目已有角色,跳过生成');
                updateStep(3, 'completed', `已有 ${project.characters.length} 个角色`);
                updateStep(4, 'completed', '角色资产已存在');
            } else {
                await generateCharactersFromContext(script, shots, artStyle);
            }

            toast.success('资产生成完成！');

            // ⭐ 展开左侧边栏
            const { leftSidebarCollapsed, toggleLeftSidebar } = useProjectStore.getState();
            if (leftSidebarCollapsed) {
                toggleLeftSidebar();
            }

            // ⭐ 保持进度显示2秒,让用户看到完成状态
            await new Promise(resolve => setTimeout(resolve, 2000));

            setCurrentStep(null);
        } catch (error: any) {
            console.error('Failed to generate assets:', error);
            toast.error('资产生成失败: ' + (error.message || '未知错误'));
            updateStep(currentStep?.step || 1, 'error', error.message);
        } finally {
            setIsGenerating(false);
        }
    }, [project, generateLocationsFromShots, generateCharactersFromContext, updateStep, currentStep]);

    return {
        isGenerating,
        currentStep,
        generateAssetsForImportedStoryboard,
        generateLocationsFromShots,
        generateCharactersFromContext
    };
};
