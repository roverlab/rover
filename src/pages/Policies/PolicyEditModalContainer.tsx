import React, { useState, useEffect, useMemo } from 'react';
import type { Policy, PolicyType } from '../../types/policy';
import type { RuleProvider } from '../../types/rule-providers';
import { PolicyEditModal, type PolicyEditFormState } from './PolicyEditModal';
import { PolicyMultiLineModal } from './PolicyMultiLineModal';
import { useProfile } from '../../contexts/ProfileContext';

export interface PolicyEditModalContainerProps {
    open: boolean;
    editingPolicy: Policy | null;
    policiesCount: number;
    onClose: () => void;
    onSaved: () => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * 从数组字段中提取 ID Set
 * @param arr 数组
 * @returns ID Set
 */
const extractIdsFromArray = (arr: string[] | undefined): Set<string> => {
    if (!arr || !Array.isArray(arr)) return new Set();
    return new Set(arr.filter(v => typeof v === 'string'));
};

/**
 * 从 editingPolicy 的 ruleSetBuildIn 中提取指定前缀的规则集 ID
 * ID 已经包含前缀，直接返回完整值
 * @param editingPolicy 编辑的策略
 * @param prefixes 前缀数组，用于筛选规则集（如 ['acl:', 'geosite:', 'geoip:']）
 * @returns 提取的 ID Set
 */
const extractRuleSetIds = (editingPolicy: Policy | null, prefixes: string[]): Set<string> => {
    if (!editingPolicy || editingPolicy.type === 'raw') {
        return new Set();
    }
    const rs = (editingPolicy as any).ruleSetBuildIn ?? (editingPolicy as any).rule_set_build_in ?? [];
    const ids = new Set<string>();
    for (const v of Array.isArray(rs) ? rs : []) {
        if (typeof v !== 'string') continue;
        if (prefixes.some(p => v.startsWith(p))) {
            ids.add(v);  // ID 已经包含前缀，直接使用
        }
    }
    return ids;
};

const getInitialFormState = (
    editingPolicy: Policy | null,
    ruleProviderIds: Set<string>,
    builtinRuleSetIds: Set<string>
): PolicyEditFormState => {
    if (!editingPolicy) {
        return {
            policyType: 'default',
            name: '',
            outbound: 'direct_out',
            preferredOutbounds: [],
            rawDataContent: '',
            selectedRuleProviderIds: new Set(),
            selectedBuiltinRuleSetIds: new Set(),
            processNames: [],
            domain: [],
            domainKeyword: [],
            domainSuffix: [],
            port: [],
            ipCidr: [],
            sourceIpCidr: [],
        };
    }
    const obFromPolicy = editingPolicy.type === 'raw' && editingPolicy.raw_data
        ? (editingPolicy.raw_data as { outbound?: string }).outbound
        : editingPolicy.outbound;
    const ob = ['direct_out', 'block_out', 'selector_out'].includes(obFromPolicy ?? '') ? (obFromPolicy ?? 'direct_out') : 'direct_out';
    return {
        policyType: (editingPolicy.type || 'default') as PolicyType,
        name: editingPolicy.name,
        outbound: ob,
        preferredOutbounds: [],
        rawDataContent: editingPolicy.type === 'raw' && editingPolicy.raw_data
            ? JSON.stringify(editingPolicy.raw_data, null, 2)
            : '',
        selectedRuleProviderIds: ruleProviderIds,
        selectedBuiltinRuleSetIds: builtinRuleSetIds,
        processNames: editingPolicy.processName ?? [],
        domain: editingPolicy.domain ?? [],
        domainKeyword: editingPolicy.domain_keyword ?? [],
        domainSuffix: editingPolicy.domain_suffix ?? [],
        port: editingPolicy.port?.map(String) ?? [],
        ipCidr: editingPolicy.ip_cidr ?? [],
        sourceIpCidr: editingPolicy.source_ip_cidr ?? [],
    };
};

export function PolicyEditModalContainer({
    open,
    editingPolicy,
    policiesCount,
    onClose,
    onSaved,
    addNotification,
}: PolicyEditModalContainerProps) {
    const { seed } = useProfile();
    const [form, setForm] = useState<PolicyEditFormState>(() => getInitialFormState(null, new Set(), new Set()));
    const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>([]);
    const [builtinRulesets, setBuiltinRulesets] = useState<RuleProvider[]>([]);
    const [availableOutbounds, setAvailableOutbounds] = useState<Array<{ tag: string; type: string; all?: string[] }>>([]);
    const [showRuleSetModal, setShowRuleSetModal] = useState(false);
    const [showBuiltinRuleSetModal, setShowBuiltinRuleSetModal] = useState(false);
    const [showPreferredOutboundModal, setShowPreferredOutboundModal] = useState(false);
    const [showMultiLineModal, setShowMultiLineModal] = useState(false);
    const [multiLineTitle, setMultiLineTitle] = useState('');
    const [multiLineValue, setMultiLineValue] = useState('');
    const [multiLineField, setMultiLineField] = useState<{ setter: (value: string[]) => void } | null>(null);

    useEffect(() => {
        if (open) {
            // 从 ruleSetAcl 字段读取自定义规则集（数据库规则集）
            const ruleProviderIds = extractIdsFromArray((editingPolicy as any)?.ruleSetAcl);
            
            // 从 ruleSetBuildIn 字段读取内置规则集（geosite:, geoip:, acl: 内置规则集）
            const builtinRuleSetIds = extractRuleSetIds(editingPolicy, ['acl:']);
            
            // 立即设置初始表单状态
            setForm(getInitialFormState(editingPolicy, ruleProviderIds, builtinRuleSetIds));
            
            setShowRuleSetModal(false);
            setShowBuiltinRuleSetModal(false);
            setShowPreferredOutboundModal(false);
            
            // 并行加载所有数据
            Promise.all([
                window.ipcRenderer.core.getSelectedProfile(),
                window.ipcRenderer.db.getRuleProviders(),
                window.ipcRenderer.core.getBuiltinRulesets(),
                window.ipcRenderer.core.getAvailableOutbounds(),
            ]).then(([selectedProfileResult, ruleProvidersData, builtinRulesetsData, outboundsData]) => {
                const currentProfileId = (selectedProfileResult as any)?.profile?.id;
                const rpData = ruleProvidersData as RuleProvider[];
                const brData = builtinRulesetsData as RuleProvider[];
                
                // 更新规则集数据
                setRuleProviders(rpData || []);
                setBuiltinRulesets(brData || []);
                setAvailableOutbounds((outboundsData as Array<{ tag: string; type: string; all?: string[] }>) || []);
                
                // 从 ruleSetAcl 字段读取自定义规则集（数据库规则集）
                // 从 ruleSetBuildIn 字段读取内置规则集
                if (editingPolicy) {
                    const rpIds = new Set((rpData || []).map(p => p.id));
                    const brIds = new Set((brData || []).map(p => p.id));
                    
                    // 自定义规则集：从 ruleSetAcl 字段读取
                    const ruleProviderIdsFromAcl = extractIdsFromArray((editingPolicy as any).ruleSetAcl);
                    
                    // 内置规则集：从 ruleSetBuildIn 字段读取 acl: 开头的
                    const builtinRuleSetIds = new Set<string>();
                    const rs = (editingPolicy as any).ruleSetBuildIn ?? (editingPolicy as any).rule_set_build_in ?? [];
                    for (const v of Array.isArray(rs) ? rs : []) {
                        if (typeof v !== 'string') continue;
                        if (brIds.has(v)) {
                            builtinRuleSetIds.add(v);
                        }
                    }
                    
                    setForm(prev => ({
                        ...prev,
                        selectedRuleProviderIds: ruleProviderIdsFromAcl,
                        selectedBuiltinRuleSetIds: builtinRuleSetIds,
                    }));
                }
                
                // 加载当前profile的preferred outbounds（仅编辑时加载，添加时不加载）
                if (currentProfileId && editingPolicy) {
                    window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, editingPolicy.id).then((profilePolicy: any) => {
                        if (profilePolicy?.preferred_outbounds) {
                            setForm(prev => ({ ...prev, preferredOutbounds: profilePolicy.preferred_outbounds }));
                        }
                    }).catch((err: unknown) => {
                        console.error('Failed to load profile policy by policy id:', err);
                    });
                }
                // 注意：添加新策略时，不加载默认的 preferred_outbounds，保持为空数组
            }).catch((err: unknown) => {
                console.error('Failed to load data:', err);
            });
        }
    }, [open, editingPolicy?.id, seed]);

