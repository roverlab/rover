import React, { useState, useEffect } from 'react';
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
import { useProfile } from '../../contexts/ProfileContext';
import { PolicyPreferredOutboundModal } from './PolicyPreferredOutboundModal';
import { cn } from '../../components/Sidebar';
import { ChevronDown } from 'lucide-react';

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
    const { seed } = useProfile();

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
                        await window.ipcRenderer.db.setProfilePolicy(currentProfileId, policyId, form.preferredOutbound ? [form.preferredOutbound] : []);
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
                showRuleFieldsEditorModal,
                onClose,
                onFormChange,
                setShowRuleSetModal,
                setShowRuleFieldsEditorModal,
                onSave,
                addNotification,
            }) => {
                // 额外处理 availableOutbounds 和 preferredOutbound
                const [availableOutbounds, setAvailableOutbounds] = useState<Array<{ tag: string; type: string; all?: string[] }>>([]);
                const [showPreferredOutboundModal, setShowPreferredOutboundModal] = useState(false);

                const policy = editingPolicy as unknown as Policy | null;

                React.useEffect(() => {
                    if (open) {
                        window.ipcRenderer.core.getAvailableOutbounds().then((data) => {
                            setAvailableOutbounds((data as Array<{ tag: string; type: string; all?: string[] }>) || []);
                        });
                        // 加载 preferredOutbound
                        if (policy) {
                            window.ipcRenderer.core.getSelectedProfile().then((selectedProfileResult: any) => {
                                const currentProfileId = selectedProfileResult?.profile?.id;
                                if (currentProfileId) {
                                    window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, policy.id).then((profilePolicy: any) => {
                                        // 取第一个作为单选值
                                        const firstOutbound = profilePolicy?.preferred_outbounds?.[0];
                                        onFormChange({ preferredOutbound: firstOutbound || null });
                                    });
                                }
                            });
                        }
                    }
                }, [open, policy?.id, seed]);

                // 订阅出站节点选择器（单选模式）
                const extraFields = availableOutbounds && availableOutbounds.length > 0 && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">订阅出站节点</label>
                            <div
                                className={cn(
                                    "relative flex items-center min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer",
                                    "border-[rgba(39,44,54,0.12)]"
                                )}
                                onClick={() => setShowPreferredOutboundModal(true)}
                            >
                                {!form.preferredOutbound ? (
                                    <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择节点</span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)]">
                                        <span className="truncate max-w-[200px]">{form.preferredOutbound}</span>
                                    </span>
                                )}
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                            </div>
                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">选择订阅的出站节点后，将覆盖上面的默认出站</p>
                        </div>
                        
                        {/* 订阅出站节点选择弹窗 */}
                        <PolicyPreferredOutboundModal
                            open={showPreferredOutboundModal}
                            availableOutbounds={availableOutbounds}
                            preferredOutbound={form.preferredOutbound}
                            onConfirm={tag => onFormChange({ preferredOutbound: tag })}
                            onClose={() => setShowPreferredOutboundModal(false)}
                        />
                    </>
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
                        showRuleFieldsEditorModal={showRuleFieldsEditorModal}
                        onClose={onClose}
                        onFormChange={onFormChange}
                        setShowRuleSetModal={setShowRuleSetModal}
                        setShowRuleFieldsEditorModal={setShowRuleFieldsEditorModal}
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
