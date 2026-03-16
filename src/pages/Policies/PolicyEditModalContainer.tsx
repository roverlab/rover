import React, { useState, useMemo, useEffect } from 'react';
import type { Policy } from '../../types/policy';
import { getPolicyRuleSet, OUTBOUND_OPTIONS } from '../../types/policy';
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
import { X, ChevronDown, ChevronUp } from 'lucide-react';

export interface PolicyEditFormState extends PolicyEditFormStateBase {
    outbound: string;
    preferredOutbounds: string[];
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

// 使用工厂函数创建 getInitialFormState，额外字段为 preferredOutbounds
const getInitialFormState = createGetInitialFormState(
    POLICY_FIELD_DATA_CONFIG,
    () => ({ preferredOutbounds: [] }) as Partial<PolicyEditFormState>
);

// 使用工厂函数创建 buildPolicyData，添加 preferredOutbounds 字段
const buildPolicyData = createBuildPolicyData(
    POLICY_FIELD_DATA_CONFIG,
    (form) => ({ preferredOutbounds: form.preferredOutbounds })
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

                // 保存preferredOutbounds到profile_policy
                try {
                    const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                    const currentProfileId = selectedProfileResult?.profile?.id;
                    if (currentProfileId) {
                        await window.ipcRenderer.db.setProfilePolicy(currentProfileId, policyId, form.preferredOutbounds);
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
                // 额外处理 availableOutbounds 和 preferredOutbounds
                const [availableOutbounds, setAvailableOutbounds] = useState<Array<{ tag: string; type: string; all?: string[] }>>([]);
                const [showPreferredOutboundModal, setShowPreferredOutboundModal] = useState(false);
                const [showAllPreferredOutbounds, setShowAllPreferredOutbounds] = useState(false);

                const policy = editingPolicy as unknown as Policy | null;

                // 订阅出站节点折叠时最多显示的数量
                const PREFERRED_OUTBOUND_MAX_VISIBLE = 3;

                // 显示的订阅出站节点（折叠时只显示前N个）
                const visiblePreferredOutbounds = useMemo(() => {
                    if (showAllPreferredOutbounds) return form.preferredOutbounds || [];
                    return (form.preferredOutbounds || []).slice(0, PREFERRED_OUTBOUND_MAX_VISIBLE);
                }, [form.preferredOutbounds, showAllPreferredOutbounds]);

                // 隐藏的订阅出站节点数量
                const hiddenPreferredOutboundCount = (form.preferredOutbounds?.length || 0) - visiblePreferredOutbounds.length;

                // 重置展开状态
                useEffect(() => {
                    if (!open) setShowAllPreferredOutbounds(false);
                }, [open]);

                React.useEffect(() => {
                    if (open) {
                        window.ipcRenderer.core.getAvailableOutbounds().then((data) => {
                            setAvailableOutbounds((data as Array<{ tag: string; type: string; all?: string[] }>) || []);
                        });
                        // 加载 preferredOutbounds
                        if (policy) {
                            window.ipcRenderer.core.getSelectedProfile().then((selectedProfileResult: any) => {
                                const currentProfileId = selectedProfileResult?.profile?.id;
                                if (currentProfileId) {
                                    window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, policy.id).then((profilePolicy: any) => {
                                        if (profilePolicy?.preferred_outbounds) {
                                            onFormChange({ preferredOutbounds: profilePolicy.preferred_outbounds });
                                        }
                                    });
                                }
                            });
                        }
                    }
                }, [open, policy?.id, seed]);

                const handleRemovePreferredOutbound = (idx: number) => {
                    const newPreferred = form.preferredOutbounds.filter((_, i) => i !== idx);
                    onFormChange({ preferredOutbounds: newPreferred });
                };

                // 订阅出站节点选择器 - 作为 extraFields 传入
                const extraFields = availableOutbounds && availableOutbounds.length > 0 && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">订阅出站节点</label>
                            <div
                                className={cn(
                                    "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer",
                                    "border-[rgba(39,44,54,0.12)]",
                                    showAllPreferredOutbounds && (form.preferredOutbounds?.length || 0) > PREFERRED_OUTBOUND_MAX_VISIBLE ? "max-h-none" : "overflow-hidden"
                                )}
                                onClick={() => setShowPreferredOutboundModal(true)}
                            >
                                {!form.preferredOutbounds || form.preferredOutbounds.length === 0 ? (
                                    <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择节点</span>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center gap-1.5 flex-1">
                                            {visiblePreferredOutbounds.map((tag, idx) => (
                                                <span
                                                    key={`${tag}-${idx}`}
                                                    className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <span className="truncate">{tag}</span>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                        onClick={e => { e.stopPropagation(); handleRemovePreferredOutbound(idx); }}
                                                        aria-label="删除"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                            {/* 显示更多/收起按钮 */}
                                            {hiddenPreferredOutboundCount > 0 && !showAllPreferredOutbounds && (
                                                <button
                                                    type="button"
                                                    className="inline-flex shrink-0 items-center gap-0.5 px-2 py-0.5 rounded-[6px] text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] transition-colors"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setShowAllPreferredOutbounds(true);
                                                    }}
                                                >
                                                    <span>+{hiddenPreferredOutboundCount}</span>
                                                    <span className="text-[10px]">更多</span>
                                                </button>
                                            )}
                                            {showAllPreferredOutbounds && (form.preferredOutbounds?.length || 0) > PREFERRED_OUTBOUND_MAX_VISIBLE && (
                                                <button
                                                    type="button"
                                                    className="inline-flex shrink-0 items-center gap-0.5 px-2 py-0.5 rounded-[6px] text-[11px] text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] transition-colors"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setShowAllPreferredOutbounds(false);
                                                    }}
                                                >
                                                    <span>收起</span>
                                                    <ChevronUp className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                            </div>
                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">选择订阅的出站节点后，将覆盖上面的默认出站</p>
                        </div>
                        
                        {/* 订阅出站节点选择弹窗 */}
                        <PolicyPreferredOutboundModal
                            open={showPreferredOutboundModal}
                            availableOutbounds={availableOutbounds}
                            preferredOutbounds={form.preferredOutbounds}
                            onConfirm={tags => onFormChange({ preferredOutbounds: tags })}
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
