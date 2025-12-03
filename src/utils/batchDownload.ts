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
  const videosFolder = zip.folder('videos');
  const audioFolder = zip.folder('audio');

  if (!imagesFolder || !videosFolder || !audioFolder) {
    throw new Error('创建文件夹失败');
  }

  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;

  // 使用 Set 跟踪已下载的 URL，避免重复下载
  const downloadedUrls = new Set<string>();

  // 收集所有镜头的图片和视频
  for (const shot of project.shots) {
    const shotName = `shot_${String(shot.order).padStart(2, '0')}`;

    // 1. 下载参考图片
    if (shot.referenceImage && !downloadedUrls.has(shot.referenceImage)) {
      try {
        const response = await fetch(shot.referenceImage);
        const blob = await response.blob();
        imagesFolder.file(`${shotName}_reference.png`, blob);
        downloadedUrls.add(shot.referenceImage);
        imageCount++;
      } catch (error) {
        console.error(`Failed to download reference image for shot ${shot.order}:`, error);
      }
    }

    // 2. 下载 Grid 图片（切片）
    if (shot.gridImages && shot.gridImages.length > 0) {
      for (let i = 0; i < shot.gridImages.length; i++) {
        if (!downloadedUrls.has(shot.gridImages[i])) {
          try {
            const response = await fetch(shot.gridImages[i]);
            const blob = await response.blob();
            imagesFolder.file(`${shotName}_grid_slice_${i + 1}.png`, blob);
            downloadedUrls.add(shot.gridImages[i]);
            imageCount++;
          } catch (error) {
            console.error(`Failed to download grid slice ${i + 1} for shot ${shot.order}:`, error);
          }
        }
      }
    }

    // 3. 下载完整 Grid 图（去重：同一个 Grid 只下载一次）
    if (shot.fullGridUrl && !downloadedUrls.has(shot.fullGridUrl)) {
      try {
        const response = await fetch(shot.fullGridUrl);
        const blob = await response.blob();
        // 使用场景信息命名，避免重复
        const scene = project.scenes.find((s) => s.shotIds.includes(shot.id));
        const sceneName = scene?.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') || 'scene';
        imagesFolder.file(`${sceneName}_full_grid.png`, blob);
        downloadedUrls.add(shot.fullGridUrl);
        imageCount++;
      } catch (error) {
        console.error(`Failed to download full grid for shot ${shot.order}:`, error);
      }
    }

    // 4. 下载视频
    if (shot.videoClip) {
      try {
        const response = await fetch(shot.videoClip);
        const blob = await response.blob();
        videosFolder.file(`${shotName}_video.mp4`, blob);
        videoCount++;
      } catch (error) {
        console.error(`Failed to download video for shot ${shot.order}:`, error);
      }
    }

    // 5. 下载生成历史中的图片和视频
    if (shot.generationHistory) {
      for (let i = 0; i < shot.generationHistory.length; i++) {
        const history = shot.generationHistory[i];
        try {
          const response = await fetch(history.result);
          const blob = await response.blob();

          if (history.type === 'image') {
            imagesFolder.file(`${shotName}_history_${i + 1}.png`, blob);
            imageCount++;
          } else if (history.type === 'video') {
            videosFolder.file(`${shotName}_history_${i + 1}.mp4`, blob);
            videoCount++;
          }
        } catch (error) {
          console.error(`Failed to download history item ${i + 1} for shot ${shot.order}:`, error);
        }
      }
    }
  }

  // 收集音频素材
  if (project.audioAssets) {
    for (let i = 0; i < project.audioAssets.length; i++) {
      const audio = project.audioAssets[i];
      try {
        const response = await fetch(audio.url);
        const blob = await response.blob();
        const ext = audio.type === 'music' ? 'mp3' : audio.type === 'voice' ? 'wav' : 'mp3';
        audioFolder.file(`${audio.name || `audio_${i + 1}`}.${ext}`, blob);
        audioCount++;
      } catch (error) {
        console.error(`Failed to download audio ${audio.name}:`, error);
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
          try {
            const response = await fetch(character.referenceImages[i]);
            const blob = await response.blob();
            const characterName = character.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            charactersFolder.file(`${characterName}_${i + 1}.png`, blob);
            imageCount++;
          } catch (error) {
            console.error(`Failed to download character image for ${character.name}:`, error);
          }
        }
      }
    }
  }

  if (project.locations && locationsFolder) {
    for (const location of project.locations) {
      if (location.referenceImages) {
        for (let i = 0; i < location.referenceImages.length; i++) {
          try {
            const response = await fetch(location.referenceImages[i]);
            const blob = await response.blob();
            const locationName = location.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
            locationsFolder.file(`${locationName}_${i + 1}.png`, blob);
            imageCount++;
          } catch (error) {
            console.error(`Failed to download location image for ${location.name}:`, error);
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
