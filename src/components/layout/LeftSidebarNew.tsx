'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Film,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Plus,
  Home,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Loader2,
  Download,
  Trash2,
  Edit2,
  MoreHorizontal,
  Image as ImageIcon,
  Check,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { generateStoryboardFromScript, analyzeScript, groupShotsIntoScenes, generateCharacterDesigns, CharacterDesign } from '@/services/storyboardService';
import { batchDownloadAssets } from '@/utils/batchDownload';
import AddShotDialog from '@/components/shot/AddShotDialog';
import ShotListItem from '@/components/shot/ShotListItem';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import AddLocationDialog from '@/components/asset/AddLocationDialog';
import { toast } from 'sonner';
import type { Shot, ShotSize, CameraMovement, Character, Location } from '@/types/project';
import { formatShotLabel } from '@/utils/shotOrder';

type Tab = 'script' | 'storyboard' | 'assets';

export default function LeftSidebarNew() {
  const router = useRouter();
  const { project, leftSidebarCollapsed, toggleLeftSidebar, selectedShotId, selectShot, currentSceneId, selectScene, updateScript, addScene, addShot, deleteShot, deleteScene, updateScene, addCharacter, addLocation, setControlMode, updateShot, reorderShots, updateCharacter, isSaving } = useProjectStore();
  const [activeTab, setActiveTab] = useState<Tab>('storyboard');
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAddShotDialog, setShowAddShotDialog] = useState(false);
  const [selectedSceneForNewShot, setSelectedSceneForNewShot] = useState<string>('');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string>('');
  const [showAddCharacterDialog, setShowAddCharacterDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [shotImagePreview, setShotImagePreview] = useState<string | null>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);
  const [shotInsertIndex, setShotInsertIndex] = useState<number | null>(null);
  const [charactersCollapsed, setCharactersCollapsed] = useState(false);
  const [locationsCollapsed, setLocationsCollapsed] = useState(false);
  const [shotForm, setShotForm] = useState<{
    description: string;
    narration: string;
    dialogue: string;
    shotSize: ShotSize | '';
    cameraMovement: CameraMovement | '';
    duration: number;
  }>({
    description: '',
    narration: '',
    dialogue: '',
    shotSize: '',
    cameraMovement: '',
    duration: 3,
  });

  const shotSizeOptions: ShotSize[] = ['Extreme Wide Shot', 'Wide Shot', 'Medium Shot', 'Close-Up', 'Extreme Close-Up'];
  const cameraMovementOptions: CameraMovement[] = ['Static', 'Pan Left', 'Pan Right', 'Tilt Up', 'Tilt Down', 'Dolly In', 'Dolly Out', 'Zoom In', 'Zoom Out', 'Handheld'];
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [resizing, setResizing] = useState(false);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing || !resizeState.current) return;
      const delta = e.clientX - resizeState.current.startX;
      const next = Math.min(Math.max(resizeState.current.startWidth + delta, 260), 520);
      setSidebarWidth(next);
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const startResize = (e: React.MouseEvent) => {
    setResizing(true);
    resizeState.current = { startX: e.clientX, startWidth: sidebarWidth };
  };

  const scenes = project?.scenes || [];
  const shots = project?.shots || [];
  const liveEditingShot = editingShot ? project?.shots.find((s) => s.id === editingShot.id) || editingShot : null;

  useEffect(() => {
    if (liveEditingShot?.referenceImage) {
      setSelectedHistoryImage(liveEditingShot.referenceImage);
    } else {
      setSelectedHistoryImage(null);
    }
  }, [liveEditingShot?.referenceImage, editingShot?.id]);
  const shotHistoryImages = useMemo(() => {
    if (!liveEditingShot) return [];
    const urls = new Set<string>();
    if (liveEditingShot.referenceImage) urls.add(liveEditingShot.referenceImage);
    if (liveEditingShot.gridImages?.length) {
      liveEditingShot.gridImages.forEach((u) => u && urls.add(u));
    }
    if (liveEditingShot.generationHistory?.length) {
      liveEditingShot.generationHistory.forEach((h) => {
        if (h.type === 'image' && typeof h.result === 'string') {
          urls.add(h.result);
        }
        if (h.parameters && (h.parameters as any)?.fullGridUrl) {
          urls.add((h.parameters as any).fullGridUrl);
        }
      });
    }
    return Array.from(urls);
  }, [liveEditingShot]);

  const buildCharacterTemplate = () => {
    const normalizeSegment = (text?: string) =>
      (text || '').trim().replace(/[。．\.！!？?\s]+$/u, '');
    const appendPeriod = (text: string) =>
      text && /[。．.！!？?]$/.test(text) ? text : `${text}。`;

    const style = project?.metadata.artStyle?.trim();
    const baseStyle = style ? `画风与风格定位：${style}` : '画风与风格定位：保持项目统一画风';
    const parts = [
      baseStyle,
      '性别、年龄、职业/身份：',
      '身材与整体比例：',
      '脸型与五官特征：',
      '发型与发色：',
      '服装与主要配饰：',
      '表情与气质：',
      '姿态/动作：'
    ]
      .map(normalizeSegment)
      .filter(Boolean);
    const sentence = parts.join('。');
    return appendPeriod(sentence);
  };

  const buildAppearanceFromDesign = (design?: CharacterDesign) => {
    const normalizeSegment = (text?: string) =>
      (text || '').trim().replace(/[。．\.！!？?\s]+$/u, '');
    const appendPeriod = (text: string) =>
      text && /[。．.！!？?]$/.test(text) ? text : `${text}。`;

    if (!design) return buildCharacterTemplate();
    const parts = [
      design.style,
      design.genderAgeOccupation,
      design.bodyShape,
      design.faceFeatures,
      design.hair,
      design.outfit,
      design.expressionMood,
      design.pose,
    ]
      .map(normalizeSegment)
      .filter(Boolean);
    if (parts.length === 0) return buildCharacterTemplate();
    const sentence = parts.join('。');
    return appendPeriod(sentence);
  };

  const isPlaceholderDescription = (desc?: string) => {
    if (!desc) return true;
    const trimmed = desc.trim();
    if (trimmed.length < 10) return true; // 太短,认为是占位符
    return trimmed.includes('形象设计草稿') || trimmed.includes('请按项补充具体信息') || trimmed.includes('角色定位：');
  };

  const isPlaceholderAppearance = (appearance?: string) => {
    if (!appearance) return true;
    const normalized = appearance.trim();
    if (normalized.length < 20) return true; // 太短,认为是占位符
    // 检查是否包含占位符关键词
    const hasPlaceholder = normalized.includes('保持项目统一画风') ||
      normalized.includes('画风与风格定位：') ||
      normalized.includes('性别、年龄、职业/身份：') ||
      normalized.includes('请按项补充');
    return hasPlaceholder;
  };

  // 简化：只要AI返回了设计对象就直接使用
  const isCharacterDesignComplete = (design?: CharacterDesign) => {
    if (!design) {
      console.log('❌ [角色检查] 设计对象为空');
      return false;
    }

    // 只检查是否有name，其他字段有数据就用
    const hasName = !!design.name;
    console.log(`🔍 [角色检查] "${design.name}": ${hasName ? '✅ 有效' : '❌ 无效'}`);
    return hasName;
  };

  const normalizeNameKey = (value?: string) =>
    (value || '')
      .toLowerCase()
      .replace(/[\\s"'“”、，,。()（）]/g, '')
      .trim();

  const addCandidateName = (map: Map<string, string>, name?: string) => {
    if (!name) return;
    const key = normalizeNameKey(name);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, name.trim());
    }
  };

  const applyCharacterDesigns = (
    names: string[],
    designs: Record<string, CharacterDesign> = {}
  ) => {
    let updated = 0;
    const missing: string[] = [];

    console.log(`\n📋 [回填角色设计] 开始处理 ${names.length} 个角色`);
    console.log(`📋 [回填角色设计] 收到的设计数量: ${Object.keys(designs).length}`);

    // 预构建归一化名称索引，兼容 "多萝西(Dorothy)" vs "dorothy"
    const designByKey: Record<string, CharacterDesign> = {};
    Object.entries(designs || {}).forEach(([k, v]) => {
      const key1 = normalizeNameKey(k);
      const key2 = normalizeNameKey(v?.name);
      if (key1) designByKey[key1] = v;
      if (key2) designByKey[key2] = v;
    });

    const findDesign = (name: string) => {
      const key = normalizeNameKey(name);
      return designs[name] || designByKey[key];
    };

    names.forEach((name) => {
      const design = findDesign(name);

      if (!design) {
        console.warn(`⚠️ 角色 "${name}" 没有找到对应的设计`);
        missing.push(name);
        return;
      }

      console.log(`\n🎭 [处理角色] "${name}"`);
      console.log(`  设计对象:`, design);

      // 构建appearance和description
      const appearance = buildAppearanceFromDesign(design);
      const description = design.summary || `角色 "${name}"`;

      console.log(`  生成的appearance: "${appearance.slice(0, 80)}..."`);
      console.log(`  生成的description: "${description.slice(0, 80)}..."`);

      const existing = project?.characters.find(
        (c) => normalizeNameKey(c.name) === normalizeNameKey(name)
      );

      if (existing) {
        // 直接更新，不检查是否是占位符
        updateCharacter(existing.id, {
          appearance,
          description,
        });
        updated += 1;
        console.log(`✅ 更新角色 "${name}"`);
      } else {
        // 新建角色
        addCharacter({
          id: crypto.randomUUID(),
          name,
          description,
          appearance,
          referenceImages: [],
        });
        updated += 1;
        console.log(`✅ 新建角色 "${name}"`);
      }
    });

    console.log(`\n📊 [回填完成] 更新: ${updated}, 缺失: ${missing.length}`);
    return { updated, missing };
  };

  const toggleSceneCollapse = (sceneId: string) => {
    setCollapsedScenes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sceneId)) {
        newSet.delete(sceneId);
      } else {
        newSet.add(sceneId);
      }
      return newSet;
    });
  };

  const handleShotClick = (shotId: string) => {
    selectShot(shotId);
    setControlMode('pro'); // 点击镜头直接进入 Pro 模式，配合右侧上下文
  };

  const openShotEditor = (shot: Shot) => {
    setEditingShot(shot);
    setShotForm({
      description: shot.description || '',
      narration: shot.narration || '',
      dialogue: shot.dialogue || '',
      shotSize: shot.shotSize || '',
      cameraMovement: shot.cameraMovement || '',
      duration: shot.duration || 3,
    });
  };

  const saveShotEdit = () => {
    if (!editingShot) return;
    if (!shotForm.description.trim()) {
      toast.error('分镜描述不能为空');
      return;
    }
    if (!shotForm.shotSize || !shotForm.cameraMovement) {
      toast.error('请选择镜头景别和镜头运动');
      return;
    }
    updateShot(editingShot.id, {
      description: shotForm.description.trim(),
      narration: shotForm.narration.trim(),
      dialogue: shotForm.dialogue.trim(),
      shotSize: shotForm.shotSize,
      cameraMovement: shotForm.cameraMovement,
      duration: shotForm.duration,
    });
    toast.success('分镜已更新');
    setEditingShot(null);
  };

  const handleAddShotClick = (sceneId: string, insertIndex?: number) => {
    setSelectedSceneForNewShot(sceneId);
    setShotInsertIndex(insertIndex ?? null);
    setShowAddShotDialog(true);
  };

  const handleAddShot = (shotData: any) => {
    const scene = scenes.find(s => s.id === shotData.sceneId);
    const sceneShots = shots.filter(s => s.sceneId === shotData.sceneId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const targetIndex = shotInsertIndex !== null ? shotInsertIndex : sceneShots.length;
    const order = targetIndex + 1;

    const newShot = {
      id: crypto.randomUUID(),
      ...shotData,
      order,
      status: 'draft' as const,
    };

    addShot(newShot);
    // 更新场景 shotIds 顺序并重排 order
    if (scene) {
      const newShotIds = [...sceneShots.map(s => s.id)];
      newShotIds.splice(targetIndex, 0, newShot.id);
      reorderShots(scene.id, newShotIds);
    }

    setShotInsertIndex(null);
    toast.success('镜头添加成功！', {
      description: `已添加到 ${scene?.name || ''}`
    });
  };

  const handleDeleteShot = (shotId: string, shotOrder: number, sceneName: string) => {
    const confirmed = confirm(
      `确定要删除镜头 #${shotOrder} 吗？\n\n此操作将同时删除该镜头的所有生成内容（图片、视频、历史记录等），且无法恢复。`
    );

    if (confirmed) {
      deleteShot(shotId);
      toast.success('镜头已删除', {
        description: `已从 ${sceneName} 中删除`
      });
    }
  };

  const handleDeleteScene = (sceneId: string, sceneName: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // 直接按 sceneId 统计镜头数量，避免 shotIds 不准确
    const shotCount = shots.filter(s => s.sceneId === sceneId).length;
    toast.warning(`删除场景 "${sceneName}"？`, {
      description: `该场景包含 ${shotCount} 个镜头，删除后无法恢复`,
      action: {
        label: '删除',
        onClick: () => {
          deleteScene(sceneId);
          toast.success('场景已删除', {
            description: `已删除场景 "${sceneName}" 及其所有镜头`
          });
        }
      }
    });
  };

  const handleAddScene = () => {
    const order = scenes.length + 1;
    const scene = {
      id: crypto.randomUUID(),
      name: `场景 ${order}`,
      location: '',
      description: '',
      shotIds: [],
      position: { x: order * 200, y: 100 },
      order,
      status: 'draft' as const,
      created: new Date(),
      modified: new Date(),
    };
    addScene(scene);
    selectScene(scene.id);
    toast.success('已添加新场景', { description: scene.name });
  };

  const handleStartEditScene = (sceneId: string, currentName: string) => {
    setEditingSceneId(sceneId);
    setEditingSceneName(currentName);
  };

  const handleSaveSceneName = (sceneId: string) => {
    if (!editingSceneName.trim()) {
      toast.error('场景名称不能为空');
      return;
    }

    updateScene(sceneId, { name: editingSceneName.trim() });
    setEditingSceneId(null);
    setEditingSceneName('');
    toast.success('场景名称已更新');
  };

  const handleCancelEditScene = () => {
    setEditingSceneId(null);
    setEditingSceneName('');
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
          const firstPass = applyCharacterDesigns(allNames, characterDesigns);
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

              const secondPass = applyCharacterDesigns(firstPass.missing, retryDesigns);
              console.log('📝 二次回填结果:', {
                更新数量: secondPass.updated,
                仍缺失数量: secondPass.missing.length,
                仍缺失角色: secondPass.missing,
              });

              // 合并计数
              firstPass.updated += secondPass.updated;
              firstPass.missing.splice(0, firstPass.missing.length, ...secondPass.missing);

              // 如果二次尝试后仍有缺失，提示用户
              if (secondPass.missing.length > 0) {
                toast.warning(`部分角色设计不完整`, {
                  id: toastId,
                  description: `角色 ${secondPass.missing.join('、')} 的设计信息不完整，请在"资源"标签页手动完善`,
                  duration: 5000,
                });
              }
            } catch (retryErr) {
              console.error('❌ 角色设定二次生成失败:', retryErr);
              toast.warning('角色设计补充失败', {
                description: `部分角色信息可能不完整，请在"资源"标签页手动完善`,
                duration: 3000,
              });
            }
          }
        } catch (err) {
          console.error('❌ AI 角色设定生成失败，使用占位模板：', err);
          toast.warning('角色形象设计生成失败，已使用默认模板', {
            id: toastId,
            description: '可在"资源"标签页手动完善角色设计',
            duration: 3000,
          });
        }
      }

      toast.success(`AI 分镜生成完成！`, {
        id: toastId,
        description: `已生成 ${sceneGroups.length} 个场景、${generatedShots.length} 个镜头、${characterCandidates.length} 个角色`,
        duration: 5000,
      });
      // 自动切换到分镜脚本标签页
      setActiveTab('storyboard');
    } catch (error: any) {
      console.error('AI分镜失败:', error);
      toast.error('AI分镜生成失败', {
        id: toastId,
        description: error.message || '请检查API配置或网络连接',
        duration: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchDownload = async () => {
    if (!project) {
      toast.error('没有可下载的项目');
      return;
    }

    // 检查是否有素材
    const hasAssets = project.shots.some(
      shot => shot.referenceImage || shot.gridImages?.length || shot.videoClip || shot.generationHistory?.length
    ) || project.audioAssets?.length || project.characters?.some(c => c.referenceImages?.length) || project.locations?.some(l => l.referenceImages?.length);

    if (!hasAssets) {
      toast.warning('项目中还没有任何素材', {
        description: '请先生成图片或视频'
      });
      return;
    }

    setIsDownloading(true);
    const downloadToast = toast.loading('正在打包下载...');

    try {
      const result = await batchDownloadAssets(project);
      toast.success('下载完成！', {
        id: downloadToast,
        description: `图片: ${result.imageCount} 个 | 视频: ${result.videoCount} 个 | 音频: ${result.audioCount} 个`
      });
    } catch (error) {
      console.error('批量下载失败:', error);
      toast.error('下载失败', {
        id: downloadToast,
        description: '请重试'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (leftSidebarCollapsed) {
    return (
      <div className="w-16 glass-panel flex flex-col items-center py-6 z-20">
        <button
          onClick={toggleLeftSidebar}
          className="p-3 glass-button rounded-xl group"
          title="展开侧边栏"
        >
          <ChevronRightIcon size={20} className="text-gray-500 dark:text-gray-400 group-hover:text-black dark:group-hover:text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-panel flex flex-col relative shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
        >
          <Home size={16} />
          <span>返回首页</span>
        </button>
        <button
          onClick={toggleLeftSidebar}
          className="p-1 glass-button rounded-lg"
          title="收起侧边栏"
        >
          <ChevronLeft size={16} className="text-gray-500 dark:text-gray-400" />
        </button>
      </div>
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${resizing ? 'bg-light-accent/30 dark:bg-cine-accent/30' : 'bg-transparent hover:bg-light-border dark:hover:bg-cine-border'}`}
        onMouseDown={startResize}
      />

      {/* Project Info */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg text-light-text dark:text-white truncate">
            {project?.metadata.title || '未命名项目'}
          </h2>
          {isSaving && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-light-accent/10 dark:bg-cine-accent/10 border border-light-accent/20 dark:border-cine-accent/20 animate-pulse">
              <Loader2 size={10} className="animate-spin text-light-accent dark:text-cine-accent" />
              <span className="text-[10px] font-medium text-light-accent dark:text-cine-accent">同步中</span>
            </div>
          )}
        </div>
        {project?.metadata.description && (
          <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1 line-clamp-2">
            {project.metadata.description}
          </p>
        )}
        {/* Batch Download Button */}
        <button
          onClick={handleBatchDownload}
          disabled={isDownloading}
          className="w-full mt-3 glass-button rounded-xl px-3 py-2 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDownloading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>打包下载中...</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>批量下载素材</span>
            </>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 pb-2">
        <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-xl backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('script')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'script'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <FileText size={14} />
            <span>剧本</span>
          </button>
          <button
            onClick={() => setActiveTab('storyboard')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'storyboard'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <Film size={14} />
            <span>分镜</span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-300 ${activeTab === 'assets'
              ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
          >
            <FolderOpen size={14} />
            <span>资源</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      < div className="flex-1 overflow-y-auto" >
        {activeTab === 'script' && (
          <div className="p-4 space-y-4">
            {/* Project Overview */}
            <div>
              <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                项目概要
              </h3>
              <div className="glass-card p-3 space-y-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">项目名称：</span>
                  <span className="text-gray-900 dark:text-white font-medium">{project?.metadata.title}</span>
                </div>
                {project?.settings.aspectRatio && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">画面比例：</span>
                    <span className="text-gray-900 dark:text-white font-medium">{project.settings.aspectRatio}</span>
                  </div>
                )}
                {project?.metadata.artStyle && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">画风：</span>
                    <span className="text-gray-900 dark:text-white font-medium">{project.metadata.artStyle}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Script Content */}
            <div>
              <h3 className="text-sm font-bold text-light-text dark:text-white mb-3">
                剧本文本
              </h3>
              <textarea
                value={project?.script || ''}
                onChange={(e) => updateScript(e.target.value)}
                placeholder="在此输入剧本内容..."
                className="glass-input w-full h-64 rounded-xl p-3 text-sm resize-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* AI Storyboard Button */}
            <button
              onClick={handleAIStoryboard}
              disabled={isGenerating || !project?.script?.trim()}
              className="w-full bg-black dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-[0.98] py-3 px-4 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>AI 分镜生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>AI 自动分镜</span>
                </>
              )}
            </button>
          </div>
        )
        }

        {
          activeTab === 'storyboard' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-light-text dark:text-white">
                  分镜脚本 ({shots.length} 个镜头)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddScene}
                    className="flex items-center gap-1 text-xs px-2 py-1 border border-light-border dark:border-cine-border rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
                    title="添加新场景"
                  >
                    <Plus size={12} />
                    <span>添加场景</span>
                  </button>
                  <button
                    onClick={() => setShowScriptEditor(true)}
                    className="flex items-center gap-1 text-xs px-2 py-1 glass-button rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <Edit2 size={12} />
                    <span>编辑分镜脚本</span>
                  </button>
                </div>
              </div>

              {/* Scene List */}
              <div className="space-y-3">
                {scenes.map((scene) => {
                  // 直接按 sceneId 取镜头，避免 shotIds 异常导致数量不一致，再按 order 排序
                  const sceneShots: Shot[] = shots
                    .filter(s => s.sceneId === scene.id)
                    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
                  const isCollapsed = collapsedScenes.has(scene.id);

                  return (
                    <div
                      key={scene.id}
                      className="glass-card rounded-xl overflow-hidden"
                    >
                      {/* Scene Header */}
                      <div className="flex items-center justify-between p-3 hover:bg-light-border/50 dark:hover:bg-cine-panel/50 transition-colors">
                        <button
                          onClick={() => toggleSceneCollapse(scene.id)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {isCollapsed ? (
                              <ChevronRight size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                            ) : (
                              <ChevronDown size={16} className="text-light-text-muted dark:text-cine-text-muted flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              {editingSceneId === scene.id ? (
                                <input
                                  type="text"
                                  value={editingSceneName}
                                  onChange={(e) => setEditingSceneName(e.target.value)}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') {
                                      handleSaveSceneName(scene.id);
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditScene();
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full text-sm font-bold glass-input rounded px-2 py-1"
                                  autoFocus
                                />
                              ) : (
                                <>
                                  <div className="text-sm font-bold text-light-text dark:text-white truncate">
                                    {scene.name}
                                  </div>
                                  <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                                    {sceneShots.length} 个镜头
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1">
                          {editingSceneId === scene.id ? (
                            <>
                              {/* Save Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveSceneName(scene.id);
                                }}
                                className="p-1.5 hover:bg-green-500/10 rounded transition-colors flex-shrink-0"
                                title="保存"
                              >
                                <span className="text-green-500 text-xs font-bold">✓</span>
                              </button>
                              {/* Cancel Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEditScene();
                                }}
                                className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                                title="取消"
                              >
                                <span className="text-red-500 text-xs font-bold">✕</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Edit Scene Name Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditScene(scene.id, scene.name);
                                }}
                                className="p-1.5 hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 rounded transition-colors flex-shrink-0"
                                title="编辑场景名称"
                              >
                                <Edit2 size={14} className="text-light-text-muted dark:text-cine-text-muted" />
                              </button>

                              {/* Delete Scene Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScene(scene.id, scene.name);
                                }}
                                className="p-1.5 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                                title="删除场景"
                              >
                                <Trash2 size={14} className="text-light-text-muted dark:text-cine-text-muted hover:text-red-500" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Shot List */}
                      {!isCollapsed && (
                        <div className="px-3 pb-3 space-y-2">
                          {sceneShots.length === 0 ? (
                            // 空状态：没有分镜时显示添加按钮
                            <div className="text-center py-6">
                              <p className="text-xs text-light-text-muted dark:text-cine-text-muted mb-3">
                                该场景还没有分镜
                              </p>
                              <button
                                onClick={() => handleAddShotClick(scene.id, 0)}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-light-accent/10 dark:bg-cine-accent/10 text-light-accent dark:text-cine-accent border border-light-accent/30 dark:border-cine-accent/30 rounded-lg hover:bg-light-accent/20 dark:hover:bg-cine-accent/20 transition-colors"
                              >
                                <Plus size={14} />
                                <span>添加第一个分镜</span>
                              </button>
                            </div>
                          ) : (
                            // 有分镜时正常显示列表
                            sceneShots
                              .slice()
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((shot, idx) => (
                                <div key={shot.id} className="relative group overflow-visible">
                                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddShotClick(scene.id, idx);
                                      }}
                                      className="w-6 h-6 rounded-full bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent text-xs flex items-center justify-center shadow-sm z-20"
                                      title="在此处插入镜头"
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                  <ShotListItem
                                    shot={shot}
                                    isSelected={selectedShotId === shot.id}
                                    onSelect={() => handleShotClick(shot.id)}
                                    onEdit={() => openShotEditor(shot)}
                                    onDelete={() => handleDeleteShot(shot.id, shot.order, scene.name)}
                                    label={formatShotLabel(scene.order, shot.order, shot.globalOrder)}
                                  />
                                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddShotClick(scene.id, idx + 1);
                                      }}
                                      className="w-6 h-6 rounded-full bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border text-light-text-muted dark:text-cine-text-muted hover:border-light-accent dark:hover:border-cine-accent hover:text-light-accent dark:hover:text-cine-accent text-xs flex items-center justify-center shadow-sm z-20"
                                      title="在此处插入镜头"
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {scenes.length === 0 && (
                  <div className="text-center py-12 text-light-text-muted dark:text-cine-text-muted">
                    <Film size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">还没有分镜</p>
                    <p className="text-xs mt-1">在剧本标签页使用 AI 自动分镜</p>
                  </div>
                )}
              </div>
            </div>
          )
        }

        {
          activeTab === 'assets' && (
            <div className="p-4 space-y-6">
              {/* Characters */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setCharactersCollapsed((prev) => !prev)}
                    className="flex items-center gap-2 text-sm font-bold text-light-text dark:text-white"
                  >
                    {charactersCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>角色 ({project?.characters.length || 0})</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddCharacterDialog(true)}
                      className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} />
                      <span>添加</span>
                    </button>
                  </div>
                </div>
                {!charactersCollapsed && (
                  <div className="space-y-2">
                    {project?.characters.map((character) => (
                      <div
                        key={character.id}
                        className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm text-light-text dark:text-white">
                              {character.name}
                            </div>
                            <div className="text-[11px] text-light-text-muted dark:text-cine-text-muted mt-0.5 line-clamp-2">
                              {character.description || '角色描述'}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingCharacter(character)}
                              className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                              title="编辑角色"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`确定删除角色「${character.name}」？`)) {
                                  useProjectStore.getState().deleteCharacter(character.id);
                                  toast.success('角色已删除');
                                }
                              }}
                              className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                              title="删除角色"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {/* Reference Images */}
                        {character.referenceImages && character.referenceImages.length > 0 && (
                          <div className="flex gap-1 mt-2 overflow-x-auto">
                            {character.referenceImages.map((imageUrl, idx) => (
                              <div
                                key={idx}
                                className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                              >
                                <img
                                  src={imageUrl}
                                  alt={`${character.name} 参考图 ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {(!project?.characters || project.characters.length === 0) && (
                      <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                        暂无角色
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Locations */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setLocationsCollapsed((prev) => !prev)}
                    className="flex items-center gap-2 text-sm font-bold text-light-text dark:text-white"
                  >
                    {locationsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>场景地点 ({project?.locations.length || 0})</span>
                  </button>
                  <button
                    onClick={() => setShowAddLocationDialog(true)}
                    className="text-xs text-light-accent dark:text-cine-accent hover:text-light-accent-hover dark:hover:text-cine-accent-hover transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>添加</span>
                  </button>
                </div>
                {!locationsCollapsed && (
                  <div className="space-y-2">
                    {project?.locations.map((location) => (
                      <div
                        key={location.id}
                        className="bg-light-bg dark:bg-cine-black/30 rounded-lg p-3 border border-light-border/60 dark:border-cine-border/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm text-light-text dark:text-white">
                              {location.name}
                            </div>
                            <div className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
                              {location.type === 'interior' ? '室内' : '室外'}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingLocation(location)}
                              className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent rounded"
                              title="编辑场景"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`确定删除场景地点「${location.name}」？`)) {
                                  useProjectStore.getState().deleteLocation(location.id);
                                  toast.success('场景地点已删除');
                                }
                              }}
                              className="p-1 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 rounded"
                              title="删除场景"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {/* Reference Images */}
                        {location.referenceImages && location.referenceImages.length > 0 && (
                          <div className="flex gap-1 mt-2 overflow-x-auto">
                            {location.referenceImages.map((imageUrl, idx) => (
                              <div
                                key={idx}
                                className="flex-shrink-0 w-16 h-16 bg-light-panel dark:bg-cine-panel rounded overflow-hidden"
                              >
                                <img
                                  src={imageUrl}
                                  alt={`${location.name} 参考图 ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {(!project?.locations || project.locations.length === 0) && (
                      <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4">
                        暂无场景地点
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Audio (Coming Soon) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-light-text-muted dark:text-cine-text-muted opacity-50">
                    音频（后期功能）
                  </h3>
                </div>
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center py-4 opacity-50">
                  音频功能即将上线
                </div>
              </div>
            </div>
          )
        }
      </div >

      {showScriptEditor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl shadow-xl w-[800px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-cine-border">
              <div className="flex items-center gap-2">
                <Film size={16} className="text-light-accent dark:text-cine-accent" />
                <span className="text-sm font-bold text-light-text dark:text-white">分镜脚本编辑</span>
              </div>
              <button
                onClick={() => setShowScriptEditor(false)}
                className="p-1 rounded hover:bg-light-bg dark:hover:bg-cine-panel transition-colors"
              >
                <ChevronRightIcon size={16} className="text-light-text-muted dark:text-cine-text-muted" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto space-y-3">
              <p className="text-xs text-light-text-muted dark:text-cine-text-muted">
                直接在此修改完整分镜脚本内容，保存后右侧 Pro 模式将按镜头/场景上下文展示历史。
              </p>
              <textarea
                value={project?.script || ''}
                onChange={(e) => updateScript(e.target.value)}
                className="w-full h-full min-h-[400px] bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white placeholder:text-light-text-muted dark:placeholder:text-cine-text-muted"
                placeholder="在此粘贴或编写分镜脚本..."
              />
            </div>
          </div>
        </div>
      )}

      {
        shotImagePreview && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4" onClick={() => setShotImagePreview(null)}>
            <div className="max-w-5xl w-full max-h-[90vh]">
              <img src={shotImagePreview} alt="预览" className="w-full h-full object-contain rounded-lg" />
            </div>
          </div>
        )
      }

      {
        editingShot && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 md:p-8">
            <div className="bg-white dark:bg-[#0c0c0e] border border-light-border dark:border-cine-border rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
              {/* Header Toolbar */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-dark/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-light-accent dark:bg-cine-accent rounded-xl text-white dark:text-black">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-light-text dark:text-white">分镜详情编辑</span>
                      <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-light-text-muted dark:text-cine-text-muted mt-0.5">
                      <span>镜头 #{editingShot.order}</span>
                      <span className="opacity-30">•</span>
                      <span>{editingShot.shotSize}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                    <button className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white dark:hover:bg-white/10 text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-all">
                      Web search
                    </button>
                    <button className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white dark:hover:bg-white/10 text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-all">
                      Copy
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-light-text-muted dark:text-cine-text-muted transition-all">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                  <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-1"></div>
                  <button
                    onClick={() => setEditingShot(null)}
                    className="p-2 rounded-xl hover:bg-red-500/10 text-light-text-muted dark:text-cine-text-muted hover:text-red-500 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Description & Text */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头描述</label>
                      <textarea
                        value={shotForm.description}
                        onChange={(e) => setShotForm((prev) => ({ ...prev, description: e.target.value }))}
                        className="w-full h-48 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                        placeholder="详细描述镜头画面内容..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">对白</label>
                        <textarea
                          value={shotForm.dialogue}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, dialogue: e.target.value }))}
                          className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                          placeholder="角色对白（可选）"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">旁白</label>
                        <textarea
                          value={shotForm.narration}
                          onChange={(e) => setShotForm((prev) => ({ ...prev, narration: e.target.value }))}
                          className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 focus:border-light-accent dark:focus:border-cine-accent text-light-text dark:text-white transition-all"
                          placeholder="旁白/场景说明"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Settings & History */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary rounded-3xl p-6 border border-light-border dark:border-cine-border space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头景别</label>
                          <select
                            value={shotForm.shotSize}
                            onChange={(e) => setShotForm((prev) => ({ ...prev, shotSize: e.target.value as ShotSize }))}
                            className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                          >
                            <option value="">选择景别</option>
                            {shotSizeOptions.map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">镜头运动</label>
                          <select
                            value={shotForm.cameraMovement}
                            onChange={(e) => setShotForm((prev) => ({ ...prev, cameraMovement: e.target.value as CameraMovement }))}
                            className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2.5 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent transition-all"
                          >
                            <option value="">选择运动</option>
                            {cameraMovementOptions.map((move) => (
                              <option key={move} value={move}>{move}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider ml-1">时长 (秒)</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={0.5}
                            value={shotForm.duration}
                            onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                            className="flex-1 accent-light-accent dark:accent-cine-accent"
                          />
                          <input
                            type="number"
                            min={1}
                            value={shotForm.duration}
                            onChange={(e) => setShotForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                            className="w-16 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl p-2 text-center text-sm font-bold text-light-text dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-xs font-bold text-light-text-muted dark:text-cine-text-muted uppercase tracking-wider">历史分镜图片</label>
                        <span className="text-[10px] text-light-text-muted dark:text-cine-text-muted bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                          {shotHistoryImages.length} 张记录
                        </span>
                      </div>

                      {shotHistoryImages.length === 0 ? (
                        <div className="bg-light-bg-secondary dark:bg-cine-bg-secondary border border-dashed border-light-border dark:border-cine-border rounded-2xl py-8 text-center">
                          <ImageIcon size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted opacity-30" />
                          <p className="text-xs text-light-text-muted dark:text-cine-text-muted">暂无历史图片</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {shotHistoryImages.map((url, idx) => (
                            <div
                              key={idx}
                              className={`group relative aspect-video bg-light-bg dark:bg-cine-black rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedHistoryImage === url ? 'border-light-accent dark:border-cine-accent ring-4 ring-light-accent/10 dark:ring-cine-accent/10' : 'border-transparent hover:border-light-accent/30 dark:hover:border-cine-accent/30'}`}
                              onClick={() => {
                                setSelectedHistoryImage(url);
                                if (liveEditingShot) {
                                  updateShot(liveEditingShot.id, { referenceImage: url, status: 'done' });
                                }
                              }}
                              onDoubleClick={() => setShotImagePreview(url)}
                            >
                              <img src={url} alt={`history-${idx + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                              {selectedHistoryImage === url && (
                                <div className="absolute inset-0 bg-light-accent/10 dark:bg-cine-accent/10 flex items-center justify-center">
                                  <div className="bg-light-accent dark:bg-cine-accent text-white dark:text-black p-1 rounded-full shadow-lg">
                                    <Check size={12} />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between px-8 py-6 border-t border-light-border dark:border-cine-border bg-light-bg-secondary dark:bg-cine-bg-secondary">
                <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                  最后修改: {new Date().toLocaleTimeString()}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingShot(null)}
                    className="px-6 py-2.5 text-sm font-bold rounded-xl glass-button text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveShotEdit}
                    className="px-8 py-2.5 text-sm font-bold rounded-xl bg-black dark:bg-white text-white dark:text-black shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <span>保存并应用</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Add Shot Dialog */}
      {
        showAddShotDialog && selectedSceneForNewShot && (
          <AddShotDialog
            sceneId={selectedSceneForNewShot}
            sceneName={scenes.find(s => s.id === selectedSceneForNewShot)?.name || ''}
            existingShotsCount={shots.filter(s => s.sceneId === selectedSceneForNewShot).length}
            insertIndex={shotInsertIndex ?? undefined}
            onAdd={handleAddShot}
            onClose={() => {
              setShowAddShotDialog(false);
              setShotInsertIndex(null);
            }}
          />
        )
      }

      {/* Add Character Dialog */}
      {
        showAddCharacterDialog && (
          <AddCharacterDialog
            onAdd={addCharacter}
            onClose={() => setShowAddCharacterDialog(false)}
          />
        )
      }
      {
        editingCharacter && (
          <AddCharacterDialog
            mode="edit"
            initialCharacter={editingCharacter}
            onAdd={(updated) => {
              useProjectStore.getState().updateCharacter(editingCharacter.id, updated);
            }}
            onClose={() => setEditingCharacter(null)}
          />
        )
      }

      {/* Add Location Dialog */}
      {
        showAddLocationDialog && (
          <AddLocationDialog
            onAdd={addLocation}
            onClose={() => setShowAddLocationDialog(false)}
          />
        )
      }
      {
        editingLocation && (
          <AddLocationDialog
            mode="edit"
            initialLocation={editingLocation}
            onAdd={(updated) => {
              useProjectStore.getState().updateLocation(editingLocation.id, updated);
            }}
            onClose={() => setEditingLocation(null)}
          />
        )
      }
    </div>
  );
}

