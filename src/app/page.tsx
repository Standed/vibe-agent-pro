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
import type { Project, Series, Character } from '@/types/project';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSeriesId = searchParams.get('seriesId');

  const { createNewProject, project } = useProjectStore();
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

  // 加载数据
  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [user, authLoading, currentSeriesId]);

  const loadData = async () => {
    console.log('[HomePage] 🔄 开始加载数据...');
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
      console.log('[HomePage] Raw projects:', allProjects);
      console.log('[HomePage] Raw series:', allSeries);
      console.log('[HomePage] Global characters:', allGlobalCharacters);

      setProjects(allProjects);
      setSeries(allSeries);
      setGlobalCharacters(allGlobalCharacters);
      console.log('[HomePage] ✅ 数据加载完成', { projects: allProjects.length, series: allSeries.length });
    } catch (error) {
      console.error('[HomePage] ❌ 加载失败:', error);
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
    if (!aiDirectorInput.trim()) return;

    setIsAiBrainstorming(true);
    setAiProposal(null); // Reset previous proposal

    try {
      const response = await fetch('/api/ai/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: aiDirectorInput,
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
      // Fallback: open dialog with raw input as description
      setAiProposal({ description: aiDirectorInput });
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
      createNewProject(title, description, artStyle, aspectRatio);
      await new Promise(resolve => setTimeout(resolve, 100));
      const currentProject = useProjectStore.getState().project;

      if (!currentProject) throw new Error('Project creation failed');

      if (currentSeriesId) {
        currentProject.seriesId = currentSeriesId;
      }

      await dataService.saveProject(currentProject, user?.id);

      setShowNewProjectDialog(false);
      router.push(`/project/${currentProject.id}/planning`);
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
    <main className="min-h-screen bg-light-bg dark:bg-cine-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="https://storage.googleapis.com/n8n-bucket-xys/%E7%AB%96%E7%89%88logo%E9%80%8F%E6%98%8E%E5%BA%95.png"
                alt="Logo"
                width={40}
                height={40}
                className="object-contain"
              />
              <h1 className="text-2xl font-bold text-light-text dark:text-white hidden md:block">
                {t('common.appName')}
              </h1>
            </Link>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

            <Link
              href="/assets"
              className="flex items-center gap-2 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent transition-colors"
            >
              <ImageIcon size={18} />
              <span className="text-sm font-medium">素材库</span>
            </Link>
          </div>
          <UserNav />
        </header>

        {/* AI Director Hero Section */}
        {/* AI Director Hero Section */}
        {!currentSeriesId && (
          <section className="mb-20 text-center relative">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-light-accent/10 dark:bg-cine-accent/5 blur-[120px] rounded-full -z-10" />

            <h2 className="text-5xl md:text-6xl font-black text-zinc-900 dark:text-white mb-10 tracking-tight leading-tight">
              有什么新的故事灵感？
            </h2>

            <div className="max-w-4xl mx-auto px-4">
              <form
                onSubmit={handleAiDirectorSubmit}
                className="relative bg-white/40 dark:bg-zinc-900/40 border border-white/20 dark:border-white/10 rounded-[40px] p-3 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] focus-within:border-light-accent/40 dark:focus-within:border-cine-accent/40 transition-all backdrop-blur-[40px] saturate-150"
              >
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={aiDirectorInput}
                    onChange={handleTextareaChange}
                    placeholder="输入你的灵感，输入 @ 召唤角色..."
                    rows={4}
                    className="w-full bg-transparent border-none py-6 px-8 text-xl focus:outline-none focus:ring-0 resize-none text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-medium leading-relaxed"
                  />

                  {/* @ Mention Menu */}
                  <AnimatePresence>
                    {mentionState.visible && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-8 top-20 w-64 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl p-2 shadow-2xl z-50 max-h-60 overflow-y-auto"
                      >
                        <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">召唤全局角色</div>
                        {globalCharacters
                          .filter(c => c.name.toLowerCase().includes(mentionState.filter.toLowerCase()))
                          .map((char) => (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => insertMention(char)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-light-accent/20 to-cine-accent/20 flex items-center justify-center text-xs font-bold border border-white/20">
                                {char.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{char.name}</div>
                                <div className="text-[10px] text-zinc-500 truncate">{char.description || '无描述'}</div>
                              </div>
                            </button>
                          ))}
                        {globalCharacters.length === 0 && (
                          <div className="px-3 py-4 text-center text-xs text-zinc-500">暂无全局角色</div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-6 mb-2">
                  {selectedCharacters.map(id => {
                    const char = globalCharacters.find(c => c.id === id);
                    if (!char) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 px-3 py-1 bg-light-accent/10 dark:bg-cine-accent/10 border border-light-accent/20 dark:border-cine-accent/20 rounded-full text-[11px] font-bold text-light-accent dark:text-cine-accent">
                        <UserCircle2 size={12} />
                        {char.name}
                        <button type="button" onClick={() => toggleCharacter(id)} className="hover:text-red-500 transition-colors">
                          <Plus size={12} className="rotate-45" />
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between px-6 pb-4">
                  <div className="flex items-center gap-2">
                    {/* 上传剧本 */}
                    <label className="p-3 rounded-2xl hover:bg-white/20 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 cursor-pointer transition-all group relative active:scale-95">
                      <FileText size={22} />
                      <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none shadow-xl">上传剧本</span>
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
                              setAiDirectorInput(content.slice(0, 2000) + (content.length > 2000 ? '...' : ''));
                              toast.success(`已导入剧本: ${file.name}`);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </label>

                    {/* 上传分镜脚本 */}
                    <label className="p-3 rounded-2xl hover:bg-white/20 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 cursor-pointer transition-all group relative active:scale-95">
                      <Upload size={22} />
                      <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none shadow-xl">上传分镜脚本</span>
                      <input
                        type="file"
                        accept=".json,.txt,.md"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const content = ev.target?.result as string;
                              setAiDirectorInput(`[分镜脚本] ${file.name}`);
                              toast.success(`已导入分镜脚本: ${file.name}`);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </label>

                    <div className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-2" />

                    {/* 角色多选 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowSubjectMenu(!showSubjectMenu); setShowStyleMenu(false); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-all text-xs font-bold border border-white/20 dark:border-white/5 active:scale-95"
                      >
                        <UserCircle2 size={16} />
                        <span>选择角色 ({selectedCharacters.length})</span>
                        <ChevronDown size={14} className={cn("transition-transform", showSubjectMenu && "rotate-180")} />
                      </button>

                      <AnimatePresence>
                        {showSubjectMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-3 left-0 w-64 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl p-2 shadow-2xl z-50 max-h-80 overflow-y-auto"
                          >
                            <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">我的全局角色库</div>
                            {globalCharacters.map((char) => (
                              <button
                                key={char.id}
                                type="button"
                                onClick={() => toggleCharacter(char.id)}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors",
                                  selectedCharacters.includes(char.id)
                                    ? "bg-light-accent/20 dark:bg-cine-accent/20 text-light-accent dark:text-cine-accent"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
                                )}
                              >
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] border",
                                  selectedCharacters.includes(char.id) ? "border-current" : "border-zinc-200 dark:border-white/10"
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
                                <Link href="/assets" className="text-[10px] font-bold text-light-accent dark:text-cine-accent hover:underline">去素材库创建</Link>
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
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-all text-xs font-bold border border-white/20 dark:border-white/5 active:scale-95"
                      >
                        <Palette size={16} />
                        <span>{selectedArtStyle}</span>
                        <ChevronDown size={14} className={cn("transition-transform", showStyleMenu && "rotate-180")} />
                      </button>

                      <AnimatePresence>
                        {showStyleMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-3 left-0 w-48 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl p-2 shadow-2xl z-50"
                          >
                            {artStyles.map((style) => (
                              <button
                                key={style.name}
                                type="button"
                                onClick={() => { setSelectedArtStyle(style.name); setShowStyleMenu(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors",
                                  selectedArtStyle === style.name
                                    ? "bg-light-accent dark:bg-cine-accent text-white dark:text-black"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
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
                  </div>

                  <button
                    type="submit"
                    disabled={isAiBrainstorming || !aiDirectorInput.trim()}
                    className={cn(
                      "group relative flex items-center justify-center w-14 h-14 rounded-full transition-all shadow-xl disabled:opacity-20 disabled:scale-100 disabled:cursor-not-allowed overflow-hidden",
                      isAiBrainstorming
                        ? "bg-zinc-900 dark:bg-zinc-100 scale-110"
                        : "bg-zinc-900 dark:bg-zinc-100 hover:scale-110 active:scale-95"
                    )}
                  >
                    {/* Rotating Glow Effect for Loading */}
                    {isAiBrainstorming && (
                      <div className="absolute inset-0">
                        <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0%,#3b82f6_30%,transparent_100%)] animate-[spin_2s_linear_infinite]" />
                        <div className="absolute inset-[2px] bg-zinc-900 dark:bg-zinc-100 rounded-full z-10" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-tr from-light-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {isAiBrainstorming ? (
                      <div className="relative z-20 flex items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-zinc-100 dark:text-zinc-900" />
                      </div>
                    ) : (
                      <ArrowRight size={24} className="relative z-10 text-zinc-100 dark:text-zinc-900" />
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-10 flex flex-wrap justify-center gap-4">
                {['婚礼上的背叛', '小猫游九寨沟', '风魔劫', '三生三世的羁绊'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setAiDirectorInput(tag)}
                    className="px-6 py-2.5 bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-all flex items-center gap-3 border border-white/20 dark:border-white/5 backdrop-blur-md hover:scale-105 active:scale-95 shadow-sm"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 flex-shrink-0 border border-white/20">
                      <div className="w-full h-full bg-gradient-to-br from-light-accent/40 to-cine-accent/40 animate-pulse" />
                    </div>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Breadcrumb if in Series */}
        {currentSeriesId && activeSeries && (
          <div className="mb-6 flex items-center gap-2 text-lg">
            <Link href="/" className="text-light-text-muted hover:text-light-text dark:text-cine-text-muted dark:hover:text-white transition-colors">首页</Link>
            <span className="text-gray-400">/</span>
            <span className="font-bold text-light-text dark:text-white flex items-center gap-2">
              <Folder size={20} className="text-light-accent dark:text-cine-accent" />
              {activeSeries.title}
            </span>
          </div>
        )}

        {/* Content Controls */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              {currentSeriesId ? '剧集内容' : '全部作品'}
            </h3>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">
              {currentSeriesId ? '该剧集下的所有分集' : '您最近的项目和剧集'}
            </p>
          </div>
          <div className="flex gap-3">
            {!currentSeriesId && (
              <button
                onClick={() => setShowNewSeriesDialog(true)}
                className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 px-5 py-2.5 rounded-2xl font-bold hover:border-zinc-900 dark:hover:border-white transition-all active:scale-95 shadow-sm"
              >
                <Folder size={18} />
                <span>新建剧集</span>
              </button>
            )}
            <button
              onClick={() => setShowNewProjectDialog(true)}
              className="inline-flex items-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-2.5 rounded-2xl font-bold hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-black/10 dark:shadow-white/10"
            >
              <Plus size={18} />
              <span>{currentSeriesId ? '新建分集' : '新建项目'}</span>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {isLoading ? (
            <div className="col-span-full py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
              <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">正在加载...</p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="col-span-full py-32 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[32px] flex flex-col items-center justify-center gap-4 bg-zinc-50/50 dark:bg-white/5">
              <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <Film size={24} className="text-zinc-400" />
              </div>
              <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">暂无作品</p>
            </div>
          ) : (
            displayedItems.map((item) => {
              if (item.type === 'series') {
                const s = item.data as Series;
                return (
                  <Link
                    key={`series-${s.id}`}
                    href={`/?seriesId=${s.id}`}
                    className="group relative flex flex-col bg-white dark:bg-zinc-900 rounded-[32px] border border-black/5 dark:border-white/10 p-4 transition-all duration-500 hover:shadow-2xl hover:shadow-black/5 dark:hover:shadow-white/5 hover:-translate-y-1"
                  >
                    <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[24px] mb-4 flex items-center justify-center relative overflow-hidden">
                      {s.coverImage ? (
                        <img src={s.coverImage} alt={s.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 opacity-20">
                          <Folder size={40} className="text-zinc-900 dark:text-white" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-zinc-900/90 dark:bg-white/90 backdrop-blur-md rounded-full shadow-lg">
                        <span className="text-[10px] font-black text-white dark:text-zinc-900 uppercase tracking-tighter">剧集</span>
                      </div>
                    </div>
                    <div className="px-2 pb-2">
                      <h4 className="font-black text-zinc-900 dark:text-white truncate tracking-tight">{s.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{formatDate(s.updated)}</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">合集</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSeries(s.id, e)}
                      className="absolute top-6 right-6 p-2 bg-red-500 text-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 hover:scale-110"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Link>
                );
              } else {
                const p = item.data as Project;
                return (
                  <Link
                    key={`proj-${p.id}`}
                    href={`/project/${p.id}`}
                    className="group relative flex flex-col bg-white dark:bg-zinc-900 rounded-[32px] border border-black/5 dark:border-white/10 p-4 transition-all duration-500 hover:shadow-2xl hover:shadow-black/5 dark:hover:shadow-white/5 hover:-translate-y-1"
                  >
                    <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[24px] mb-4 flex items-center justify-center relative overflow-hidden">
                      {p.shots?.find(s => s.referenceImage)?.referenceImage ? (
                        <img src={p.shots.find(s => s.referenceImage)!.referenceImage} alt={p.metadata.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 opacity-20">
                          <Film size={40} className="text-zinc-900 dark:text-white" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-full shadow-lg border border-black/5 dark:border-white/10">
                        <span className="text-[10px] font-black text-zinc-900 dark:text-white uppercase tracking-tighter">项目</span>
                      </div>
                    </div>
                    <div className="px-2 pb-2">
                      <h4 className="font-black text-zinc-900 dark:text-white truncate tracking-tight">{p.metadata.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{formatDate(p.metadata.modified)}</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                          <Film size={10} /> {p.shots?.length || 0} 个分镜
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteProject(p.id, e)}
                      className="absolute top-6 right-6 p-2 bg-red-500 text-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 hover:scale-110"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Link>
                );
              }
            })
          )}
        </div>

        {showNewProjectDialog && (
          <NewProjectDialog
            onConfirm={handleCreateProject}
            onClose={() => setShowNewProjectDialog(false)}
            initialDescription={aiProposal?.description || aiDirectorInput}
            initialTitle={aiProposal?.title}
            initialArtStyle={aiProposal?.artStyle}
            initialAspectRatio={aiProposal?.aspectRatio}
          />
        )}

        {showNewSeriesDialog && (
          <NewSeriesDialog
            onConfirm={handleCreateSeries}
            onClose={() => setShowNewSeriesDialog(false)}
          />
        )}
      </div>
    </main>
  );
}
