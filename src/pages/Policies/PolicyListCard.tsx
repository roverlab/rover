import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Surface';
import { Button } from '../../components/ui/Button';
import { Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Policy } from '../../types/policy';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';
import { getOutboundLabel, getOutboundTone, getPolicyOutbound, getPolicyRuleSets, getPolicyMatchCount, isOutboundDisplayable } from './utils';
import { PolicyRowDropdown } from './PolicyRowDropdown';

interface PolicyListCardProps {
    policies: Policy[];
    onAdd: () => void;
    onImportTemplate: () => void;
    onEdit: (policy: Policy) => void;
    onViewDetail: (policy: Policy) => void;
    onDelete: (id: string, name: string) => void;
    onToggleEnabled: (policy: Policy) => void;
    onBatchEnable: (selectedIds: Set<string>) => void;
    onBatchDisable: (selectedIds: Set<string>) => void;
    onBatchDelete: (selectedIds: Set<string>) => void;
    onReorder?: (itemId: string, oldIndex: number, newIndex: number) => void;
}

export function PolicyListCard({
    policies,
    onAdd,
    onImportTemplate,
    onEdit,
    onViewDetail,
    onDelete,
    onToggleEnabled,
    onBatchEnable,
    onBatchDisable,
    onBatchDelete,
    onReorder,
}: PolicyListCardProps) {
    const { t } = useTranslation();
    const [profilePolicies, setProfilePolicies] = useState<Record<string, string[]>>({});

    // 异步加载每个策略的订阅优先选择节点
    const policyIdsKey = useMemo(() => policies.map(p => p.id).join(','), [policies]);
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
    }, [policyIdsKey]);

    // 列定义
    const columns: ColumnDef<Policy>[] = useMemo(() => [
        {
            id: 'name',
            header: t('policies.tableColName'),
            width: 'min-w-[140px]',
        },
        {
            id: 'type',
            header: t('policies.tableColType'),
            width: 'w-[60px] min-w-[60px]',
            align: 'text-center',
        },
        {
            id: 'outbound',
            header: t('policies.tableColOutbound'),
            width: 'w-[100px] min-w-[100px]',
            align: 'text-center',
            nowrap: true,
        },
        {
            id: 'preferredOutbound',
            header: t('policies.tableColPreferredOutbound'),
            width: 'min-w-[120px]',
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
                        <Badge tone={policy.type === 'raw' ? 'warning' : 'accent'} className="text-[12px] px-2.5 py-0.5 whitespace-nowrap inline-block truncate max-w-[72px]">
                            {policy.type === 'raw' ? t('policies.typeRaw') : t('policies.typeStandard')}
                        </Badge>
                    </div>
                );
            case 'outbound':
                return (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                        {isOutboundDisplayable(getPolicyOutbound(policy)) ? (
                            <Badge tone={getOutboundTone(getPolicyOutbound(policy) ?? '')} className="text-[12px] px-2.5 py-0.5 whitespace-nowrap inline-block truncate max-w-[72px]">
                                {getOutboundLabel(getPolicyOutbound(policy), t)}
                            </Badge>
                        ) : null}
                    </div>
                );
            case 'preferredOutbound':
                return (
                    <>
                        {profilePolicies[policy.id] && profilePolicies[policy.id].length > 0 && (
                            <div className="flex flex-wrap gap-1 overflow-hidden" title={profilePolicies[policy.id].join(', ')}>
                                {profilePolicies[policy.id].map((node, index) => (
                                    <Badge
                                        key={index}
                                        tone="accent"
                                        className="text-[12px] px-2.5 py-0.5 whitespace-nowrap truncate max-w-[120px]"
                                    >
                                        {node}
                                    </Badge>
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
            onBatchEnable={onBatchEnable}
            onBatchDisable={onBatchDisable}
            onBatchDelete={onBatchDelete}
            onEdit={onEdit}
            renderDropdown={renderDropdown}
            onReorder={onReorder}
            noMatchText={t('policies.noMatchingPolicies')}
        />
    );
}
