import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { X, ChevronDown } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { RuleSetGroupItem } from './PolicyAllRuleSetModal';
import { PolicyAllRuleSetModal } from './PolicyAllRuleSetModal';
import { RuleFieldsEditorModal } from './components/RuleFieldsEditorModal';
import { RuleTreeView } from './components/RuleTreeView';
import { RULE_FIELD_CONFIG } from './utils/ruleFieldConfig';
import type { RuleFieldConfig } from './types/ruleFields';

export type PolicyType = 'default' | 'raw';

export interface PolicyEditFormStateBase {
    policyType: PolicyType;
    name: string;
    rawDataContent: string;
    selectedRuleSetIds: Set<string>;
    /** 规则组树（最小单位为规则组，逻辑字段表示嵌套关系） */
    ruleGroupsTree?: import('./RuleFieldsEditor').RuleGroupTreeNode;
}

/** 选项配置 */
export interface FieldOption {
    value: string;
    label: string;
}

/** 字段配置 - 用于定义中间字段的渲染 */
export interface PolicyFieldConfig<T extends PolicyEditFormStateBase> {
    /** 字段名称（如 outbound / server） */
    fieldName: keyof T;
    /** 字段标签（如 "出站" / "DNS服务器"） */
    fieldLabel: string;
    /** 选项列表 */
    options: FieldOption[];
}

export interface PolicyEditModalBaseProps<T extends PolicyEditFormStateBase> {
    open: boolean;
    title: string;
    editingPolicy: { id?: string; type?: PolicyType } | null;
    form: T;
    ruleSetGroups: RuleSetGroupItem[];
    unavailableAclRefs?: string[];
    /** 规则集与高级规则同时有值时为 true */
    ruleSetAdvancedConflict?: boolean;
    showRuleSetModal: boolean;
    showRuleFieldsEditorModal: boolean;
    onClose: () => void;
    onFormChange: (updates: Partial<T>) => void;
    setShowRuleSetModal: (v: boolean) => void;
    setShowRuleFieldsEditorModal: (v: boolean) => void;
    onSave: () => void;
    /** 中间字段配置（出站 / DNS服务器） */
    fieldConfig: PolicyFieldConfig<T>;
    /** 高级规则字段配置（默认使用 RULE_FIELD_CONFIG） */
    ruleFieldConfig?: RuleFieldConfig[];
    /** 规则编辑器弹窗标题（默认「规则集编辑器」，DNS 策略可传「规则编辑器」） */
    ruleFieldsEditorTitle?: string;
    /** 额外字段内容（在中间字段后面，规则集前面） */
    extraFields?: React.ReactNode;
}

