'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { ShotSize, CameraMovement } from '@/types/project';

interface AddShotDialogProps {
  sceneId: string;
  sceneName: string;
  existingShotsCount: number;
  insertIndex?: number;
  onAdd: (shotData: {
    sceneId: string;
    order: number;
    shotSize: ShotSize;
    cameraMovement: CameraMovement;
    duration: number;
    description: string;
    dialogue?: string;
    narration?: string;
  }) => void;
  onClose: () => void;
}

export default function AddShotDialog({
  sceneId,
  sceneName,
  existingShotsCount,
  onAdd,
  onClose,
  insertIndex,
}: AddShotDialogProps) {
  const [shotSize, setShotSize] = useState<ShotSize>('Medium Shot');
  const [cameraMovement, setCameraMovement] = useState<CameraMovement>('Static');
  const [duration, setDuration] = useState(3);
  const [description, setDescription] = useState('');
  const [dialogue, setDialogue] = useState('');
  const [narration, setNarration] = useState('');

  const shotSizeOptions: ShotSize[] = [
    'Extreme Wide Shot',
    'Wide Shot',
    'Medium Shot',
    'Close-Up',
    'Extreme Close-Up',
  ];

  const cameraMovementOptions: CameraMovement[] = [
    'Static',
    'Pan Left',
    'Pan Right',
    'Tilt Up',
    'Tilt Down',
    'Dolly In',
    'Dolly Out',
    'Zoom In',
    'Zoom Out',
    'Handheld',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      alert('请输入镜头描述');
      return;
    }

    onAdd({
      sceneId,
      order: (insertIndex ?? existingShotsCount) + 1,
      shotSize,
      cameraMovement,
      duration,
      description: description.trim(),
      dialogue: dialogue.trim() || undefined,
      narration: narration.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-light-panel dark:bg-cine-dark border border-light-border dark:border-cine-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-cine-border">
          <div>
            <h2 className="text-lg font-bold text-light-text dark:text-white">添加新镜头</h2>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              场景：{sceneName} · 镜头 #{(insertIndex ?? existingShotsCount) + 1}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-light-bg dark:hover:bg-cine-panel rounded-lg transition-colors"
          >
            <X size={20} className="text-light-text-muted dark:text-cine-text-muted" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Shot Size */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              景别 *
            </label>
            <select
              value={shotSize}
              onChange={(e) => setShotSize(e.target.value as ShotSize)}
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
            >
              {shotSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              远景适合展示环境，特写适合捕捉情绪细节
            </p>
          </div>

          {/* Camera Movement */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              运镜方式 *
            </label>
            <select
              value={cameraMovement}
              onChange={(e) => setCameraMovement(e.target.value as CameraMovement)}
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
            >
              {cameraMovementOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              80% 的镜头使用 Static（静止），避免过度运镜
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              时长（秒）*
            </label>
            <input
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
              className="w-full bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
            />
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              建议：环境镜头 3-4s，动作镜头 2-3s，情绪特写 2-3s
            </p>
          </div>

          {/* Visual Description */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              视觉描述 *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述画面内容：场景环境、人物动作、情绪表情、光影氛围等...&#10;&#10;示例：室内客厅，温暖的午后阳光透过窗帘洒进来。苏白坐在沙发上，手里拿着手机，表情疑惑地看着屏幕。中景，平视角度。"
              className="w-full h-32 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
              required
            />
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              至少 50 字，包含：场景、人物、动作、情绪、光影、镜头角度
            </p>
          </div>

          {/* Dialogue */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              对白（选填）
            </label>
            <textarea
              value={dialogue}
              onChange={(e) => setDialogue(e.target.value)}
              placeholder="角色说的话...&#10;&#10;示例：这是什么鬼？"
              className="w-full h-20 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
            />
            <p className="text-xs text-light-text-muted dark:text-cine-text-muted mt-1">
              只填写台词内容，不要加"XX说："前缀
            </p>
          </div>

          {/* Narration */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-white mb-2">
              旁白（选填）
            </label>
            <textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="画外音或旁白..."
              className="w-full h-20 bg-light-bg dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-light-accent dark:focus:border-cine-accent"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-light-border dark:border-cine-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-light-text-muted dark:text-cine-text-muted hover:text-light-text dark:hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="bg-light-accent dark:bg-cine-accent hover:bg-light-accent-hover dark:hover:bg-cine-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            添加镜头
          </button>
        </div>
      </div>
    </div>
  );
}
