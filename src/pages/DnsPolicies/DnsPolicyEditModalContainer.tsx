import React from 'react';
import type { DnsPolicy } from '../../types/dns-policy';
import { getDnsPolicyRuleSet } from '../../services/dns-policy';
import { DNS_SERVER_OPTIONS } from '../../types/dns-policy';
import {
    PolicyEditModalBase,
    type PolicyEditFormStateBase,
    type PolicyFieldConfig,
} from '../Policies/PolicyEditModalBase';
import {
    PolicyEditModalBaseContainer,
    createGetInitialFormState,
    createBuildPolicyData,
    type BasePolicy,
    type PolicyFieldDataConfig,
} from '../Policies/PolicyEditModalBaseContainer';
import { cn } from '../../components/Sidebar';
import { Select } from '../../components/ui/Field';

export interface DnsPolicyEditFormState extends PolicyEditFormStateBase {
    server: string;
    dnsServerId: string | null;
}

export interface DnsPolicyEditModalContainerProps {
    open: boolean;
    editingPolicy: DnsPolicy | null;
    policiesCount: number;
    onClose: () => void;
    onSaved: () => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// DNS策略字段数据配置（用于工厂函数）- 动态DNS服务器，无固定有效值
const DNS_FIELD_DATA_CONFIG: PolicyFieldDataConfig<DnsPolicyEditFormState> = {
    fieldName: 'server',
    defaultValue: '',
    validValues: [], // 动态验证，接受任何值
};

// DNS策略字段UI配置（用于Modal渲染）- 使用空选项，实际选项从数据库动态加载
const DNS_FIELD_CONFIG: PolicyFieldConfig<DnsPolicyEditFormState> = {
    fieldName: 'server',
    fieldLabel: 'DNS服务器',
    options: [], // 动态加载
};

// 使用工厂函数创建 getInitialFormState，额外字段为 dnsServerId
const getInitialFormState = createGetInitialFormState(
    DNS_FIELD_DATA_CONFIG,
    () => ({ dnsServerId: null }) as Partial<DnsPolicyEditFormState>
);

// 使用工厂函数创建 buildPolicyData
const buildPolicyData = createBuildPolicyData(
    DNS_FIELD_DATA_CONFIG,
    () => ({})
);

export function DnsPolicyEditModalContainer({
    open,
    editingPolicy,
    policiesCount,
    onClose,
    onSaved,
    addNotification,
}: DnsPolicyEditModalContainerProps) {

    return (
        <PolicyEditModalBaseContainer<DnsPolicyEditFormState, BasePolicy>
            open={open}
            editingPolicy={editingPolicy as unknown as BasePolicy | null}
            policiesCount={policiesCount}
            onClose={onClose}
            onSaved={onSaved}
            addNotification={addNotification}
            getPolicyRuleSet={(policy) => getDnsPolicyRuleSet(policy as unknown as DnsPolicy)}
            getInitialFormState={getInitialFormState}
            buildPolicyData={(params) => buildPolicyData({ ...params, addNotification })}
            savePolicy={async ({ editingPolicy, policyData, form }) => {
                const dnsPolicy = editingPolicy as unknown as DnsPolicy | null;
                let policyId: string;
                if (dnsPolicy) {
                    await window.ipcRenderer.db.updateDnsPolicy(dnsPolicy.id, policyData);
                    policyId = dnsPolicy.id;
                } else {
                    policyId = await window.ipcRenderer.db.addDnsPolicy(policyData);
                }

                // 保存dnsServerId到profile_dns_policy
                try {
                    const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                    const currentProfileId = selectedProfileResult?.profile?.id;
                    if (currentProfileId) {
                        await window.ipcRenderer.db.setProfileDnsPolicy(currentProfileId, policyId, form.dnsServerId);
                    }
                } catch (profileErr) {
                    console.error('Failed to save profile dns policy:', profileErr);
                }

                // 异步生成配置，不阻塞UI
                window.ipcRenderer.core.generateConfig().catch(console.error);
            }}
            renderModal={({
                open,
                editingPolicy,
                form,
                ruleSetGroups,
                unavailableAclRefs,
                ruleSetAdvancedConflict,
                showRuleSetModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                onSave,
                addNotification,
            }) => {
                // DNS服务器列表
                const [dnsServers, setDnsServers] = React.useState<Array<{ id: string; type: string }>>([]);

                const policy = editingPolicy as unknown as DnsPolicy | null;

                React.useEffect(() => {
                    if (open) {
                        window.ipcRenderer.db.getDnsServers().then((servers) => {
                            setDnsServers((servers as Array<{ id: string; type: string }>) || []);
                        });
                        // 加载已保存的dnsServerId
                        if (policy) {
                            window.ipcRenderer.core.getSelectedProfile().then((selectedProfileResult: any) => {
                                const currentProfileId = selectedProfileResult?.profile?.id;
                                if (currentProfileId) {
                                    window.ipcRenderer.db.getProfileDnsPolicyByPolicyId(currentProfileId, policy.id).then((profilePolicy: any) => {
                                        if (profilePolicy?.preferred_server) {
                                            onFormChange({ dnsServerId: profilePolicy.preferred_server });
                                        }
                                    });
                                }
                            });
                        }
                    }
                }, [open, policy?.id]);

                // 构建动态的DNS服务器选项（统一使用 id）
                const dynamicDnsServerOptions = React.useMemo(() => {
                    return dnsServers.map(s => ({
                        value: s.id,
                        label: `${s.id} (${s.type})`,
                    }));
                }, [dnsServers]);

                // 订阅DNS服务器选择器 - 作为 extraFields 传入（使用普通Select）
                const extraFields = dnsServers && dnsServers.length > 0 && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">订阅DNS服务器</label>
                            <Select
                                value={form.dnsServerId || ''}
                                onChange={(e) => onFormChange({ dnsServerId: e.target.value || null })}
                                className="w-full"
                            >
                                <option value="">不指定</option>
                                {dnsServers.map((server) => (
                                    <option key={server.id} value={server.id}>
                                        {server.id} ({server.type})
                                    </option>
                                ))}
                            </Select>
                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">选择订阅的DNS服务器后，将覆盖上面的默认DNS服务器</p>
                        </div>
                    </>
                );

                // 构建动态的fieldConfig
                const dynamicFieldConfig: PolicyFieldConfig<DnsPolicyEditFormState> = {
                    ...DNS_FIELD_CONFIG,
                    options: dynamicDnsServerOptions,
                };

                return (
                    <PolicyEditModalBase
                        open={open}
                        title="DNS策略"
                        editingPolicy={policy}
                        form={form}
                        ruleSetGroups={ruleSetGroups}
                        unavailableAclRefs={unavailableAclRefs}
                        ruleSetAdvancedConflict={ruleSetAdvancedConflict}
                        showRuleSetModal={showRuleSetModal}
                        onClose={onClose}
                        onFormChange={onFormChange}
                        setShowRuleSetModal={setShowRuleSetModal}
                        onSave={onSave}
                        addNotification={addNotification}
                        fieldConfig={dynamicFieldConfig}
                        ruleFieldsEditorTitle="规则编辑器"
                        extraFields={extraFields}
                    />
                );
            }}
        />
    );
}
