import React from 'react';
import { useTranslation } from 'react-i18next';
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
const DNS_FIELD_CONFIG_BASE: Omit<PolicyFieldConfig<DnsPolicyEditFormState>, 'fieldLabel' | 'options'> = {
    fieldName: 'server',
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
    const { t } = useTranslation();

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
            buildPolicyData={(params) => buildPolicyData({ ...params, addNotification, t })}
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
                showRuleSetModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                onSave,
                addNotification,
            }) => {
                // DNS服务器列表
                const [dnsServers, setDnsServers] = React.useState<Array<{ id: string; name?: string; type: string }>>([]);

                const policy = editingPolicy as unknown as DnsPolicy | null;

                React.useEffect(() => {
                    if (open) {
                        window.ipcRenderer.db.getDnsServers().then((servers) => {
                            setDnsServers((servers as Array<{ id: string; name?: string; type: string }>) || []);
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

                // 构建动态的DNS服务器选项（显示 name，值使用 id）
                const dynamicDnsServerOptions = React.useMemo(() => {
                    return dnsServers.map(s => ({
                        value: s.id,
                        label: s.name ? `${s.name} (${s.type})` : `${s.id} (${s.type})`,
                    }));
                }, [dnsServers]);

                // 订阅DNS服务器选择器 - 作为 extraFields 传入（使用普通Select）
                const extraFields = dnsServers && dnsServers.length > 0 && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('policies.tableColPreferredDns')}</label>
                            <Select
                                value={form.dnsServerId || ''}
                                onChange={(e) => onFormChange({ dnsServerId: e.target.value || null })}
                                className="w-full"
                            >
                                <option value="">{t('dnsPolicies.preferredDnsPlaceholder')}</option>
                                {dnsServers.map((server) => (
                                    <option key={server.id} value={server.id}>
                                        {server.name || server.id} ({server.type})
                                    </option>
                                ))}
                            </Select>
                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">{t('dnsPolicies.preferredDnsHint')}</p>
                        </div>
                    </>
                );

                // 构建动态的fieldConfig
                const dynamicFieldConfig: PolicyFieldConfig<DnsPolicyEditFormState> = {
                    ...DNS_FIELD_CONFIG_BASE,
                    fieldLabel: t('policies.fieldDnsServer'),
                    options: dynamicDnsServerOptions,
                };

                return (
                    <PolicyEditModalBase
                        open={open}
                        title={t('dnsPolicies.editModalTitle')}
                        editingPolicy={policy}
                        form={form}
                        ruleSetGroups={ruleSetGroups}
                        showRuleSetModal={showRuleSetModal}
                        onClose={onClose}
                        onFormChange={onFormChange}
                        setShowRuleSetModal={setShowRuleSetModal}
                        onSave={onSave}
                        addNotification={addNotification}
                        fieldConfig={dynamicFieldConfig}
                        ruleFieldsEditorTitle={t('common.ruleEditor')}
                        extraFields={extraFields}
                    />
                );
            }}
        />
    );
}
