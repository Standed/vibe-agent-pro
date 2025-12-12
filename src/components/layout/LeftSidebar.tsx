'use client';

import { useState } from 'react';
import { FileText, Users, MapPin, Volume2, X, Upload, Trash2, Loader2, Sparkles, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { generateStoryboardFromScript, analyzeScript, groupShotsIntoScenes } from '@/services/storyboardService';
import type { Character, Location, LocationType } from '@/types/project';

type Tab = 'script' | 'characters' | 'locations' | 'audio';

export default function LeftSidebar() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('script');
  const [isGenerating, setIsGenerating] = useState(false);
  const {
    project,
    addScene,
    addShot,
    addCharacter,
    addLocation,
    deleteCharacter,
    deleteLocation,
    leftSidebarCollapsed,
    toggleLeftSidebar
  } = useProjectStore();
  const [scriptContent, setScriptContent] = useState(project?.script || '');

  // Character modal state
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [characterForm, setCharacterForm] = useState({
    name: '',
    description: '',
    appearance: '',
    artStyle: '',
    referenceImages: [] as string[],
  });
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);

  // Location modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationForm, setLocationForm] = useState({
    name: '',
    type: 'interior' as LocationType,
    description: '',
    referenceImages: [] as string[],
  });

  // Audio upload state
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioForm, setAudioForm] = useState({
    name: '',
    type: 'music' as 'music' | 'voice' | 'sfx',
    file: null as File | null,
  });

  const tabs = [
    { id: 'script' as Tab, icon: FileText, label: '剧本' },
    { id: 'characters' as Tab, icon: Users, label: '角色' },
    { id: 'locations' as Tab, icon: MapPin, label: '场景' },
    { id: 'audio' as Tab, icon: Volume2, label: '声音' },
  ];

  const handleAIStoryboard = async () => {
    if (!scriptContent.trim() || !project) {
      alert('请先输入剧本内容');
      return;
    }

    setIsGenerating(true);
    try {
      // 1. Analyze script for metadata
      const analysis = await analyzeScript(scriptContent);

      // 2. Generate storyboard shots with project art style
      const shots = await generateStoryboardFromScript(
        scriptContent,
        project.metadata.artStyle // 传入用户设置的画风
      );

      // 3. Group shots into scenes
      const sceneGroups = await groupShotsIntoScenes(shots);

      // 4. Add scenes and shots to store
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
          const shot = shots.find(s => s.id === shotId);
          if (shot) {
            addShot({ ...shot, sceneId: scene.id });
          }
        });
      });

      alert(`成功生成 ${sceneGroups.length} 个场景，${shots.length} 个镜头！`);
    } catch (error: any) {
      console.error('AI分镜失败:', error);
      alert(`AI分镜生成失败: ${error.message || '请检查API配置'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'character' | 'location'
  ) => {
    const files = Array.from(e.target.files || []);
    const imagePromises = files.map((file) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    const imageUrls = await Promise.all(imagePromises);

    if (type === 'character') {
      setCharacterForm((prev) => ({
        ...prev,
        referenceImages: [...prev.referenceImages, ...imageUrls],
      }));
    } else {
      setLocationForm((prev) => ({
        ...prev,
        referenceImages: [...prev.referenceImages, ...imageUrls],
      }));
    }
  };

  // Generate character turnaround (三视图)
  const handleGenerateCharacterTurnaround = async () => {
    if (!characterForm.name.trim() || !characterForm.appearance.trim()) {
      alert('请输入角色名称和外观特征');
      return;
    }

    setIsGeneratingCharacter(true);
    try {
      const { VolcanoEngineService } = await import('@/services/volcanoEngineService');
      const volcanoService = new VolcanoEngineService();

      // 构建三视图生成 prompt
      const turnaroundPrompt = `角色三视图设计：${characterForm.name}
${characterForm.appearance}
${characterForm.artStyle ? `画风：${characterForm.artStyle}` : ''}

要求：
- 布局：最左边 1/3 位置是超大的面部特写，右边 2/3 放置正视图、侧视图、后视图
- 纯白背景
- 大师级画质，精致的五官描写
- 官方美术设定集风格
- 角色三视图（正面，侧面，背面）
- 带一张面部超大特写
- 专业角色设计，线条清晰
- 保持角色一致性`;

      const imageUrl = await volcanoService.generateSingleImage(turnaroundPrompt, '1024x1024');

      setCharacterForm((prev) => ({
        ...prev,
        referenceImages: [...prev.referenceImages, imageUrl],
      }));

      alert('角色三视图生成成功！');
    } catch (error) {
      console.error('Character turnaround generation error:', error);
      const errorMessage = error instanceof Error ? error.message : '三视图生成失败';
      alert(`生成失败：${errorMessage}`);
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  // Add character
  const handleAddCharacter = () => {
    if (!characterForm.name.trim()) {
      alert('请输入角色名称');
      return;
    }

    const newCharacter: Character = {
      id: crypto.randomUUID(),
      name: characterForm.name,
      description: characterForm.description,
      appearance: characterForm.appearance,
      referenceImages: characterForm.referenceImages,
    };

    addCharacter(newCharacter);
    setCharacterForm({
      name: '',
      description: '',
      appearance: '',
      artStyle: '',
      referenceImages: [],
    });
    setShowCharacterModal(false);
  };

  // Add location
  const handleAddLocation = () => {
    if (!locationForm.name.trim()) {
      alert('请输入场景名称');
      return;
    }

    const newLocation: Location = {
      id: `location_${Date.now()}`,
      name: locationForm.name,
      type: locationForm.type,
      description: locationForm.description,
      referenceImages: locationForm.referenceImages,
    };

    addLocation(newLocation);
    setLocationForm({
      name: '',
      type: 'interior',
      description: '',
      referenceImages: [],
    });
    setShowLocationModal(false);
  };

  // Handle audio file upload
  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioForm((prev) => ({
        ...prev,
        file,
        name: prev.name || file.name.replace(/\.[^/.]+$/, ''),
      }));
    }
  };

  // Add audio asset
  const handleAddAudio = async () => {
    if (!audioForm.file) {
      alert('请选择音频文件');
      return;
    }

    try {
      // Convert audio file to data URL
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;

        const newAudio = {
          id: crypto.randomUUID(),
          name: audioForm.name,
          type: audioForm.type,
          url: dataUrl,
          duration: 0, // Would need to calculate this from audio file
        };

        const { addAudioAsset } = useProjectStore.getState();
        addAudioAsset(newAudio);

        setAudioForm({
          name: '',
          type: 'music',
          file: null,
        });
        setShowAudioModal(false);
        alert('音频添加成功！');
      };
      reader.readAsDataURL(audioForm.file);
    } catch (error) {
      console.error('Audio upload error:', error);
      alert('音频上传失败');
    }
  };

  return (
    <div className={`bg-light-panel dark:bg-cine-dark border-r border-light-border dark:border-cine-border flex flex-col transition-all duration-300 ${leftSidebarCollapsed ? 'w-12' : 'w-80'}`}>
      {leftSidebarCollapsed ? (
        /* Collapsed State */
        <div className="flex flex-col items-center h-full">
          <button
            onClick={toggleLeftSidebar}
            className="p-3 hover:bg-light-bg dark:hover:bg-cine-panel transition-colors mt-4"
            title="展开侧边栏"
          >
            <ChevronRight size={20} className="text-light-text-muted dark:text-cine-text-muted" />
          </button>
        </div>
      ) : (
        /* Expanded State */
        <>
          {/* Home Button */}
          <div className="p-3 border-b border-light-border dark:border-cine-border">
            <button
              onClick={() => router.push('/')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-light-panel dark:bg-cine-panel hover:bg-light-accent/10 dark:hover:bg-cine-accent/10 text-light-text-muted dark:text-cine-text-muted hover:text-light-accent dark:hover:text-cine-accent transition-colors"
              title="返回首页"
            >
              <Home size={18} />
              <span className="text-sm font-medium">返回首页</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-light-border dark:border-cine-border relative">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-colors ${activeTab === tab.id
                    ? 'bg-light-panel dark:bg-cine-panel text-light-accent dark:text-cine-accent border-b-2 border-light-accent dark:border-cine-accent'
                    : 'text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white hover:bg-light-bg/50 dark:hover:bg-cine-panel/50'
                    }`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
            {/* Collapse Button */}
            <button
              onClick={toggleLeftSidebar}
              className="absolute right-2 top-3 p-1 hover:bg-light-bg dark:hover:bg-cine-panel rounded transition-colors"
              title="收起侧边栏"
            >
              <ChevronLeft size={16} className="text-light-text-muted dark:text-cine-text-muted" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'script' && (
              <div>
                <h3 className="text-sm font-bold mb-3 text-light-text dark:text-white">剧本</h3>
                <textarea
                  value={scriptContent}
                  onChange={(e) => setScriptContent(e.target.value)}
                  placeholder="在这里输入你的剧本...&#10;&#10;示例：&#10;场景1: 清晨的咖啡馆&#10;阳光透过玻璃窗洒进来，一位年轻女性独自坐在角落..."
                  className="w-full h-64 bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg p-3 text-sm text-light-text dark:text-white resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                />
                <button
                  onClick={handleAIStoryboard}
                  disabled={isGenerating}
                  className="mt-3 w-full bg-light-accent dark:bg-cine-accent text-white py-2 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'AI 分镜生成中...' : 'AI 自动分镜'}
                </button>
              </div>
            )}

            {activeTab === 'characters' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-light-text dark:text-white">角色列表</h3>
                  <button
                    onClick={() => setShowCharacterModal(true)}
                    className="text-xs bg-light-panel dark:bg-cine-panel px-3 py-1 rounded hover:bg-light-border dark:hover:bg-cine-border text-light-text dark:text-white"
                  >
                    + 添加
                  </button>
                </div>
                {project?.characters && project.characters.length > 0 ? (
                  <div className="space-y-2">
                    {project.characters.map((char) => (
                      <div key={char.id} className="bg-light-panel dark:bg-cine-panel p-3 rounded border border-light-border dark:border-cine-border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-sm text-light-text dark:text-white">{char.name}</div>
                          <button
                            onClick={() => deleteCharacter(char.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">{char.description}</div>
                        {char.referenceImages && char.referenceImages.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {char.referenceImages.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`${char.name} reference ${idx + 1}`}
                                className="w-12 h-12 object-cover rounded"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-light-text-muted dark:text-cine-text-muted text-center py-8">
                    暂无角色
                  </div>
                )}
              </div>
            )}

            {activeTab === 'locations' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-light-text dark:text-white">场景列表</h3>
                  <button
                    onClick={() => setShowLocationModal(true)}
                    className="text-xs bg-light-panel dark:bg-cine-panel px-3 py-1 rounded hover:bg-light-border dark:hover:bg-cine-border text-light-text dark:text-white"
                  >
                    + 添加
                  </button>
                </div>
                {project?.locations && project.locations.length > 0 ? (
                  <div className="space-y-2">
                    {project.locations.map((loc) => (
                      <div key={loc.id} className="bg-light-panel dark:bg-cine-panel p-3 rounded border border-light-border dark:border-cine-border">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-sm text-light-text dark:text-white">{loc.name}</div>
                            <div className="text-xs text-light-accent dark:text-cine-accent">{loc.type === 'interior' ? '室内' : '室外'}</div>
                          </div>
                          <button
                            onClick={() => deleteLocation(loc.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted mb-2">{loc.description}</div>
                        {loc.referenceImages && loc.referenceImages.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {loc.referenceImages.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`${loc.name} reference ${idx + 1}`}
                                className="w-12 h-12 object-cover rounded"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-light-text-muted dark:text-cine-text-muted text-center py-8">
                    暂无场景
                  </div>
                )}
              </div>
            )}

            {activeTab === 'audio' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-light-text dark:text-white">音频素材</h3>
                  <button
                    onClick={() => setShowAudioModal(true)}
                    className="text-xs bg-light-panel dark:bg-cine-panel px-3 py-1 rounded hover:bg-light-border dark:hover:bg-cine-border text-light-text dark:text-white"
                  >
                    + 上传
                  </button>
                </div>
                {project?.audioAssets && project.audioAssets.length > 0 ? (
                  <div className="space-y-2">
                    {project.audioAssets.map((audio) => (
                      <div key={audio.id} className="bg-light-panel dark:bg-cine-panel p-3 rounded border border-light-border dark:border-cine-border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-sm text-light-text dark:text-white">{audio.name}</div>
                          <button
                            onClick={() => {
                              const { deleteAudioAsset } = useProjectStore.getState();
                              deleteAudioAsset(audio.id);
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                          类型: {audio.type === 'music' ? '音乐' : audio.type === 'voice' ? '语音' : '音效'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-light-text-muted dark:text-cine-text-muted text-center py-8">
                    暂无音频
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Character Modal */}
      {showCharacterModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-light-text dark:text-white">添加角色</h3>
              <button onClick={() => setShowCharacterModal(false)} className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">角色名称</label>
                <input
                  type="text"
                  value={characterForm.name}
                  onChange={(e) =>
                    setCharacterForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：李明"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">角色描述</label>
                <textarea
                  value={characterForm.description}
                  onChange={(e) =>
                    setCharacterForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：30岁，侦探"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">外观特征</label>
                <textarea
                  value={characterForm.appearance}
                  onChange={(e) =>
                    setCharacterForm((prev) => ({ ...prev, appearance: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：黑色短发，深色风衣，红色眼睛"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">画风</label>
                <input
                  type="text"
                  value={characterForm.artStyle}
                  onChange={(e) =>
                    setCharacterForm((prev) => ({ ...prev, artStyle: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：赛博朋克、动画、写实"
                />
              </div>

              {/* Generate Character Turnaround Button */}
              <button
                onClick={handleGenerateCharacterTurnaround}
                disabled={isGeneratingCharacter || !characterForm.name.trim() || !characterForm.appearance.trim()}
                className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGeneratingCharacter ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    生成三视图中...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    AI 生成角色三视图
                  </>
                )}
              </button>

              <div className="text-xs text-light-text-muted dark:text-cine-text-muted text-center">
                或手动上传参考图片 ↓
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">参考图片</label>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageUpload(e, 'character')}
                    className="hidden"
                  />
                  <div className="w-full bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors">
                    <Upload size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted" />
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">点击上传参考图片</div>
                  </div>
                </label>
                {characterForm.referenceImages.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {characterForm.referenceImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={img}
                          alt={`Reference ${idx + 1}`}
                          className="w-16 h-16 object-cover rounded"
                        />
                        <button
                          onClick={() =>
                            setCharacterForm((prev) => ({
                              ...prev,
                              referenceImages: prev.referenceImages.filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddCharacter}
                className="w-full bg-light-accent dark:bg-cine-accent text-white py-2 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors"
              >
                添加角色
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-light-text dark:text-white">添加场景</h3>
              <button onClick={() => setShowLocationModal(false)} className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">场景名称</label>
                <input
                  type="text"
                  value={locationForm.name}
                  onChange={(e) =>
                    setLocationForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：咖啡馆"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">场景类型</label>
                <select
                  value={locationForm.type}
                  onChange={(e) =>
                    setLocationForm((prev) => ({
                      ...prev,
                      type: e.target.value as LocationType,
                    }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                >
                  <option value="interior">室内</option>
                  <option value="exterior">室外</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">场景描述</label>
                <textarea
                  value={locationForm.description}
                  onChange={(e) =>
                    setLocationForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：温馨的日式咖啡馆，阳光透过玻璃窗洒进来"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">参考图片</label>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageUpload(e, 'location')}
                    className="hidden"
                  />
                  <div className="w-full bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors">
                    <Upload size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted" />
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">点击上传参考图片</div>
                  </div>
                </label>
                {locationForm.referenceImages.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {locationForm.referenceImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={img}
                          alt={`Reference ${idx + 1}`}
                          className="w-16 h-16 object-cover rounded"
                        />
                        <button
                          onClick={() =>
                            setLocationForm((prev) => ({
                              ...prev,
                              referenceImages: prev.referenceImages.filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddLocation}
                className="w-full bg-light-accent dark:bg-cine-accent text-white py-2 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors"
              >
                添加场景
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Upload Modal */}
      {showAudioModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-lg p-6 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-light-text dark:text-white">上传音频</h3>
              <button onClick={() => setShowAudioModal(false)} className="text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">音频名称</label>
                <input
                  type="text"
                  value={audioForm.name}
                  onChange={(e) =>
                    setAudioForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                  placeholder="例如：背景音乐1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">音频类型</label>
                <select
                  value={audioForm.type}
                  onChange={(e) =>
                    setAudioForm((prev) => ({
                      ...prev,
                      type: e.target.value as 'music' | 'voice' | 'sfx',
                    }))
                  }
                  className="w-full bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm text-light-text dark:text-white focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
                >
                  <option value="music">音乐</option>
                  <option value="voice">语音</option>
                  <option value="sfx">音效</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-light-text dark:text-white">选择文件</label>
                <label className="block">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioFileSelect}
                    className="hidden"
                  />
                  <div className="w-full bg-light-panel dark:bg-cine-panel hover:bg-light-border dark:hover:bg-cine-border border border-light-border dark:border-cine-border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors">
                    <Upload size={24} className="mx-auto mb-2 text-light-text-muted dark:text-cine-text-muted" />
                    <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                      {audioForm.file ? audioForm.file.name : '点击选择音频文件'}
                    </div>
                  </div>
                </label>
              </div>

              <button
                onClick={handleAddAudio}
                disabled={!audioForm.file}
                className="w-full bg-light-accent dark:bg-cine-accent text-white py-2 px-4 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上传音频
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
