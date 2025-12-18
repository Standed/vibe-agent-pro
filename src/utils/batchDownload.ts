import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Project } from '@/types/project';

/**
 * 批量下载项目素材（并发下载）
 */
export async function batchDownloadAssets(project: Project) {
  const zip = new JSZip();
  const projectName = project.metadata.title || '未命名项目';

  const imagesFolder = zip.folder('images');
  const selectedFolder = imagesFolder?.folder('selected');
  const historyFolder = imagesFolder?.folder('history');
  const videosFolder = zip.folder('videos');
  const audioFolder = zip.folder('audio');
  const charactersFolder = imagesFolder?.folder('characters');
  const locationsFolder = imagesFolder?.folder('locations');

  if (!imagesFolder || !videosFolder || !audioFolder || !selectedFolder || !historyFolder) {
    throw new Error('创建文件夹失败');
  }

  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  const failedDownloads: Array<{ type: string; url: string; reason: string }> = [];

  const downloadedUrls = new Set<string>();

  const base64ToBlob = (base64: string, mimeType = 'image/png') => {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
  };

  const fetchImageBlob = async (url: string | null | undefined, retries = 3): Promise<Blob | null> => {
    if (!url) return null;
    const isR2PublicUrl = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const fetchOptions: RequestInit = isR2PublicUrl
          ? { mode: 'cors', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } }
          : {};

        const resp = await fetch(url, fetchOptions);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        if (attempt === retries - 1) {
          try {
            const proxyResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`);
            if (!proxyResp.ok) {
              const proxyError = await proxyResp.text();
              throw new Error(`Proxy failed (${proxyResp.status}): ${proxyError}`);
            }
            const data = await proxyResp.json();
            return base64ToBlob(data.data, data.mimeType || 'image/png');
          } catch (proxyErr: any) {
            console.error(`[Batch Download] ❌ 所有重试失败（包括代理），跳过: ${url}`, proxyErr.message);
            return null;
          }
        }

        if (attempt < retries - 1) {
          const delay = 1000 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return null;
  };

  const fetchMediaBlob = async (url: string | null | undefined, type: 'video' | 'audio' = 'video', retries = 3): Promise<Blob | null> => {
    if (!url) return null;
    const isR2PublicUrl = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const fetchOptions: RequestInit = isR2PublicUrl
          ? { mode: 'cors', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } }
          : {};

        const resp = await fetch(url, fetchOptions);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] ${type} 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        if (attempt < retries - 1) {
          const delay = 1000 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`[Batch Download] ❌ ${type} 下载失败，已重试 ${retries} 次: ${url}`, errorMsg);
          return null;
        }
      }
    }

    return null;
  };

  const runWithConcurrency = async (tasks: Array<() => Promise<void>>, limit = 6) => {
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (idx < tasks.length) {
        const task = tasks[idx++];
        await task();
      }
    });
    await Promise.all(workers);
  };

  const shotTasks: Array<() => Promise<void>> = [];

  const sortedShots = [...project.shots].sort((a, b) => {
    const orderA = a.globalOrder ?? a.order ?? 0;
    const orderB = b.globalOrder ?? b.order ?? 0;
    return orderA - orderB;
  });

  console.log(`[Batch Download] 📊 共 ${sortedShots.length} 个镜头，按全局序号排序`);

  for (const shot of sortedShots) {
    const globalOrder = shot.globalOrder ?? shot.order ?? 0;
    const shotName = `shot_${String(globalOrder).padStart(3, '0')}`;

    shotTasks.push(async () => {
      const tasks: Array<Promise<void>> = [];

      const enqueueImage = (
        url: string | undefined,
        targetFolder: JSZip | null | undefined,
        filename: string,
        typeLabel: string
      ) => {
        if (!url || !targetFolder || downloadedUrls.has(url)) return;
        tasks.push(
          (async () => {
            const blob = await fetchImageBlob(url);
            if (blob) {
              targetFolder.file(filename, blob);
              downloadedUrls.add(url);
              imageCount++;
            } else {
              failedDownloads.push({ type: typeLabel, url, reason: '重试3次后仍失败' });
            }
          })()
        );
      };

      const enqueueVideo = (url: string | undefined, filename: string, typeLabel: string) => {
        if (!url) return;
        tasks.push(
          (async () => {
            const blob = await fetchMediaBlob(url, 'video');
            if (blob) {
              videosFolder.file(filename, blob);
              videoCount++;
            } else {
              failedDownloads.push({ type: typeLabel, url, reason: '重试3次后仍失败' });
            }
          })()
        );
      };

      const enqueueAudio = (url: string | undefined, filename: string) => {
        if (!url) return;
        tasks.push(
          (async () => {
            const blob = await fetchMediaBlob(url, 'audio');
            if (blob) {
              audioFolder.file(filename, blob);
              audioCount++;
            } else {
              failedDownloads.push({ type: '音频', url, reason: '重试3次后仍失败' });
            }
          })()
        );
      };

      // 1. Selected Image
      enqueueImage(shot.referenceImage, selectedFolder, `${shotName}_selected.png`, '参考图');

      // 2. Full Grid Image (if exists)
      if (shot.fullGridUrl) {
        const scene = project.scenes.find((s) => s.shotIds.includes(shot.id));
        const sceneName = scene?.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') || 'scene';
        enqueueImage(shot.fullGridUrl, historyFolder, `${sceneName}_full_grid_${shot.id.slice(0, 4)}.png`, '完整Grid');
      }

      // 3. Grid Slices (if any)
      if (shot.gridImages && shot.gridImages.length > 0) {
        shot.gridImages.forEach((url, idx) => {
          // If this slice is the selected one, it's already in selectedFolder
          if (url !== shot.referenceImage) {
            enqueueImage(url, historyFolder, `${shotName}_grid_slice_${idx + 1}.png`, 'Grid切片');
          }
        });
      }

      // 4. Generation History (All other images)
      if (shot.generationHistory && shot.generationHistory.length > 0) {
        shot.generationHistory.forEach((history, idx) => {
          if (!history.result) return;
          if (history.type === 'image') {
            const isSelected = history.result === shot.referenceImage;
            // Only add to history folder if NOT the currently selected image
            if (!isSelected) {
              enqueueImage(history.result, historyFolder, `${shotName}_history_${idx + 1}.png`, '历史图片');
            }
          } else if (history.type === 'video') {
            enqueueVideo(history.result, `${shotName}_history_${idx + 1}.mp4`, '历史视频');
          }
        });
      }

      // 5. Media
      enqueueVideo(shot.videoClip, `${shotName}_video.mp4`, '视频');
      enqueueAudio(shot.audioTrack, `${shotName}_audio.mp3`);

      await Promise.all(tasks);
    });
  }

  await runWithConcurrency(shotTasks, 6);

  // 角色参考图（串行即可，数量有限）
  if (project.characters && charactersFolder) {
    for (const character of project.characters) {
      if (character.referenceImages && character.referenceImages.length > 0) {
        for (let i = 0; i < character.referenceImages.length; i++) {
          const url = character.referenceImages[i];
          if (!url) continue;
          const blob = await fetchImageBlob(url);
          if (blob) {
            const characterName = character.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            charactersFolder.file(`${characterName}_${i + 1}.png`, blob);
            imageCount++;
          } else {
            failedDownloads.push({
              type: '角色参考图',
              url: character.referenceImages[i],
              reason: '重试3次后仍失败',
            });
          }
        }
      }
    }
  }

  // 场景参考图
  if (project.locations && locationsFolder) {
    for (const location of project.locations) {
      if (location.referenceImages && location.referenceImages.length > 0) {
        for (let i = 0; i < location.referenceImages.length; i++) {
          const url = location.referenceImages[i];
          if (!url) continue;
          const blob = await fetchImageBlob(url);
          if (blob) {
            const locationName = location.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            locationsFolder.file(`${locationName}_${i + 1}.png`, blob);
            imageCount++;
          } else {
            failedDownloads.push({
              type: '场景参考图',
              url: location.referenceImages[i],
              reason: '重试3次后仍失败',
            });
          }
        }
      }
    }
  }

  // 创建项目信息文件
  const projectInfo = {
    projectName: project.metadata.title,
    description: project.metadata.description,
    artStyle: project.metadata.artStyle,
    aspectRatio: project.settings.aspectRatio,
    sceneCount: project.scenes.length,
    shotCount: project.shots.length,
    imageCount,
    videoCount,
    audioCount,
    createdAt: project.metadata.created,
    modifiedAt: project.metadata.modified,
  };

  zip.file('project_info.json', JSON.stringify(projectInfo, null, 2));

  if (project.script) {
    zip.file('script.txt', project.script);
  }

  // 分镜脚本 JSON
  const storyboardData = {
    projectName: project.metadata.title,
    artStyle: project.metadata.artStyle,
    aspectRatio: project.settings.aspectRatio,
    scenes: project.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      description: scene.description,
      shots: project.shots
        .filter((shot) => shot.sceneId === scene.id)
        .map((shot) => ({
          id: shot.id,
          order: shot.order,
          shotSize: shot.shotSize,
          cameraMovement: shot.cameraMovement,
          duration: shot.duration,
          description: shot.description,
          dialogue: shot.dialogue,
          narration: shot.narration,
          status: shot.status,
          hasReferenceImage: !!shot.referenceImage,
          hasVideo: !!shot.videoClip,
          gridImagesCount: shot.gridImages?.length || 0,
          generationHistoryCount: shot.generationHistory?.length || 0,
        })),
    })),
  };

  zip.file('storyboard.json', JSON.stringify(storyboardData, null, 2));

  // 分镜脚本文本
  let storyboardText = `${project.metadata.title}\n`;
  storyboardText += `${'='.repeat(project.metadata.title.length)}\n\n`;
  storyboardText += `画风：${project.metadata.artStyle || '未指定'}\n`;
  storyboardText += `画面比例：${project.settings.aspectRatio}\n`;
  storyboardText += `场景数：${project.scenes.length}\n`;
  storyboardText += `镜头数：${project.shots.length}\n\n`;

  for (const scene of project.scenes) {
    storyboardText += `\n${'═'.repeat(60)}\n`;
    storyboardText += `场景：${scene.name}\n`;
    if (scene.location) {
      storyboardText += `地点：${scene.location}\n`;
    }
    storyboardText += `${'═'.repeat(60)}\n\n`;

    const sceneShots = project.shots.filter((shot) => shot.sceneId === scene.id);
    for (const shot of sceneShots) {
      storyboardText += `【镜头 #${shot.order}】\n`;
      storyboardText += `  景别：${shot.shotSize}\n`;
      storyboardText += `  运镜：${shot.cameraMovement}\n`;
      storyboardText += `  时长：${shot.duration}秒\n`;
      storyboardText += `  状态：${shot.status}\n\n`;
      storyboardText += `  视觉描述：\n  ${shot.description}\n\n`;

      if (shot.dialogue) {
        storyboardText += `  对话：\n  "${shot.dialogue}"\n\n`;
      }

      if (shot.narration) {
        storyboardText += `  旁白：\n  ${shot.narration}\n\n`;
      }

      storyboardText += `  素材：\n`;
      storyboardText += `    - 参考图片：${shot.referenceImage ? '✓' : '✗'}\n`;
      storyboardText += `    - 视频：${shot.videoClip ? '✓' : '✗'}\n`;
      storyboardText += `    - Grid 切片：${shot.gridImages?.length || 0} 个\n`;
      storyboardText += `    - 生成历史：${shot.generationHistory?.length || 0} 条\n`;
      storyboardText += `\n${'-'.repeat(60)}\n\n`;
    }
  }

  zip.file('storyboard.txt', storyboardText);

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const fileName = `${projectName.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_素材.zip`;
  saveAs(content, fileName);

  console.log('\n' + '='.repeat(60));
  console.log('[Batch Download] 📊 下载统计报告');
  console.log('='.repeat(60));
  console.log(`✅ 成功下载:`);
  console.log(`   📷 图片: ${imageCount} 个`);
  console.log(`   🎬 视频: ${videoCount} 个`);
  console.log(`   🎵 音频: ${audioCount} 个`);
  console.log(`   📦 总计: ${imageCount + videoCount + audioCount} 个文件`);

  if (failedDownloads.length > 0) {
    console.log(`\n❌ 下载失败: ${failedDownloads.length} 个`);
    failedDownloads.forEach((item, index) => {
      console.log(`   ${index + 1}. [${item.type}] ${item.url.slice(0, 80)}...`);
      console.log(`      原因: ${item.reason}`);
    });
  } else {
    console.log(`\n✨ 所有文件下载成功！`);
  }

  console.log('='.repeat(60) + '\n');

  return {
    imageCount,
    videoCount,
    audioCount,
    totalCount: imageCount + videoCount + audioCount,
    failedCount: failedDownloads.length,
    failedDownloads,
  };
}
