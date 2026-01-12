import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, Pencil, Sparkles, Wand2, Video } from 'lucide-react';
import { UseSoraCharacterReturn } from '@/hooks/useSoraCharacter';
import { Character } from '@/types/project';

interface SoraReferenceSectionProps {
    sora: UseSoraCharacterReturn;
    persistCharacter: (options: { closeAfter: boolean; showToast: boolean }) => Promise<Character | null>;
}

export function SoraReferenceSection({ sora, persistCharacter }: SoraReferenceSectionProps) {
    const {
        soraStatus, setSoraStatus,
        soraUsername, setSoraUsername,
        soraReferenceVideoUrl, setSoraReferenceVideoUrl,
        isSoraProcessing, setIsSoraProcessing,
        isRefreshing, isWritingSoraCode,
        currentTaskId,
        videoDuration,
        segmentStart, setSegmentStart,
        segmentEnd, setSegmentEnd,
        hasSoraCode,
        savedCharacterId, setSavedCharacterId,
        handleSoraRegister,
        handleManualRefresh,
        handleManualSoraCodeWriteback,
    } = sora;

    return (
        <div className="mt-6 pt-6 border-t border-black/5 dark:border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20">
                        <Video className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Sora 角色一致性</h3>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">注册角色 ID 以确保视频生成的一致性</p>
                    </div>
                </div>
                <div className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                    soraStatus === 'registered'
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                        : (soraStatus === 'generating' || soraStatus === 'registering')
                            ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                            : (soraStatus === 'pending')
                                ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/20"
                                : "bg-zinc-50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10"
                )}>
                    {soraStatus === 'registered' ? 'Active' :
                        (soraStatus === 'generating' || soraStatus === 'registering') ? 'Processing' :
                            soraStatus === 'pending' ? 'Ready' : 'Inactive'}
                </div>
            </div>
            <div className="flex items-center justify-between mb-4 text-[10px] text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                    {!savedCharacterId ? (
                        <button
                            type="button"
                            onClick={() => void persistCharacter({ closeAfter: false, showToast: true })}
                            className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 transition-colors"
                        >
                            保存并继续
                        </button>
                    ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">已保存</span>
                    )}
                    <button
                        type="button"
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 transition-colors"
                    >
                        {isRefreshing ? '刷新中...' : '刷新状态'}
                    </button>
                </div>
            </div>


            <div className="mb-4 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>步骤：1 保存角色 → 2 生成参考视频 → 3 注册 Sora ID</span>
            </div>

            {
                soraReferenceVideoUrl && soraStatus !== 'registered' && (
                    <div className="mb-3 rounded-lg border border-dashed border-zinc-200 dark:border-white/10 p-3 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <div className="flex items-center justify-between gap-3">
                            <span>选择注册片段（秒）</span>
                            <span>{videoDuration ? `视频时长 ${videoDuration.toFixed(2)}s` : '时长读取中...'}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={segmentStart}
                                onChange={(e) => setSegmentStart(e.target.value)}
                                className="w-20 rounded-md border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-black/30 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200"
                                placeholder="开始"
                            />
                            <span className="text-zinc-400">到</span>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                max={videoDuration ? videoDuration.toFixed(2) : undefined}
                                value={segmentEnd}
                                onChange={(e) => setSegmentEnd(e.target.value)}
                                className="w-20 rounded-md border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-black/30 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200"
                                placeholder="结束"
                            />
                        </div>
                    </div>
                )
            }

            <div className="relative group overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                {/* Status Background Effect */}
                <div className={cn(
                    "absolute inset-0 opacity-0 transition-opacity duration-500",
                    soraStatus === 'registered' ? "bg-gradient-to-br from-emerald-500/5 to-transparent opacity-100" :
                        (soraStatus === 'generating' || soraStatus === 'registering') ? "bg-gradient-to-br from-amber-500/5 to-transparent opacity-100" :
                            soraStatus === 'pending' ? "bg-gradient-to-br from-sky-500/5 to-transparent opacity-100" : ""
                )} />

                <div className="relative p-5">
                    {soraStatus === 'registered' ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center border-4 border-white dark:border-white/5 shadow-sm">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Sora Identity Reference</p>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 group/edit relative w-fit">
                                            <input
                                                type="text"
                                                value={soraUsername}
                                                onChange={(e) => {
                                                    const val = e.target.value.trim();
                                                    setSoraUsername(val);
                                                    if (val === '') {
                                                        setSoraStatus('none');
                                                    }
                                                }}
                                                className="px-3 py-1.5 rounded-md bg-white dark:bg-black/50 border-2 border-zinc-200 dark:border-white/10 text-sm font-mono font-bold text-black dark:text-white w-48 shadow-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                                            />
                                            <Pencil className="w-3 h-3 text-zinc-400 opacity-0 group-hover/edit:opacity-100 transition-opacity absolute -right-5 top-1/2 -translate-y-1/2 cursor-pointer" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleManualSoraCodeWriteback}
                                            disabled={isWritingSoraCode || !soraUsername.trim()}
                                            className={cn(
                                                "px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                                                isWritingSoraCode || !soraUsername.trim()
                                                    ? "border-zinc-200 dark:border-white/10 text-zinc-400 cursor-not-allowed"
                                                    : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                            )}
                                        >
                                            {isWritingSoraCode ? '写回中' : '写回'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {soraReferenceVideoUrl && (
                                <div className="mt-1 p-2 rounded-lg bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 flex items-center gap-3">
                                    <div className="h-8 w-12 rounded bg-black flex items-center justify-center overflow-hidden">
                                        <video src={soraReferenceVideoUrl} className="w-full h-full object-cover opacity-80" />
                                    </div>
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">参考视频已绑定</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2",
                                    isSoraProcessing
                                        ? "border-amber-100 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10"
                                        : "border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10"
                                )}>
                                    {isSoraProcessing ? (
                                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-5 h-5 text-indigo-500" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-1">
                                        {isSoraProcessing ? "正在处理中..." : "建立角色一致性"}
                                    </h4>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                        {isSoraProcessing
                                            ? (soraReferenceVideoUrl
                                                ? "正在使用参考视频注册 Sora 身份 ID。"
                                                : "正在生成 10s 参考视频并注册角色 ID。")
                                            : (soraReferenceVideoUrl
                                                ? "参考视频已就绪，可直接注册 Sora 身份 ID。"
                                                : "系统将使用参考图片生成 10s 标准动态视频，并自动注册角色 ID (消耗积分)。")}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleSoraRegister}
                                disabled={isSoraProcessing || hasSoraCode}
                                className={cn(
                                    "w-full py-3 text-sm font-bold rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group",
                                    isSoraProcessing || hasSoraCode
                                        ? "bg-zinc-100 dark:bg-white/5 text-zinc-400 cursor-not-allowed"
                                        : "bg-black/90 text-white dark:bg-white/90 dark:text-black backdrop-blur-md shadow-xl shadow-black/10 dark:shadow-white/5 hover:scale-[1.02] active:scale-[0.98] ring-1 ring-white/10 dark:ring-black/5"
                                )}
                            >
                                {/* Glossy Reflection Effect */}
                                {!isSoraProcessing && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                )}

                                {isSoraProcessing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>处理中...</span>
                                    </>
                                ) : (
                                    <>
                                        {hasSoraCode ? '已填写 Sora ID' : (soraReferenceVideoUrl ? '立即注册角色 ID' : '生成视频并注册')}
                                        <Wand2 className="w-4 h-4 opacity-80 group-hover:rotate-12 transition-transform duration-300" />
                                    </>
                                )}
                            </button>
                            <div className="mt-3 flex items-center justify-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">已有 Sora ID?</span>
                                <input
                                    type="text"
                                    placeholder="输入 @ch_..."
                                    className="bg-transparent border-b-2 border-zinc-400 dark:border-white/20 text-xs py-1 focus:outline-none focus:border-emerald-500 w-28 text-zinc-900 dark:text-white placeholder-zinc-500 font-mono text-center font-medium"
                                    onChange={(e) => {
                                        const val = e.target.value.trim();
                                        setSoraUsername(val);
                                        if (val) {
                                            setSoraStatus('registered');
                                        } else {
                                            setSoraStatus('none');
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleManualSoraCodeWriteback}
                                    disabled={isWritingSoraCode || !soraUsername.trim()}
                                    className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                                        isWritingSoraCode || !soraUsername.trim()
                                            ? "border-zinc-200 dark:border-white/10 text-zinc-400 cursor-not-allowed"
                                            : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                    )}
                                >
                                    {isWritingSoraCode ? '写回中' : '写回'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
