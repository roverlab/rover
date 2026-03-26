import React, { useState, useEffect, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { RuleSetGroupItem } from './PolicyAllRuleSetModal';
import type { PolicyEditFormStateBase } from './PolicyEditModalBase';
import type { RouteLogicRule } from '../../types/singbox';

export type PolicyType = 'default' | 'raw';

/** 策略字段数据配置 - 用于工厂函数创建表单状态和构建数据 */
export interface PolicyFieldDataConfig<T extends PolicyEditFormStateBase> {
    /** 字段名称（如 outbound / server） */
    fieldName: keyof T;
    /** 默认值 */
    defaultValue: string;
    /** 有效值列表（用于验证） */
    validValues: string[];
};

export interface BasePolicy {
    id?: string;
    type?: PolicyType;
    name: string;
    order?: number;
    enabled?: boolean;
    raw_data?: Record<string, unknown>;
    logical_rule?: RouteLogicRule;
    ruleSet?: string[];
    /** 允许额外字段（如 outbound、server 等） */
    [key: string]: unknown;
}

export interface PolicyEditModalBaseContainerProps<T extends PolicyEditFormStateBase, P extends BasePolicy> {
    open: boolean;
    editingPolicy: P | null;
    policiesCount: number;
    onClose: () => void;
    onSaved: () => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
    /** 获取策略的规则集 */
    getPolicyRuleSet: (policy: P) => (string | { id?: string; name?: string })[];
    /** 获取初始表单状态 */
    getInitialFormState: (editingPolicy: P | null, selectedRuleSetIds: Set<string>) => T;
    /** 构建保存的数据 */
    buildPolicyData: (params: {
        form: T;
        editingPolicy: P | null;
        policiesCount: number;
        customGroupIds: Set<string>;
        builtinIds: Set<string>;
        addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
        t: TFunction;
    }) => Record<string, unknown> | null;
    /** 保存策略 */
    savePolicy: (params: {
        editingPolicy: P | null;
        policyData: Record<string, unknown>;
        form: T;
    }) => Promise<void>;
    /** 加载额外数据（可选） */
    loadExtraData?: () => Promise<Record<string, unknown>>;
    /** 应用额外数据到表单（可选） */
    applyExtraData?: (params: { form: T; extraData: Record<string, unknown>; editingPolicy: P | null }) => Partial<T>;
    /** 渲染Modal组件 */
    renderModal: (props: {
        open: boolean;
        editingPolicy: P | null;
        policiesCount: number;
        form: T;
        ruleSetGroups: RuleSetGroupItem[];
        showRuleSetModal: boolean;
        onClose: () => void;
        onFormChange: (updates: Partial<T>) => void;
        setShowRuleSetModal: (v: boolean) => void;
        onSave: () => void;
        addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
    }) => React.ReactNode;
}

/** Policy 转为 RouteLogicRule，从 logical_rule 读取 */
export function policyToLogicalRule<P extends BasePolicy>(policy: P | null): RouteLogicRule | null {
    if (!policy || policy.type === 'raw') {
        return null;
    }
    const lr = policy.logical_rule;
    if (!lr) {
        return null;
    }
    return lr;
}

/** 创建初始表单状态的工厂函数 */
export function createGetInitialFormState<T extends PolicyEditFormStateBase>(
    fieldConfig: PolicyFieldDataConfig<T>,
    getExtraDefaultFields?: () => Partial<T>
) {
    return (editingPolicy: BasePolicy | null, selectedRuleSetIds: Set<string>): T => {
        const baseState: PolicyEditFormStateBase = {
            policyType: (editingPolicy?.type || 'default') as PolicyType,
            name: editingPolicy?.name ?? '',
            rawDataContent: editingPolicy?.type === 'raw' && editingPolicy?.raw_data
                ? JSON.stringify(editingPolicy.raw_data, null, 2)
                : '',
            selectedRuleSetIds,
            ruleGroupsTree: policyToLogicalRule(editingPolicy),
        };

        if (!editingPolicy) {
            return {
                ...baseState,
                [fieldConfig.fieldName]: fieldConfig.defaultValue,
                ...(getExtraDefaultFields?.() || {}),
            } as T;
        }

        // 从策略中获取字段值
        const fieldValue = editingPolicy.type === 'raw' && editingPolicy.raw_data
            ? (editingPolicy.raw_data as Record<string, unknown>)[fieldConfig.fieldName as string]
            : editingPolicy[fieldConfig.fieldName as string];
        
        // 当validValues为空数组时，接受任何值（动态选项）
        const strValue = String(fieldValue ?? '');
        const validatedValue = fieldConfig.validValues.length === 0 || fieldConfig.validValues.includes(strValue)
            ? strValue || fieldConfig.defaultValue
            : fieldConfig.defaultValue;

        return {
            ...baseState,
            [fieldConfig.fieldName]: validatedValue,
            ...(getExtraDefaultFields?.() || {}),
        } as T;
    };
}

/** 创建构建策略数据的工厂函数 */
export function createBuildPolicyData<T extends PolicyEditFormStateBase>(
    fieldConfig: PolicyFieldDataConfig<T>,
    getExtraFields?: (form: T) => Record<string, unknown>
) {
    return ({
        form,
        editingPolicy,
        policiesCount,
        customGroupIds,
        builtinIds,
        addNotification,
        t,
    }: {
        form: T;
        editingPolicy: BasePolicy | null;
        policiesCount: number;
        customGroupIds: Set<string>;
        builtinIds: Set<string>;
        addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
        t: TFunction;
    }): Record<string, unknown> | null => {
        if (form.policyType === 'raw') {
            let parsedRawData: unknown = null;
            if (form.rawDataContent.trim()) {
                try {
                    parsedRawData = JSON.parse(form.rawDataContent);
                } catch {
                    addNotification(t('policies.jsonFormatInvalid'), 'error');
                    return null;
                }
                if (typeof parsedRawData !== 'object' || parsedRawData === null || Array.isArray(parsedRawData)) {
                    addNotification(t('policies.jsonMustBeObject'), 'error');
                    return null;
                }
            }
            // raw 类型：用户填写的 JSON 原样保留，不覆盖 server/outbound 等字段
            const fieldValue = (form as Record<string, unknown>)[fieldConfig.fieldName as string] || fieldConfig.defaultValue;
            const rawData = parsedRawData
                ? (parsedRawData as Record<string, unknown>)
                : { [fieldConfig.fieldName]: fieldValue };
            return {
                type: 'raw',
                name: form.name.trim(),
                raw_data: rawData,
                order: editingPolicy?.order ?? policiesCount,
            };
        } else {
            const ruleSetValue: string[] = [];
            for (const id of form.selectedRuleSetIds) {
                if (customGroupIds.has(id) || builtinIds.has(id)) {
                    ruleSetValue.push(id);
                }
            }
            const hasRuleSet = ruleSetValue.length > 0;
            const hasAdvancedRules = form.ruleGroupsTree !== null;
            if (hasRuleSet && hasAdvancedRules) {
                addNotification(t('policies.ruleSetVsAdvancedExclusive'), 'error');
                return null;
            }
            if (!hasRuleSet && !hasAdvancedRules) {
                addNotification(t('policies.ruleSetOrAdvancedRequired'), 'error');
                return null;
            }
            const logical_rule = form.ruleGroupsTree ?? undefined;
            return {
                type: 'default',
                name: form.name.trim(),
                [fieldConfig.fieldName]: (form as Record<string, unknown>)[fieldConfig.fieldName as string],
                order: editingPolicy?.order ?? policiesCount,
                ruleSet: ruleSetValue.length > 0 ? ruleSetValue : undefined,
                logical_rule,
                ...(getExtraFields?.(form) || {}),
            };
        }
    };
}

export function PolicyEditModalBaseContainer<T extends PolicyEditFormStateBase, P extends BasePolicy>({
    open,
    editingPolicy,
    policiesCount,
    onClose,
    onSaved,
    addNotification,
    getPolicyRuleSet,
    getInitialFormState,
    buildPolicyData,
    savePolicy,
    loadExtraData,
    applyExtraData,
    renderModal,
}: PolicyEditModalBaseContainerProps<T, P>) {
    const { t } = useTranslation();
    const [form, setForm] = useState<T>(() => getInitialFormState(null, new Set()));
    const [ruleSetGroups, setRuleSetGroups] = useState<RuleSetGroupItem[]>([]);
    const [showRuleSetModal, setShowRuleSetModal] = useState(false);
    const [extraData, setExtraData] = useState<Record<string, unknown>>({});

    useEffect(() => {
        if (open) {
            const ruleSetIds = getPolicyRuleSet(editingPolicy ?? ({} as P));
            const initialIds = new Set(ruleSetIds.filter((v): v is string => typeof v === 'string'));
            setForm(getInitialFormState(editingPolicy, initialIds));
            setShowRuleSetModal(false);

            const loadData = async () => {
                try {
                    const [groupsData, extra] = await Promise.all([
                        window.ipcRenderer.core.getAllRuleSetsGrouped(),
                        loadExtraData ? loadExtraData() : Promise.resolve({}),
                    ]);
                    const groups = (groupsData as RuleSetGroupItem[]) || [];
                    setRuleSetGroups(groups);
                    setExtraData(extra);

                    if (editingPolicy && groups.length > 0) {
                        const allIds = new Set<string>();
                        for (const g of groups) {
                            for (const item of g.items) allIds.add(item.id);
                        }
                        const rs = getPolicyRuleSet(editingPolicy);
                        const merged = new Set<string>();
                        for (const v of rs) {
                            const id = typeof v === 'string' ? v : v.id;
                            if (!id) continue;
                            if (allIds.has(id)) {
                                merged.add(id);
                            } else {
                                const name = typeof v === 'string' ? v : v.name;
                                for (const g of groups) {
                                    const byName = g.items.find(p => 
                                        p.name === name || 
                                        p.id === id || 
                                        (typeof v === 'string' && v.startsWith('acl:') && p.name === v.substring(4))
                                    );
                                    if (byName) {
                                        merged.add(byName.id);
                                        break;
                                    }
                                }
                            }
                        }
                        setForm(prev => ({ ...prev, selectedRuleSetIds: merged } as T));
                    }

                    // 应用额外数据
                    if (applyExtraData && Object.keys(extra).length > 0) {
                        setForm(prev => ({ ...prev, ...applyExtraData({ form: prev, extraData: extra, editingPolicy }) } as T));
                    }
                } catch (err: unknown) {
                    console.error('Failed to load data:', err);
                }
            };
            loadData();
        }
    }, [open, editingPolicy?.id]);

    const customGroupIds = useMemo(() => {
        const customGroup = ruleSetGroups.find(g => g.groupKey === 'custom');
        return new Set((customGroup?.items ?? []).map(p => p.id));
    }, [ruleSetGroups]);

    const builtinIds = useMemo(() => {
        const ids = new Set<string>();
        for (const g of ruleSetGroups) {
            if (g.groupKey !== 'custom') {
                for (const p of g.items) ids.add(p.id);
            }
        }
        return ids;
    }, [ruleSetGroups]);

    const onFormChange = (updates: Partial<T>) => {
        setForm(prev => {
            const next = { ...prev, ...updates };
            // 切换策略类型时清空另一类型的数据
            if (updates.policyType !== undefined && updates.policyType !== prev.policyType) {
                if (updates.policyType === 'raw') {
                    next.selectedRuleSetIds = new Set();
                    next.ruleGroupsTree = null;
                } else {
                    next.rawDataContent = '';
                    // 从原始类型切换到标准类型时，重置高级规则树为 null（显示默认占位符）
                    next.ruleGroupsTree = null;
                }
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        try {
            const policyData = buildPolicyData({
                form,
                editingPolicy,
                policiesCount,
                customGroupIds,
                builtinIds,
                addNotification,
                t,
            });

            if (!policyData) {
                return; // buildPolicyData 内部已经处理了错误通知
            }

            if (!editingPolicy) policyData.enabled = true;

            await savePolicy({ editingPolicy, policyData, form });

            onClose();
            onSaved();
            addNotification(editingPolicy ? t('policies.policyUpdated') : t('policies.policyAdded'));
        } catch (err: unknown) {
            console.error('Failed to save policy:', err);
            addNotification(t('policies.savePolicyFailed', { error: (err as Error).message }), 'error');
        }
    };

    return (
        <>
            {renderModal({
                open,
                editingPolicy,
                policiesCount,
                form,
                ruleSetGroups,
                showRuleSetModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                onSave: handleSave,
                addNotification,
            })}
        </>
    );
}
