/**
 * Prompt enrichment utilities for incorporating character and location references
 */

import type { Character, Location, Project } from '@/types/project';

/**
 * Enrich a shot prompt with character and location context
 * This helps maintain consistency by including character appearance and location details
 *
 * Now includes reference image markers like "(第一个参考图)", "(第二个参考图)" to map
 * character/location names to their reference images
 */
export function enrichPromptWithAssets(
  basePrompt: string,
  project: Project | null,
  shotDescription?: string
): {
  enrichedPrompt: string;
  usedCharacters: Character[];
  usedLocations: Location[];
  referenceImageUrls: string[];
  referenceImageMap: { index: number; type: 'character' | 'location'; name: string; imageUrl: string }[];
  concisePrompt: string;
  missingAssets: { type: 'character' | 'location'; name: string }[];
} {
  if (!project) {
    return {
      enrichedPrompt: basePrompt,
      usedCharacters: [],
      usedLocations: [],
      referenceImageUrls: [],
      referenceImageMap: [],
      concisePrompt: basePrompt,
      missingAssets: [],
    };
  }

  const usedCharacters: Character[] = [];
  const usedLocations: Location[] = [];
  const referenceImageUrls: string[] = [];
  const referenceImageMap: { index: number; type: 'character' | 'location'; name: string; imageUrl: string }[] = [];
  const missingAssets: { type: 'character' | 'location'; name: string }[] = [];

  // Combine base prompt and shot description for matching
  const fullText = `${basePrompt} ${shotDescription || ''}`.toLowerCase();

  let referenceImageIndex = 0;

  // Find mentioned characters
  for (const character of project.characters) {
    const characterName = character.name.toLowerCase();
    if (fullText.includes(characterName)) {
      usedCharacters.push(character);
      // Collect reference images with indexing
      if (character.referenceImages && character.referenceImages.length > 0) {
        for (const imageUrl of character.referenceImages) {
          referenceImageIndex++;
          referenceImageUrls.push(imageUrl);
          referenceImageMap.push({
            index: referenceImageIndex,
            type: 'character',
            name: character.name,
            imageUrl,
          });
        }
      } else {
        missingAssets.push({ type: 'character', name: character.name });
      }
    }
  }

  // Find mentioned locations
  for (const location of project.locations) {
    const locationName = location.name.toLowerCase();
    if (fullText.includes(locationName)) {
      usedLocations.push(location);
      // Collect reference images with indexing
      if (location.referenceImages && location.referenceImages.length > 0) {
        for (const imageUrl of location.referenceImages) {
          referenceImageIndex++;
          referenceImageUrls.push(imageUrl);
          referenceImageMap.push({
            index: referenceImageIndex,
            type: 'location',
            name: location.name,
            imageUrl,
          });
        }
      } else {
        missingAssets.push({ type: 'location', name: location.name });
      }
    }
  }

  // Build enriched prompt with reference image markers
  let enrichedPrompt = basePrompt;
  let concisePrompt = basePrompt;

  // Add character context with reference image markers
  if (usedCharacters.length > 0) {
    const characterContext = usedCharacters
      .map((char) => {
        let desc = `${char.name}: ${char.description}`;
        if (char.appearance) {
          desc += `. 外貌：${char.appearance}`;
        }
        // Add reference image markers
        if (char.referenceImages && char.referenceImages.length > 0) {
          const charImageIndices = referenceImageMap
            .filter(ref => ref.type === 'character' && ref.name === char.name)
            .map(ref => ref.index);
          if (charImageIndices.length > 0) {
            const markers = charImageIndices.map(idx => `(第${convertNumberToChinese(idx)}个参考图)`).join('、');
            desc += ` ${markers}`;
          }
        }
        return desc;
      })
      .join('\n');

    enrichedPrompt += `\n\n【角色信息】\n${characterContext}`;
  }

  // Add location context with reference image markers
  if (usedLocations.length > 0) {
    const locationContext = usedLocations
      .map((loc) => {
        const typeText = loc.type === 'interior' ? '室内' : '室外';
        let desc = `${loc.name} (${typeText}): ${loc.description}`;
        // Add reference image markers
        if (loc.referenceImages && loc.referenceImages.length > 0) {
          const locImageIndices = referenceImageMap
            .filter(ref => ref.type === 'location' && ref.name === loc.name)
            .map(ref => ref.index);
          if (locImageIndices.length > 0) {
            const markers = locImageIndices.map(idx => `(第${convertNumberToChinese(idx)}个参考图)`).join('、');
            desc += ` ${markers}`;
          }
        }
        return desc;
      })
      .join('\n');

    enrichedPrompt += `\n\n【场景信息】\n${locationContext}`;
  }

  // Add reference image summary at the end
  if (referenceImageMap.length > 0) {
    enrichedPrompt += '\n\n【参考图像】\n';
    referenceImageMap.forEach(ref => {
      enrichedPrompt += `(第${convertNumberToChinese(ref.index)}个参考图) - ${ref.type === 'character' ? '角色' : '场景'}: ${ref.name}\n`;
    });

    // Concise markers only
    const markerList = referenceImageMap
      .map(ref => `@${ref.name}(第${ref.index}张参考图)`)
      .join(' ');
    concisePrompt = [basePrompt, markerList].filter(Boolean).join('\n');
  }

  return {
    enrichedPrompt,
    usedCharacters,
    usedLocations,
    referenceImageUrls,
    referenceImageMap,
    concisePrompt,
    missingAssets,
  };
}

/**
 * Convert number to Chinese characters (一、二、三...)
 */
function convertNumberToChinese(num: number): string {
  const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) {
    return chineseNumbers[num];
  }
  // For numbers > 10, use Arabic numerals for simplicity
  return num.toString();
}

/**
 * Get all character reference images for a project
 */
export function getAllCharacterReferenceImages(project: Project | null): string[] {
  if (!project || !project.characters) return [];

  return project.characters.flatMap((char) => char.referenceImages || []);
}

/**
 * Get all location reference images for a project
 */
export function getAllLocationReferenceImages(project: Project | null): string[] {
  if (!project || !project.locations) return [];

  return project.locations.flatMap((loc) => loc.referenceImages || []);
}

/**
 * Get all asset reference images (characters + locations)
 */
export function getAllAssetReferenceImages(project: Project | null): string[] {
  return [
    ...getAllCharacterReferenceImages(project),
    ...getAllLocationReferenceImages(project),
  ];
}
