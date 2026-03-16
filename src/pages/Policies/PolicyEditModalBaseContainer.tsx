import React, { useState, useEffect, useMemo } from 'react';
import type { RuleSetGroupItem } from './PolicyAllRuleSetModal';
import type { PolicyEditFormStateBase } from './PolicyEditModalBase';
import type { RuleTreeNode } from './types/ruleFields';
import type { SingboxLogicalRule } from '../../types/policy';
import {
    ruleTreeNodeToSingboxLogical,
    singboxLogicalToRuleTreeNodeRoot,
} from './utils/ruleTreeNodeConversion';

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
    logical_rule?: SingboxLogicalRule;
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
        unavailableAclRefs: string[];
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
        unavailableAclRefs: string[];
        ruleSetAdvancedConflict: boolean;
        showRuleSetModal: boolean;
        showRuleFieldsEditorModal: boolean;
        onClose: () => void;
        onFormChange: (updates: Partial<T>) => void;
        setShowRuleSetModal: (v: boolean) => void;
        setShowRuleFieldsEditorModal: (v: boolean) => void;
        onSave: () => void;
        addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
    }) => React.ReactNode;
}

/** 创建空的规则树节点 */
export function makeEmptyRuleTreeNode(): RuleTreeNode {
    return { id: crypto.randomUUID(), type: 'all', rules: [{ id: crypto.randomUUID(), type: 'domain', value: '' }] };
}

/** Policy 转为 RuleTreeNode，从 logical_rule 读取 */
export function policyToRuleGroupsTree<P extends BasePolicy>(policy: P | null): RuleTreeNode | null {
    if (!policy || policy.type === 'raw') {
        return null;
    }
    const lr = policy.logical_rule;
    if (!lr || !lr.rules?.length) {
        return null;
    }
    return singboxLogicalToRuleTreeNodeRoot(lr);
}

/** RuleTreeNode 转为 policy，所有规则数据直接存 logical_rule */
export function ruleGroupsTreeToPolicyFields(tree: RuleTreeNode): {
    logical_rule?: { type: string; mode: string; rules: unknown[] };
} {
    const converted = ruleTreeNodeToSingboxLogical(tree);
    if (!converted || converted.rules.length === 0) {
        return {};
    }
    return { logical_rule: converted };
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
            ruleGroupsTree: policyToRuleGroupsTree(editingPolicy),
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
        unavailableAclRefs,
        addNotification,
    }: {
        form: T;
        editingPolicy: BasePolicy | null;
        policiesCount: number;
        customGroupIds: Set<string>;
        builtinIds: Set<string>;
        unavailableAclRefs: string[];
        addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
    }): Record<string, unknown> | null => {
        if (form.policyType === 'raw') {
            let parsedRawData: unknown = null;
            if (form.rawDataContent.trim()) {
                try {
                    parsedRawData = JSON.parse(form.rawDataContent);
                } catch {
                    addNotification('JSON 格式错误，请检查输入', 'error');
                    return null;
                }
                if (typeof parsedRawData !== 'object' || parsedRawData === null || Array.isArray(parsedRawData)) {
                    addNotification('JSON 内容必须是有效的对象格式', 'error');
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
            const { logical_rule: treeLogical } = ruleGroupsTreeToPolicyFields(
                (form.ruleGroupsTree ?? makeEmptyRuleTreeNode()) as RuleTreeNode
            );
            const subRules = treeLogical?.rules ?? [];
            const hasRuleSet = ruleSetValue.length > 0;
            const hasAdvancedRules = subRules.length > 0;
            if (hasRuleSet && hasAdvancedRules) {
                addNotification('规则集和高级规则只能二选一，请清空其中一项后再保存', 'error');
                return null;
            }
            if (editingPolicy && unavailableAclRefs.length > 0) {
                addNotification(`已自动剔除 ${unavailableAclRefs.length} 个不可用规则集`, 'info');
            }
            const logical_rule = subRules.length > 0
                ? { type: 'logical' as const, mode: 'and' as const, rules: subRules }
                : undefined;
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
    const [form, setForm] = useState<T>(() => getInitialFormState(null, new Set()));
    const [ruleSetGroups, setRuleSetGroups] = useState<RuleSetGroupItem[]>([]);
    const [showRuleSetModal, setShowRuleSetModal] = useState(false);
    const [showRuleFieldsEditorModal, setShowRuleFieldsEditorModal] = useState(false);
    const [extraData, setExtraData] = useState<Record<string, unknown>>({});

    useEffect(() => {
        if (open) {
            const ruleSetIds = getPolicyRuleSet(editingPolicy ?? ({} as P));
            const initialIds = new Set(ruleSetIds.filter((v): v is string => typeof v === 'string'));
            setForm(getInitialFormState(editingPolicy, initialIds));
            setShowRuleSetModal(false);
            setShowRuleFieldsEditorModal(false);

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

    const unavailableAclRefs = useMemo(() => {
        if (!open) return [];
        const availableIds = new Set([...customGroupIds, ...builtinIds]);
        return Array.from(form.selectedRuleSetIds).filter(id => !availableIds.has(id));
    }, [form.selectedRuleSetIds, customGroupIds, builtinIds, open]);

    /** 规则集与高级规则同时有值时冲突 */
    const ruleSetAdvancedConflict = useMemo(() => {
        if (form.policyType !== 'default') return false;
        const ruleSetValue: string[] = [];
        for (const id of form.selectedRuleSetIds) {
            if (customGroupIds.has(id) || builtinIds.has(id)) ruleSetValue.push(id);
        }
        const { logical_rule } = ruleGroupsTreeToPolicyFields(
            (form.ruleGroupsTree ?? makeEmptyRuleTreeNode()) as RuleTreeNode
        );
        const subRules = logical_rule?.rules ?? [];
        return ruleSetValue.length > 0 && subRules.length > 0;
    }, [form.policyType, form.selectedRuleSetIds, form.ruleGroupsTree, customGroupIds, builtinIds]);

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
                unavailableAclRefs,
            });

            if (!policyData) {
                return; // buildPolicyData 内部已经处理了错误通知
            }

            if (!editingPolicy) policyData.enabled = true;

            await savePolicy({ editingPolicy, policyData, form });

            onClose();
            onSaved();
            addNotification(editingPolicy ? '策略已更新' : '策略已添加');
        } catch (err: unknown) {
            console.error('Failed to save policy:', err);
            addNotification(`保存失败: ${(err as Error).message}`, 'error');
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
                unavailableAclRefs,
                ruleSetAdvancedConflict,
                showRuleSetModal,
                showRuleFieldsEditorModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                setShowRuleFieldsEditorModal,
                onSave: handleSave,
                addNotification,
            })}
        </>
    );
}
