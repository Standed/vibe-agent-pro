'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function TestR2Page() {
  const { user } = useAuth();

  // 图片上传状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageResult, setImageResult] = useState<any>(null);

  // 视频上传状态
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<any>(null);

  // 音频上传状态
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioResult, setAudioResult] = useState<any>(null);

  // 通用上传函数
  const uploadToR2 = async (
    file: File,
    folder: string,
    setLoading: (loading: boolean) => void,
    setResult: (result: any) => void
  ) => {
    if (!file) {
      toast.error('请先选择文件');
      return;
    }

    if (!user) {
      toast.error('请先登录');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      const startTime = Date.now();

      // 从 cookie 读取 session
      const match = document.cookie.match(/supabase-session=([^;]+)/);
      if (!match) {
        throw new Error('未找到登录凭证');
      }

      const decoded = decodeURIComponent(match[1]);
      const session = JSON.parse(decoded);
      const token = session.access_token;

      const response = await fetch('/api/upload-r2', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setResult({ ...result, elapsed });
      toast.success(`上传成功！耗时 ${elapsed}s`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('上传失败: ' + error.message);
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cine-bg p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-cine-accent mb-6">
          🧪 Cloudflare R2 上传测试
        </h1>

        {/* 登录状态提示 */}
        {user ? (
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 size={20} />
              <span>
                已登录: <strong>{user.email}</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-400">
              <XCircle size={20} />
              <span>未登录，请先登录后再测试</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 图片上传测试 */}
          <TestSection
            title="📷 图片上传测试"
            file={imageFile}
            loading={imageLoading}
            result={imageResult}
            accept="image/*"
            onFileChange={(e) => setImageFile(e.target.files?.[0] || null)}
            onUpload={() =>
              uploadToR2(imageFile!, 'test-images', setImageLoading, setImageResult)
            }
            disabled={!user}
          />

          {/* 视频上传测试 */}
          <TestSection
            title="🎬 视频上传测试"
            file={videoFile}
            loading={videoLoading}
            result={videoResult}
            accept="video/*"
            onFileChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            onUpload={() =>
              uploadToR2(videoFile!, 'test-videos', setVideoLoading, setVideoResult)
            }
            disabled={!user}
          />

          {/* 音频上传测试 */}
          <TestSection
            title="🎵 音频上传测试"
            file={audioFile}
            loading={audioLoading}
            result={audioResult}
            accept="audio/*"
            onFileChange={(e) => setAudioFile(e.target.files?.[0] || null)}
            onUpload={() =>
              uploadToR2(audioFile!, 'test-audios', setAudioLoading, setAudioResult)
            }
            disabled={!user}
          />
        </div>
      </div>
    </div>
  );
}

// 测试区块组件
function TestSection({
  title,
  file,
  loading,
  result,
  accept,
  onFileChange,
  onUpload,
  disabled,
}: {
  title: string;
  file: File | null;
  loading: boolean;
  result: any;
  accept: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  disabled: boolean;
}) {
  return (
    <div className="bg-cine-dark border border-cine-border rounded-lg p-6">
      <h2 className="text-xl font-bold text-cine-text mb-4">{title}</h2>

      {/* 文件选择 */}
      <div className="mb-4">
        <input
          type="file"
          accept={accept}
          onChange={onFileChange}
          className="w-full px-3 py-2 bg-cine-panel border border-cine-border rounded text-cine-text text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-cine-accent file:text-white hover:file:bg-cine-accent-hover cursor-pointer"
          disabled={disabled}
        />
      </div>

      {/* 上传按钮 */}
      <button
        onClick={onUpload}
        disabled={!file || loading || disabled}
        className="w-full px-4 py-2 bg-cine-accent hover:bg-cine-accent-hover disabled:bg-cine-border disabled:cursor-not-allowed text-white rounded font-bold flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            上传中...
          </>
        ) : (
          <>
            <Upload size={18} />
            上传文件
          </>
        )}
      </button>

      {/* 文件信息 */}
      {file && (
        <div className="mt-4 p-3 bg-cine-panel rounded text-sm">
          <div className="text-cine-text-muted">文件名:</div>
          <div className="text-cine-text truncate">{file.name}</div>
          <div className="text-cine-text-muted mt-2">大小:</div>
          <div className="text-cine-text">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </div>
          <div className="text-cine-text-muted mt-2">类型:</div>
          <div className="text-cine-text">{file.type}</div>
        </div>
      )}

      {/* 上传结果 */}
      {result && (
        <div className="mt-4">
          {result.error ? (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-sm">
              <div className="text-red-400 font-bold mb-1">❌ 上传失败</div>
              <div className="text-red-300 text-xs">{result.error}</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-green-900/20 border border-green-500/30 rounded text-sm">
                <div className="text-green-400 font-bold mb-1">
                  ✅ 上传成功！耗时: {result.elapsed}s
                </div>
                <div className="text-green-300 text-xs break-all">
                  <strong>URL:</strong> <br />
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cine-accent hover:underline"
                  >
                    {result.url}
                  </a>
                </div>
                <div className="text-green-300 text-xs mt-2">
                  <strong>Key:</strong> {result.key}
                </div>
                <div className="text-green-300 text-xs">
                  <strong>Bucket:</strong> {result.bucket}
                </div>
              </div>

              {/* 预览 */}
              {file && (
                <div className="border border-cine-border rounded overflow-hidden">
                  {file.type.startsWith('image/') && (
                    <img
                      src={result.url}
                      alt="Preview"
                      className="w-full h-auto"
                    />
                  )}
                  {file.type.startsWith('video/') && (
                    <video src={result.url} controls className="w-full h-auto" />
                  )}
                  {file.type.startsWith('audio/') && (
                    <audio src={result.url} controls className="w-full" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
