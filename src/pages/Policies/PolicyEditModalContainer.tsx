import React, { useMemo } from 'react';
import type { Policy } from '../../types/policy';
import { getPolicyRuleSet } from '../../services/policy';
import { OUTBOUND_OPTION_DEFS } from '../../types/policy';
import { useTranslation } from 'react-i18next';
import {
    PolicyEditModalBase,
    type PolicyEditFormStateBase,
    type PolicyFieldConfig,
} from './PolicyEditModalBase';
import {
    PolicyEditModalBaseContainer,
    createGetInitialFormState,
    createBuildPolicyData,
    type BasePolicy,
    type PolicyFieldDataConfig,
} from './PolicyEditModalBaseContainer';
import { OutboundSelector } from '../../components/OutboundSelector';

export interface PolicyEditFormState extends PolicyEditFormStateBase {
    outbound: string;
    preferredOutbound: string | null;
}

export interface PolicyEditModalContainerProps {
    open: boolean;
    editingPolicy: Policy | null;
    policiesCount: number;
    onClose: () => void;
    onSaved: () => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Policy字段数据配置（用于工厂函数）
const POLICY_FIELD_DATA_CONFIG: PolicyFieldDataConfig<PolicyEditFormState> = {
    fieldName: 'outbound',
    defaultValue: 'direct_out',
    validValues: ['direct_out', 'block_out', 'selector_out'],
};

// 使用工厂函数创建 getInitialFormState，额外字段为 preferredOutbound
const getInitialFormState = createGetInitialFormState(
    POLICY_FIELD_DATA_CONFIG,
    () => ({ preferredOutbound: null }) as Partial<PolicyEditFormState>
);

// 使用工厂函数创建 buildPolicyData，添加 preferredOutbound 字段
const buildPolicyData = createBuildPolicyData(
    POLICY_FIELD_DATA_CONFIG,
    (form) => ({ preferredOutbound: form.preferredOutbound })
);

export function PolicyEditModalContainer({
    open,
    editingPolicy,
    policiesCount,
    onClose,
    onSaved,
    addNotification,
}: PolicyEditModalContainerProps) {
    const { t } = useTranslation();

    const outboundFieldConfig: PolicyFieldConfig<PolicyEditFormState> = useMemo(
        () => ({
            fieldName: 'outbound',
            fieldLabel: t('policies.fieldOutbound'),
            options: OUTBOUND_OPTION_DEFS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
        }),
        [t]
    );

    return (
        <PolicyEditModalBaseContainer<PolicyEditFormState, BasePolicy>
            open={open}
            editingPolicy={editingPolicy as unknown as BasePolicy | null}
            policiesCount={policiesCount}
            onClose={onClose}
            onSaved={onSaved}
            addNotification={addNotification}
            getPolicyRuleSet={(policy) => getPolicyRuleSet(policy as unknown as Policy)}
            getInitialFormState={getInitialFormState}
            buildPolicyData={(params) => buildPolicyData({ ...params, addNotification, t })}
            savePolicy={async ({ editingPolicy, policyData, form }) => {
                const policy = editingPolicy as unknown as Policy | null;
                let policyId: string;
                if (policy) {
                    await window.ipcRenderer.db.updatePolicy(policy.id, policyData);
                    policyId = policy.id;
                } else {
                    policyId = await window.ipcRenderer.db.addPolicy(policyData);
                }

                // 保存preferredOutbound到profile_policy
                try {
                    const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                    const currentProfileId = selectedProfileResult?.profile?.id;
                    if (currentProfileId) {
                        await window.ipcRenderer.db.setProfilePolicy(currentProfileId, policyId, form.preferredOutbound);
                    }
                } catch (profileErr) {
                    console.error('Failed to save profile policy:', profileErr);
                }

                // 异步生成配置，不阻塞UI
                window.ipcRenderer.core.generateConfig().catch((err) => {
                    console.error('Failed to generate config:', err);
                });
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
                const policy = editingPolicy as unknown as Policy | null;

                React.useEffect(() => {
                    if (open) {
                        // 加载 preferredOutbound
                        if (policy) {
                            window.ipcRenderer.core.getSelectedProfile().then((selectedProfileResult: any) => {
                                const currentProfileId = selectedProfileResult?.profile?.id;
                                if (currentProfileId) {
                                    window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, policy.id).then((profilePolicy: any) => {
                                        onFormChange({ preferredOutbound: profilePolicy?.preferred_outbound || null });
                                    });
                                }
                            });
                        }
                    }
                }, [open, policy?.id]);

                const extraFields = (
                    <OutboundSelector
                        value={form.preferredOutbound}
                        onChange={(tag) => onFormChange({ preferredOutbound: tag })}
                        label={t('policies.tableColPreferredOutbound')}
                        placeholder={t('outboundSelector.placeholder')}
                        hint={t('outboundSelector.hint')}
                        filterDirectBlock={false}
                    />
                );

                return (
                    <PolicyEditModalBase
                        open={open}
                        title={t('policies.policyEntity')}
                        editingPolicy={policy}
                        form={form}
                        ruleSetGroups={ruleSetGroups}
                        showRuleSetModal={showRuleSetModal}
                        onClose={onClose}
                        onFormChange={onFormChange}
                        setShowRuleSetModal={setShowRuleSetModal}
                        onSave={onSave}
                        addNotification={addNotification}
                        fieldConfig={outboundFieldConfig}
                        extraFields={extraFields}
                    />
                );
            }}
        />
    );
}
