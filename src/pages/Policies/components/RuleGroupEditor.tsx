import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, ChevronDown } from 'lucide-react';
import { Input } from '../../../components/ui/Field';
import { Switch } from '../../../components/ui/Switch';
import { cn } from '../../../components/Sidebar';
import type { RuleGroup } from '../types/ruleFields';
import type { RuleFieldConfig } from '../types/ruleFields';
import {
    flattenFields,
    getAvailableFieldConfigs,
    getUsedFieldKeys,
} from '../utils/ruleFieldsUtils';
import { getRuleFieldConfigByKey, isBoolField } from '../utils/ruleFieldConfig';

interface RuleGroupEditorProps {
    group: RuleGroup;
    onChange: (group: RuleGroup) => void;
    onRemove?: () => void;
    canRemove: boolean;
    formConfig: RuleFieldConfig[];
}

export function RuleGroupEditor({
    group,
    onChange,
    onRemove,
    canRemove,
    formConfig,
}: RuleGroupEditorProps) {
    const flatItems = useMemo(() => flattenFields(group.fields, formConfig), [group.fields, formConfig]);
    const availableConfigs = useMemo(() => getAvailableFieldConfigs(group.fields, formConfig), [group.fields, formConfig]);

    const [comboOpen, setComboOpen] = useState(false);
    const [comboQuery, setComboQuery] = useState('');
    const comboRef = useRef<HTMLDivElement>(null);

    // 更新某个字段的值
    const updateField = (formKey: string, value: string | boolean) => {
        onChange({
            ...group,
            fields: { ...group.fields, [formKey]: value },
        });
    };

    // 删除某个字段
    const removeField = (formKey: string) => {
        const newFields = { ...group.fields };
        delete newFields[formKey];
        onChange({ ...group, fields: newFields });
    };

    // 添加新字段
    const addField = (formKey: string, isBool: boolean) => {
        onChange({
            ...group,
            fields: { ...group.fields, [formKey]: isBool ? false : '' },
        });
        setComboOpen(false);
    };

    const filteredTypes = useMemo(() => {
        const q = comboQuery.trim().toLowerCase();
        if (!q) return availableConfigs;
        return availableConfigs.filter(c => c.label.toLowerCase().includes(q));
    }, [comboQuery, availableConfigs]);

    useEffect(() => {
        if (comboOpen) setComboQuery('');
    }, [comboOpen]);

    useEffect(() => {
        if (!comboOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [comboOpen]);

    return (
        <div className="rounded-lg border border-[rgba(39,44,54,0.08)] bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--app-text-tertiary)]">规则组</span>
                {canRemove && onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="p-1 rounded text-[var(--app-text-quaternary)] hover:bg-[var(--app-hover)]"
                        aria-label="删除规则组"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* 已添加的字段列表 */}
            {flatItems.length > 0 && (
                <div className="space-y-1.5">
                    {flatItems.map(item => (
                        <div key={item.formKey} className="flex items-center gap-2">
                            <span className="shrink-0 w-[72px] text-[11px] text-[var(--app-text-tertiary)]">{item.label}</span>
                            {item.type === 'boolean' ? (
                                <div className="flex-1 flex items-center">
                                    <Switch
                                        checked={item.value === true}
                                        onCheckedChange={(checked) => updateField(item.formKey, checked)}
                                        className="h-5 w-9"
                                    />
                                </div>
                            ) : (
                                <Input
                                    value={item.value as string}
                                    onChange={e => updateField(item.formKey, e.target.value)}
                                    placeholder={item.placeholder}
                                    className="flex-1 min-w-0 h-6 text-[11px]"
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => removeField(item.formKey)}
                                className="p-0.5 rounded text-[var(--app-text-quaternary)] hover:bg-[var(--app-hover)]"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 添加新字段 */}
            {availableConfigs.length > 0 && (
                <div ref={comboRef} className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                        <div
                            onClick={() => setComboOpen(v => !v)}
                            className={cn(
                                'relative flex items-center min-h-[28px] pl-7 pr-6 py-1 rounded-lg border text-left text-[11px] transition-colors cursor-pointer',
                                'border-[rgba(39,44,54,0.1)] bg-white hover:border-[rgba(39,44,54,0.2)]',
                                comboOpen && 'border-[var(--app-accent-border)] ring-1 ring-[var(--app-accent-border)]'
                            )}
                        >
                            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--app-text-quaternary)]" />
                            <span className="truncate flex-1 text-[var(--app-text-tertiary)]">
                                {comboOpen ? (comboQuery || '选择字段类型...') : '添加字段...'}
                            </span>
                            <ChevronDown className={cn('w-3 h-3 shrink-0 text-[var(--app-text-quaternary)] transition-transform', comboOpen && 'rotate-180')} />
                        </div>
                        {comboOpen && (
                            <>
                                <div className="absolute inset-0 z-10 flex rounded-lg border border-[var(--app-accent-border)] bg-white shadow-lg overflow-hidden">
                                    <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--app-text-quaternary)]" />
                                    <input
                                        type="text"
                                        value={comboQuery}
                                        onChange={e => setComboQuery(e.target.value)}
                                        placeholder="搜索字段..."
                                        className="flex-1 min-w-0 pl-7 pr-2 py-1 text-[11px] bg-transparent border-0 outline-none shadow-none focus:ring-0 placeholder:text-[var(--app-text-quaternary)]"
                                        autoFocus
                                    />
                                </div>
                                <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border border-[rgba(39,44,54,0.1)] bg-white shadow-lg py-0.5">
                                    {filteredTypes.length === 0 ? (
                                        <div className="px-2 py-2 text-[11px] text-[var(--app-text-quaternary)]">无可用字段</div>
                                    ) : (
                                        filteredTypes.map(c => (
                                            <button
                                                key={c.key}
                                                type="button"
                                                onClick={() => {
                                                    addField(c.formKey, c.type === 'boolean');
                                                    setComboQuery('');
                                                }}
                                                className="w-full px-2 py-1 text-left text-[11px] hover:bg-[var(--app-hover)] transition-colors flex items-center justify-between"
                                            >
                                                <span>{c.label}</span>
                                                {c.type === 'boolean' && (
                                                    <span className="text-[9px] text-[var(--app-text-quaternary)] bg-[var(--app-bg-secondary)] px-1 rounded">开关</span>
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
