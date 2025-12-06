'use client';

import { useState, useRef, useEffect } from 'react';
import { AtSign } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { Character, Location } from '@/types/project';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMention: (type: 'character' | 'location', item: Character | Location) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onEnterSend?: () => void; // Callback for Enter key to send message
}

export default function MentionInput({
  value,
  onChange,
  onMention,
  placeholder = '输入提示词... (输入 @ 引用资源)',
  disabled = false,
  className = '',
  onEnterSend,
}: MentionInputProps) {
  const { project } = useProjectStore();
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const characters = project?.characters || [];
  const locations = project?.locations || [];

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
          const { offsetLeft, offsetTop, offsetHeight } = textarea;

          setMentionPosition({
            top: offsetTop - 200, // 菜单显示在输入框上方
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
      // Handle Enter to send when mention menu is not showing
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

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        rows={2}
      />

      {/* Mention Menu */}
      {showMentionMenu && filteredAssets.length > 0 && (
        <div
          className="absolute z-50 bg-light-panel dark:bg-cine-panel border border-light-border dark:border-cine-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
          style={{
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            minWidth: '250px',
          }}
        >
          <div className="p-2 space-y-1">
            {filteredAssets.map((asset, index) => (
              <button
                key={`${asset.type}-${asset.item.id}`}
                onClick={() => handleSelectAsset(asset)}
                className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-3 ${
                  index === selectedIndex
                    ? 'bg-light-accent dark:bg-cine-accent text-white'
                    : 'hover:bg-light-bg dark:hover:bg-cine-bg text-light-text dark:text-white'
                }`}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${
                  index === selectedIndex
                    ? 'bg-white/20'
                    : 'bg-light-bg dark:bg-cine-bg'
                }`}>
                  {asset.type === 'character' && (
                    <span className="text-xs">👤</span>
                  )}
                  {asset.type === 'location' && (
                    <span className="text-xs">📍</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{asset.item.name}</div>
                  <div className={`text-xs truncate ${
                    index === selectedIndex
                      ? 'text-white/70'
                      : 'text-light-text-muted dark:text-cine-text-muted'
                  }`}>
                    {asset.type === 'character' ? '角色' : '场景'} · {asset.item.description.slice(0, 30)}...
                  </div>
                </div>

                {/* Reference Image Indicator */}
                {((asset.type === 'character' && (asset.item as Character).referenceImages?.length > 0) ||
                  (asset.type === 'location' && (asset.item as Location).referenceImages?.length > 0)) && (
                  <div className={`flex-shrink-0 text-xs ${
                    index === selectedIndex ? 'text-white/70' : 'text-light-accent dark:text-cine-accent'
                  }`}>
                    {asset.type === 'character'
                      ? (asset.item as Character).referenceImages?.length
                      : (asset.item as Location).referenceImages?.length} 张参考图
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-light-border dark:border-cine-border bg-light-bg/50 dark:bg-cine-bg/50">
            <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
              <span className="font-mono bg-light-bg dark:bg-cine-panel px-1 rounded">↑↓</span> 导航 ·
              <span className="font-mono bg-light-bg dark:bg-cine-panel px-1 rounded ml-1">Enter</span> 选择 ·
              <span className="font-mono bg-light-bg dark:bg-cine-panel px-1 rounded ml-1">Esc</span> 取消
            </div>
          </div>
        </div>
      )}

      {/* Hint */}
      {!showMentionMenu && !value && (
        <div className="absolute right-3 bottom-3 pointer-events-none">
          <div className="flex items-center gap-1 text-xs text-light-text-muted dark:text-cine-text-muted opacity-50">
            <AtSign size={12} />
            <span>输入 @ 引用资源</span>
          </div>
        </div>
      )}
    </div>
  );
}
