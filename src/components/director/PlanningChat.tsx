'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, FileText, Users, MapPin, MessageSquare, Wand2, CheckCircle2, Circle, Send, Loader2 } from 'lucide-react';
import { ChatMessage, Project } from '@/types/project';
import { ChatBubble } from '@/components/chat/ChatBubble';
import ThinkingProcess, { ThinkingStep } from '@/components/agent/ThinkingProcess';
import { cn } from '@/lib/utils';

interface PlanningChatProps {
    messages: ChatMessage[];
    thinkingSteps: ThinkingStep[];
    isProcessing: boolean;
    isGenerating: boolean;
    currentStep: any;
    inputText: string;
    setInputText: (text: string) => void;
    handleSendMessage: (text?: string) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    messagesTopRef: React.RefObject<HTMLDivElement | null>;
}

export default function PlanningChat({
    messages,
    thinkingSteps,
    isProcessing,
    isGenerating,
    currentStep,
    inputText,
    setInputText,
    handleSendMessage,
    messagesEndRef,
    messagesTopRef
}: PlanningChatProps) {
    return (
        <div className="flex-1 flex flex-col relative bg-white dark:bg-[#0a0a0a] overflow-hidden">
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-8">
                    <div ref={messagesTopRef} />

                    {messages.length === 0 && !isGenerating && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="py-20 text-center space-y-8"
                        >
                            <div className="relative inline-block">
                                <div className="absolute inset-0 bg-light-accent/20 blur-3xl rounded-full" />
                                <Sparkles size={64} className="relative mx-auto text-light-accent dark:text-cine-accent opacity-50" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">准备好开始你的创作了吗？</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto text-sm leading-relaxed">
                                    我是你的 AI 导演助手。你可以告诉我你的故事大纲，我会帮你完善剧本，并自动生成角色和场景设计。
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                                {[
                                    { icon: <FileText size={16} />, text: '帮我完善剧本', prompt: '请根据我目前的创意，帮我完善一下剧本，增加一些戏剧冲突和细节描写。' },
                                    { icon: <Users size={16} />, text: '设计主要角色', prompt: '请根据剧本内容，为我设计 3 个性格鲜明的主要角色，包含外貌和性格描述。' },
                                    { icon: <MapPin size={16} />, text: '构思关键场景', prompt: '这个故事需要哪些关键场景？请帮我列出并描述它们的视觉风格。' },
                                    { icon: <MessageSquare size={16} />, text: '分析故事节奏', prompt: '请分析一下我目前剧本的节奏，并给出改进建议。' },
                                ].map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSendMessage(item.prompt)}
                                        disabled={isProcessing || isGenerating}
                                        className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 hover:border-light-accent/30 dark:hover:border-cine-accent/30 hover:bg-white dark:hover:bg-white/10 transition-all text-left group disabled:opacity-50"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                            {item.icon}
                                        </div>
                                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{item.text}</span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {messages.map((msg) => (
                        <ChatBubble key={msg.id} message={msg as any} />
                    ))}

                    {/* Thinking Process */}
                    {isProcessing && thinkingSteps.length > 0 && (
                        <ThinkingProcess steps={thinkingSteps} />
                    )}

                    {/* AI Storyboard Progress */}
                    {isGenerating && currentStep && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-3 justify-start"
                        >
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white/10 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                                <Sparkles size={16} className="text-white" />
                            </div>
                            <div className="flex-1 max-w-xl">
                                <div className="bg-white dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl p-6 border border-black/5 dark:border-white/10 shadow-2xl">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 rounded-xl bg-light-accent/10 dark:bg-cine-accent/10">
                                            <Wand2 size={18} className="text-light-accent dark:text-cine-accent animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-zinc-900 dark:text-white tracking-tight">嘿！我已经为你规划好了创作流程</h3>
                                            <p className="text-[10px] text-zinc-500 font-medium">让我们一起把这个精彩的故事变成现实吧！</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {[1, 2, 3, 4, 5].map((step) => {
                                            const stepStatus = currentStep.step > step ? 'completed' : currentStep.step === step ? currentStep.status : 'pending';
                                            const stepTitles = [
                                                '构建短片的核心故事线和情节发展',
                                                '确定整体视觉风格和美术表现形式',
                                                '设计短片中的主要角色形象和特征',
                                                '设计短片中出现的各个场景',
                                                '绘制详细的分镜图，规划镜头语言'
                                            ];

                                            return (
                                                <div key={step} className="group">
                                                    <div className="flex items-start gap-3">
                                                        <div className={cn(
                                                            "mt-0.5 transition-colors duration-300",
                                                            stepStatus === 'completed' ? "text-emerald-500" :
                                                                stepStatus === 'running' ? "text-light-accent dark:text-cine-accent" : "text-zinc-300 dark:text-zinc-700"
                                                        )}>
                                                            {stepStatus === 'completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                                        </div>
                                                        <div className="flex-1 space-y-1">
                                                            <div className={cn(
                                                                "text-xs font-bold transition-colors duration-300",
                                                                stepStatus === 'completed' || stepStatus === 'running' ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                                                            )}>
                                                                {stepTitles[step - 1]}
                                                            </div>
                                                            {stepStatus === 'running' && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, height: 0 }}
                                                                    animate={{ opacity: 1, height: 'auto' }}
                                                                    className="text-xs text-zinc-500 flex items-center gap-2"
                                                                >
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                    <span>{currentStep.description}</span>
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Chat Input Area */}
            <div className="p-8 bg-gradient-to-t from-white via-white to-transparent dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-transparent">
                <div className="max-w-3xl mx-auto relative">
                    <div className="relative group">
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            disabled={isProcessing || isGenerating}
                            placeholder="描述你的创意，或者让 AI 帮你完善... (@ 引用资源)"
                            className="w-full p-6 pr-24 text-sm bg-zinc-50 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-3xl focus:outline-none focus:ring-2 focus:ring-light-accent/20 dark:focus:ring-cine-accent/20 transition-all resize-none min-h-[100px] max-h-[300px] custom-scrollbar disabled:opacity-50"
                        />
                        <div className="absolute right-4 bottom-4 flex items-center gap-2">
                            <button
                                onClick={() => handleSendMessage()}
                                disabled={!inputText.trim() || isProcessing || isGenerating}
                                className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-black/10 dark:shadow-white/10"
                            >
                                {isProcessing || isGenerating ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Send size={18} />
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Enter</span>
                                <span className="text-[10px] text-zinc-400 font-medium">发送</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Shift + Enter</span>
                                <span className="text-[10px] text-zinc-400 font-medium">换行</span>
                            </div>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium">
                            使用 @ 引用角色/场景
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
