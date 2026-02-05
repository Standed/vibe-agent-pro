'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Film, Clock, Trash2, LogOut, Coins, Folder, Sparkles, User, Image as ImageIcon, FileText, Upload, ArrowRight, Palette, UserCircle2, ChevronDown, MapPin, Loader2 } from 'lucide-react';
import { UserNav } from '@/components/layout/UserNav';
import { useI18n } from '@/components/providers/I18nProvider';
import NewProjectDialog from '@/components/project/NewProjectDialog';
import NewSeriesDialog from '@/components/project/NewSeriesDialog';
import { useProjectStore } from '@/store/useProjectStore';
import { dataService } from '@/lib/dataService';
import type { Project, Series, Character, Scene, Shot } from '@/types/project';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { getShotSizeFromValue, getCameraMovementFromValue } from '@/utils/translations';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSeriesId = searchParams.get('seriesId');

  const { createNewProject, project, batchUpdateScenesAndShots } = useProjectStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewSeriesDialog, setShowNewSeriesDialog] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // AI Director Input State
  const [aiDirectorInput, setAiDirectorInput] = useState('');
  const [isAiBrainstorming, setIsAiBrainstorming] = useState(false);
  const [selectedArtStyle, setSelectedArtStyle] = useState('智能推荐');
  const [selectedSubject, setSelectedSubject] = useState('自动识别');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showSubjectMenu, setShowSubjectMenu] = useState(false);
  const [globalCharacters, setGlobalCharacters] = useState<Character[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [mentionState, setMentionState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    filter: string;
    cursorPos: number;
  }>({ visible: false, x: 0, y: 0, filter: '', cursorPos: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadedScript, setUploadedScript] = useState('');
  const [importedStoryboard, setImportedStoryboard] = useState<{
    scenes: Scene[];
    shots: Shot[];
    errors: { row: number; msg: string; type: 'error' | 'warning' }[];
    fileName?: string;
  } | null>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowStyleMenu(false);
      setShowSubjectMenu(false);
    };
    if (showStyleMenu || showSubjectMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [showStyleMenu, showSubjectMenu]);

  const artStyles = [
    { name: '智能推荐', icon: <Sparkles size={14} /> },
    { name: '写实电影', icon: <Film size={14} /> },
    { name: '二次元动漫', icon: <ImageIcon size={14} /> },
    { name: '赛博朋克', icon: <Palette size={14} /> },
    { name: '水墨国风', icon: <Palette size={14} /> },
  ];

  const subjects = [
    { name: '自动识别', icon: <Sparkles size={14} /> },
    { name: '人物故事', icon: <User size={14} /> },
    { name: '风景名胜', icon: <MapPin size={14} /> },
    { name: '产品广告', icon: <ImageIcon size={14} /> },
  ];
  const [aiProposal, setAiProposal] = useState<{
    title?: string;
    description?: string;
    artStyle?: string;
    aspectRatio?: string;
  } | null>(null);

  const { user, profile, signOut, loading: authLoading } = useRequireWhitelist();

  // 智能表头检测：检查第一行是否为表头（要求至少3列匹配关键词）
  const isHeaderRow = (row: any[]): boolean => {
    const headerKeywords = ['场景名称', '镜头序号', '镜头描述', '描述', '对白', '旁白', '景别', '运镜', '时长', 'scene', 'shot', 'description', 'dialogue'];
    const normalizedRow = row.map((cell: any) => String(cell || '').trim().toLowerCase());
    // 计算匹配的列数，至少3列匹配才判定为表头
    const matchCount = normalizedRow.filter(cell =>
      headerKeywords.some(kw => cell.includes(kw.toLowerCase()))
    ).length;
    return matchCount >= 3;
  };

  const parseStoryboardRows = (rows: any[], hasHeader: boolean = true) => {
    const errors: { row: number; msg: string; type: 'error' | 'warning' }[] = [];
    const scenes: Scene[] = [];
    const shots: Shot[] = [];
    const sceneIdMap = new Map<string, string>();

    rows.forEach((row, idx) => {
      if (!row || row.length === 0) return;
      const normalizedRow = row.map((cell: any) => (cell === null || cell === undefined ? '' : String(cell).trim()));
      if (normalizedRow.every((cell: string) => !cell)) return;

      // 根据是否有表头调整行号：有表头 +2（跳过表头+0索引），无表头 +1（只需0索引调整）
      const rowNum = hasHeader ? idx + 2 : idx + 1;
      const [sceneName, , description, dialogue, narration, shotSizeVal, cameraMoveVal, durationVal] = normalizedRow;

      if (!sceneName) {
        errors.push({ row: rowNum, msg: '场景名称不能为空', type: 'error' });
        return;
      }

      const shotSizeParsed = getShotSizeFromValue(shotSizeVal);
      const cameraMovementParsed = getCameraMovementFromValue(cameraMoveVal);
      const shotSize = shotSizeParsed || 'Medium Shot';
      const cameraMovement = cameraMovementParsed || 'Static';

      if (!shotSizeParsed && shotSizeVal) {
        errors.push({ row: rowNum, msg: `未知景别 "${shotSizeVal}"，已默认设为中景`, type: 'warning' });
      }

      if (!cameraMovementParsed && cameraMoveVal) {
        errors.push({ row: rowNum, msg: `未知运镜 "${cameraMoveVal}"，已默认设为固定镜头`, type: 'warning' });
      }

      const durationNum = parseFloat(durationVal);
      const duration = !Number.isNaN(durationNum) && durationNum > 0 ? durationNum : 3;
      if (Number.isNaN(durationNum) || durationNum <= 0) {
        errors.push({ row: rowNum, msg: `时长格式错误 "${durationVal}"，已设为默认 3s`, type: 'warning' });
      }

      let sceneId = sceneIdMap.get(sceneName);
      if (!sceneId) {
        sceneId = crypto.randomUUID();
        scenes.push({
          id: sceneId,
          name: sceneName,
          location: '',
          description: '',
          shotIds: [],
          position: { x: scenes.length * 300, y: 100 },
          order: scenes.length + 1,
          status: 'draft',
        });
        sceneIdMap.set(sceneName, sceneId);
      }

      const shotId = crypto.randomUUID();
      const scene = scenes.find(s => s.id === sceneId);
      if (scene) {
        scene.shotIds.push(shotId);
      }

      shots.push({
        id: shotId,
        sceneId,
        order: 0,
        shotSize,
        cameraMovement,
        duration,
        description: description || '',
        narration: narration || '',
        dialogue: dialogue || '',
        status: 'draft',
        gridImages: [],
        generationHistory: [],
      });
    });

    return { scenes, shots, errors };
  };

  const parseStoryboardFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension) {
      throw new Error('无法识别文件格式');
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
      // 智能表头检测：检查第一行是否为表头
      const hasHeader = rows.length > 0 && isHeaderRow(rows[0]);
      const dataRows = hasHeader ? rows.slice(1) : rows;
      return parseStoryboardRows(dataRows, hasHeader);
    }

    if (extension === 'csv') {
      const text = await file.text();
      const results = Papa.parse(text, { header: false, skipEmptyLines: true });
      const rows = results.data as any[];
      // 智能表头检测：检查第一行是否为表头
      const hasHeader = rows.length > 0 && isHeaderRow(rows[0]);
      const dataRows = hasHeader ? rows.slice(1) : rows;
      return parseStoryboardRows(dataRows, hasHeader);
    }

    throw new Error('不支持的分镜脚本格式，请上传 CSV 或 Excel 文件');
  };

  // 加载数据
  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [user, authLoading, currentSeriesId]);

  const loadData = async () => {
    // console.log('[HomePage] 🔄 开始加载数据...');
    setIsLoading(true);
    setLoadError(null);

    if (!user) {
      setProjects([]);
      setSeries([]);
      setIsLoading(false);
      return;
    }

    try {
      const [allProjects, allSeries, allGlobalCharacters] = await Promise.all([
        dataService.getAllProjects(user.id),
        dataService.getAllSeries(),
        dataService.getGlobalCharacters(user.id)
      ]);
      // console.log('[HomePage] Raw projects:', allProjects);
      // console.log('[HomePage] Raw series:', allSeries);
      // console.log('[HomePage] Global characters:', allGlobalCharacters);

      setProjects(allProjects);

      // 自动设置项目封面：如果项目没有封面，尝试从数据库获取第一张分镜图
      // 不阻塞页面渲染，完全异步执行
      const projectsNeedCover = allProjects.filter(p => !p.metadata.coverImage);

      if (projectsNeedCover.length > 0) {
        // console.log(`[HomePage] 🖼️ 尝试自动设置 ${projectsNeedCover.length} 个项目封面`);
        (async () => {
          let updatedCount = 0;
          for (const p of projectsNeedCover) {
            try {
              const coverUrl = await dataService.getProjectFirstImage(p.id);
              if (coverUrl) {
                // console.log(`[HomePage] ✅ 找到项目封面 ${p.id}: ${coverUrl}`);
                // 更新数据库：注意！必须清空 scenes 和 shots，因为 getAllProjects 返回的是空对象
                // 否则会导致 "null value in column name ... violates not-null constraint"
                const projectToSave = {
                  ...p,
                  metadata: { ...p.metadata, coverImage: coverUrl },
                  scenes: [], // 避免保存空场景
                  shots: [],  // 避免保存空分镜
                  characters: [], // 避免保存空角色
                  audioAssets: [],
                };
                await dataService.saveProject(projectToSave as Project, user.id);
                // 更新本地状态
                setProjects(prev => prev.map(curr => curr.id === p.id ? { ...curr, metadata: { ...curr.metadata, coverImage: coverUrl } } : curr));
                updatedCount++;
              }
            } catch (e) {
              // 忽略错误，仅仅是封面设置失败
            }
          }
          if (updatedCount > 0) {
            // console.log(`[HomePage] 成功更新 ${updatedCount} 个封面`);
          }
        })();
      }

      // 自动设置剧集封面：始终同步为该剧集下最新修改的项目的封面
      const seriesToUpdate = allSeries.filter(s => {
        // 找出该剧集下的所有项目
        const seriesProjects = allProjects.filter(p => p.seriesId === s.id);
        if (seriesProjects.length === 0) return false;

        // 按修改时间降序排序（注意：projects 已经在 getAllProjects 中按 updated_at 排序了，但为了保险再排一次）
        // getAllProjects 返回的是 'updated_at' 降序
        // const latestProject = seriesProjects[0]; // 假设已排序
        // 还是手动排一下稳妥
        seriesProjects.sort((a, b) => new Date(b.metadata.modified).getTime() - new Date(a.metadata.modified).getTime());
        const latestProject = seriesProjects[0];

        // 如果最新项目有封面，且剧集封面与最新项目封面不一致 => 需要更新
        return latestProject.metadata.coverImage && s.coverImage !== latestProject.metadata.coverImage;
      });

      if (seriesToUpdate.length > 0) {
        // console.log(`[HomePage] 🎬 尝试更新 ${seriesToUpdate.length} 个剧集封面`);
        (async () => {
          let updatedCount = 0;
          for (const s of seriesToUpdate) {
            const seriesProjects = allProjects.filter(p => p.seriesId === s.id);
            seriesProjects.sort((a, b) => new Date(b.metadata.modified).getTime() - new Date(a.metadata.modified).getTime());
            const latestProject = seriesProjects[0];

            if (latestProject && latestProject.metadata.coverImage) {
              try {
                const updatedSeries = { ...s, coverImage: latestProject.metadata.coverImage, updated: new Date() }; // Series type update
                // 注意：dataService.saveSeries 需要完整对象
                await dataService.saveSeries(updatedSeries);
                // Update local state
                setSeries(prev => prev.map(curr => curr.id === s.id ? updatedSeries : curr));
                updatedCount++;
              } catch (e) {
                console.error('Failed to update series cover', e);
              }
            }
          }
          if (updatedCount > 0) {
            // console.log(`[HomePage] 成功更新 ${updatedCount} 个剧集封面`);
          }
        })();
      }
      setSeries(allSeries);
      setGlobalCharacters(allGlobalCharacters);
      // console.log('[HomePage] ✅ 数据加载完成', { projects: allProjects.length, series: allSeries.length });
    } catch (error) {
      // console.error('[HomePage] ❌ 加载失败:', error);
      setLoadError(error instanceof Error ? error.message : '加载失败');
      toast.error('加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const activeSeries = currentSeriesId ? series.find(s => s.id === currentSeriesId) : null;

  // Filter items for display
  const displayedItems = (() => {
    if (currentSeriesId) {
      return projects.filter(p => p.seriesId === currentSeriesId).map(p => ({ type: 'project' as const, data: p }));
    } else {
      const seriesItems = series.map(s => ({ type: 'series' as const, data: s }));
      const projectItems = projects.filter(p => !p.seriesId).map(p => ({ type: 'project' as const, data: p }));
      return [...seriesItems, ...projectItems];
    }
  })();

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setAiDirectorInput(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ' || textBeforeCursor[atIndex - 1] === '\n')) {
      const filter = textBeforeCursor.slice(atIndex + 1);
      if (!filter.includes(' ')) {
        // Calculate position (simplified, for better accuracy we'd need a hidden mirror div)
        const rect = e.target.getBoundingClientRect();
        // Approximate position based on cursor
        setMentionState({
          visible: true,
          x: 32, // Relative to form
          y: 80, // Relative to form
          filter,
          cursorPos
        });
        return;
      }
    }
    setMentionState(prev => ({ ...prev, visible: false }));
  };

  const insertMention = (char: Character) => {
    const value = aiDirectorInput;
    const cursorPos = mentionState.cursorPos;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    const newValue = value.slice(0, atIndex) + `@${char.name} ` + value.slice(cursorPos);
    setAiDirectorInput(newValue);
    setMentionState(prev => ({ ...prev, visible: false }));

    // Add to selected characters if not already there
    if (!selectedCharacters.includes(char.id)) {
      setSelectedCharacters(prev => [...prev, char.id]);
    }

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = atIndex + char.name.length + 2;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const toggleCharacter = (charId: string) => {
    setSelectedCharacters(prev =>
      prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]
    );
  };

  const handleAiDirectorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const brainstormInput = uploadedScript.trim() ? uploadedScript : aiDirectorInput;
    if (!brainstormInput.trim()) return;

    setIsAiBrainstorming(true);
    setAiProposal(null); // Reset previous proposal

    try {
      const response = await fetch('/api/ai/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: brainstormInput,
          artStyle: selectedArtStyle,
          characterIds: selectedCharacters
        })
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();

      // Map simple aspect ratio strings to our enum values if strictly needed,
      // but NewProjectDialog handles validation.
      let mappedAspectRatio = data.recommendedAspectRatio;
      if (mappedAspectRatio === "16:9") mappedAspectRatio = "WIDE";
      if (mappedAspectRatio === "9:16") mappedAspectRatio = "MOBILE";
      if (mappedAspectRatio === "1:1") mappedAspectRatio = "SQUARE";
      if (mappedAspectRatio === "4:3") mappedAspectRatio = "STANDARD";
      if (mappedAspectRatio === "21:9") mappedAspectRatio = "CINEMA";

      setAiProposal({
        title: data.title,
        description: data.description,
        artStyle: data.artStyle,
        aspectRatio: mappedAspectRatio
      });

      setShowNewProjectDialog(true);
    } catch (error) {
      console.error('Brainstorming failed:', error);
      toast.error('AI 构思失败，请直接手动创建');
      // Fallback: open dialog with manual summary if provided
      const fallbackDescription = aiDirectorInput.trim();
      setAiProposal({ description: fallbackDescription || undefined });
      setShowNewProjectDialog(true);
    } finally {
      setIsAiBrainstorming(false);
    }
  };

  const handleCreateProject = async (
    title: string,
    description: string,
    artStyle: string,
    aspectRatio: string
  ) => {
    try {
      const scriptContent = uploadedScript.trim();
      createNewProject(title, description, artStyle, aspectRatio, scriptContent);
      await new Promise(resolve => setTimeout(resolve, 100));
      if (importedStoryboard && importedStoryboard.shots.length > 0) {
        batchUpdateScenesAndShots(importedStoryboard.scenes, importedStoryboard.shots);
      }

      const currentProject = useProjectStore.getState().project;

      if (!currentProject) throw new Error('Project creation failed');

      if (currentSeriesId) {
        currentProject.seriesId = currentSeriesId;
      }

      await dataService.saveProject(currentProject, user?.id);

      setShowNewProjectDialog(false);
      setUploadedScript('');
      setImportedStoryboard(null);
      router.push(`/project/${currentProject.id}?view=planning`);
    } catch (error) {
      console.error('[HomePage] ❌ Create failed:', error);
      toast.error('创建项目失败');
    }
  };

  const handleCreateSeries = async (title: string, description: string) => {
    if (!user) return;
    try {
      const newSeries: Series = {
        id: crypto.randomUUID(),
        userId: user.id,
        title,
        description,
        created: new Date(),
        updated: new Date()
      };
      await dataService.saveSeries(newSeries);
      toast.success('剧集创建成功');
      setShowNewSeriesDialog(false);
      loadData();
    } catch (error) {
      console.error('Failed to create series:', error);
      toast.error('创建剧集失败');
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('确定要删除这个项目吗？')) {
      try {
        await dataService.deleteProject(projectId);
        loadData();
      } catch (error) {
        toast.error('删除失败');
      }
    }
  };

  const handleDeleteSeries = async (seriesId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('删除剧集将只删除剧集容器，内部项目将移至根目录。确定吗？')) {
      try {
        await dataService.deleteSeries(seriesId);
        loadData();
      } catch (error) {
        toast.error('删除剧集失败');
      }
    }
  };

  const formatDate = (date: Date) => new Date(date).toLocaleDateString('zh-CN');

  return (
    <main className="min-h-screen relative overflow-hidden bg-white dark:bg-black selection:bg-primary/30">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none ambient-bg-light dark:ambient-bg-dark opacity-70" />
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 pointer-events-none mix-blend-overlay" />

      <div className="relative z-10 max-w-7xl mx-auto p-8">
        {/* Header */}
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 transition-transform duration-500 group-hover:rotate-12">
                <Image
                  src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                  alt="Logo"
                  fill
                  className="object-contain drop-shadow-lg"
                />
              </div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-zinc-400 hidden md:block">
                {t('common.appName')}
              </h1>
            </Link>

            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-2"></div>

            <Link
              href="/assets"
              className="group flex items-center gap-2 px-4 py-2 rounded-full hover:bg-white/50 dark:hover:bg-white/5 transition-all duration-300"
            >
              <ImageIcon size={18} className="text-zinc-500 dark:text-zinc-400 group-hover:text-primary transition-colors" />
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">素材库</span>
            </Link>
          </div>
          <UserNav />
        </header>

        {/* AI Director Hero Section */}
        {!currentSeriesId && (
          <section className="mb-24 text-center relative max-w-3xl mx-auto">
            {/* Hero Title & decorative elements */}
            <div className="mb-10 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-3xl rounded-full opacity-60 pointer-events-none" />
              <h2 className="relative text-5xl md:text-7xl font-medium tracking-tight mb-4 pb-2 bg-clip-text text-transparent bg-gradient-to-b from-zinc-800 to-zinc-500 dark:from-white dark:to-zinc-200">
                What will you create?
              </h2>
              <p className="relative text-zinc-500 dark:text-zinc-400 text-lg md:text-xl max-w-xl mx-auto">
                释放 AI 的力量，将您的灵感转化为电影级作品
              </p>
            </div>

            <div className="relative group">
              {/* Glow Effect behind input */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-[2rem] opacity-20 group-hover:opacity-40 blur-xl transition-opacity duration-500" />

              <div className="relative glass-panel rounded-[1.5rem] p-2 transition-transform duration-300 focus-within:-translate-y-1 focus-within:shadow-2xl ring-1 ring-white/20 dark:ring-white/10">
                <textarea
                  ref={textareaRef}
                  value={aiDirectorInput}
                  onChange={handleTextareaChange}
                  placeholder="描述您的故事创意，输入 @ 召唤角色..."
                  rows={currentSeriesId ? 1 : 3}
                  className="w-full bg-transparent border-none py-4 px-6 text-lg focus:outline-none focus:ring-0 resize-none text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-medium leading-relaxed"
                  style={{ minHeight: '120px' }}
                />

                {/* Toolbar inside input */}
                <div className="flex items-center justify-between px-4 pb-2 mt-2">
                  <div className="flex items-center gap-2">
                    {/* 角色选择 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowSubjectMenu(!showSubjectMenu); setShowStyleMenu(false); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedCharacters.length > 0
                          ? "bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                          : "bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-700"
                          }`}
                      >
                        <UserCircle2 size={14} />
                        <span>{selectedCharacters.length > 0 ? `已选 ${selectedCharacters.length} 人` : "选择角色"}</span>
                        <ChevronDown size={12} className={cn("transition-transform", showSubjectMenu && "rotate-180")} />
                      </button>

                      <AnimatePresence>
                        {showSubjectMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full mt-2 left-0 w-64 glass-panel backdrop-blur-2xl bg-white/80 dark:bg-black/80 rounded-xl p-2 z-50 max-h-80 overflow-y-auto shadow-2xl border border-white/20 ring-1 ring-black/5"
                          >
                            <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">角色库</div>
                            {globalCharacters.map((char) => (
                              <button
                                key={char.id}
                                type="button"
                                onClick={() => toggleCharacter(char.id)}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors",
                                  selectedCharacters.includes(char.id)
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                                )}
                              >
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] border",
                                  selectedCharacters.includes(char.id) ? "border-current" : "border-zinc-200 dark:border-zinc-700"
                                )}>
                                  {char.name[0]}
                                </div>
                                <span className="flex-1 text-left truncate">{char.name}</span>
                                {selectedCharacters.includes(char.id) && <Sparkles size={12} />}
                              </button>
                            ))}
                            {globalCharacters.length === 0 && (
                              <div className="px-3 py-6 text-center">
                                <p className="text-xs text-zinc-500 mb-3">暂无全局角色</p>
                                <Link href="/assets" className="text-[10px] font-bold text-blue-500 hover:underline">去素材库创建</Link>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 画风选择 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowStyleMenu(!showStyleMenu); setShowSubjectMenu(false); }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-all text-xs font-bold border border-zinc-200 dark:border-zinc-700"
                      >
                        <Palette size={14} />
                        <span>{selectedArtStyle}</span>
                        <ChevronDown size={12} className={cn("transition-transform", showStyleMenu && "rotate-180")} />
                      </button>

                      <AnimatePresence>
                        {showStyleMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-zinc-900 rounded-xl p-2 z-[9999] shadow-2xl border border-zinc-200 dark:border-zinc-700"
                          >
                            {artStyles.map((style) => (
                              <button
                                key={style.name}
                                type="button"
                                onClick={() => { setSelectedArtStyle(style.name); setShowStyleMenu(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors",
                                  selectedArtStyle === style.name
                                    ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                                )}
                              >
                                {style.icon}
                                {style.name}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                    {/* Upload Actions */}
                    <div className="flex items-center gap-1">
                      <label className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-pointer transition-colors" title="上传剧本">
                        <FileText size={18} />
                        <input
                          type="file"
                          accept=".txt,.md,.fdx"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const content = ev.target?.result as string;
                                setUploadedScript(content || '');
                                toast.success(`已导入剧本: ${file.name}`);
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                      <label className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-pointer transition-colors" title="上传分镜">
                        <Upload size={18} />
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              parseStoryboardFile(file)
                                .then((result) => {
                                  setImportedStoryboard({
                                    scenes: result.scenes,
                                    shots: result.shots,
                                    errors: result.errors,
                                    fileName: file.name
                                  });
                                  // Error handling logic (abbreviated)
                                  toast.success(`已导入分镜脚本: ${file.name}`);
                                })
                                .catch((error: Error) => {
                                  toast.error(error.message || '分镜脚本导入失败');
                                });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAiBrainstorming || !aiDirectorInput.trim()}
                    className={cn(
                      "group relative flex items-center justify-center w-12 h-12 rounded-full transition-all shadow-lg overflow-hidden",
                      isAiBrainstorming || !aiDirectorInput.trim()
                        ? "bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed opacity-50"
                        : "bg-black dark:bg-white hover:scale-105 active:scale-95 cursor-pointer"
                    )}
                  >
                    {isAiBrainstorming ? (
                      <Loader2 size={20} className="animate-spin text-zinc-500" />
                    ) : (
                      <ArrowRight size={20} className="text-white dark:text-black" />
                    )}
                  </button>
                </div>

                {/* Visual indicator for selected script */}
                {uploadedScript && (
                  <div className="absolute top-2 right-4 flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px] font-bold rounded-md">
                    <FileText size={10} />
                    <span>已加载剧本</span>
                  </div>
                )}
              </div>

              {/* @ Mention Menu Implementation */}
              <AnimatePresence>
                {mentionState.visible && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute left-8 top-20 w-64 glass-panel rounded-xl p-2 z-50 max-h-60 overflow-y-auto"
                  >
                    {/* ... mention list rendering ... reuse logic from existing ... */}
                    <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">召唤全局角色</div>
                    {globalCharacters
                      .filter(c => c.name.toLowerCase().includes(mentionState.filter.toLowerCase()))
                      .map((char) => (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => insertMention(char)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            {char.name[0]}
                          </div>
                          <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{char.name}</span>
                        </button>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Chips suggestions (Optional) */}
            <div className="mt-6 flex flex-wrap justify-center gap-2 opacity-60">
              {["赛博朋克风格的城市追逐", "宁静的江南水乡", "悬疑探案故事"].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setAiDirectorInput(tag)}
                  className="px-3 py-1 rounded-full text-xs bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 hover:bg-white/50 dark:hover:bg-white/10 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Content Section */}
        <section className="relative z-10 transition-all duration-500">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
                {currentSeriesId ? activeSeries?.title : '全部作品'}
              </span>
              {currentSeriesId && <span className="text-sm font-normal text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">剧集</span>}
            </h2>

            <div className="flex gap-3">
              {!currentSeriesId && (
                <button
                  onClick={() => setShowNewSeriesDialog(true)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  新建剧集
                </button>
              )}
              <button
                onClick={() => setShowNewProjectDialog(true)}
                className="px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-bold shadow-lg shadow-black/5 dark:shadow-white/5 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={16} />
                新建项目
              </button>
            </div>
          </div>

          {displayedItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {displayedItems.map((item) => (
                  <motion.div
                    key={item.type === 'project' ? item.data.id : item.data.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    {item.type === 'project' ? (
                      // Project Card
                      <Link href={`/project/${item.data.id}`} className="block h-full group">
                        <div className="glass-card h-full flex flex-col overflow-hidden relative">
                          <div className="aspect-video relative overflow-hidden bg-zinc-100 dark:bg-zinc-900/50">
                            {item.data.metadata.coverImage ? (
                              <Image
                                src={item.data.metadata.coverImage}
                                alt={item.data.metadata.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-300 dark:text-zinc-700">
                                <Film size={32} />
                              </div>
                            )}

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                            {/* Quick Actions */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <button
                                onClick={(e) => handleDeleteProject(item.data.id, e)}
                                className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-red-500 transition-colors backdrop-blur-md"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div className="absolute top-2 left-2">
                              <span className="px-2 py-0.5 bg-black/40 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-wider rounded-md border border-white/10">项目</span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.data.metadata.title}</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4 flex-1">{item.data.metadata.description || '无描述'}</p>

                            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-white/5">
                              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                                <Clock size={12} />
                                <span>{formatDate(item.data.metadata.modified)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                                <span>{item.data.shots.length} 镜头</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ) : (
                      // Series Card
                      <Link href={`/?seriesId=${item.data.id}`} className="block h-full group">
                        <div className="glass-card h-full flex flex-col overflow-hidden relative border border-black/5 dark:border-white/10">
                          <div className="aspect-video relative overflow-hidden bg-zinc-100 dark:bg-white/5">
                            {item.data.coverImage ? (
                              <>
                                <Image
                                  src={item.data.coverImage}
                                  alt={item.data.title}
                                  fill
                                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                              </>
                            ) : (
                              <>
                                <div className="absolute inset-0 flex items-center justify-center text-zinc-300 dark:text-zinc-700 z-10">
                                  <div className="relative">
                                    <Folder size={64} strokeWidth={1} className="drop-shadow-sm" />
                                    <div className="absolute -bottom-2 -right-2 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white dark:border-black shadow-sm">
                                      SET
                                    </div>
                                  </div>
                                </div>

                                {/* Stacked Cards Effect */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity duration-500">
                                  <div className="absolute w-2/3 h-2/3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm rotate-6 translate-x-4 translate-y-2 pointer-events-none" />
                                  <div className="absolute w-2/3 h-2/3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm rotate-3 translate-x-2 translate-y-1 pointer-events-none" />
                                  <div className="absolute w-2/3 h-2/3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm pointer-events-none" />
                                </div>

                              </>
                            )}

                            <div className="absolute top-2 left-2">
                              <span className="px-2 py-0.5 bg-black/40 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-wider rounded-md border border-white/10">剧集</span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col relative z-10 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">{item.data.title}</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4 flex-1">{item.data.description || '剧集容器'}</p>

                            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-white/5">
                              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                                <Clock size={12} />
                                <span>{formatDate(item.data.updated)}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteSeries(item.data.id, e)}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-md transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-24 h-24 bg-zinc-100 dark:bg-zinc-800/50 rounded-full flex items-center justify-center mb-6">
                <Film className="w-10 h-10 text-zinc-400" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                {currentSeriesId ? '此剧集为空' : '还没有项目'}
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mb-8">
                {currentSeriesId ? '在这个剧集中创建一个新项目，或者从其他地方移动项目过来。' : '创建一个新项目开始创作，或创建一个剧集来组织您的作品。'}
              </p>
              <button
                onClick={() => setShowNewProjectDialog(true)}
                className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/10 dark:shadow-white/10"
              >
                开始创作
              </button>
            </div>
          )}
        </section>

        {/* Dialogs */}
        {
          showNewProjectDialog && (
            <NewProjectDialog
              onConfirm={handleCreateProject}
              onClose={() => setShowNewProjectDialog(false)}
              initialDescription={aiProposal?.description || aiDirectorInput}
              initialTitle={aiProposal?.title}
              initialArtStyle={aiProposal?.artStyle}
              initialAspectRatio={aiProposal?.aspectRatio}
            />
          )
        }

        {
          showNewSeriesDialog && (
            <NewSeriesDialog
              onConfirm={handleCreateSeries}
              onClose={() => setShowNewSeriesDialog(false)}
            />
          )
        }
      </div>
    </main>
  );
}