export function PolicyEditModalBase<T extends PolicyEditFormStateBase>({
    open,
    title,
    editingPolicy,
    form,
    ruleSetGroups,
    unavailableAclRefs = [],
    ruleSetAdvancedConflict = false,
    showRuleSetModal,
    showRuleFieldsEditorModal,
    onClose,
    onFormChange,
    setShowRuleSetModal,
    setShowRuleFieldsEditorModal,
    onSave,
    fieldConfig,
    ruleFieldConfig = RULE_FIELD_CONFIG,
    ruleFieldsEditorTitle = '规则集编辑器',
    extraFields,
}: PolicyEditModalBaseProps<T>) {
    const toggleRuleSetSelection = (id: string) => {
        const next = new Set(form.selectedRuleSetIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onFormChange({ selectedRuleSetIds: next } as Partial<T>);
    };

    const allRuleSetItems = ruleSetGroups.flatMap(g => g.items);
    const getItemById = (id: string) => allRuleSetItems.find(p => p.id === id);

    // 获取当前字段值
    const fieldValue = String((form as Record<string, unknown>)[fieldConfig.fieldName as string] || '');

    if (!open) return null;

    return (
        <>
            {createPortal(
                <AnimatePresence>
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                            onClick={onClose}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative z-10 w-full max-w-2xl flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                    {editingPolicy ? `编辑${title}` : `添加${title}`}
                                </h2>
                                <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2" aria-label="关闭">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">策略类型</label>
                                    {editingPolicy ? (
                                        <div className="px-3 py-2 rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-[var(--app-bg-secondary)] text-[13px] text-[var(--app-text-secondary)]">
                                            {form.policyType === 'raw' ? '原始编辑' : '标准'}
                                            <span className="text-[11px] text-[var(--app-text-quaternary)] ml-2">(编辑时不可修改类型)</span>
                                        </div>
                                    ) : (
                                        <Select value={form.policyType} onChange={e => onFormChange({ policyType: e.target.value as PolicyType } as Partial<T>)}>
                                            <option value="default">标准</option>
                                            <option value="raw">原始</option>
                                        </Select>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">策略名称</label>
                                    <Input value={form.name} onChange={e => onFormChange({ name: e.target.value } as Partial<T>)} placeholder="例如：🌍 国外穿墙" />
                                </div>

                                {/* 中间字段选择器（出站 / DNS服务器）- 唯一的差异点 */}
                                {form.policyType === 'default' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{fieldConfig.fieldLabel}</label>
                                        <Select 
                                            value={fieldValue} 
                                            onChange={e => onFormChange({ [fieldConfig.fieldName]: e.target.value } as Partial<T>)}
                                        >
                                            {fieldConfig.options.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </Select>
                                    </div>
                                )}

                                {/* 额外字段（如普通策略的"订阅出站节点"） */}
                                {form.policyType === 'default' && extraFields}

                                {form.policyType === 'raw' ? (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">原始规则</label>
                                        <textarea
                                            value={form.rawDataContent}
                                            onChange={e => onFormChange({ rawDataContent: e.target.value } as Partial<T>)}
                                            placeholder={`{\n  "domain": ["example.com"],\n  "domain_suffix": [".google.com"],\n  "ip_cidr": ["192.168.1.0/24"]\n}`}
                                            className="w-full h-48 px-3 py-2 text-[13px] font-mono rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-white focus:border-[var(--app-accent-border)] focus:outline-none resize-none"
                                            spellCheck={false}
                                        />
                                        <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">输入 sing-box 路由规则 JSON 格式</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">规则集</label>
                                            {ruleSetGroups.length === 0 ? (
                                                <p className="px-3 py-4 text-[12px] text-[var(--app-text-quaternary)] border border-[rgba(39,44,54,0.12)] rounded-[10px] bg-white">暂无规则集，请先在「规则集」页面添加或等待内置规则集加载</p>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer overflow-hidden",
                                                        "border-[rgba(39,44,54,0.12)]"
                                                    )}
                                                    onClick={() => setShowRuleSetModal(true)}
                                                >
                                                    {form.selectedRuleSetIds.size === 0 ? (
                                                        <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择规则集</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                                                            {Array.from(form.selectedRuleSetIds).map(id => {
                                                                const p = getItemById(id);
                                                                const displayName = p ? p.name : id;
                                                                return (
                                                                    <span
                                                                        key={id}
                                                                        className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <span className="truncate">{displayName}</span>
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                const next = new Set(form.selectedRuleSetIds);
                                                                                next.delete(id);
                                                                                onFormChange({ selectedRuleSetIds: next } as Partial<T>);
                                                                            }}
                                                                            aria-label="删除"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                                                </div>
                                            )}
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">点击选择规则集，内置与自定义已合并展示</p>
                                        </div>

                                        {/* 规则查看器 + 高级规则编辑器 */}
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 pl-1">
                                                <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">高级规则</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRuleFieldsEditorModal?.(true)}
                                                    className="px-3 py-1.5 rounded-[8px] border border-[rgba(39,44,54,0.12)] bg-white hover:bg-[var(--app-hover)] transition-colors text-[12px] text-[var(--app-text)]"
                                                >
                                                    打开规则编辑器
                                                </button>
                                            </div>
                                            {form.ruleGroupsTree && (
                                                <RuleTreeView
                                                    node={form.ruleGroupsTree}
                                                    formConfig={ruleFieldConfig}
                                                />
                                            )}
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">点击打开高级规则编辑器，支持复杂规则逻辑</p>
                                        </div>
                                        {ruleSetAdvancedConflict && (
                                            <p className="text-[12px] text-red-500 pl-1">规则集和高级规则只能二选一，请清空其中一项后再保存</p>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                                <Button variant="ghost" onClick={onClose}>取消</Button>
                                <Button variant="primary" onClick={onSave} disabled={!form.name.trim() || ruleSetAdvancedConflict}>保存</Button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>,
                document.body
            )}

            <PolicyAllRuleSetModal
                open={showRuleSetModal}
                ruleSetGroups={ruleSetGroups}
                selectedIds={form.selectedRuleSetIds}
                onToggle={toggleRuleSetSelection}
                onClose={() => setShowRuleSetModal(false)}
            />
            
            {/* 规则字段编辑器弹窗 */}
            {showRuleFieldsEditorModal && (
                <RuleFieldsEditorModal
                    open={showRuleFieldsEditorModal}
                    form={form as any}
                    onFormChange={updates => onFormChange(updates as Partial<T>)}
                    onClose={() => setShowRuleFieldsEditorModal?.(false)}
                    formConfig={ruleFieldConfig}
                    title={ruleFieldsEditorTitle}
                />
            )}
        </>
    );
}