    // 处理数据库规则集的选中状态（当 ruleProviders 加载后进行名称匹配补充）
    useEffect(() => {
        if (open && ruleProviders.length > 0 && editingPolicy) {
            const rs = (editingPolicy as any).ruleSetBuildIn ?? (editingPolicy as any).rule_set_build_in ?? [];
            const rpIds = new Set(ruleProviders.map(p => p.id));
            const rpNames = new Set(ruleProviders.map(p => p.name));
            const selectedIds = new Set<string>();
            for (const v of Array.isArray(rs) ? rs : []) {
                if (typeof v !== 'string') continue;
                // 如果已经是完整的 ID 匹配，跳过
                if (rpIds.has(v)) continue;
                // 处理旧的格式：可能是纯名称，或者 acl:名称
                let nameToMatch = v;
                if (v.startsWith('acl:')) {
                    nameToMatch = v.substring(4);
                }
                // 如果是 geosite/geoip 前缀，跳过
                if (nameToMatch.startsWith('geosite:') || nameToMatch.startsWith('geoip:')) continue;
                // 尝试按名称匹配
                const byName = ruleProviders.find(p => p.name === nameToMatch);
                if (byName) selectedIds.add(byName.id);
            }
            if (selectedIds.size > 0) {
                setForm(prev => ({
                    ...prev,
                    selectedRuleProviderIds: new Set([...prev.selectedRuleProviderIds, ...selectedIds]),
                }));
            }
        }
    }, [open, ruleProviders, editingPolicy?.id]);

