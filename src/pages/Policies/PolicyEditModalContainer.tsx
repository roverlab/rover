import React from 'react';
import type { Policy } from '../../types/policy';
import { getPolicyRuleSet } from '../../services/policy';
import { OUTBOUND_OPTIONS } from '../../types/policy';
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

// Policy字段UI配置（用于Modal渲染）
const POLICY_FIELD_CONFIG: PolicyFieldConfig<PolicyEditFormState> = {
    fieldName: 'outbound',
    fieldLabel: '出站',
    options: OUTBOUND_OPTIONS,
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
            buildPolicyData={(params) => buildPolicyData({ ...params, addNotification })}
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
                unavailableAclRefs,
                ruleSetAdvancedConflict,
                showRuleSetModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                onSave,
                addNotification,
            }) => {
                // 额外处理 preferredOutbound
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

                // 订阅出站节点选择器（单选模式，不过滤 direct 和 block）
                const extraFields = (
                    <OutboundSelector
                        value={form.preferredOutbound}
                        onChange={(tag) => onFormChange({ preferredOutbound: tag })}
                        label="订阅出站节点"
                        placeholder="请选择节点"
                        hint="选择订阅的出站节点后，将覆盖上面的默认出站"
                        filterDirectBlock={false}
                    />
                );

                return (
                    <PolicyEditModalBase
                        open={open}
                        title="策略"
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
                        fieldConfig={POLICY_FIELD_CONFIG}
                        extraFields={extraFields}
                    />
                );
            }}
        />
    );
}
