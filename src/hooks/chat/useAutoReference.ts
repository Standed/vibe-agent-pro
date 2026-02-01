import { useState, useEffect } from 'react';
import { Project, Character, Location } from '@/types/project';
import { enrichPromptWithAssets } from '@/utils/promptEnrichment';

export type ActiveReference = {
    url: string;
    source: 'shot_ref' | 'auto_detect' | 'manual_upload' | 'history_ref';
    label?: string;
    entityName?: string;
    file?: File;
};

export function useAutoReference(
    project: Project | null,
    selectedShotId: string | null,
    inputText: string,
    setInputText: (text: string) => void,
    manualReferenceUrls: string[],
    droppedReferences: ActiveReference[] = []
) {
    const [activeReferences, setActiveReferences] = useState<ActiveReference[]>([]);
    const [ignoredUrls, setIgnoredUrls] = useState<Set<string>>(new Set());
    const [mentionedAssets, setMentionedAssets] = useState<{
        characters: Character[];
        locations: Location[];
    }>({ characters: [], locations: [] });

    // Auto-detect references
    useEffect(() => {
        if (!project) return;

        const newRefs: ActiveReference[] = [];
        const seenUrls = new Set<string>();

        // 1. Dropped Refs (Highest Priority)
        droppedReferences.forEach(ref => {
            // Even if it was in ignoredUrls, if it's in droppedReferences, we show it (means user re-added it)
            // But we should check if it's explicitly ignored? 
            // Actually, if it's in droppedReferences, it means user just added it.
            // The ChatPanel logic removes it from ignoredUrls on drop.
            if (!seenUrls.has(ref.url) && !ignoredUrls.has(ref.url)) {
                newRefs.push(ref);
                seenUrls.add(ref.url);
            }
        });

        // 2. Manual History Refs (Second Priority)
        // Manual addition should override ignorance list
        manualReferenceUrls.forEach(url => {
            if (!seenUrls.has(url)) {
                newRefs.push({
                    url,
                    source: 'history_ref',
                    label: '历史引用'
                });
                seenUrls.add(url);
            }
        });

        // 3. Auto Detect from Prompt (Lowest Priority)
        const { referenceImageMap, usedCharacters, usedLocations } = enrichPromptWithAssets(inputText, project, undefined);

        // Sync mentioned assets for downstream consumers (e.g., Vidu reference2video)
        setMentionedAssets(prev => {
            const next = { characters: usedCharacters, locations: usedLocations };
            if (prev.characters === next.characters && prev.locations === next.locations) return prev;
            const sameLength = prev.characters.length === next.characters.length && prev.locations.length === next.locations.length;
            if (sameLength) {
                const sameChars = prev.characters.every((c, idx) => c.id === next.characters[idx]?.id);
                const sameLocs = prev.locations.every((l, idx) => l.id === next.locations[idx]?.id);
                if (sameChars && sameLocs) return prev;
            }
            return next;
        });

        let newText = inputText;
        let textChanged = false;

        referenceImageMap.forEach(ref => {
            if (!seenUrls.has(ref.imageUrl) && !ignoredUrls.has(ref.imageUrl)) {
                newRefs.push({
                    url: ref.imageUrl,
                    source: 'auto_detect',
                    label: `${ref.type === 'character' ? '角色' : '场景'}: ${ref.name}`,
                    entityName: ref.name
                });
                seenUrls.add(ref.imageUrl);

                // Auto-format text to include @
                const escapedName = ref.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(?<!@)${escapedName}`, 'g');
                if (regex.test(newText)) {
                    newText = newText.replace(regex, `@${ref.name}`);
                    textChanged = true;
                }
            }
        });

        setActiveReferences(prev => {
            const newRefMap = new Map(newRefs.map(r => [r.url, r]));
            const prevUrlSet = new Set(prev.map(r => r.url));

            // 1. Keep existing refs that are still valid (preserve user order)
            // Use the object from newRefs to ensure latest data (e.g. labels), but keep position from prev
            const result: ActiveReference[] = [];
            prev.forEach(p => {
                if (newRefMap.has(p.url)) {
                    result.push(newRefMap.get(p.url)!);
                }
            });

            // 2. Append new refs that weren't there before
            newRefs.forEach(r => {
                if (!prevUrlSet.has(r.url)) {
                    result.push(r);
                }
            });

            // Deep compare to avoid unnecessary re-renders
            if (JSON.stringify(result) === JSON.stringify(prev)) return prev;
            return result;
        });

    }, [inputText, selectedShotId, project, manualReferenceUrls, droppedReferences, ignoredUrls, setInputText, setMentionedAssets]);

    const handleMention = async (query: string) => {
        if (!project) return [];
        const chars = project.characters.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).map(c => ({ id: c.id, display: c.name, type: 'character', data: c }));
        const locs = project.locations.filter(l => l.name.toLowerCase().includes(query.toLowerCase())).map(l => ({ id: l.id, display: l.name, type: 'location', data: l }));
        return [...chars, ...locs];
    };

    const handleAssetSelected = (type: 'character' | 'location', item: Character | Location) => {
        const refs = item.referenceImages || [];
        if (refs.length === 0) return;

        // Remove from ignoredUrls (allow re-adding)
        setIgnoredUrls(prev => {
            const next = new Set(prev);
            refs.forEach(url => next.delete(url));
            return next;
        });

        // Add to activeReferences immediately
        setActiveReferences(prev => {
            const newRefs = [...prev];
            refs.forEach(url => {
                if (!newRefs.some(r => r.url === url)) {
                    newRefs.push({
                        url,
                        source: 'auto_detect',
                        label: `${type === 'character' ? '角色' : '场景'}: ${item.name}`,
                        entityName: item.name
                    });
                }
            });
            return newRefs;
        });
    };

    return {
        activeReferences,
        setActiveReferences,
        ignoredUrls,
        setIgnoredUrls,
        mentionedAssets,
        setMentionedAssets,
        handleMention,
        handleAssetSelected
    };
}