    // 处理内置规则集的选中状态（当 builtinRulesets 加载后进行名称匹配补充）
    useEffect(() => {
        if (open && builtinRulesets.length > 0 && editingPolicy) {
            const rs = (editingPolicy as any).ruleSetBuildIn ?? (editingPolicy as any).rule_set_build_in ?? [];
            const brIds = new Set(builtinRulesets.map(p => p.id));
            const selectedBuiltinIds = new Set<string>();
            for (const v of Array.isArray(rs) ? rs : []) {
                if (typeof v !== 'string') continue;
                // 如果已经是完整的 ID 匹配，跳过
                if (brIds.has(v)) continue;
                // 处理旧的格式：可能是 acl:名称
                if (v.startsWith('acl:')) {
                    const nameToMatch = v.substring(4);
                    // 尝试按名称匹配
                    const byName = builtinRulesets.find(p => p.name === nameToMatch);
                    if (byName) selectedBuiltinIds.add(byName.id);
                }
            }
            if (selectedBuiltinIds.size > 0) {
                setForm(prev => ({
                    ...prev,
                    selectedBuiltinRuleSetIds: new Set([...prev.selectedBuiltinRuleSetIds, ...selectedBuiltinIds]),
                }));
            }
        }
    }, [open, builtinRulesets, editingPolicy?.id]);

    const unavailableAclRefs = useMemo(() => {
        if (!editingPolicy || !open) return [];
        const missing: string[] = [];
        
        // 检查 ruleSetAcl 中的不可用项（自定义规则集）
        const ruleSetAcl = (editingPolicy as any).ruleSetAcl ?? [];
        const providerIds = new Set(ruleProviders.map(p => p.id));
        for (const v of ruleSetAcl) {
            if (typeof v !== 'string') continue;
            if (!providerIds.has(v)) {
                missing.push(v);
            }
        }
        
        return missing;
    }, [editingPolicy, ruleProviders, open]);

    const otherRuleSets = useMemo(() => {
        if (!editingPolicy) return [];
        const rs = (editingPolicy as any).ruleSetBuildIn ?? (editingPolicy as any).rule_set_build_in ?? [];
        return (Array.isArray(rs) ? rs : []).filter((v: string) => v.startsWith('geosite:') || v.startsWith('geoip:'));
    }, [editingPolicy]);

