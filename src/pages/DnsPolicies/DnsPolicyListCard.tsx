import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, ChevronRight } from 'lucide-react';
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
    /** 未匹配DNS服务器设置值 */
    unmatchedServer?: string;
    /** 点击未匹配DNS服务器行时的回调（打开设置弹窗） */
    onUnmatchedServerClick?: () => void;
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
    unmatchedServer,
    onUnmatchedServerClick,
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
                        <span className="inline-flex items-center rounded-md border border-[var(--app-stroke)]/70 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--app-text-secondary)] tracking-wide">
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
                                <span
                                    className="inline-flex items-center rounded-full border border-[var(--app-accent-border)]/60 bg-gradient-to-b from-[var(--app-accent-soft)]/50 to-[var(--app-accent-soft)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--app-accent-strong)] shadow-sm"
                                    title={displayLabel}
                                >
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
    const renderDropdown = (policy: DnsPolicy, position: { top: number; left: number }, close: () => void) => {
        return (
            <DnsPolicyRowDropdown
                policy={policy}
                position={position}
                onViewDetail={(p) => { close(); onViewDetail(p); }}
                onEdit={(p) => { close(); onEdit(p); }}
                onDelete={(id, name) => { close(); onDelete(id, name); }}
            />
        );
    };

    // 未匹配 DNS 服务器设置条
    const unmatchedServerLabel = useMemo(() => {
        if (unmatchedServer === undefined) return null;
        const dnsServer = dnsServers.find(s => s.id === unmatchedServer);
        const displayLabel = dnsServer ? (dnsServer.name || dnsServer.id) : getServerLabel(unmatchedServer, t);
        return (
            <div
                className="group mb-2 flex items-center gap-3 rounded-xl border border-[var(--app-accent-border)]/60 bg-gradient-to-r from-[var(--app-accent-soft)]/40 to-[var(--app-panel-soft)]/30 px-4 py-2.5 text-[13px] cursor-pointer transition-all hover:shadow-[0_4px_16px_rgba(31,119,255,0.08)] hover:border-[var(--app-accent)]/40 hover:from-[var(--app-accent-soft)]/60 hover:to-[var(--app-accent-soft)]/20"
                onClick={onUnmatchedServerClick}
            >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--app-accent)]/20 to-[var(--app-accent)]/5 shadow-inner shrink-0 ring-1 ring-[var(--app-accent)]/15">
                    <Lightbulb className="w-4 h-4 text-[var(--app-accent-strong)]" />
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold text-[#1a1a1a] dark:text-white leading-tight">{t('dnsPolicies.unmatchedServer.label')}</span>
                    <span className="text-[11px] text-[var(--app-text-tertiary)] leading-tight hidden md:block">
                        {t('dnsPolicies.unmatchedServer.description')}
                    </span>
                </div>
                <span className="flex-1" />
                <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-accent-border)]/70 bg-gradient-to-b from-white/80 to-[var(--app-accent-soft)]/40 dark:from-white/[0.03] dark:to-[var(--app-accent)]/[0.08] px-3 py-1 text-[11px] font-semibold text-[var(--app-accent-strong)] shadow-sm">
                        {displayLabel}
                    </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--app-text-tertiary)] group-hover:text-[var(--app-accent)] transition-colors shrink-0" />
            </div>
        );
    }, [unmatchedServer, dnsServers, t, onUnmatchedServerClick]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <PolicyListTable<DnsPolicy>
                items={policies}
                columns={columns}
                renderCell={renderCell}
                searchFields={searchFields}
                searchPlaceholder={t('policies.listSearchPlaceholder')}
                showIndexColumn={true}
                onAdd={onAdd}
                onToggleEnabled={onToggleEnabled}
                onEdit={onEdit}
                renderDropdown={renderDropdown}
                onReorder={policies.length > 0 ? onReorder : undefined}
                noMatchText={t('policies.noMatchingPolicies')}
                toolbarAboveExtra={unmatchedServerLabel}
            />
        </div>
    );
}
