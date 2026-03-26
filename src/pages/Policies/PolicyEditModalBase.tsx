import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { X, ChevronDown, Settings2, Code2, ChevronUp } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { RuleSetGroupItem } from './PolicyAllRuleSetModal';
import { PolicyAllRuleSetModal } from './PolicyAllRuleSetModal';
import { JsonEditor } from '../../components/JsonEditor';
import { RuleEditorField } from '../../components/AdvancedRuleEditor';
import type { RuleFieldConfig } from '../../components/AdvancedRuleEditor';
import type { RouteLogicRule } from '../../types/singbox';

export type PolicyType = 'default' | 'raw';

export interface PolicyEditFormStateBase {
    policyType: PolicyType;
    name: string;
    rawDataContent: string;
    selectedRuleSetIds: Set<string>;
    /** 高级规则（logical_rule 格式） */
    ruleGroupsTree?: RouteLogicRule | null;
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
    showRuleSetModal: boolean;
    showRuleFieldsEditorModal?: boolean;
    onClose: () => void;
    onFormChange: (updates: Partial<T>) => void;
    setShowRuleSetModal: (v: boolean) => void;
    setShowRuleFieldsEditorModal?: (v: boolean) => void;
    onSave: () => void;
    /** 用于显示格式化错误等提示 */
    addNotification?: (message: string, type?: 'success' | 'error' | 'info') => void;
    /** 中间字段配置（出站 / DNS服务器） */
    fieldConfig: PolicyFieldConfig<T>;
    /** 高级规则字段配置（默认使用 RULE_FIELD_CONFIG） */
    ruleFieldConfig?: RuleFieldConfig[];
    /** 规则编辑器弹窗标题（默认「规则集编辑器」，DNS 策略可传「规则编辑器」） */
    ruleFieldsEditorTitle?: string;
    /** 额外字段内容（在中间字段后面，规则集前面） */
    extraFields?: React.ReactNode;
    /** 规则集折叠时最多显示的数量（默认为 3） */
    ruleSetMaxVisible?: number;
}

