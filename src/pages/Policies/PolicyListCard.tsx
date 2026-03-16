import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Card, Badge } from '../../components/ui/Surface';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { Plus, Search, MoreVertical, ChevronDown, Download } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { Policy } from '../../types/policy';
import { getOutboundLabel, getOutboundTone, getPolicyOutbound, getPolicyRuleSets, getPolicyMatchCount, isOutboundDisplayable } from './utils';
import { PolicyRowDropdown } from './PolicyRowDropdown';
import { useProfile } from '../../contexts/ProfileContext';

interface PolicyListCardProps {
    policies: Policy[];
    onAdd: () => void;
    onImportTemplate: () => void;
    onEdit: (policy: Policy) => void;
    onViewDetail: (policy: Policy) => void;
    onDelete: (id: string, name: string) => void;
    onToggleEnabled: (policy: Policy) => void;
    onReorder: (mode: 'top' | 'up' | 'down' | 'bottom', selectedIds: Set<string>) => void;
    onBatchEnable: (selectedIds: Set<string>) => void;
    onBatchDisable: (selectedIds: Set<string>) => void;
    onBatchDelete: (selectedIds: Set<string>) => void;
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
    onBatchEnable,
    onBatchDisable,
    onBatchDelete,
}: PolicyListCardProps) {
    const { seed } = useProfile();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'selected'>('all');
    const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(new Set());
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [profilePolicies, setProfilePolicies] = useState<Record<string, string[]>>({});
    const dropdownButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
    const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setSelectedPolicyIds(prev => {
            if (prev.size === 0) return prev;
            const validIds = new Set(policies.map(p => p.id));
            const next = new Set(Array.from(prev).filter((id: string) => validIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [policies]);

    // 异步加载每个策略的订阅优先选择节点
    useEffect(() => {
        const loadProfilePolicies = async () => {
            try {
                const selectedProfileResult = await window.ipcRenderer.core.getSelectedProfile();
                const currentProfileId = selectedProfileResult?.profile?.id;
                
                if (currentProfileId) {
                    const newProfilePolicies: Record<number, string[]> = {};
                    
                    await Promise.all(
                        policies.map(async (policy) => {
                            try {
                                const profilePolicy = await window.ipcRenderer.db.getProfilePolicyByPolicyId(currentProfileId, policy.id);
                                if (profilePolicy?.preferred_outbounds) {
                                    newProfilePolicies[policy.id] = profilePolicy.preferred_outbounds;
                                }
                            } catch (err) {
                                console.error(`Failed to load profile policy for policy ${policy.id}:`, err);
                            }
                        })
                    );
                    
                    setProfilePolicies(newProfilePolicies);
                }
            } catch (err) {
                console.error('Failed to load profile policies:', err);
            }
        };

        loadProfilePolicies();
    }, [policies, seed]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.dropdown-menu')) return;
            setOpenDropdownId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);


    const filteredPolicies = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return policies.filter((policy) => {
            if (statusFilter === 'enabled' && !policy.enabled) return false;
            if (statusFilter === 'disabled' && policy.enabled) return false;
            if (statusFilter === 'selected' && !selectedPolicyIds.has(policy.id)) return false;
            if (!query) return true;
            const searchFields = [
                policy.name,
                getPolicyOutbound(policy),
                getOutboundLabel(getPolicyOutbound(policy)),
                ...getPolicyRuleSets(policy),
            ];
            return searchFields.some((value) => value?.toLowerCase().includes(query));
        });
    }, [policies, searchQuery, selectedPolicyIds, statusFilter]);

    const policyStats = useMemo(() => {
        const enabledCount = policies.filter((p) => p.enabled).length;
        return {
            total: policies.length,
            enabled: enabledCount,
            disabled: policies.length - enabledCount,
            selected: selectedPolicyIds.size,
            totalMatches: policies.reduce((sum, p) => sum + getPolicyMatchCount(p), 0),
        };
    }, [policies, selectedPolicyIds]);

    const togglePolicySelection = (id: number) => {
        setSelectedPolicyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleOpenDropdown = (e: React.MouseEvent, policyId: number) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[policyId];
        if (button) {
            const rect = button.getBoundingClientRect();
            const menuWidth = 120;
            const menuHeight = 130;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const gap = 4;
            const edgePadding = 8;
            const preferBelowTop = rect.bottom + gap;
            const placeAboveTop = rect.top - menuHeight - gap;
            const top = preferBelowTop + menuHeight <= viewportHeight - edgePadding ? preferBelowTop : Math.max(edgePadding, placeAboveTop);
            const preferredLeft = rect.right - menuWidth;
            const minLeft = edgePadding;
            const maxLeft = Math.max(edgePadding, viewportWidth - menuWidth - edgePadding);
            const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);
            setDropdownPosition({ top, left });
        }
        setOpenDropdownId(prev => prev === policyId ? null : policyId);
    };

    useEffect(() => {
        const el = selectAllCheckboxRef.current;
        if (!el || filteredPolicies.length === 0) return;
        const selectedInFiltered = filteredPolicies.filter(p => selectedPolicyIds.has(p.id)).length;
        el.indeterminate = selectedInFiltered > 0 && selectedInFiltered < filteredPolicies.length;
    }, [filteredPolicies, selectedPolicyIds]);

    return (
        <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-divider)] bg-[rgba(255,255,255,0.6)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索策略、规则集、域名..."
                            className="input-field h-8 pl-8 pr-2.5 text-[12px]"
                        />
                    </div>
                    {[
                        { key: 'all', label: '全部' },
                        { key: 'enabled', label: '启用' },
                        { key: 'disabled', label: '停用' },
                        { key: 'selected', label: '已选' }
                    ].map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => setStatusFilter(option.key as 'all' | 'enabled' | 'disabled' | 'selected')}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                                statusFilter === option.key
                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                    : "border-[var(--app-stroke)] bg-white/75 text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                    <span className="text-[11px] text-[var(--app-text-quaternary)]">
                        {policyStats.total} 条 · 展示 {filteredPolicies.length}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onReorder('top', selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>置顶</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onReorder('up', selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>↑</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onReorder('down', selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>↓</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onReorder('bottom', selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>置底</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700" onClick={() => onBatchEnable(selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>启用</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700" onClick={() => onBatchDisable(selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>禁用</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-500 hover:text-red-600" onClick={() => onBatchDelete(selectedPolicyIds)} disabled={selectedPolicyIds.size === 0}>删除</Button>
                    <div className="mx-1 w-px h-5 bg-[var(--app-divider)]" />
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-[11px]" onClick={onImportTemplate}><Download className="w-3 h-3 mr-1" />导入</Button>
                    <Button variant="primary" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onAdd}><Plus className="w-3 h-3 mr-1" />添加</Button>
                </div>
            </div>

            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                {filteredPolicies.length === 0 ? (
                    <div className="flex min-h-[180px] flex-col items-center justify-center py-8 text-center">
                        <Search className="h-6 w-6 text-[var(--app-text-quaternary)]" />
                        <p className="mt-3 text-[13px] text-[var(--app-text-tertiary)]">没有匹配的策略</p>
                    </div>
                ) : (
                    <table className="data-table w-full">
                        <thead className="sticky top-0 z-10 border-b border-[var(--app-divider)] bg-[rgba(248,249,251,0.95)]">
                            <tr className="h-9">
                                <th className="w-8 shrink-0 pl-4 pr-3 py-1.5 text-left">
                                    {filteredPolicies.length > 0 && (
                                        <input
                                            type="checkbox"
                                            checked={filteredPolicies.every(p => selectedPolicyIds.has(p.id))}
                                            ref={selectAllCheckboxRef}
                                            onChange={() => {
                                                const allSelected = filteredPolicies.every(p => selectedPolicyIds.has(p.id));
                                                if (allSelected) {
                                                    setSelectedPolicyIds(prev => {
                                                        const next = new Set(prev);
                                                        filteredPolicies.forEach(p => next.delete(p.id));
                                                        return next;
                                                    });
                                                } else {
                                                    setSelectedPolicyIds(prev => {
                                                        const next = new Set(prev);
                                                        filteredPolicies.forEach(p => next.add(p.id));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="h-3.5 w-3.5 rounded border-[rgba(39,44,54,0.2)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                            aria-label="全选"
                                        />
                                    )}
                                </th>
                                <th className="w-8 shrink-0 px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">#</th>
                                <th className="w-[52px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">启用</th>
                                <th className="min-w-[140px] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">策略名称</th>
                                <th className="w-[60px] min-w-[60px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">类型</th>
                                <th className="w-[100px] min-w-[100px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)] whitespace-nowrap">出站</th>
                                <th className="min-w-[120px] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)] whitespace-nowrap">订阅出站节点</th>
                                <th className="w-[80px] pl-3 pr-4 py-1.5 text-right text-[11px] font-medium text-[var(--app-text-quaternary)]">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPolicies.map((policy, index) => (
                                <tr
                                    key={policy.id}
                                    className={cn(
                                        "group border-b border-[var(--app-divider)] transition-colors cursor-pointer h-9",
                                        selectedPolicyIds.has(policy.id) && "bg-[var(--app-accent-soft-card)]"
                                    )}
                                    onDoubleClick={(e) => {
                                        const target = e.target as HTMLElement;
                                        if (target.closest('input, button, [role="switch"]')) return;
                                        onEdit(policy);
                                    }}
                                >
                                    <td className="w-8 shrink-0 pl-4 pr-3 py-1.5 align-middle">
                                        <input
                                            type="checkbox"
                                            checked={selectedPolicyIds.has(policy.id)}
                                            onChange={() => togglePolicySelection(policy.id)}
                                            className="h-3.5 w-3.5 rounded border-[rgba(39,44,54,0.2)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                            aria-label={`选择 ${policy.name}`}
                                        />
                                    </td>
                                    <td className="w-8 shrink-0 px-3 py-1.5 text-center text-[11px] text-[var(--app-text-quaternary)] align-middle">
                                        {index + 1}
                                    </td>
                                    <td className="w-[52px] shrink-0 px-3 py-1.5 text-center align-middle">
                                        <Switch
                                            checked={policy.enabled}
                                            onCheckedChange={() => onToggleEnabled(policy)}
                                        />
                                    </td>
                                    <td className={cn("min-w-[140px] px-3 py-1.5 align-middle", !policy.enabled && "opacity-60")}>
                                        <span className="truncate text-[13px] font-medium text-[var(--app-text)]">{policy.name}</span>
                                    </td>
                                    <td className={cn("w-[60px] min-w-[60px] shrink-0 px-3 py-1.5 text-center align-middle", !policy.enabled && "opacity-60")}>
                                        <div className="flex items-center justify-center h-full">
                                            <Badge tone={policy.type === 'raw' ? 'warning' : 'accent'} className="text-[10px] px-1.5 py-0.5 whitespace-nowrap inline-block truncate max-w-[56px]">
                                                {policy.type === 'raw' ? '原始' : '标准'}
                                            </Badge>
                                        </div>
                                    </td>
                                    <td className={cn("w-[100px] min-w-[100px] shrink-0 px-3 py-1.5 text-center align-middle", !policy.enabled && "opacity-60")}>
                                        <div className="flex items-center justify-center gap-1 flex-wrap">
                                            {isOutboundDisplayable(getPolicyOutbound(policy)) ? (
                                                <Badge tone={getOutboundTone(getPolicyOutbound(policy) ?? '')} className="text-[10px] px-1.5 py-0 whitespace-nowrap inline-block truncate max-w-[50px]">
                                                {getOutboundLabel(getPolicyOutbound(policy))}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className={cn("px-3 py-1.5 align-middle", !policy.enabled && "opacity-60")}>
                                        {profilePolicies[policy.id] && profilePolicies[policy.id].length > 0 && (
                                            <div className="flex flex-wrap gap-1 overflow-hidden" title={profilePolicies[policy.id].join(', ')}>
                                                {profilePolicies[policy.id].map((node, index) => (
                                                    <Badge 
                                                        key={index}
                                                        tone="info" 
                                                        className="text-[10px] px-1.5 py-0.5 whitespace-nowrap truncate max-w-[120px]"
                                                    >
                                                        {node}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="w-[80px] shrink-0 pl-3 pr-4 py-1.5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-0.5">
                                            <button
                                                type="button"
                                                ref={(el) => { dropdownButtonRefs.current[policy.id] = el; }}
                                                onClick={(e) => { e.stopPropagation(); handleOpenDropdown(e, policy.id); }}
                                                className="rounded p-1 text-[var(--app-text-quaternary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                                                title="更多"
                                            >
                                                <MoreVertical className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {openDropdownId !== null && (() => {
                const policy = policies.find(p => p.id === openDropdownId);
                if (!policy) return null;
                return (
                    <PolicyRowDropdown
                        policy={policy}
                        position={dropdownPosition}
                        onViewDetail={(p) => { setOpenDropdownId(null); onViewDetail(p); }}
                        onEdit={(p) => { setOpenDropdownId(null); onEdit(p); }}
                        onDelete={(id, name) => { setOpenDropdownId(null); onDelete(id, name); }}
                    />
                );
            })()}
        </Card>
    );
}
