import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Surface';
import { Button } from '../../components/ui/Button';
import { Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Policy } from '../../types/policy';
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
                        <span className="policy-type-badge">
                            {policy.type === 'raw' ? t('policies.typeRaw') : t('policies.typeStandard')}
                        </span>
                    </div>
                );
            case 'outbound':
                return (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                        {isOutboundDisplayable(getPolicyOutbound(policy)) ? (
                            <span className="policy-chip" title={getOutboundLabel(getPolicyOutbound(policy), t)}>
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
    const renderDropdown = (policy: Policy, position: { top: number; left: number }, close: () => void) => (
        <PolicyRowDropdown
            policy={policy}
            position={position}
            onViewDetail={(p) => { close(); onViewDetail(p); }}
            onEdit={(p) => { close(); onEdit(p); }}
            onDelete={(id, name) => { close(); onDelete(id, name); }}
        />
    );

    // 工具栏右侧额外内容（导入按钮）
    const toolbarRightExtra = (
        <Button variant="secondary" size="sm" className="h-9 rounded-[10px] px-3 text-[12px]" onClick={onImportTemplate}>
            <Download className="w-3.5 h-3.5 mr-1" />{t('common.import')}
        </Button>
    );

    return (
        <PolicyListTable<Policy>
            items={policies}
            columns={columns}
            renderCell={renderCell}
            searchFields={searchFields}
            searchPlaceholder={t('policies.listSearchPlaceholder')}
            statsLineKey="policies.statsLine"
            toolbarRightExtra={toolbarRightExtra}
            showIndexColumn={true}
            onAdd={onAdd}
            onToggleEnabled={onToggleEnabled}
            onEdit={onEdit}
            renderDropdown={renderDropdown}
            onReorder={onReorder}
            noMatchText={t('policies.noMatchingPolicies')}
        />
    );
}
