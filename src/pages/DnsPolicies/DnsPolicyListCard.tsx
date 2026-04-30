import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Surface';
import { cn } from '../../lib/utils';
import type { DnsPolicy } from '../../types/dns-policy';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';
import { getPolicyServer, getPolicyMatchCount, getServerLabel } from './utils';
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
    onReorder?: (itemId: string, oldIndex: number, newIndex: number, visibleOrderedIds: string[]) => void;
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
            width: 'minmax(100px, 1.5fr)',
        },
        {
            id: 'type',
            header: t('policies.tableColType'),
            width: '56px',
            align: 'center',
        },
        {
            id: 'dnsServer',
            header: t('policies.tableColDnsServer'),
            width: 'minmax(80px, 0.8fr)',
            align: 'center',
            nowrap: true,
        },
        {
            id: 'preferredDns',
            header: t('policies.tableColPreferredDns'),
            width: 'minmax(90px, 1fr)',
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
                        <span className="policy-type-badge">
                            {policy.type === 'raw' ? t('policies.typeRaw') : t('policies.typeStandard')}
                        </span>
                    </div>
                );
            case 'dnsServer':
                return (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                        {(() => {
                            const serverId = getPolicyServer(policy);
                            const dnsServer = serverId ? dnsServers.find(s => s.id === serverId) : null;
                            const displayLabel = dnsServer ? (dnsServer.name || dnsServer.id) : getServerLabel(serverId, t);
                            return serverId ? (
                                <span className="policy-chip" title={displayLabel}>
                                    {displayLabel}
                                </span>
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
                                <span
                                    className="policy-chip"
                                    title={displayTag}
                                >
                                    {displayTag}
                                </span>
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
            onEdit={onEdit}
            renderDropdown={renderDropdown}
            onReorder={onReorder}
            noMatchText={t('policies.noMatchingPolicies')}
        />
    );
}
