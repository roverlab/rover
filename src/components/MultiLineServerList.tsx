/**
 * 多行地址列表编辑组件（卡片表格风格）
 * 将逗号分隔的地址字符串转换为可逐行编辑的卡片列表
 * 每条地址一行，带序号和删除按钮，底部独立的添加按钮
 */
import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Plus, X } from 'lucide-react';

export interface MultiLineServerListProps {
  /** 逗号分隔的地址字符串 */
  value: string;
  /** 值变化回调，返回逗号分隔的字符串 */
  onChange: (value: string) => void;
  /** 占位文本（编辑行的 placeholder） */
  placeholder?: string;
  /** 帮助文本 */
  hint?: string;
  /** 是否必填（显示红色星号） */
  required?: boolean;
  /** 标签文本 */
  label?: string;
  /** 额外 className */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 添加按钮文本（默认使用 i18n） */
  addLabel?: string;
}

/**
 * 将逗号分隔字符串解析为地址数组
 */
function parseEntries(value: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((s) => s.trim());
}

/**
 * 将地址数组序列化为逗号分隔字符串
 */
function serializeEntries(entries: string[]): string {
  return entries.join(', ');
}

export function MultiLineServerList({
  value,
  onChange,
  placeholder,
  hint,
  required = false,
  label,
  className,
  disabled = false,
  addLabel,
}: MultiLineServerListProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const entries = parseEntries(value);

  const emitChange = useCallback(
    (newEntries: string[]) => {
      onChange(serializeEntries(newEntries));
    },
    [onChange]
  );

  // 点击添加：进入新增模式（不修改 entries，等确认时才添加）
  const handleAdd = useCallback(() => {
    if (disabled) return;
    setEditingIndex(entries.length); // 用 entries.length 表示新增行
    setEditingValue('');
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, [disabled, entries.length]);

  // 删除条目
  const handleRemove = useCallback(
    (index: number) => {
      const newEntries = entries.filter((_, i) => i !== index);
      emitChange(newEntries);
      if (editingIndex === index) {
        setEditingIndex(null);
        setEditingValue('');
      }
    },
    [entries, editingIndex, emitChange]
  );

  // 双击进入编辑
  const handleStartEdit = useCallback(
    (index: number) => {
      if (disabled) return;
      setEditingIndex(index);
      setEditingValue(entries[index] || '');
      setTimeout(() => editInputRef.current?.select(), 0);
    },
    [disabled, entries]
  );

  // 确认编辑（回车或失焦）
  const handleCommitEdit = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      // 空内容：如果是新增则直接丢弃，如果是编辑已有则删除该行
      if (editingIndex < entries.length) {
        const newEntries = entries.filter((_, i) => i !== editingIndex);
        emitChange(newEntries);
      }
    } else {
      if (editingIndex < entries.length) {
        // 编辑已有条目
        const newEntries = [...entries];
        newEntries[editingIndex] = trimmed;
        emitChange(newEntries);
      } else {
        // 新增条目
        emitChange([...entries, trimmed]);
      }
    }
    setEditingIndex(null);
    setEditingValue('');
  }, [editingIndex, editingValue, entries, emitChange]);

  // 编辑输入框键盘
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommitEdit();
      } else if (e.key === 'Escape') {
        // Escape 取消编辑
        setEditingIndex(null);
        setEditingValue('');
      }
    },
    [editingIndex, editingValue, entries, emitChange, handleCommitEdit]
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
          {label}
          {required && <span className="text-[var(--app-danger)] ml-0.5">*</span>}
          {entries.filter(Boolean).length > 0 && (
            <span className="ml-2 text-[10px] font-normal text-[var(--app-text-quaternary)]">
              ({entries.filter(Boolean).length})
            </span>
          )}
        </label>
      )}

      {/* 卡片列表容器（有条目或正在新增时显示） */}
      {(entries.length > 0 || editingIndex !== null) && (
        <div
          className={cn(
            'rounded-[10px] border overflow-hidden transition-colors',
            'bg-[var(--app-panel)] border-[var(--app-stroke)]',
            !disabled && 'hover:border-[var(--app-stroke-strong)]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* 地址行 */}
          {entries.map((entry, index) => (
            <div
              key={`${index}-${entry}`}
              className={cn(
                'group flex items-center gap-2 px-3 min-h-[32px] transition-colors',
                index > 0 && 'border-t border-[var(--app-stroke)]/50',
                editingIndex === index
                  ? 'py-1.5'
                  : 'hover:bg-[var(--app-hover)]'
              )}
            >
              {/* 序号 */}
              <span className="shrink-0 w-5 text-center text-[10px] font-mono text-[var(--app-text-quaternary)] select-none">
                {index + 1}
              </span>

              {/* 内容 */}
              {editingIndex === index ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={handleCommitEdit}
                  onKeyDown={handleEditKeyDown}
                  placeholder={placeholder || t('multiLineServerList.addPlaceholder')}
                  spellCheck={false}
                  className={cn(
                    'input-field flex-1 min-w-0 text-[13px] font-mono',
                    'min-h-[30px] py-1 px-2.5',
                    'rounded-[8px]'
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'flex-1 min-w-0 text-[13px] font-mono truncate',
                    entry ? 'text-[var(--app-text)]' : 'text-[var(--app-text-quaternary)] italic',
                    !disabled && 'cursor-text'
                  )}
                  onClick={() => handleStartEdit(index)}
                  title={entry}
                >
                  {entry || t('multiLineServerList.emptyEntry')}
                </span>
              )}

              {/* 删除按钮 */}
              {!disabled && editingIndex !== index && (
                <button
                  type="button"
                  className={cn(
                    'shrink-0 p-0.5 rounded transition-opacity',
                    'text-[var(--app-text-quaternary)] hover:text-[var(--app-danger)]',
                    'opacity-0 group-hover:opacity-100',
                    'hover:bg-[var(--app-danger)]/10'
                  )}
                  onClick={() => handleRemove(index)}
                  aria-label={t('common.delete')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {/* 新增行（editingIndex === entries.length 表示正在新增） */}
          {editingIndex === entries.length && (
            <div
              className={cn(
                'group flex items-center gap-2 px-3 min-h-[32px] py-1.5 transition-colors',
                entries.length > 0 && 'border-t border-[var(--app-stroke)]/50'
              )}
            >
              <span className="shrink-0 w-5 text-center text-[10px] font-mono text-[var(--app-text-quaternary)] select-none">
                {entries.length + 1}
              </span>
              <input
                ref={editInputRef}
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={handleCommitEdit}
                onKeyDown={handleEditKeyDown}
                placeholder={placeholder || t('multiLineServerList.addPlaceholder')}
                spellCheck={false}
                className={cn(
                  'input-field flex-1 min-w-0 text-[13px] font-mono',
                  'min-h-[30px] py-1 px-2.5',
                  'rounded-[8px]'
                )}
              />
            </div>
          )}
        </div>
      )}

      {/* 添加按钮（独立于卡片，独占一行） */}
      {!disabled && (
        <div className="w-full">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-[6px] transition-colors',
              'text-[12px] text-[var(--app-accent-strong)]',
              'hover:bg-[var(--app-accent-soft)]'
            )}
            onClick={handleAdd}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{addLabel || t('multiLineServerList.addLabel')}</span>
          </button>
        </div>
      )}

      {/* 帮助文本 */}
      {hint && (
        <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1 pl-1">
          {hint}
        </p>
      )}
    </div>
  );
}
