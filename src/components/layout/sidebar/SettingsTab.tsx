import React, { useState, useEffect } from 'react';
import { Project, AspectRatio } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { Sparkles, Layout, Type, Palette, Save } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsTabProps {
    project: Project;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ project }) => {
    const { updateProjectMetadata, updateProjectSettings } = useProjectStore();

    // Local state for form fields to avoid excessive re-renders/saving on every keystroke
    const [title, setTitle] = useState(project.metadata.title || '');
    const [description, setDescription] = useState(project.metadata.description || '');
    const [artStyle, setArtStyle] = useState(project.metadata.artStyle || '智能推荐');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
        (project.settings.aspectRatio as AspectRatio) || AspectRatio.MOBILE
    );

    // Sync from project when it changes (external updates)
    useEffect(() => {
        setTitle(project.metadata.title || '');
        setDescription(project.metadata.description || '');
        setArtStyle(project.metadata.artStyle || '智能推荐');
        // Ensure type safety for enum
        const ratio = project.settings.aspectRatio as AspectRatio;
        setAspectRatio(Object.values(AspectRatio).includes(ratio) ? ratio : AspectRatio.MOBILE);
    }, [project.metadata.title, project.metadata.description, project.metadata.artStyle, project.settings.aspectRatio]);

    const handleSave = () => {
        // Update Metadata (including Art Style)
        if (title !== project.metadata.title || description !== project.metadata.description || artStyle !== project.metadata.artStyle) {
            updateProjectMetadata({
                title,
                description,
                artStyle
            });
        }

        // Update Settings
        if (aspectRatio !== project.settings.aspectRatio) {
            updateProjectSettings({
                aspectRatio
            });
        }

        toast.success('项目设置已保存');
    };

    const artStyles = [
        '智能推荐', '写实电影', '二次元动漫', '赛博朋克', '水墨国风', '美漫风格',
        '皮克斯3D', '油画风格', '极简插画', '老照片'
    ];

    const aspectRatios = [
        { value: AspectRatio.WIDE, label: '16:9 (横屏/电影)', icon: '▭' },
        { value: AspectRatio.MOBILE, label: '9:16 (竖屏/抖音)', icon: '▯' },
        { value: AspectRatio.STANDARD, label: '4:3 (传统电视)', icon: '□' },
        { value: AspectRatio.PORTRAIT, label: '3:4 (小红书)', icon: '▯' },
        { value: AspectRatio.SQUARE, label: '1:1 (正方形)', icon: '□' },
        { value: AspectRatio.CINEMA, label: '21:9 (宽银幕)', icon: '▬' },
    ];

    return (
        <div className="p-6 space-y-8 pb-20">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Type size={18} />
                    项目信息
                </h3>
            </div>

            {/* Title */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">项目名称</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white/50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent transition-all"
                    placeholder="请输入项目名称"
                />
            </div>

            {/* Description (Initial Prompt) */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">初始提示词 / 故事梗概</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    className="w-full bg-white/50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent transition-all resize-none"
                    placeholder="描述你的故事梗概..."
                />
            </div>

            <hr className="border-black/5 dark:border-white/5" />

            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Palette size={18} />
                    生成参数
                </h3>
            </div>

            {/* Art Style */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">艺术风格</label>
                <div className="space-y-3">
                    {/* Custom Input */}
                    <div className="relative">
                        <input
                            type="text"
                            value={artStyle}
                            onChange={(e) => setArtStyle(e.target.value)}
                            maxLength={50}
                            className="w-full bg-white/50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-cine-accent transition-all pl-10"
                            placeholder="选择下方风格或手动输入..."
                        />
                        <Palette size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">
                            {artStyle.length}/50
                        </div>
                    </div>

                    {/* Presets */}
                    <div className="grid grid-cols-2 gap-2">
                        {artStyles.map((style) => (
                            <button
                                key={style}
                                onClick={() => setArtStyle(style)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center justify-between group ${artStyle === style
                                    ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent text-light-accent dark:text-cine-accent'
                                    : 'bg-white/30 dark:bg-white/5 border-transparent hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400'
                                    }`}
                            >
                                <span>{style}</span>
                                {artStyle === style && <Sparkles size={12} className="animate-pulse" />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">画面比例</label>
                <div className="grid grid-cols-1 gap-2">
                    {aspectRatios.map((ratio) => (
                        <button
                            key={ratio.value}
                            onClick={() => setAspectRatio(ratio.value as AspectRatio)}
                            className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all flex items-center gap-3 ${aspectRatio === ratio.value
                                ? 'bg-light-accent/10 dark:bg-cine-accent/10 border-light-accent dark:border-cine-accent text-light-accent dark:text-cine-accent'
                                : 'bg-white/30 dark:bg-white/5 border-transparent hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            <span className="text-lg opacity-50 font-mono">{ratio.icon}</span>
                            <span>{ratio.label}</span>
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-orange-500 mt-2 bg-orange-500/10 p-2 rounded border border-orange-500/20">
                    ⚠️ 注意：修改比例将影响所有后续生成的图片和视频。已生成的内容不会自动裁剪，但预览可能会发生变化。
                </p>
            </div>


            {/* Save Button (Floating at bottom of scroll container) */}
            <div className="sticky bottom-0 pt-4 bg-gradient-to-t from-white/95 via-white/95 to-transparent dark:from-zinc-900/95 dark:via-zinc-900/95 pb-0 -mx-6 px-6">
                <button
                    onClick={handleSave}
                    className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    <Save size={16} />
                    保存修改
                </button>
            </div>
        </div>
    );
};