export function PolicyEditModalBase<T extends PolicyEditFormStateBase>({
    open,
    title,
    editingPolicy,
    form,
    ruleSetGroups,
    showRuleSetModal,
    onClose,
    onFormChange,
    setShowRuleSetModal,
    onSave,
    addNotification,
    fieldConfig,
    ruleFieldConfig,
    ruleFieldsEditorTitle,
    extraFields,
    ruleSetMaxVisible = 3,
}: PolicyEditModalBaseProps<T>) {
    const { t } = useTranslation();
    const resolvedRuleEditorTitle = ruleFieldsEditorTitle ?? t('common.ruleEditor');
    const [showAllRuleSets, setShowAllRuleSets] = useState(false);
    const ruleSetBarRef = useRef<HTMLDivElement>(null);
    
    const handleRuleSetConfirm = (ids: Set<string>) => {
        onFormChange({ selectedRuleSetIds: ids } as Partial<T>);
    };

    const allRuleSetItems = ruleSetGroups.flatMap(g => g.items);
    const getItemById = (id: string) => allRuleSetItems.find(p => p.id === id);

    // 获取当前字段值
    const fieldValue = String((form as Record<string, unknown>)[fieldConfig.fieldName as string] || '');
    
    // 规则集列表数据
    const selectedRuleSetList = useMemo(() => {
        return Array.from(form.selectedRuleSetIds).map(id => {
            const p = getItemById(id);
            // 查找规则集所属分组
            const group = ruleSetGroups.find(g => g.items.some(item => item.id === id));
            const groupName = group?.displayName || '';
            return { id, groupName, ruleName: p?.name || id };
        });
    }, [form.selectedRuleSetIds, ruleSetGroups]);
    
    // 显示的规则集（折叠时只显示前N个）
    const visibleRuleSets = useMemo(() => {
        if (showAllRuleSets) return selectedRuleSetList;
        return selectedRuleSetList.slice(0, ruleSetMaxVisible);
    }, [selectedRuleSetList, showAllRuleSets, ruleSetMaxVisible]);
    
    // 隐藏的规则集数量
    const hiddenCount = selectedRuleSetList.length - visibleRuleSets.length;
    
    // 重置展开状态
    useEffect(() => {
        if (!open) setShowAllRuleSets(false);
    }, [open]);

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
                                    {editingPolicy ? t('policies.editModalEdit', { name: title }) : t('policies.editModalAdd', { name: title })}
                                </h2>
                                <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2" aria-label={t('common.close')}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('policies.policyType')}</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onFormChange({ policyType: 'default' as PolicyType } as Partial<T>)}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all cursor-pointer",
                                                form.policyType === 'default'
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]"
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <Settings2 className={cn(
                                                "w-3.5 h-3.5",
                                                form.policyType === 'default' ? "text-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-medium",
                                                form.policyType === 'default' ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
                                            )}>
                                                {t('policies.typeStandardVisual')}
                                            </span>
                                            <span className="text-[11px] text-[var(--app-text-quaternary)]">{t('policies.typeStandardHint')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onFormChange({ policyType: 'raw' as PolicyType } as Partial<T>)}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all cursor-pointer",
                                                form.policyType === 'raw'
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]"
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <Code2 className={cn(
                                                "w-3.5 h-3.5",
                                                form.policyType === 'raw' ? "text-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-medium",
                                                form.policyType === 'raw' ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
                                            )}>
                                                {t('policies.typeRawJson')}
                                            </span>
                                            <span className="text-[11px] text-[var(--app-text-quaternary)]">{t('policies.typeRawHint')}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('policies.policyNameLabel')}</label>
                                    <Input value={form.name} onChange={e => onFormChange({ name: e.target.value } as Partial<T>)} placeholder={t('policies.policyNamePlaceholder')} />
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
                                    <JsonEditor
                                        value={form.rawDataContent}
                                        onChange={value => onFormChange({ rawDataContent: value } as Partial<T>)}
                                        placeholder={t('policies.rawJsonPlaceholder')}
                                        rows={12}
                                        hint={t('policies.rawJsonHint')}
                                        showFormatButton
                                        onFormatSuccess={() => addNotification?.(t('policies.formatted'), 'success')}
                                        onFormatError={err => addNotification?.(err, 'error')}
                                    />
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('policies.ruleSetsLabel')}</label>
                                            {ruleSetGroups.length === 0 ? (
                                                <p className="px-3 py-4 text-[12px] text-[var(--app-text-quaternary)] border border-[rgba(39,44,54,0.12)] rounded-[10px] bg-white">{t('policies.ruleSetsEmptyHint')}</p>
                                            ) : (
                                                <div
                                                    ref={ruleSetBarRef}
                                                    className={cn(
                                                        "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer",
                                                        "border-[rgba(39,44,54,0.12)]",
                                                        showAllRuleSets && selectedRuleSetList.length > ruleSetMaxVisible ? "max-h-none" : "overflow-hidden"
                                                    )}
                                                    onClick={() => setShowRuleSetModal(true)}
                                                >
                                                    {form.selectedRuleSetIds.size === 0 ? (
                                                        <span className="text-[13px] text-[var(--app-text-quaternary)]">{t('policies.selectRuleSets')}</span>
                                                    ) : (
                                                        <>
                                                            <div className="flex flex-wrap items-center gap-1.5 flex-1">
                                                                {visibleRuleSets.map(({ id, groupName, ruleName }) => (
                                                                    <span
                                                                        key={id}
                                                                        className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[180px]"
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <span className="truncate">
                                                                            <span className="text-[var(--app-text-tertiary)]">{groupName}</span>
                                                                            <span className="text-[var(--app-text-quaternary)] mx-0.5">/</span>
                                                                            <span>{ruleName}</span>
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                const next = new Set(form.selectedRuleSetIds);
                                                                                next.delete(id);
                                                                                onFormChange({ selectedRuleSetIds: next } as Partial<T>);
                                                                            }}
                                                                            aria-label={t('common.delete')}
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                                {/* 显示更多/收起按钮 */}
                                                                {hiddenCount > 0 && !showAllRuleSets && (
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex shrink-0 items-center gap-0.5 px-2 py-0.5 rounded-[6px] text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] transition-colors"
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            setShowAllRuleSets(true);
                                                                        }}
                                                                    >
                                                                        <span>+{hiddenCount}</span>
                                                                        <span className="text-[10px]">{t('logs.more')}</span>
                                                                    </button>
                                                                )}
                                                                {showAllRuleSets && selectedRuleSetList.length > ruleSetMaxVisible && (
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex shrink-0 items-center gap-0.5 px-2 py-0.5 rounded-[6px] text-[11px] text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] transition-colors"
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            setShowAllRuleSets(false);
                                                                        }}
                                                                    >
                                                                        <span>{t('common.collapse')}</span>
                                                                        <ChevronUp className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                                                </div>
                                            )}
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">{t('policies.ruleSetPickerFootnote')}</p>
                                        </div>

                                        {/* 高级规则编辑器 */}
                                        <RuleEditorField
                                            value={form.ruleGroupsTree}
                                            onChange={(logicRule) => {
                                                onFormChange({ ruleGroupsTree: logicRule } as Partial<T>);
                                            }}
                                            label={t('policies.advancedRules')}
                                            hint={t('policies.advancedRulesHint')}
                                            modalTitle={resolvedRuleEditorTitle}
                                            fieldConfig={ruleFieldConfig}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                                <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                                <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>{t('common.save')}</Button>
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
                onConfirm={handleRuleSetConfirm}
                onClose={() => setShowRuleSetModal(false)}
            />
        </>
    );
}
