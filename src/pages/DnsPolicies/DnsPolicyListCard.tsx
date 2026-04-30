import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Surface';
import { cn } from '../../lib/utils';
import type { DnsPolicy } from '../../types/dns-policy';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';
import { getPolicyServer, getPolicyMatchCount, getServerTone, getServerLabel } from './utils';
import { DnsPolicyRowDropdown } from './DnsPolicyRowDropdown';

interface DnsPolicyListCardProps {
    policies: DnsPolicy[];
    dnsServers: Array<{ id: string; name?: string }>;
    availableOutbounds: Array<{ tag: string; type: string }>;
    profileDnsPolicies: Record<string, string>;
    onAdd: () => void;
    onEdit: (policy: DnsPolicy) => void;
    onViewDetail: (policy: DnsPolicy) => void;
    onDelete: (id: string, name: string) => void;
    onToggleEnabled: (policy: DnsPolicy) => void;
    onBatchEnable: (selectedIds: Set<string>) => void;
    onBatchDisable: (selectedIds: Set<string>) => void;
    onBatchDelete: (selectedIds: Set<string>) => void;
    onReorder?: (itemId: string, oldIndex: number, newIndex: number) => void;
}

export function DnsPolicyListCard({
    policies,
    dnsServers,
    availableOutbounds,
    profileDnsPolicies,
    onAdd,
    onEdit,
    onViewDetail,
    onDelete,
    onToggleEnabled,
    onBatchEnable,
    onBatchDisable,
    onBatchDelete,
    onReorder,
}: DnsPolicyListCardProps) {
    const { t } = useTranslation();

    // 从profileDnsPolicies获取preferred_server（订阅服务器）
    const getSubscriptionServer = useCallback((policy: DnsPolicy): string | undefined => {
        return profileDnsPolicies[policy.id];
    }, [profileDnsPolicies]);

    // 列定义
    const columns: ColumnDef<DnsPolicy>[] = useMemo(() => [
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
            id: 'dnsServer',
            header: t('policies.tableColDnsServer'),
            width: 'w-[100px] min-w-[100px]',
            align: 'text-center',
            nowrap: true,
        },
        {
            id: 'preferredDns',
            header: t('policies.tableColPreferredDns'),
            width: 'min-w-[120px]',
            nowrap: true,
        },
    ], [t]);

    // 搜索字段
    const searchFields = useMemo(() => (policy: DnsPolicy) => {
        const serverId = getPolicyServer(policy);
        const dnsServer = serverId ? dnsServers.find(s => s.id === serverId) : null;
        const fields = [
            policy.name,
            serverId,
            dnsServer?.id,
            dnsServer?.name,
            getServerLabel(serverId, t),
            getSubscriptionServer(policy),
        ];
        return fields;
    }, [dnsServers, getSubscriptionServer, t]);

    // 单元格渲染
    const renderCell = (policy: DnsPolicy, columnId: string, _index: number) => {
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
            case 'dnsServer':
                return (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                        {(() => {
                            const serverId = getPolicyServer(policy);
                            const dnsServer = serverId ? dnsServers.find(s => s.id === serverId) : null;
                            const displayLabel = dnsServer ? (dnsServer.name || dnsServer.id) : getServerLabel(serverId, t);
                            const tone = getServerTone(serverId ?? '');
                            return serverId ? (
                                <Badge tone={tone} className="text-[12px] px-2.5 py-0.5 whitespace-nowrap inline-block truncate max-w-[96px]">
                                    {displayLabel}
                                </Badge>
                            ) : null;
                        })()}
                    </div>
                );
            case 'preferredDns':
                return (
                    <div className="flex flex-wrap gap-1 overflow-hidden">
                        {(() => {
                            const preferredServer = getSubscriptionServer(policy);
                            if (!preferredServer) return null;
                            const dnsServer = dnsServers.find(s => s.id === preferredServer);
                            const displayTag = dnsServer?.name || dnsServer?.id || preferredServer;
                            return (
                                <Badge
                                    tone="accent"
                                    className="text-[12px] px-2.5 py-0.5 whitespace-nowrap truncate max-w-[120px]"
                                >
                                    {displayTag}
                                </Badge>
                            );
                        })()}
                    </div>
                );
            default:
                return null;
        }
    };

    // 下拉菜单渲染
    const renderDropdown = (policy: DnsPolicy, position: { top: number; left: number }, close: () => void) => (
        <DnsPolicyRowDropdown
            policy={policy}
            position={position}
            onViewDetail={(p) => { close(); onViewDetail(p); }}
            onEdit={(p) => { close(); onEdit(p); }}
            onDelete={(id, name) => { close(); onDelete(id, name); }}
        />
    );

    return (
        <PolicyListTable<DnsPolicy>
            items={policies}
            columns={columns}
            renderCell={renderCell}
            searchFields={searchFields}
            searchPlaceholder={t('policies.listSearchPlaceholder')}
            statsLineKey="policies.statsLine"
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
