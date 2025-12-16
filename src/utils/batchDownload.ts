import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Project } from '@/types/project';

/**
 * 批量下载项目素材
 * @param project 项目数据
 */
export async function batchDownloadAssets(project: Project) {
  const zip = new JSZip();
  const projectName = project.metadata.title || '未命名项目';

  // 创建文件夹
  const imagesFolder = zip.folder('images');
  const selectedFolder = imagesFolder?.folder('selected');
  const historyFolder = imagesFolder?.folder('history');
  const videosFolder = zip.folder('videos');
  const audioFolder = zip.folder('audio');

  if (!imagesFolder || !videosFolder || !audioFolder || !selectedFolder || !historyFolder) {
    throw new Error('创建文件夹失败');
  }

  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;

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

  /**
   * 下载图片，带重试机制
   * @param url 图片 URL
   * @param retries 最大重试次数（默认 3 次）
   * @returns Blob 或 null（失败）
   */
  const fetchImageBlob = async (url: string, retries = 3): Promise<Blob | null> => {
    // 检查是否是 R2 公开 URL（不需要代理）
    const isR2PublicUrl = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // 对于 R2 公开 URL，使用 no-cors 模式避免代理干扰
        const fetchOptions: RequestInit = isR2PublicUrl
          ? {
              mode: 'cors',
              cache: 'no-cache',
              // 添加随机参数避免缓存
              headers: { 'Cache-Control': 'no-cache' }
            }
          : {};

        const resp = await fetch(url, fetchOptions);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        // 最后一次尝试，使用后端代理
        if (attempt === retries - 1) {
          try {
            console.log(`[Batch Download] 尝试使用后端代理下载: ${url}`);
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

        // 指数退避：第1次重试等待1秒，第2次等待2秒
        if (attempt < retries - 1) {
          const delay = 1000 * (attempt + 1);
          console.log(`[Batch Download] ⏳ 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return null;
  };

  /**
   * 下载视频/音频，带重试机制
   * @param url 视频/音频 URL
   * @param type 文件类型（用于日志）
   * @param retries 最大重试次数（默认 3 次）
   * @returns Blob 或 null（失败）
   */
  const fetchMediaBlob = async (url: string, type: 'video' | 'audio' = 'video', retries = 3): Promise<Blob | null> => {
    const isR2PublicUrl = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const fetchOptions: RequestInit = isR2PublicUrl
          ? {
              mode: 'cors',
              cache: 'no-cache',
              headers: { 'Cache-Control': 'no-cache' }
            }
          : {};

        const resp = await fetch(url, fetchOptions);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] ${type} 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        // 指数退避
        if (attempt < retries - 1) {
          const delay = 1000 * (attempt + 1);
          console.log(`[Batch Download] ⏳ 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[Batch Download] ❌ ${type} 下载失败，已重试 ${retries} 次: ${url}`, errorMsg);
          return null;
        }
      }
    }

    return null;
  };

  // 使用 Set 跟踪已下载的 URL，避免重复下载
  const downloadedUrls = new Set<string>();

  // 收集所有镜头的图片和视频
  for (const shot of project.shots) {
    const shotName = `shot_${String(shot.order).padStart(2, '0')}`;

    // 1. 下载已选参考图片到 selected
    if (shot.referenceImage && !downloadedUrls.has(shot.referenceImage)) {
      const blob = await fetchImageBlob(shot.referenceImage);
      if (blob) {
        selectedFolder.file(`${shotName}_selected.png`, blob);
        downloadedUrls.add(shot.referenceImage);
        imageCount++;
      }
    }

    // 2. 下载 Grid 图片（切片）到 history
    if (shot.gridImages && shot.gridImages.length > 0) {
      for (let i = 0; i < shot.gridImages.length; i++) {
        if (!downloadedUrls.has(shot.gridImages[i])) {
          const blob = await fetchImageBlob(shot.gridImages[i]);
          if (blob) {
            historyFolder.file(`${shotName}_grid_slice_${i + 1}.png`, blob);
            downloadedUrls.add(shot.gridImages[i]);
            imageCount++;
          }
        }
      }
    }

    // 3. 下载完整 Grid 图（历史，去重）
    if (shot.fullGridUrl && !downloadedUrls.has(shot.fullGridUrl)) {
      const blob = await fetchImageBlob(shot.fullGridUrl);
      if (blob) {
        const scene = project.scenes.find((s) => s.shotIds.includes(shot.id));
        const sceneName = scene?.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') || 'scene';
        historyFolder.file(`${sceneName}_full_grid.png`, blob);
        downloadedUrls.add(shot.fullGridUrl);
        imageCount++;
      }
    }

    // 4. 下载视频（使用重试机制）
    if (shot.videoClip) {
      const blob = await fetchMediaBlob(shot.videoClip, 'video');
      if (blob) {
        videosFolder.file(`${shotName}_video.mp4`, blob);
        videoCount++;
      }
    }

    // 5. 下载生成历史中的图片和视频
    if (shot.generationHistory) {
      for (let i = 0; i < shot.generationHistory.length; i++) {
        const history = shot.generationHistory[i];
        if (history.type === 'image') {
          // 已下载（或与 referenceImage 相同）则跳过
          if (downloadedUrls.has(history.result)) continue;

          const blob = await fetchImageBlob(history.result);
          if (!blob) continue;

          const isSelected = history.result === shot.referenceImage;
          const targetFolder = isSelected ? selectedFolder : historyFolder;
          const prefix = isSelected ? 'selected_history' : 'history';
          targetFolder.file(`${shotName}_${prefix}_${i + 1}.png`, blob);
          downloadedUrls.add(history.result);
          imageCount++;
        } else if (history.type === 'video') {
          const blob = await fetchMediaBlob(history.result, 'video');
          if (blob) {
            videosFolder.file(`${shotName}_history_${i + 1}.mp4`, blob);
            videoCount++;
          }
        }
      }
    }
  }

  // 收集音频素材（使用重试机制）
  if (project.audioAssets) {
    for (let i = 0; i < project.audioAssets.length; i++) {
      const audio = project.audioAssets[i];
      const blob = await fetchMediaBlob(audio.url, 'audio');
      if (blob) {
        const ext = audio.type === 'music' ? 'mp3' : audio.type === 'voice' ? 'wav' : 'mp3';
        audioFolder.file(`${audio.name || `audio_${i + 1}`}.${ext}`, blob);
        audioCount++;
      }
    }
  }

  // 收集角色和场景的参考图片
  const charactersFolder = imagesFolder.folder('characters');
  const locationsFolder = imagesFolder.folder('locations');

  if (project.characters && charactersFolder) {
    for (const character of project.characters) {
      if (character.referenceImages) {
        for (let i = 0; i < character.referenceImages.length; i++) {
          const blob = await fetchImageBlob(character.referenceImages[i]);
          if (blob) {
            const characterName = character.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            charactersFolder.file(`${characterName}_${i + 1}.png`, blob);
            imageCount++;
          }
        }
      }
    }
  }

  if (project.locations && locationsFolder) {
    for (const location of project.locations) {
      if (location.referenceImages) {
        for (let i = 0; i < location.referenceImages.length; i++) {
          const blob = await fetchImageBlob(location.referenceImages[i]);
          if (blob) {
            const locationName = location.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            locationsFolder.file(`${locationName}_${i + 1}.png`, blob);
            imageCount++;
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

  // 添加剧本文本
  if (project.script) {
    zip.file('script.txt', project.script);
  }

  // 添加分镜脚本 JSON
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

  // 添加人类可读的分镜脚本文本
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

  // 生成并下载 ZIP 文件
  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  const fileName = `${projectName.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_素材.zip`;
  saveAs(content, fileName);

  return {
    imageCount,
    videoCount,
    audioCount,
    totalCount: imageCount + videoCount + audioCount,
  };
}
