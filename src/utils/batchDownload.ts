import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Project, SoraTask } from '@/types/project';
import { dataService } from '@/lib/dataService';

type BatchDownloadPhase = 'prepare' | 'download' | 'zip' | 'done';
type BatchDownloadProgress = {
  phase: BatchDownloadPhase;
  completed?: number;
  total?: number;
  message?: string;
  percent?: number;
};

/**
 * 批量下载项目素材（并发下载）
 */
export async function batchDownloadAssets(
  project: Project,
  options?: {
    onProgress?: (progress: BatchDownloadProgress) => void;
    maxConcurrent?: number;
  }
) {
  const zip = new JSZip();
  const projectName = project.metadata.title || '未命名项目';

  const imagesFolder = zip.folder('images');
  const selectedFolder = imagesFolder?.folder('selected');
  const historyFolder = imagesFolder?.folder('history');
  const videosFolder = zip.folder('videos');
  const selectedVideosFolder = videosFolder?.folder('selected');
  const historyVideosFolder = videosFolder?.folder('history');
  const soraVideosFolder = videosFolder?.folder('sora');
  const soraSelectedFolder = soraVideosFolder?.folder('selected');
  const soraUnselectedFolder = soraVideosFolder?.folder('unselected');
  const audioFolder = zip.folder('audio');
  const charactersFolder = imagesFolder?.folder('characters');
  const locationsFolder = imagesFolder?.folder('locations');

  if (
    !imagesFolder ||
    !videosFolder ||
    !audioFolder ||
    !selectedFolder ||
    !historyFolder ||
    !selectedVideosFolder ||
    !historyVideosFolder ||
    !soraVideosFolder ||
    !soraSelectedFolder ||
    !soraUnselectedFolder
  ) {
    throw new Error('创建文件夹失败');
  }

  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  const failedDownloads: Array<{ type: string; url: string; reason: string }> = [];

  // 任务队列管理
  const allTasks: Array<() => Promise<void>> = [];
  let completedTasks = 0;

  const downloadedUrls = new Set<string>();
  const mediaCache = new Map<string, Blob>();

  const emitProgress = (progress: BatchDownloadProgress) => {
    options?.onProgress?.(progress);
  };
  emitProgress({ phase: 'prepare', message: '正在准备下载列表...' });

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // 优化后的 fetchImageBlob：支持流式代理，减少 Base64 开销
  const fetchImageBlob = async (url: string | null | undefined, retries = 3): Promise<Blob | null> => {
    if (!url) return null;
    const isR2PublicUrl = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 缩短超时时间到 30s
        const fetchOptions: RequestInit = isR2PublicUrl
          ? { mode: 'cors', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal }
          : { signal: controller.signal };

        const resp = await fetch(url, fetchOptions);
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        if (attempt === retries - 1) {
          try {
            // 使用优化后的流式代理接口
            const proxyResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`);
            if (!proxyResp.ok) {
              throw new Error(`Proxy failed: ${proxyResp.status}`);
            }
            return await proxyResp.blob();
          } catch (proxyErr: any) {
            console.error(`[Batch Download] ❌ 所有重试失败（包括代理），跳过: ${url}`, proxyErr.message);
            return null;
          }
        }

        if (attempt < retries - 1) {
          const delay = 500 * (attempt + 1);
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 缩短超时时间到 60s
        const fetchOptions: RequestInit = isR2PublicUrl
          ? { mode: 'cors', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal }
          : { signal: controller.signal };

        const resp = await fetch(url, fetchOptions);
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        return await resp.blob();
      } catch (err: any) {
        const errorMsg = err?.message || 'unknown error';
        console.warn(`[Batch Download] ${type} 第 ${attempt + 1}/${retries} 次尝试失败: ${url}`, errorMsg);

        if (attempt < retries - 1) {
          const delay = 800 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`[Batch Download] ❌ ${type} 下载失败，已重试 ${retries} 次: ${url}`, errorMsg);
          return null;
        }
      }
    }

    return null;
  };

  const getCachedMediaBlob = async (url: string, type: 'video' | 'audio'): Promise<Blob | null> => {
    const cached = mediaCache.get(url);
    if (cached) return cached;
    const blob = await fetchMediaBlob(url, type);
    if (blob) {
      mediaCache.set(url, blob);
    }
    return blob;
  };

  // 统一的添加任务函数
  const addTask = (taskFn: () => Promise<void>) => {
    allTasks.push(async () => {
      await taskFn();
      completedTasks++;
      emitProgress({
        phase: 'download',
        completed: completedTasks,
        total: allTasks.length, // 注意：这里 total 是动态的，但在开始执行前会固定
        message: `正在下载素材 ${completedTasks}/${allTasks.length}`
      });
    });
  };

  // ==========================================
  // 1. 读取 Sora 任务 (用于去重和归类)
  // ==========================================
  let soraTasks: SoraTask[] = [];
  try {
    emitProgress({ phase: 'prepare', message: '正在读取 Sora 任务...' });
    const result = await withTimeout(dataService.getSoraTasks(project.id), 8000);
    if (result) {
      soraTasks = result;
    } else {
      console.warn('[Batch Download] 读取 Sora 任务超时，已跳过');
    }
  } catch (error) {
    console.warn('[Batch Download] 读取 Sora 任务失败:', error);
  }

  // URL 归一化函数
  const normalizeMediaUrl = (url: string) => {
    const trimmed = url.trim();
    const withoutHash = trimmed.split('#')[0];
    return withoutHash.split('?')[0];
  };

  // ==========================================
  // 2. 统一视频收集系统 (核心去重逻辑)
  // ==========================================

  // 视频元数据类型
  type VideoSource = 'sora_task' | 'shot_clip' | 'shot_history' | 'scene_sora';
  type VideoMeta = {
    url: string;
    normalizedUrl: string;
    source: VideoSource;
    priority: number; // 1=最高(sora_task), 4=最低(shot_history)
    fileName: string;
    targetFolder: 'sora_assigned' | 'sora_unassigned' | 'selected' | 'history';
    shotIds: string[];
    taskIds: string[];
    assigned: boolean; // 是否已分配给镜头
  };

  // 全局视频收集 Map (按归一化 URL 去重)
  const allVideosMap = new Map<string, VideoMeta>();

  // 辅助函数：格式化镜头覆盖范围
  const shotIndexById = new Map(project.shots.map(s => [s.id, s.globalOrder ?? s.order ?? 0]));
  const formatShotCoverage = (shotIds?: string[]) => {
    if (!shotIds?.length) return '';
    const numbers = Array.from(new Set(shotIds))
      .map(id => shotIndexById.get(id) || 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (!numbers.length) return '';
    if (numbers.length === 1) {
      return String(numbers[0]).padStart(3, '0');
    }
    const isContiguous = numbers[numbers.length - 1] - numbers[0] + 1 === numbers.length;
    const normalized = numbers.map(n => String(n).padStart(3, '0'));
    return isContiguous ? `${normalized[0]}-${normalized[normalized.length - 1]}` : normalized.join('_');
  };

  // 添加视频到收集 Map (如果 URL 已存在，保留优先级更高的)
  const addVideoToCollection = (meta: VideoMeta) => {
    const existing = allVideosMap.get(meta.normalizedUrl);
    if (!existing) {
      allVideosMap.set(meta.normalizedUrl, meta);
    } else {
      // 合并 shotIds 和 taskIds
      meta.shotIds.forEach(id => {
        if (!existing.shotIds.includes(id)) existing.shotIds.push(id);
      });
      meta.taskIds.forEach(id => {
        if (!existing.taskIds.includes(id)) existing.taskIds.push(id);
      });
      // 如果新来源优先级更高，更新元数据
      if (meta.priority < existing.priority) {
        existing.source = meta.source;
        existing.priority = meta.priority;
        existing.fileName = meta.fileName;
        existing.targetFolder = meta.targetFolder;
      }
      // 只要有一个来源是 assigned，就认为是 assigned
      existing.assigned = existing.assigned || meta.assigned;
    }
  };

  // ==========================================
  // 2.1 收集 Sora 任务视频 (优先级最高)
  // ==========================================
  const soraTasksToDownload = soraTasks.filter(t =>
    t.status === 'completed' && t.type !== 'character_reference' && (t.r2Url || t.kaponaiUrl)
  );

  console.log(`[Batch Download] 📊 共 ${soraTasksToDownload.length} 个已完成的 Sora 任务`);

  // 统计已分配和未分配的任务数量
  let assignedCount = 0;
  let unassignedCount = 0;

  soraTasksToDownload.forEach((task) => {
    const url = task.r2Url || task.kaponaiUrl;
    if (!url) return;

    const normalizedUrl = normalizeMediaUrl(url);
    const rangeShotIds = (task.shotRanges || []).map((range) => range.shotId).filter(Boolean);
    const rawShotIds = task.shotIds && task.shotIds.length > 0 ? task.shotIds : (task.shotId ? [task.shotId] : []);
    const mergedShotIds = Array.from(new Set([...rawShotIds, ...rangeShotIds]));
    const assigned = mergedShotIds.length > 0;

    // 生成文件名：镜头序号在前，格式如 014-016_sora_abc123.mp4
    const coverage = formatShotCoverage(mergedShotIds);
    const taskIdSuffix = task.id.slice(-6);
    // 新格式：优先显示镜头覆盖范围
    const fileName = coverage
      ? `${coverage}_sora_${taskIdSuffix}.mp4`  // 例如: 014-016_sora_abc123.mp4
      : `unassigned_sora_${taskIdSuffix}.mp4`; // 未分配的任务

    if (assigned) {
      assignedCount++;
    } else {
      unassignedCount++;
      console.log(`[Batch Download] 📹 未分配的 Sora 视频: ${fileName}, taskId=${task.id}`);
    }

    addVideoToCollection({
      url,
      normalizedUrl,
      source: 'sora_task',
      priority: 1,
      fileName,
      targetFolder: assigned ? 'sora_assigned' : 'sora_unassigned',
      shotIds: mergedShotIds,
      taskIds: [task.id],
      assigned,
    });

    // 如果同时有 r2Url 和 kaponaiUrl，也标记 kaponaiUrl 为已处理
    if (task.r2Url && task.kaponaiUrl) {
      const altNormalized = normalizeMediaUrl(task.kaponaiUrl);
      if (altNormalized !== normalizedUrl && !allVideosMap.has(altNormalized)) {
        // 标记为同一视频的别名，不重复下载
        allVideosMap.set(altNormalized, allVideosMap.get(normalizedUrl)!);
      }
    }
  });

  console.log(`[Batch Download] 📊 Sora任务统计: 已分配=${assignedCount}, 未分配=${unassignedCount}`);

  // ==========================================
  // 2.2 收集场景 Sora 视频
  // ==========================================
  project.scenes.forEach(scene => {
    const videoUrl = scene.soraGeneration?.videoUrl;
    if (!videoUrl) return;

    const normalizedUrl = normalizeMediaUrl(videoUrl);
    if (allVideosMap.has(normalizedUrl)) return; // 已被 Sora 任务收集

    const sceneOrder = scene.order ?? project.scenes.indexOf(scene) + 1;
    const sceneLabel = scene.name ? scene.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') : `scene_${sceneOrder}`;
    const fileName = `${sceneLabel}_sora.mp4`;

    addVideoToCollection({
      url: videoUrl,
      normalizedUrl,
      source: 'scene_sora',
      priority: 2,
      fileName,
      targetFolder: 'sora_assigned',
      shotIds: scene.shotIds || [],
      taskIds: scene.soraGeneration?.taskId ? [scene.soraGeneration.taskId] : [],
      assigned: true,
    });
  });

  // ==========================================
  // 2.3 收集分镜视频 (shot.videoClip)
  // ==========================================
  const sortedShots = [...project.shots].sort((a, b) => {
    const orderA = a.globalOrder ?? a.order ?? 0;
    const orderB = b.globalOrder ?? b.order ?? 0;
    return orderA - orderB;
  });

  console.log(`[Batch Download] 📊 共 ${sortedShots.length} 个镜头，开始构建任务队列`);

  sortedShots.forEach(shot => {
    if (!shot.videoClip) return;

    const normalizedUrl = normalizeMediaUrl(shot.videoClip);
    if (allVideosMap.has(normalizedUrl)) {
      // 已被更高优先级来源收集，只需要合并 shotId
      const existing = allVideosMap.get(normalizedUrl)!;
      if (!existing.shotIds.includes(shot.id)) {
        existing.shotIds.push(shot.id);
        existing.assigned = true;
      }
      return;
    }

    const globalOrder = shot.globalOrder ?? shot.order ?? 0;
    const shotName = `shot_${String(globalOrder).padStart(3, '0')}`;

    addVideoToCollection({
      url: shot.videoClip,
      normalizedUrl,
      source: 'shot_clip',
      priority: 3,
      fileName: `${shotName}_video.mp4`,
      targetFolder: 'selected',
      shotIds: [shot.id],
      taskIds: [],
      assigned: true,
    });
  });

  // ==========================================
  // 2.4 收集分镜历史视频 (shot.generationHistory)
  // ==========================================
  sortedShots.forEach(shot => {
    if (!shot.generationHistory?.length) return;

    const globalOrder = shot.globalOrder ?? shot.order ?? 0;
    const shotName = `shot_${String(globalOrder).padStart(3, '0')}`;

    shot.generationHistory.forEach((history, idx) => {
      if (history.type !== 'video' || !history.result) return;

      const normalizedUrl = normalizeMediaUrl(history.result);
      if (allVideosMap.has(normalizedUrl)) {
        // 已被更高优先级来源收集
        return;
      }

      addVideoToCollection({
        url: history.result,
        normalizedUrl,
        source: 'shot_history',
        priority: 4,
        fileName: `${shotName}_history_${idx + 1}.mp4`,
        targetFolder: 'history',
        shotIds: [shot.id],
        taskIds: [],
        assigned: false,
      });
    });
  });

  // ==========================================
  // 3. 下载所有去重后的视频
  // ==========================================
  console.log(`[Batch Download] 🎬 视频去重完成，共 ${allVideosMap.size} 个唯一视频`);

  // 按来源统计
  const videoStats = { sora_task: 0, scene_sora: 0, shot_clip: 0, shot_history: 0 };
  allVideosMap.forEach(meta => {
    videoStats[meta.source]++;
  });
  console.log(`[Batch Download] 📊 视频来源统计: Sora任务=${videoStats.sora_task}, 场景=${videoStats.scene_sora}, 分镜选中=${videoStats.shot_clip}, 历史=${videoStats.shot_history}`);

  // 添加视频下载任务
  allVideosMap.forEach((meta) => {
    let targetFolder: JSZip | null | undefined;
    switch (meta.targetFolder) {
      case 'sora_assigned':
        targetFolder = soraSelectedFolder;
        break;
      case 'sora_unassigned':
        targetFolder = soraUnselectedFolder;
        break;
      case 'selected':
        targetFolder = selectedVideosFolder;
        break;
      case 'history':
        targetFolder = historyVideosFolder;
        break;
    }

    addTask(async () => {
      const blob = await getCachedMediaBlob(meta.url, 'video');
      if (blob) {
        targetFolder?.file(meta.fileName, blob, { binary: true, compression: 'STORE' });
        videoCount++;
      } else {
        failedDownloads.push({ type: `视频(${meta.source})`, url: meta.url, reason: '下载失败' });
      }
    });
  });

  // ==========================================
  // 4. 收集分镜图片和音频
  // ==========================================
  for (const shot of sortedShots) {
    const globalOrder = shot.globalOrder ?? shot.order ?? 0;
    const shotName = `shot_${String(globalOrder).padStart(3, '0')}`;

    // 4.1 Selected Image
    if (shot.referenceImage && !downloadedUrls.has(shot.referenceImage)) {
      downloadedUrls.add(shot.referenceImage);
      addTask(async () => {
        const blob = await fetchImageBlob(shot.referenceImage);
        if (blob) {
          selectedFolder?.file(`${shotName}_selected.png`, blob);
          imageCount++;
        } else {
          failedDownloads.push({ type: '参考图', url: shot.referenceImage!, reason: '下载失败' });
        }
      });
    }

    // 4.2 Full Grid Image
    if (shot.fullGridUrl && !downloadedUrls.has(shot.fullGridUrl)) {
      downloadedUrls.add(shot.fullGridUrl);
      addTask(async () => {
        const blob = await fetchImageBlob(shot.fullGridUrl);
        if (blob) {
          const scene = project.scenes.find((s) => s.shotIds.includes(shot.id));
          const sceneName = scene?.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') || 'scene';
          historyFolder?.file(`${sceneName}_full_grid_${shot.id.slice(0, 4)}.png`, blob);
          imageCount++;
        } else {
          failedDownloads.push({ type: '完整Grid', url: shot.fullGridUrl!, reason: '下载失败' });
        }
      });
    }

    // 4.3 Grid Slices
    if (shot.gridImages?.length) {
      shot.gridImages.forEach((url, idx) => {
        if (url && url !== shot.referenceImage && !downloadedUrls.has(url)) {
          downloadedUrls.add(url);
          addTask(async () => {
            const blob = await fetchImageBlob(url);
            if (blob) {
              historyFolder?.file(`${shotName}_grid_slice_${idx + 1}.png`, blob);
              imageCount++;
            } else {
              failedDownloads.push({ type: 'Grid切片', url: url!, reason: '下载失败' });
            }
          });
        }
      });
    }

    // 4.4 Generation History (Images only - videos already collected above)
    if (shot.generationHistory?.length) {
      shot.generationHistory.forEach((history, idx) => {
        if (!history.result) return;

        if (history.type === 'image') {
          if (history.result !== shot.referenceImage && !downloadedUrls.has(history.result)) {
            downloadedUrls.add(history.result);
            addTask(async () => {
              const blob = await fetchImageBlob(history.result);
              if (blob) {
                historyFolder?.file(`${shotName}_history_${idx + 1}.png`, blob);
                imageCount++;
              } else {
                failedDownloads.push({ type: '历史图片', url: history.result!, reason: '下载失败' });
              }
            });
          }
        }
        // 注意：视频已在上面统一收集，此处不再处理
      });
    }

    // 4.5 Audio Track
    if (shot.audioTrack) {
      const audioUrl = shot.audioTrack;
      const normalizedAudio = normalizeMediaUrl(audioUrl);
      if (!downloadedUrls.has(normalizedAudio)) {
        downloadedUrls.add(normalizedAudio);
        addTask(async () => {
          const blob = await getCachedMediaBlob(audioUrl, 'audio');
          if (blob) {
            audioFolder?.file(`${shotName}_audio.mp3`, blob, { binary: true, compression: 'STORE' });
            audioCount++;
          } else {
            failedDownloads.push({ type: '音频', url: audioUrl, reason: '下载失败' });
          }
        });
      }
    }
  }

  // ==========================================
  // 5. 保存 Sora 任务元数据
  // ==========================================
  if (soraTasksToDownload.length > 0) {
    const soraMeta = soraTasksToDownload.map(t => ({
      id: t.id,
      status: t.status,
      type: t.type,
      videoUrl: t.r2Url || t.kaponaiUrl,
      shotIds: t.shotIds,
      shotId: t.shotId,
      assigned: !!(t.shotId || (t.shotIds && t.shotIds.length > 0))
    }));
    soraVideosFolder?.file('sora_tasks.json', JSON.stringify(soraMeta, null, 2));
  }

  // ==========================================
  // 4. 角色和场景参考图 (关键修复：加入并发队列)
  // ==========================================

  // 3.1 角色参考图
  if (project.characters && charactersFolder) {
    project.characters.forEach(character => {
      character.referenceImages?.forEach((url, i) => {
        if (url && !downloadedUrls.has(url)) {
          downloadedUrls.add(url);
          addTask(async () => {
            const blob = await fetchImageBlob(url);
            if (blob) {
              const characterName = character.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
              charactersFolder.file(`${characterName}_${i + 1}.png`, blob);
              imageCount++;
            } else {
              failedDownloads.push({ type: '角色参考图', url, reason: '下载失败' });
            }
          });
        }
      });
    });
  }

  // 3.2 场景参考图
  if (project.locations && locationsFolder) {
    project.locations.forEach(location => {
      location.referenceImages?.forEach((url, i) => {
        if (url && !downloadedUrls.has(url)) {
          downloadedUrls.add(url);
          addTask(async () => {
            const blob = await fetchImageBlob(url);
            if (blob) {
              const locationName = location.name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
              locationsFolder.file(`${locationName}_${i + 1}.png`, blob);
              imageCount++;
            } else {
              failedDownloads.push({ type: '场景参考图', url, reason: '下载失败' });
            }
          });
        }
      });
    });
  }

  // ==========================================
  // 5. 执行下载
  // ==========================================
  console.log(`[Batch Download] 🚀 开始执行下载，总任务数: ${allTasks.length}`);
  emitProgress({
    phase: 'download',
    completed: 0,
    total: allTasks.length,
    message: allTasks.length > 0
      ? `开始下载 0/${allTasks.length}`
      : '无可下载素材，直接打包...'
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

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

  await runWithConcurrency(allTasks, options?.maxConcurrent ?? 6);

  // ==========================================
  // 6. 生成文档和打包
  // ==========================================

  emitProgress({
    phase: 'zip',
    message: allTasks.length > 0
      ? `素材下载完成，正在打包...`
      : '正在打包素材...'
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 项目信息
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

  // 打包
  const content = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true,
    },
    (metadata) => {
      emitProgress({
        phase: 'zip',
        percent: metadata.percent,
        message: `正在打包素材 ${Math.floor(metadata.percent)}%`
      });
    }
  );

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

  emitProgress({ phase: 'done', message: '打包完成' });

  return {
    imageCount,
    videoCount,
    audioCount,
    totalCount: imageCount + videoCount + audioCount,
    failedCount: failedDownloads.length,
    failedDownloads,
  };
}
