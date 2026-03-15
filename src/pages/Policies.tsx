import React, { useState, useEffect, useCallback } from 'react';
import type { Policy } from '../types/policy';
import type { RuleProvider } from '../types/rule-providers';
import { useNotificationState, NotificationList } from '../components/ui/Notification';
import { POLICY_FINAL_OPTIONS } from './Policies/utils';
import { PolicyHeader } from './Policies/PolicyHeader';
import { PolicyEmptyState } from './Policies/PolicyEmptyState';
import { PolicyListCard } from './Policies/PolicyListCard';
import { PolicyEditModalContainer } from './Policies/PolicyEditModalContainer';
import { PolicyImportModalContainer } from './Policies/PolicyImportModalContainer';
import { PolicyDetailModal } from './Policies/PolicyDetailModal';
import { PolicyDeleteConfirmModal } from './Policies/PolicyDeleteConfirmModal';
import { PolicyBatchDeleteConfirmModal } from './Policies/PolicyBatchDeleteConfirmModal';
import { usePolicyFinalOutbound } from './Policies/usePolicyFinalOutbound';

export function Policies() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importSource, setImportSource] = useState<'template' | 'config'>('template');
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailPolicy, setDetailPolicy] = useState<Policy | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [deleteTargetName, setDeleteTargetName] = useState('');
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
    const [batchDeleteIds, setBatchDeleteIds] = useState<Set<string>>(new Set());
    const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>([]);

    const { notifications, addNotification, removeNotification } = useNotificationState();
    const policyFinalOutbound = usePolicyFinalOutbound();

    const loadPolicies = useCallback(async () => {
        try {
            setLoading(true);
            const [data, providers] = await Promise.all([
                window.ipcRenderer.db.getPolicies(),
                window.ipcRenderer.db.getRuleProviders(),
            ]);
            setPolicies(data || []);
            setRuleProviders(providers || []);
        } catch (err: unknown) {
            console.error('Failed to load policies:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPolicies();
    }, [loadPolicies]);

    const handleAdd = () => {
        setEditingPolicy(null);
        setShowEditModal(true);
    };

    const handleEdit = (policy: Policy) => {
        setEditingPolicy(policy);
        setShowEditModal(true);
    };

    const handleViewDetail = (policy: Policy) => {
        setDetailPolicy(policy);
        setShowDetailModal(true);
    };

    const handleCopyDetailPolicy = async () => {
        if (!detailPolicy || detailPolicy.type !== 'raw') return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(detailPolicy.raw_data || {}, null, 2));
            addNotification('原始规则已复制到剪贴板');
        } catch (err: unknown) {
            addNotification(`复制失败: ${(err as Error)?.message || '未知错误'}`, 'error');
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
            // 转换为批量操作：创建一个包含当前策略的临时选中集
            const tempDeleteIds = new Set([deleteTargetId]);
            await confirmBatchDeleteForSingle(tempDeleteIds);
        } catch (err: unknown) {
            console.error('Failed to delete policy:', err);
            addNotification(`删除失败: ${(err as Error)?.message || '未知错误'}`, 'error');
        } finally {
            setShowDeleteConfirm(false);
            setDeleteTargetId(null);
            setDeleteTargetName('');
        }
    };

    const handleToggleEnabled = async (policy: Policy) => {
        // 转换为批量操作：创建一个包含当前策略的临时选中集
        const tempSelectedIds = new Set([policy.id]);
        const newEnabledState = !policy.enabled;
        
        try {
            if (newEnabledState) {
                await handleBatchEnable(tempSelectedIds);
            } else {
                await handleBatchDisable(tempSelectedIds);
            }
        } catch (err: unknown) {
            console.error('Failed to toggle policy:', err);
        }
    };

    const persistPolicyOrder = async (nextPolicies: Policy[]) => {
        setPolicies(nextPolicies);
        const orders = nextPolicies.map((p, index) => ({ id: p.id, order: index }));
        try {
            await window.ipcRenderer.db.updatePoliciesOrder(orders);
        } catch (err: unknown) {
            console.error('Failed to update order:', err);
            addNotification('批量排序失败，已恢复原顺序', 'error');
            loadPolicies();
        }
    };

    const handleBatchEnable = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.updatePolicy(id, { enabled: true })));
            addNotification(`已启用 ${ids.length} 条策略`);
            loadPolicies();
            // 不在此处调用 generateConfig：db.updatePolicy 已触发 regenerateConfigIfOverrideRulesEnabled（防抖），
            // 主进程会自动重新生成配置并重启内核，避免重复重启
        } catch (err: unknown) {
            addNotification(`批量启用失败: ${(err as Error)?.message || '未知错误'}`, 'error');
        }
    };

    const handleBatchDisable = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.updatePolicy(id, { enabled: false })));
            addNotification(`已禁用 ${ids.length} 条策略`);
            loadPolicies();
            // 不在此处调用 generateConfig：db.updatePolicy 已触发 regenerateConfigIfOverrideRulesEnabled（防抖），
            // 主进程会自动重新生成配置并重启内核，避免重复重启
        } catch (err: unknown) {
            addNotification(`批量禁用失败: ${(err as Error)?.message || '未知错误'}`, 'error');
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
            await Promise.all(ids.map(id => window.ipcRenderer.db.deletePolicy(id as string)));
            addNotification(`已删除 ${count} 条策略`);
            loadPolicies();
            // 不在此处调用 generateConfig：db.deletePolicy 已触发 regenerateConfigIfOverrideRulesEnabled（防抖），
            // 主进程会自动重新生成配置并重启内核，避免重复重启
        } catch (err: unknown) {
            addNotification(`批量删除失败: ${(err as Error)?.message || '未知错误'}`, 'error');
        }
    };

    // 为单个删除操作创建的批量删除函数
    const confirmBatchDeleteForSingle = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => window.ipcRenderer.db.deletePolicy(id as string)));
            addNotification('策略已删除');
            loadPolicies();
            // 不在此处调用 generateConfig：db.deletePolicy 已触发 regenerateConfigIfOverrideRulesEnabled（防抖），
            // 主进程会自动重新生成配置并重启内核，避免重复重启
        } catch (err: unknown) {
            addNotification(`删除失败: ${(err as Error)?.message || '未知错误'}`, 'error');
        }
    };

    const reorderSelectedPolicies = async (mode: 'top' | 'up' | 'down' | 'bottom', selectedIds: Set<string>) => {
        if (selectedIds.size === 0 || policies.length <= 1) return;
        const next = [...policies];
        const isSelected = (id: string) => selectedIds.has(id);
        if (mode === 'top') {
            const selected = next.filter(p => isSelected(p.id));
            const unselected = next.filter(p => !isSelected(p.id));
            await persistPolicyOrder([...selected, ...unselected]);
            return;
        }
        if (mode === 'bottom') {
            const selected = next.filter(p => isSelected(p.id));
            const unselected = next.filter(p => !isSelected(p.id));
            await persistPolicyOrder([...unselected, ...selected]);
            return;
        }
        if (mode === 'up') {
            for (let i = 1; i < next.length; i++) {
                if (isSelected(next[i].id) && !isSelected(next[i - 1].id)) {
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                }
            }
            await persistPolicyOrder(next);
            return;
        }
        for (let i = next.length - 2; i >= 0; i--) {
            if (isSelected(next[i].id) && !isSelected(next[i + 1].id)) {
                [next[i], next[i + 1]] = [next[i + 1], next[i]];
            }
        }
        await persistPolicyOrder(next);
    };

    const handlePolicyFinalOutboundChange = async (value: 'direct_out' | 'block_out' | 'selector_out') => {
        try {
            await policyFinalOutbound.onChange(value);
            addNotification(`未匹配时出站已切换为：${POLICY_FINAL_OPTIONS.find(item => item.value === value)?.label ?? value}`);
        } catch (err: unknown) {
            addNotification(`更新未匹配时出站失败: ${(err as Error)?.message || '未知错误'}`, 'error');
        }
    };

    const handleOpenImport = async (source: 'template' | 'config') => {
        setImportSource(source);
        setShowImportModal(true);
    };

    const handleImportComplete = (updatedPolicies?: Policy[], policyFinalOutboundValue?: string) => {
        if (updatedPolicies) {
            setPolicies(updatedPolicies);
        } else {
            loadPolicies();
        }
        if (policyFinalOutboundValue) {
            policyFinalOutbound.refresh();
        }
    };

    return (
        <div className="page-shell text-[var(--app-text-secondary)] relative">
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            <PolicyHeader
                policyFinalOutbound={policyFinalOutbound.value}
                savingPolicyFinalOutbound={policyFinalOutbound.saving}
                onPolicyFinalOutboundChange={handlePolicyFinalOutboundChange}
            />

            <div className="page-content space-y-3">
                {policies.length === 0 ? (
                    <PolicyEmptyState onAdd={handleAdd} onImportTemplate={() => handleOpenImport('template')} />
                ) : (
                    <PolicyListCard
                        policies={policies}
                        onAdd={handleAdd}
                        onImportTemplate={() => handleOpenImport('template')}
                        onEdit={handleEdit}
                        onViewDetail={handleViewDetail}
                        onDelete={openDeleteConfirm}
                        onToggleEnabled={handleToggleEnabled}
                        onReorder={reorderSelectedPolicies}
                        onBatchEnable={handleBatchEnable}
                        onBatchDisable={handleBatchDisable}
                        onBatchDelete={handleBatchDelete}
                    />
                )}
            </div>

            <PolicyEditModalContainer
                open={showEditModal}
                editingPolicy={editingPolicy}
                policiesCount={policies.length}
                onClose={() => setShowEditModal(false)}
                onSaved={loadPolicies}
                addNotification={addNotification}
            />

            <PolicyImportModalContainer
                open={showImportModal}
                importSource={importSource}
                policiesCount={policies.length}
                onClose={() => setShowImportModal(false)}
                onImportComplete={handleImportComplete}
                addNotification={addNotification}
            />

            <PolicyDetailModal
                open={showDetailModal}
                policy={detailPolicy}
                ruleProviders={ruleProviders}
                onCopy={handleCopyDetailPolicy}
                onEdit={handleEdit}
                onClose={() => setShowDetailModal(false)}
            />

            <PolicyDeleteConfirmModal
                open={showDeleteConfirm}
                targetName={deleteTargetName}
                onConfirm={confirmDelete}
                onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); setDeleteTargetName(''); }}
            />

            <PolicyBatchDeleteConfirmModal
                open={showBatchDeleteConfirm}
                count={batchDeleteIds.size}
                onConfirm={confirmBatchDelete}
                onClose={() => setShowBatchDeleteConfirm(false)}
            />
        </div>
    );
}
