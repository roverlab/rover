import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../Sidebar';

export interface TagInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    className?: string;
    /** 分隔符，输入时用于拆分（默认逗号、空格、回车） */
    separators?: string[];
}

/**
 * Tag 风格的多值输入组件
 * 单行展示，每个值为一个可删除的 tag，支持输入添加
 */
export const TagInput = React.forwardRef<HTMLDivElement, TagInputProps>(
    ({ value, onChange, placeholder, className, separators }, ref) => {
        const { t } = useTranslation();
        const defaultPlaceholder = placeholder ?? t('common.tagInputPlaceholder');
        const [inputValue, setInputValue] = React.useState('');
        const inputRef = React.useRef<HTMLInputElement>(null);

        const addTag = (tag: string) => {
            const trimmed = tag.trim();
            if (trimmed && !value.includes(trimmed)) {
                onChange([...value, trimmed]);
            }
        };

        const removeTag = (index: number) => {
            onChange(value.filter((_, i) => i !== index));
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' || e.key === 'Backspace') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (inputValue.trim()) {
                        addTag(inputValue);
                        setInputValue('');
                    }
                    return;
                }
                if (e.key === 'Backspace' && !inputValue && value.length > 0) {
                    removeTag(value.length - 1);
                    return;
                }
            }
        };

        const splitBySeparators = (text: string): string[] => {
            const regex = separators
                ? new RegExp('[' + separators.map(s => {
                    if (s === ' ') return '\\s';
                    if (s === '\n') return '\\n';
                    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }).join('') + ']+')
                : /[,\s\n]+/;
            return text.split(regex).map(s => s.trim()).filter(Boolean);
        };

        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            const parts = splitBySeparators(v);
            if (parts.length > 1) {
                parts.forEach(p => addTag(p));
                setInputValue('');
            } else if (parts.length === 1 && (v.includes(',') || v.includes(' ') || v.includes('\n'))) {
                addTag(parts[0]);
                setInputValue('');
            } else {
                setInputValue(v);
            }
        };

        const handlePaste = (e: React.ClipboardEvent) => {
            const pasted = e.clipboardData.getData('text');
            const parts = splitBySeparators(pasted);
            if (parts.length > 1) {
                e.preventDefault();
                parts.forEach(tag => addTag(tag));
            }
        };

        return (
            <div
                ref={ref}
                className={cn(
                    'flex flex-nowrap items-center gap-1.5 min-h-[36px] px-3 py-2 rounded-[10px] border border-[var(--app-stroke-strong)] bg-white overflow-hidden',
                    'focus-within:border-[var(--app-accent-border)]',
                    'text-[13px] text-[var(--app-text)]',
                    className
                )}
                onClick={() => inputRef.current?.focus()}
            >
                <div className="flex flex-nowrap items-center gap-1.5 shrink-0 overflow-hidden">
                    {value.map((tag, idx) => (
                        <span
                            key={`${tag}-${idx}`}
                            className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                        >
                            <span className="truncate">{tag}</span>
                            <button
                                type="button"
                                className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                onClick={e => {
                                    e.stopPropagation();
                                    removeTag(idx);
                                }}
                                aria-label={t('common.delete')}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={value.length === 0 ? defaultPlaceholder : ''}
                    className="min-w-[80px] flex-1 bg-transparent border-0 outline-none shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:shadow-none placeholder:text-[var(--app-text-quaternary)] text-left"
                />
            </div>
        );
    }
);

TagInput.displayName = 'TagInput';