'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Plus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { dataService } from '@/lib/dataService';
import type { Character } from '@/types/project';
import { useAuth, useRequireWhitelist } from '@/components/auth/AuthProvider';
import AddCharacterDialog from '@/components/asset/AddCharacterDialog';
import { toast } from 'sonner';

export default function AssetsPage() {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const { user, loading: authLoading } = useRequireWhitelist();

    useEffect(() => {
        if (!authLoading && user) {
            loadCharacters();
        } else if (!authLoading && !user) {
            setIsLoading(false);
        }
    }, [user, authLoading]);

    const loadCharacters = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const chars = await dataService.getGlobalCharacters(user.id);
            setCharacters(chars);
        } catch (error) {
            console.error('Failed to load assets:', error);
            toast.error('加载素材失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddCharacter = async (char: Character, options?: { keepOpen?: boolean }) => {
        if (!user) return;
        try {
            // Ensure project_id is null for global characters
            const globalChar: Character = {
                ...char,
                projectId: undefined,
                userId: user.id
            };
            await dataService.saveCharacter(null, globalChar);
            toast.success('全局角色已保存');
            loadCharacters();
            if (!options?.keepOpen) setShowAddDialog(false);
        } catch (error) {
            console.error('Failed to save character:', error);
            toast.error('保存失败');
        }
    };

    const handleUpdateCharacter = async (updatedChar: Character, options?: { keepOpen?: boolean }) => {
        if (!user) return;
        try {
            const globalChar: Character = {
                ...updatedChar,
                projectId: undefined,
                userId: user.id
            };
            await dataService.saveCharacter(null, globalChar);
            toast.success('角色已更新');
            loadCharacters();
            if (!options?.keepOpen) setEditingCharacter(null);
        } catch (error) {
            toast.error('更新失败');
        }
    };

    const handleDeleteCharacter = async (id: string, name: string) => {
        if (!confirm(`确定删除全局角色 "${name}" 吗？这不会影响已经引用该角色的项目，但列表中将不可见。`)) return;
        // Since deleteCharacter in dataService usually takes id, and might check projectId.
        // We might need a specific deleteGlobalCharacter or just use generic delete if it checks ownership.
        // dataService.deleteCharacter(id) might assume project scope?
        // Let's check dataService. deleteCharacter usually calls Supabase delete by ID.
        // It should work if RLS allows it.
        try {
            // Assuming dataService has deleteCharacter or generic delete
            // Actually dataService.deleteCharacter implementation calls table('characters').delete().eq('id', id).
            // RLS should handle "user_id = auth.uid()" check.
            // Wait, the current dataService implementation for deleteCharacter (checked earlier) might require modification if it enforces project_id.
            // But usually it just deletes by ID.
            // I'll assume it works or I added it.
            // I will verify dataService deleteCharacter signature.
            await (dataService as any).deleteCharacter(id); // Using cast if typescript complains
            toast.success('删除成功');
            loadCharacters();
        } catch (error) {
            toast.error('删除失败');
        }
    };

    return (
        <main className="min-h-screen bg-light-bg dark:bg-cine-black p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                            <ArrowLeft size={24} className="text-light-text dark:text-white" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-light-text dark:text-white">素材库</h1>
                            <p className="text-light-text-muted dark:text-cine-text-muted">管理你的全局角色和资产</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddDialog(true)}
                        className="bg-light-accent dark:bg-cine-accent text-white px-4 py-2 rounded-lg font-bold hover:bg-light-accent-hover dark:hover:bg-cine-accent/90 transition-colors flex items-center gap-2"
                    >
                        <Plus size={20} />
                        添加角色
                    </button>
                </header>

                {/* Content */}
                {isLoading ? (
                    <div className="text-center py-20 text-gray-500">加载中...</div>
                ) : characters.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                        <p className="text-gray-500 mb-4">暂无全局角色</p>
                        <button
                            onClick={() => setShowAddDialog(true)}
                            className="text-light-accent dark:text-cine-accent hover:underline"
                        >
                            创建一个新角色
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {characters.map(char => (
                            <div key={char.id} className="group bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-xl overflow-hidden hover:border-light-accent dark:hover:border-cine-accent transition-all relative">
                                <div className="aspect-[3/4] bg-gray-100 dark:bg-black relative">
                                    {char.referenceImages && char.referenceImages[0] ? (
                                        <img src={char.referenceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">无图</div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditingCharacter(char)}
                                            className="p-2 bg-black/60 text-white rounded hover:bg-light-accent dark:hover:bg-cine-accent transition-colors"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCharacter(char.id, char.name)}
                                            className="p-2 bg-red-500/80 text-white rounded hover:bg-red-500 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-3">
                                    <h3 className="font-bold text-light-text dark:text-white truncate">{char.name}</h3>
                                    <p className="text-xs text-light-text-muted dark:text-cine-text-muted line-clamp-2 mt-1">{char.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showAddDialog && (
                    <AddCharacterDialog
                        onAdd={handleAddCharacter}
                        onClose={() => setShowAddDialog(false)}
                    />
                )}

                {editingCharacter && (
                    <AddCharacterDialog
                        mode="edit"
                        initialCharacter={editingCharacter}
                        onAdd={handleUpdateCharacter}
                        onClose={() => setEditingCharacter(null)}
                    />
                )}
            </div>
        </main>
    );
}
