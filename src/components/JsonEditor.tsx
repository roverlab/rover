/**
 * 通用 JSON 编辑器组件
 * 支持 JSON 格式化、校验功能
 */
import React, { useMemo, useCallback } from 'react';
import { Button } from './ui/Button';
import { AlignLeft } from 'lucide-react';

export interface JsonEditorProps {
    /** JSON 文本内容 */
    value: string;
    /** 值变化回调 */
    onChange: (value: string) => void;
    /** 占位符文本 */
    placeholder?: string;
    /** 帮助文本（显示在编辑器下方） */
    hint?: string;
    /** 文档链接 */
    docLink?: {
        url: string;
        label: string;
    };
    /** textarea 高度（行数） */
    rows?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示格式化按钮 */
    showFormatButton?: boolean;
    /** 格式化成功回调 */
    onFormatSuccess?: () => void;
    /** 格式化失败回调 */
    onFormatError?: (error: string) => void;
    /** 额外的 className */
    className?: string;
    /** 额外的 textarea className */
    textareaClassName?: string;
    /** 是否要求必须是对象格式（非数组） */
    requireObject?: boolean;
}

/**
 * 格式化 JSON 文本
 * @param text 原始 JSON 文本
 * @param requireObject 是否要求必须是对象
 * @returns 格式化结果：成功返回格式化后的文本，失败返回错误信息
 */
export function formatJsonText(text: string, requireObject: boolean = true): { success: true; data: string } | { success: false; error: string } {
    const content = text.trim();
    if (!content) {
        return { success: false, error: '请输入 JSON 内容' };
    }
    
    try {
        const parsed = JSON.parse(content);
        
        if (requireObject && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
            return { success: false, error: 'JSON 内容必须是有效的对象格式' };
        }
        
        return { success: true, data: JSON.stringify(parsed, null, 2) };
    } catch {
        return { success: false, error: 'JSON 格式错误，请检查输入' };
    }
}

/**
 * 通用 JSON 编辑器组件
 * 
 * 支持功能：
 * - JSON 格式化
 * - 格式校验
 * - 可选的对象格式要求
 * - 文档链接
 * 
 * 使用示例：
 * ```tsx
 * <JsonEditor
 *   value={jsonText}
 *   onChange={setJsonText}
 *   placeholder="输入 JSON 配置..."
 *   hint="输入 sing-box 配置"
 *   docLink={{ url: "https://example.com", label: "文档" }}
 *   showFormatButton
 * />
 * ```
 */
export function JsonEditor({
    value,
    onChange,
    placeholder,
    hint,
    docLink,
    rows = 12,
    disabled = false,
    showFormatButton = true,
    onFormatSuccess,
    onFormatError,
    className = '',
    textareaClassName = '',
    requireObject = true,
}: JsonEditorProps) {
    const handleFormat = useCallback(() => {
        const result = formatJsonText(value, requireObject);
        
        if (result.success) {
            onChange(result.data);
            onFormatSuccess?.();
        } else {
            onFormatError?.(result.error);
        }
    }, [value, requireObject, onChange, onFormatSuccess, onFormatError]);

    const defaultPlaceholder = useMemo(() => `{\n  "key": "value"\n}`, []);

    return (
        <div className={`space-y-1.5 ${className}`}>
            {showFormatButton && (
                <div className="flex items-center justify-between gap-2 pl-1">
                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">
                        JSON 配置
                    </label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFormat}
                        disabled={disabled}
                    >
                        <AlignLeft className="w-3.5 h-3.5 mr-1" />
                        格式化
                    </Button>
                </div>
            )}
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder || defaultPlaceholder}
                rows={rows}
                disabled={disabled}
                spellCheck={false}
                className={`w-full px-3 py-2 text-[13px] font-mono border rounded-[10px] resize-y focus:outline-none focus:border-[var(--app-accent-border)] bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] border-[rgba(39,44,54,0.12)] hover:border-[rgba(39,44,54,0.18)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${textareaClassName}`}
            />
            {(hint || docLink) && (
                <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">
                    {hint}
                    {docLink && (
                        <>
                            {'，参考 '}
                            <a
                                href={docLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--app-accent)] hover:underline"
                            >
                                {docLink.label}
                            </a>
                        </>
                    )}
                </p>
            )}
        </div>
    );
}

export default JsonEditor;