    const onFormChange = (updates: Partial<PolicyEditFormState>) => {
        setForm(prev => ({ ...prev, ...updates }));
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        try {
            let policyData: Record<string, unknown>;
            if (form.policyType === 'raw') {
                let parsedRawData: unknown = null;
                if (form.rawDataContent.trim()) {
                    try {
                        parsedRawData = JSON.parse(form.rawDataContent);
                    } catch {
                        addNotification('JSON 格式错误，请检查输入', 'error');
                        return;
                    }
                    if (typeof parsedRawData !== 'object' || parsedRawData === null || Array.isArray(parsedRawData)) {
                        addNotification('JSON 内容必须是有效的对象格式', 'error');
                        return;
                    }
                }
                // outbound 合并进 raw_data，不单独写入数据库
                const rawData = parsedRawData
                    ? { ...(parsedRawData as Record<string, unknown>), outbound: form.outbound || 'selector_out' }
                    : { outbound: form.outbound || 'selector_out' };
                policyData = {
                    type: 'raw',
                    name: form.name.trim(),
                    raw_data: rawData,
                    order: editingPolicy?.order ?? policiesCount,
                    
                };
            } else {
                // 内置规则集（geosite:, geoip:, acl: 内置规则集）保存到 ruleSetBuildIn
                const builtinAclParts = Array.from(form.selectedBuiltinRuleSetIds)
                    .map(id => builtinRulesets.find(p => p.id === id))
                    .filter((p): p is RuleProvider => !!p)
                    .map(p => p.id);
                // 去重：使用 Set 去除重复项，保持顺序
                const ruleSetBuildInValue = [...new Set([...otherRuleSets.filter(Boolean), ...builtinAclParts])];
                
                // 自定义规则集（数据库规则集）保存到 ruleSetAcl
                const ruleSetAclValue = Array.from(form.selectedRuleProviderIds)
                    .map(id => ruleProviders.find(p => p.id === id))
                    .filter((p): p is RuleProvider => !!p)
                    .map(p => p.id);
                
                if (editingPolicy && unavailableAclRefs.length > 0) {
                    addNotification(`已自动剔除 ${unavailableAclRefs.length} 个不可用规则集`, 'info');
                }
                policyData = {
                    type: 'default',
                    name: form.name.trim(),
                    outbound: form.outbound,
                    ruleSetBuildIn: ruleSetBuildInValue,
                    ruleSetAcl: ruleSetAclValue.length ? ruleSetAclValue : undefined,
                    package: undefined,
                    processName: form.processNames.length ? form.processNames : undefined,
                    order: editingPolicy?.order ?? policiesCount,
                    domain: form.domain.length ? form.domain : undefined,
                    domain_keyword: form.domainKeyword.length ? form.domainKeyword : undefined,
                    domain_suffix: form.domainSuffix.length ? form.domainSuffix : undefined,
                    ip_cidr: form.ipCidr.length ? form.ipCidr : undefined,
                    source_ip_cidr: form.sourceIpCidr.length ? form.sourceIpCidr : undefined,
                    port: (() => {
                        const nums = form.port.map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                        return nums.length ? nums : undefined;
                    })(),
                    
                };
            }
            if (!editingPolicy) policyData.enabled = true;
            
            // 保存策略并获取policy_id
            let policyId: string;
            if (editingPolicy) {
                await window.ipcRenderer.db.updatePolicy(editingPolicy.id, policyData);
                policyId = editingPolicy.id;
            } else {
                const newPolicyId = await window.ipcRenderer.db.addPolicy(policyData);
                policyId = newPolicyId;
            }
            
            // 保存preferredOutbounds到profile_policy（使用policy_id）
            try {
                const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                const currentProfileId = selectedProfileResult?.profile?.id;
                if (currentProfileId) {
                    await window.ipcRenderer.db.setProfilePolicy(currentProfileId, policyId, form.preferredOutbounds);
                }
            } catch (profileErr) {
                console.error('Failed to save profile policy:', profileErr);
                // 不阻止主要保存流程，仅记录错误
            }
            
            onClose();
            onSaved();
            addNotification(editingPolicy ? '策略已更新' : '策略已添加');
        } catch (err: unknown) {
            console.error('Failed to save policy:', err);
            addNotification(`保存失败: ${(err as Error).message}`, 'error');
        }
    };

    const openMultiLineEdit = (title: string, currentValue: string[], setter: (value: string[]) => void) => {
        setMultiLineTitle(title);
        setMultiLineValue(currentValue.join('\n'));
        setMultiLineField({ setter });
        setShowMultiLineModal(true);
    };

    const confirmMultiLineEdit = () => {
        if (multiLineField) {
            const arr = multiLineValue.split('\n').map(s => s.trim()).filter(Boolean);
            multiLineField.setter(arr);
        }
        setShowMultiLineModal(false);
    };

    return (
        <>
            <PolicyEditModal
                open={open}
                editingPolicy={editingPolicy}
                policiesCount={policiesCount}
                form={form}
                ruleProviders={ruleProviders}
                builtinRulesets={builtinRulesets}
                availableOutbounds={availableOutbounds}
                unavailableAclRefs={unavailableAclRefs}
                showRuleSetModal={showRuleSetModal}
                showBuiltinRuleSetModal={showBuiltinRuleSetModal}
                showPreferredOutboundModal={showPreferredOutboundModal}
                onClose={onClose}
                onFormChange={onFormChange}
                setShowRuleSetModal={setShowRuleSetModal}
                setShowBuiltinRuleSetModal={setShowBuiltinRuleSetModal}
                setShowPreferredOutboundModal={setShowPreferredOutboundModal}
                onSave={handleSave}
                onOpenMultiLineEdit={openMultiLineEdit}
            />
            <PolicyMultiLineModal
                open={showMultiLineModal}
                title={multiLineTitle}
                value={multiLineValue}
                onValueChange={setMultiLineValue}
                onConfirm={confirmMultiLineEdit}
                onClose={() => setShowMultiLineModal(false)}
            />
        </>
    );
}
