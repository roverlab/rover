import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Surface';
import { Button } from '../../components/ui/Button';
import { Download, Lightbulb, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Policy } from '../../types/policy';
import type { PolicyFinalOutboundValue } from './usePolicyFinalOutbound';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';
import { getOutboundLabel, getPolicyOutbound, getPolicyRuleSets, getPolicyMatchCount, isOutboundDisplayable } from './utils';
import { PolicyRowDropdown } from './PolicyRowDropdown';

interface PolicyListCardProps {
    policies: Policy[];
    onAdd: () => void;
    onImportTemplate: () => void;
    onEdit: (policy: Policy) => void;
    onViewDetail: (policy: Policy) => void;
    onDelete: (id: string, name: string) => void;
    onToggleEnabled: (policy: Policy) => void;
    onReorder?: (itemId: string, oldIndex: number, newIndex: number, visibleOrderedIds: string[]) => void;
    /** 用于触发 profilePolicies 刷新的 key，每次变化会重新加载 */
    refreshKey?: number;
    /** 未匹配时的出站设置值 */
    policyFinalOutbound?: PolicyFinalOutboundValue;
    /** 点击未匹配出站行时的回调（打开设置弹窗） */
    onFinalOutboundClick?: () => void;
}

export function PolicyListCard({
    policies,
    onAdd,
    onImportTemplate,
    onEdit,
    onViewDetail,
    onDelete,
    onToggleEnabled,
    onReorder,
    refreshKey,
    policyFinalOutbound,
    onFinalOutboundClick,
}: PolicyListCardProps) {
    const { t } = useTranslation();
    const [profilePolicies, setProfilePolicies] = useState<Record<string, string[]>>({});

    // 异步加载每个策略的订阅优先选择节点
    const policyIdsKey = useMemo(() => policies.map(p => p.id).join(','), [policies]);
    // refreshKey 变化时也需要重新加载 profilePolicies
    const profilePoliciesDepsKey = `${policyIdsKey}-${refreshKey ?? 0}`;
    useEffect(() => {
        const loadProfilePolicies = async () => {
            try {
                const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                const currentProfileId = selectedProfileResult?.profile?.id;

                if (currentProfileId) {
                    const newProfilePolicies: Record<string, string[]> = {};

                    await Promise.all(
                        policies.map(async (policy) => {
                            try {
                                const profilePolicy = await window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, policy.id);
                                if (profilePolicy?.preferred_outbound) {
                                    newProfilePolicies[policy.id] = [profilePolicy.preferred_outbound];
                                }
                            } catch (err) {
                                console.error(`Failed to load profile policy for policy ${policy.id}:`, err);
                            }
                        })
                    );

                    setProfilePolicies(prev => {
                        // 如果数据没有变化，保持原引用避免不必要的重渲染
                        const prevKeys = Object.keys(prev);
                        const newKeys = Object.keys(newProfilePolicies);
                        if (prevKeys.length !== newKeys.length) return newProfilePolicies;
                        for (const key of newKeys) {
                            if (!prev[key] || prev[key].join(',') !== newProfilePolicies[key].join(',')) {
                                return newProfilePolicies;
                            }
                        }
                        return prev;
                    });
                }
            } catch (err) {
                console.error('Failed to load profile policies:', err);
            }
        };

        loadProfilePolicies();
    }, [profilePoliciesDepsKey]);



    // 列定义
    const columns: ColumnDef<Policy>[] = useMemo(() => [
        {
            id: 'name',
            header: t('policies.tableColName'),
            width: 'minmax(100px, 1.5fr)',
        },
        {
            id: 'type',
            header: t('policies.tableColType'),
            width: '56px',
            align: 'center',
        },
        {
            id: 'outbound',
            header: t('policies.tableColOutbound'),
            width: 'minmax(80px, 0.8fr)',
            align: 'center',
            nowrap: true,
        },
        {
            id: 'preferredOutbound',
            header: t('policies.tableColPreferredOutbound'),
            width: 'minmax(90px, 1fr)',
            nowrap: true,
        },
    ], [t]);

    // 搜索字段
    const searchFields = useMemo(() => (policy: Policy) => {
        const fields = [
            policy.name,
            getPolicyOutbound(policy),
            getOutboundLabel(getPolicyOutbound(policy), t),
            ...getPolicyRuleSets(policy),
        ];
        return fields;
    }, [t]);

    // 单元格渲染
    const renderCell = (policy: Policy, columnId: string, _index: number) => {
        switch (columnId) {
            case 'name':
                return <span className="truncate text-[13px] font-medium text-[var(--app-text)]">{policy.name}</span>;
            case 'type':
                return (
                    <div className="flex items-center justify-center h-full">
                        <span className="inline-flex items-center rounded-md border border-[var(--app-stroke)]/70 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--app-text-secondary)] tracking-wide">
                            {policy.type === 'raw' ? t('policies.typeRaw') : t('policies.typeStandard')}
                        </span>
                    </div>
                );
            case 'outbound':
                return (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                        {isOutboundDisplayable(getPolicyOutbound(policy)) ? (
                            <span
                                className="inline-flex items-center rounded-full border border-[var(--app-accent-border)]/60 bg-gradient-to-b from-[var(--app-accent-soft)]/50 to-[var(--app-accent-soft)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--app-accent-strong)] shadow-sm"
                                title={getOutboundLabel(getPolicyOutbound(policy), t)}
                            >
                                {getOutboundLabel(getPolicyOutbound(policy), t)}
                            </span>
                        ) : null}
                    </div>
                );
            case 'preferredOutbound':
                return (
                    <>
                        {profilePolicies[policy.id] && profilePolicies[policy.id].length > 0 && (
                            <div className="flex flex-wrap gap-1 overflow-hidden" title={profilePolicies[policy.id].join(', ')}>
                                {profilePolicies[policy.id].map((node, index) => (
                                    <span
                                        key={index}
                                        className="policy-chip"
                                        title={node}
                                    >
                                        {node}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                );
            default:
                return null;
        }
    };

    // 下拉菜单渲染
    const renderDropdown = (policy: Policy, position: { top: number; left: number }, close: () => void) => {
        return (
            <PolicyRowDropdown
                policy={policy}
                position={position}
                onViewDetail={(p) => { close(); onViewDetail(p); }}
                onEdit={(p) => { close(); onEdit(p); }}
                onDelete={(id, name) => { close(); onDelete(id, name); }}
            />
        );
    };

    // 工具栏右侧额外内容（导入按钮）
    const toolbarRightExtra = (
        <Button variant="secondary" size="sm" className="h-8 rounded-md border-[var(--app-stroke)] bg-[var(--app-panel)]/75 px-3 text-[12px] shadow-none" onClick={onImportTemplate}>
            <Download className="w-3.5 h-3.5 mr-1" />{t('common.import')}
        </Button>
    );

    // 未匹配出站设置条
    const finalOutboundBar = useMemo(() => {
        if (policyFinalOutbound === undefined) return null;
        const outboundLabel = getOutboundLabel(policyFinalOutbound, t);
        return (
            <div
                className="group mb-2 flex items-center gap-3 rounded-xl border border-[var(--app-accent-border)]/60 bg-gradient-to-r from-[var(--app-accent-soft)]/40 to-[var(--app-panel-soft)]/30 px-4 py-2.5 text-[13px] cursor-pointer transition-all hover:shadow-[0_4px_16px_rgba(31,119,255,0.08)] hover:border-[var(--app-accent)]/40 hover:from-[var(--app-accent-soft)]/60 hover:to-[var(--app-accent-soft)]/20"
                onClick={onFinalOutboundClick}
            >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--app-accent)]/20 to-[var(--app-accent)]/5 shadow-inner shrink-0 ring-1 ring-[var(--app-accent)]/15">
                    <Lightbulb className="w-4 h-4 text-[var(--app-accent-strong)]" />
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold text-[#1a1a1a] dark:text-white leading-tight">{t('policies.finalOutbound.label')}</span>
                    <span className="text-[11px] text-[var(--app-text-tertiary)] leading-tight hidden md:block">
                        {t('policies.finalOutbound.description')}
                    </span>
                </div>
                <span className="flex-1" />
                <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-accent-border)]/70 bg-gradient-to-b from-white/80 to-[var(--app-accent-soft)]/40 dark:from-white/[0.03] dark:to-[var(--app-accent)]/[0.08] px-3 py-1 text-[11px] font-semibold text-[var(--app-accent-strong)] shadow-sm">
                        {outboundLabel}
                    </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--app-text-tertiary)] group-hover:text-[var(--app-accent)] transition-colors shrink-0" />
            </div>
        );
    }, [policyFinalOutbound, t, onFinalOutboundClick]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <PolicyListTable<Policy>
                items={policies}
                columns={columns}
                renderCell={renderCell}
                searchFields={searchFields}
                searchPlaceholder={t('policies.listSearchPlaceholder')}
                toolbarRightExtra={toolbarRightExtra}
                toolbarAboveExtra={finalOutboundBar}
                showIndexColumn={true}
                onAdd={onAdd}
                onToggleEnabled={onToggleEnabled}
                onEdit={onEdit}
                renderDropdown={renderDropdown}
                onReorder={onReorder}
                noMatchText={t('policies.noMatchingPolicies')}
            />
        </div>
    );
}
