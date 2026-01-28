import { useState, useRef, useEffect } from 'react';
import { AtSign, User, MapPin, Image as ImageIcon } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { Character, Location } from '@/types/project';
import { cn } from '@/lib/utils';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMention: (type: 'character' | 'location', item: Character | Location) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onEnterSend?: () => void;
  autoResize?: boolean;
  style?: React.CSSProperties;
}

export default function MentionInput({
  value,
  onChange,
  onMention,
  placeholder = '输入提示词... (输入 @ 引用资源)',
  disabled = false,
  className = '',
  onEnterSend,
  autoResize = true,
  style,
}: MentionInputProps) {
  const { project } = useProjectStore();
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const characters = project?.characters || [];
  const locations = project?.locations || [];

  // ... (rest of logic same until useEffect)
  // I need to skip the middle part, but I can't skip with replace_file_content unless I target specific chunks.
  // I will use two replacements if needed, or just replace the top interface and then the bottom effect.
  // Actually, I'll replace the top part first.


  // 合并角色和场景
  const allAssets: Array<{ type: 'character' | 'location'; item: Character | Location }> = [
    ...characters.map(c => ({ type: 'character' as const, item: c })),
    ...locations.map(l => ({ type: 'location' as const, item: l })),
  ];

  // 过滤匹配的资源
  const filteredAssets = allAssets.filter(asset => {
    const name = asset.item.name.toLowerCase();
    return name.includes(mentionQuery.toLowerCase());
  });

  // 检测 @ 输入
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // 检查 @ 后面是否只有字母/数字/中文
      if (/^[\w\u4e00-\u9fa5]*$/.test(textAfterAt)) {
        setMentionQuery(textAfterAt);
        setShowMentionMenu(true);
        setSelectedIndex(0);

        // 计算菜单位置
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const { offsetLeft, offsetTop } = textarea;

          setMentionPosition({
            top: offsetTop - 220,
            left: offsetLeft,
          });
        }
      } else {
        setShowMentionMenu(false);
      }
    } else {
      setShowMentionMenu(false);
    }
  };

  // 选择资源
  const handleSelectAsset = (asset: typeof allAssets[0]) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const newValue = value.slice(0, lastAtIndex) + `@${asset.item.name} ` + textAfterCursor;
      onChange(newValue);
      setShowMentionMenu(false);
      // 通知父组件
      onMention(asset.type, asset.item);

      // 重新聚焦
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = lastAtIndex + asset.item.name.length + 2;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionMenu || filteredAssets.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey && onEnterSend) {
        e.preventDefault();
        onEnterSend();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredAssets.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredAssets.length) % filteredAssets.length);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSelectAsset(filteredAssets[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowMentionMenu(false);
    }
  };

  // Auto-resize
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value, autoResize]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className} overflow-y-auto`}
        rows={1}
        style={{
          ...(autoResize ? { minHeight: '44px', maxHeight: '200px' } : {}),
          ...style
        }}
      />

      {/* Mention Menu */}
      {showMentionMenu && filteredAssets.length > 0 && (
        <div
          className="absolute z-50 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-64 overflow-y-auto w-72 animate-in fade-in slide-in-from-bottom-2"
          style={{
            bottom: '100%',
            left: 0,
            marginBottom: '12px',
          }}
        >
          <div className="p-1 space-y-0.5">
            {filteredAssets.map((asset, index) => (
              <button
                key={`${asset.type}-${asset.item.id}`}
                onClick={() => handleSelectAsset(asset)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3",
                  index === selectedIndex
                    ? "bg-zinc-100 dark:bg-white/10 text-black dark:text-white"
                    : "hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-300"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border",
                  index === selectedIndex
                    ? "bg-white dark:bg-black/20 border-black/5 dark:border-white/10"
                    : "bg-zinc-50 dark:bg-white/5 border-transparent"
                )}>
                  {asset.type === 'character' ? <User size={16} /> : <MapPin size={16} />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{asset.item.name}</span>
                    {/* Ref Image Count */}
                    {(asset.item as any).referenceImages?.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full">
                        <ImageIcon size={10} />
                        <span>{(asset.item as any).referenceImages.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                    {asset.item.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {/* Footer */}
          <div className="px-3 py-2 border-t border-black/5 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 backdrop-blur-sm flex justify-between items-center text-[10px] text-zinc-400">
            <span>↑↓ 导航</span>
            <span>Enter 选择</span>
          </div>
        </div>
      )}

      {/* Hint */}
      {!showMentionMenu && !value && (
        <div className="absolute right-3 bottom-3 pointer-events-none">
          <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-600 opacity-50">
            <AtSign size={12} />
            <span>输入 @ 引用资源</span>
          </div>
        </div>
      )}
    </div>
  );
}
