import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DnsPolicy } from '../types/dns-policy';
import { useNotificationState, NotificationList } from '../components/ui/Notification';
import { DnsPolicyHeader } from './DnsPolicies/DnsPolicyHeader';
import { DnsPolicyEmptyState } from './DnsPolicies/DnsPolicyEmptyState';
import { DnsPolicyListCard } from './DnsPolicies/DnsPolicyListCard';
import { DnsPolicyEditModalContainer } from './DnsPolicies/DnsPolicyEditModalContainer';
import { DnsPolicyDetailModal } from './DnsPolicies/DnsPolicyDetailModal';
import { DnsPolicyDeleteConfirmModal } from './DnsPolicies/DnsPolicyDeleteConfirmModal';
import { DnsPolicyBatchDeleteConfirmModal } from './DnsPolicies/DnsPolicyBatchDeleteConfirmModal';

interface DnsPoliciesProps {
    /** 页面是否处于激活状态，用于进入时重新加载 */
    isActive?: boolean;
}

export function DnsPolicies({ isActive = true }: DnsPoliciesProps) {
const { t } = useTranslation();
const [policies, setPolicies] = useState<DnsPolicy[]>([]);
    const [dnsServers, setDnsServers] = useState<Array<{ id: string; name?: string }>>([]);
    const [availableOutbounds, setAvailableOutbounds] = useState<Array<{ tag: string; type: string }>>([]);
    const [profileDnsPolicies, setProfileDnsPolicies] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<DnsPolicy | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailPolicy, setDetailPolicy] = useState<DnsPolicy | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [deleteTargetName, setDeleteTargetName] = useState('');
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
    const [batchDeleteIds, setBatchDeleteIds] = useState<Set<string>>(new Set());

    const { notifications, addNotification, removeNotification } = useNotificationState();

    const loadPolicies = useCallback(async () => {
        try {
            setLoading(true);
            const [data, servers, outbounds, selectedProfile] = await Promise.all([
                window.ipcRenderer.db.getDnsPolicies(),
                window.ipcRenderer.db.getDnsServers(),
                window.ipcRenderer.core.getAvailableOutbounds(),
                window.ipcRenderer.core.getSelectedProfile(),
            ]);
            setPolicies(data || []);
            setDnsServers((servers || []).map((s: any) => ({ id: s.id, name: s.name })));
            setAvailableOutbounds((outbounds as Array<{ tag: string; type: string }>) || []);
            
            // 从 profile.dnsPolicies 加载（已嵌入 profile）
            const dnsPolicies = selectedProfile?.profile?.dnsPolicies ?? [];
            const profileDnsMap: Record<string, string> = {};
            dnsPolicies.forEach((p: { dns_policy_id: string; preferred_server: string | null }) => {
                if (p.preferred_server) profileDnsMap[p.dns_policy_id] = p.preferred_server;
            });
            setProfileDnsPolicies(profileDnsMap);
        } catch (err: unknown) {
            console.error('Failed to load DNS policies:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // 进入页面时重新加载
    useEffect(() => {
        if (isActive) {
            loadPolicies();
        }
    }, [isActive, loadPolicies]);

    const handleAdd = () => {
        setEditingPolicy(null);
        setShowEditModal(true);
    };

    const handleEdit = (policy: DnsPolicy) => {
        setEditingPolicy(policy);
        setShowEditModal(true);
    };

    const handleViewDetail = (policy: DnsPolicy) => {
        setDetailPolicy(policy);
        setShowDetailModal(true);
    };

    const handleCopyDetailPolicy = async () => {
        if (!detailPolicy || detailPolicy.type !== 'raw') return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(detailPolicy.raw_data || {}, null, 2));
            addNotification(t('policies.rawRuleCopied'));
        } catch (err: unknown) {
            addNotification(t('policies.copyFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        }
    };

    const openDeleteConfirm = (id: string, name: string) => {
        setDeleteTargetId(id);
        setDeleteTargetName(name);
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        if (deleteTargetId === null) return;
        try {
            const tempDeleteIds = new Set([deleteTargetId]);
            await confirmBatchDeleteForSingle(tempDeleteIds);
        } catch (err: unknown) {
            console.error('Failed to delete DNS policy:', err);
            addNotification(t('policies.deleteFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        } finally {
            setShowDeleteConfirm(false);
            setDeleteTargetId(null);
            setDeleteTargetName('');
        }
    };

    const handleToggleEnabled = async (policy: DnsPolicy) => {
        const tempSelectedIds = new Set([policy.id]);
        const newEnabledState = !policy.enabled;
        
        try {
            if (newEnabledState) {
                await handleBatchEnable(tempSelectedIds);
            } else {
                await handleBatchDisable(tempSelectedIds);
            }
        } catch (err: unknown) {

        }
    };

    // 拖拽排序回调
    const handleReorder = useCallback(async (itemId: string, _oldIndex: number, newIndex: number, visibleOrderedIds: string[]) => {
        const currentPolicies = [...policies];
        const fromIndex = currentPolicies.findIndex(p => p.id === itemId);
        if (fromIndex === -1 || fromIndex === newIndex) return;
        const visibleIdSet = new Set(visibleOrderedIds);
        const reorderedVisible = visibleOrderedIds
            .map(id => currentPolicies.find(p => p.id === id))
            .filter((p): p is DnsPolicy => Boolean(p));
        let visibleIndex = 0;
        const reorderedPolicies = currentPolicies.map(policy =>
            visibleIdSet.has(policy.id) ? reorderedVisible[visibleIndex++] : policy
        );
        setPolicies(reorderedPolicies);
        const orders = reorderedPolicies.map((p, index) => ({ id: p.id, order: index }));
        try {
            await window.ipcRenderer.db.updateDnsPoliciesOrder(orders);
            window.ipcRenderer.core.generateConfig().catch(console.error);
        } catch (err: unknown) {
            console.error('Failed to update order:', err);
            addNotification(t('policies.reorderFailed'), 'error');
            loadPolicies();
        }
    }, [policies, addNotification, t]);

    const handleBatchEnable = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.updateDnsPolicy(id, { enabled: true })));
            // 异步生成配置，不阻塞UI
            window.ipcRenderer.core.generateConfig().catch(console.error);
            addNotification(t('dnsPolicies.batchEnableSuccess', { count: ids.length }));
            loadPolicies();
        } catch (err: unknown) {
            addNotification(t('dnsPolicies.batchEnableFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        }
    };

    const handleBatchDisable = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.updateDnsPolicy(id, { enabled: false })));
            // 异步生成配置，不阻塞UI
            window.ipcRenderer.core.generateConfig().catch(console.error);
            addNotification(t('dnsPolicies.batchDisableSuccess', { count: ids.length }));
            loadPolicies();
        } catch (err: unknown) {
            addNotification(t('dnsPolicies.batchDisableFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        }
    };

    const handleBatchDelete = (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        setBatchDeleteIds(selectedIds);
        setShowBatchDeleteConfirm(true);
    };

    const confirmBatchDelete = async () => {
        if (batchDeleteIds.size === 0) return;
        const count = batchDeleteIds.size;
        const ids = Array.from(batchDeleteIds);
        setShowBatchDeleteConfirm(false);
        setBatchDeleteIds(new Set());
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.deleteDnsPolicy(id as string)));
            // 异步生成配置，不阻塞UI
            window.ipcRenderer.core.generateConfig().catch(console.error);
            addNotification(t('dnsPolicies.policyDeleted'));
            loadPolicies();
        } catch (err: unknown) {
            addNotification(t('dnsPolicies.batchDeleteFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        }
    };

    const confirmBatchDeleteForSingle = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.deleteDnsPolicy(id as string)));
            // 异步生成配置，不阻塞UI
            window.ipcRenderer.core.generateConfig().catch(console.error);
            addNotification(t('dnsPolicies.policyDeleted'));
            loadPolicies();
        } catch (err: unknown) {
            addNotification(t('policies.deleteFailed', { error: (err as Error)?.message || 'Unknown' }), 'error');
        }
    };

    return (
        <div className="page-shell text-[var(--app-text-secondary)] relative">
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            <DnsPolicyHeader />

            <div className="page-content flex flex-col !overflow-hidden">
                {policies.length === 0 ? (
                    <DnsPolicyEmptyState onAdd={handleAdd} />
                ) : (
                    <DnsPolicyListCard
                        policies={policies}
                        dnsServers={dnsServers}
                        availableOutbounds={availableOutbounds}
                        profileDnsPolicies={profileDnsPolicies}
                        onAdd={handleAdd}
                        onEdit={handleEdit}
                        onViewDetail={handleViewDetail}
                        onDelete={openDeleteConfirm}
                        onToggleEnabled={handleToggleEnabled}
                        onReorder={handleReorder}
                    />
                )}
            </div>

            <DnsPolicyEditModalContainer
                open={showEditModal}
                editingPolicy={editingPolicy}
                policiesCount={policies.length}
                onClose={() => setShowEditModal(false)}
                onSaved={loadPolicies}
                addNotification={addNotification}
            />

            <DnsPolicyDetailModal
                open={showDetailModal}
                policy={detailPolicy}
                onCopy={handleCopyDetailPolicy}
                onEdit={handleEdit}
                onClose={() => setShowDetailModal(false)}
            />

            <DnsPolicyDeleteConfirmModal
                open={showDeleteConfirm}
                targetName={deleteTargetName}
                onConfirm={confirmDelete}
                onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); setDeleteTargetName(''); }}
            />

            <DnsPolicyBatchDeleteConfirmModal
                open={showBatchDeleteConfirm}
                count={batchDeleteIds.size}
                onConfirm={confirmBatchDelete}
                onClose={() => setShowBatchDeleteConfirm(false)}
            />
        </div>
    );
}
