const inferFileExtension = (url: string): string => {
  if (!url) return 'png';
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);/);
    const mime = match?.[1] || '';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('bmp')) return 'bmp';
    return 'png';
  }

  try {
    const cleanUrl = url.split('?')[0];
    const lastPart = cleanUrl.split('/').pop() || '';
    const extMatch = lastPart.match(/\.([a-zA-Z0-9]+)$/);
    return extMatch?.[1]?.toLowerCase() || 'png';
  } catch {
    return 'png';
  }
};

const triggerDownload = (href: string, filename: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadFile = async (url: string, filename: string): Promise<void> => {
  if (!url) return;

  const hasExt = filename.includes('.');
  const finalName = hasExt ? filename : `${filename}.${inferFileExtension(url)}`;

  if (url.startsWith('data:')) {
    triggerDownload(url, finalName);
    return;
  }

  try {
    // 尝试直接下载
    const response = await fetch(url);
    if (!response.ok) throw new Error('Direct fetch failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, finalName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // 失败（如CORS），尝试走 API 代理下载
    try {
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(finalName)}`;
      // 直接触发浏览器下载该 API 链接
      triggerDownload(proxyUrl, finalName);
    } catch (err) {
      console.error('Download failed:', err);
      // 最后兜底：直接打开链接
      triggerDownload(url, finalName);
    }
  }
};
