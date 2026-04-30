import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { cn } from '../lib/utils';
import { X, RefreshCw, Layers, MoreVertical, Copy, Settings, Cloud, Box } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { RuleProvider, RuleProviderType } from '../types/rule-providers';
import type { RouteLogicRule } from '../types/singbox';
import { RuleEditorField } from '../components/AdvancedRuleEditor';
import { useNotificationState, NotificationList, useConfirm } from '../components/ui/Notification';
import { Modal } from '../components/ui/Modal';
import { formatRelativeTime } from '../shared/date-utils';
import { getDisplayErrorMessage } from '../shared/error-utils';
import { PolicyListTable, type ColumnDef } from '../components/PolicyListTable';
import { RuleProviderRowDropdown } from './RuleProviders/RuleProvidersRowDropdown';

interface RuleProvidersProps {
    /** 页面是否处于激活状态，用于进入时重新加载 */
    isActive?: boolean;
}

export function RuleProviders({ isActive = true }: RuleProvidersProps) {
    const { t } = useTranslation();
    const [providers, setProviders] = useState<RuleProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProvider, setEditingProvider] = useState<RuleProvider | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewProvider, setViewProvider] = useState<RuleProvider | null>(null);
    const [viewContent, setViewContent] = useState<string | null>(null);
    const [viewError, setViewError] = useState<string | null>(null);
    const [viewLoading, setViewLoading] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [ruleProviderUpdateInterval, setRuleProviderUpdateInterval] = useState(86400);
    const settingsIntervalInputRef = useRef<HTMLInputElement | null>(null);
    const [logicRule, setLogicRule] = useState<RouteLogicRule | null>(null);

    // Notification state
    const { notifications, addNotification, removeNotification } = useNotificationState();

    // Confirm dialog
    const { confirm, ConfirmDialog } = useConfirm();

    // Form states
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [type, setType] = useState<RuleProviderType>('clash');

    // 进入页面时重新加载规则集
    useEffect(() => {
        if (isActive) {
            loadProviders();
        }
    }, [isActive]);

    // 加载规则集更新间隔设置
    useEffect(() => {
        if (isActive) {
            window.ipcRenderer.db.getAllSettings().then((s) => {
                const raw = s['rule-provider-update-interval'];
                const num = raw !== undefined && raw !== '' ? parseInt(raw, 10) : 86400;
                setRuleProviderUpdateInterval(Number.isNaN(num) ? 86400 : num);
            });
        }
    }, [isActive]);

    const handleUpdateInterval = async (val: number) => {
        setRuleProviderUpdateInterval(val);
        await window.ipcRenderer.db.setSetting('rule-provider-update-interval', String(val));
        addNotification(t('ruleProviders.intervalSaved'));
    };

    // 设置弹窗打开时自动聚焦输入框
    useEffect(() => {
        if (showSettingsModal) {
            const timerId = setTimeout(() => settingsIntervalInputRef.current?.focus(), 50);
            return () => clearTimeout(timerId);
        }
    }, [showSettingsModal]);

    const loadProviders = async () => {
        try {
            setLoading(true);
            const data = await window.ipcRenderer.db.getRuleProviders();
            setProviders(data || []);
        } catch (err: any) {
            console.error('Failed to load rule providers:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setEditingProvider(null);
        setName('');
        setUrl('');
        setType('clash');
        setLogicRule(null);
        setShowModal(true);
    };

    const handleEdit = (provider: RuleProvider) => {
        setEditingProvider(provider);
        setName(provider.name);
        setUrl(provider.url);
        setType(provider.type || 'clash');
        // 本地类型：从 logical_rule 初始化规则树
        if (provider.type === 'local') {
            setLogicRule(provider.logical_rule || null);
        } else {
            setLogicRule(null);
        }
        setShowModal(true);
    };


    const handleSave = async () => {
        if (!name.trim()) return;
        if (type !== 'local' && !url.trim()) return;

        // 本地类型需要检查规则内容
        if (type === 'local') {
            // 对于新建的本地规则集，必须有规则内容
            if (!editingProvider && !logicRule) {
                addNotification(t('ruleProviders.localRuleRequired'), 'error');
                return;
            }

            // 对于编辑已有的本地规则集，检查现有规则是否为空
            if (editingProvider) {
                const hasRules = logicRule?.rules?.length || editingProvider.logical_rule?.rules?.length;
                if (!hasRules) {
                    addNotification(t('ruleProviders.localRuleRequired'), 'error');
                    return;
                }
            }
        }

        try {
            setSaving(true);
            // 统一调用后端接口，由后端根据 type 判断处理方式
            const providerData = {
                id: editingProvider?.id,
                name: name.trim(),
                url: url.trim(),
                type,
                enabled: true,
                logical_rule: type === 'local' ? logicRule : undefined,
            };
            
            await window.ipcRenderer.core.saveRuleProvider(providerData);
            
            setShowModal(false);
            loadProviders();
            addNotification(editingProvider ? t('ruleProviders.ruleSetSaved') : t('ruleProviders.ruleSetAdded'));
            
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.saveFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: t('ruleProviders.deleteConfirm'),
            message: t('ruleProviders.deleteConfirmMessage'),
            confirmText: t('common.delete'),
            cancelText: t('common.cancel'),
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            // 转换为批量操作：创建一个包含当前规则集的临时选中集
            const tempSelectedIds = new Set([id]);
            await handleBatchDeleteForSingle(tempSelectedIds);
        } catch (err: any) {
            console.error('Failed to delete rule provider:', err);
            addNotification(t('ruleProviders.deleteFailed', { error: getDisplayErrorMessage(err) }), 'error');
        }
    };

    const handleToggleEnabled = async (provider: RuleProvider) => {
        // 转换为批量操作：创建一个包含当前规则集的临时选中集
        const tempSelectedIds = new Set([provider.id]);
        const newEnabledState = provider.enabled !== false;
        
        try {
            if (!newEnabledState) {
                await handleBatchEnable(tempSelectedIds);
            } else {
                await handleBatchDisable(tempSelectedIds);
            }
        } catch (err: any) {
            addNotification(t('ruleProviders.operationFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    // 刷新单个规则集
    const handleRefresh = async (provider: RuleProvider) => {
        try {
            setDownloadingId(provider.id);
            // 转换为批量操作：创建一个包含当前规则集的临时选中集
            const tempSelectedIds = new Set([provider.id]);
            await handleRefreshSelected(tempSelectedIds);
        } catch (err: any) {
            console.error('Failed to refresh rule provider:', err);
            addNotification(t('ruleProviders.refreshFailed', { error: err.message }), 'error');
        } finally {
            setDownloadingId(null);
        }
    };

    // 刷新选中的规则集
    const handleRefreshSelected = async (customSelectedIds?: Set<string>) => {
        if (!customSelectedIds || customSelectedIds.size === 0) return;
        try {
            const ids = Array.from(customSelectedIds) as string[];
            let successCount = 0;
            let failCount = 0;
            for (const id of ids) {
                try {
                    await window.ipcRenderer.core.downloadRuleProvider(id);
                    successCount++;
                } catch {
                    failCount++;
                }
            }
            if (failCount > 0) {
                addNotification(t('ruleProviders.refreshPartialSuccess', { success: successCount, fail: failCount }), failCount === ids.length ? 'error' : undefined);
            } else {
                const notificationMessage = ids.length === 1 
                    ? t('ruleProviders.refreshSuccess', { name: providers.find(p => p.id === ids[0])?.name || t('ruleProviders.genericProviderName') })
                    : t('ruleProviders.updatedCountRuleSets', { count: successCount });
                addNotification(notificationMessage);
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            console.error('Failed to refresh selected rule providers:', err);
            addNotification(t('ruleProviders.refreshFailed', { error: err.message }), 'error');
        }
    };

    const handleView = async (provider: RuleProvider) => {
        setViewProvider(provider);
        setViewContent(null);
        setViewError(null);
        setShowViewModal(true);
        setViewLoading(true);
        try {
            const result = await window.ipcRenderer.core.getRuleProviderViewContent(provider.id);
            if (result.error) {
                setViewError(result.error);
                setViewContent(null);
            } else {
                setViewContent(result.content || '');
                setViewError(null);
            }
        } catch (err: any) {
            setViewError(err.message || t('ruleProviders.viewLoadFailed'));
            setViewContent(null);
        } finally {
            setViewLoading(false);
        }
    };

    const handleCopyViewContent = async () => {
        if (!viewContent) return;
        try {
            await navigator.clipboard.writeText(viewContent);
            addNotification(t('ruleProviders.contentCopied'));
        } catch (err: any) {
            addNotification(t('ruleProviders.copyFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    const handleBatchEnable = async (customSelectedIds?: Set<string>) => {
        const targetIds = customSelectedIds;
        if (!targetIds || targetIds.size === 0) return;
        try {
            for (const id of targetIds) {
                await window.ipcRenderer.db.updateRuleProvider(id, { enabled: true });
            }
            addNotification(t('ruleProviders.enabledCount', { count: targetIds.size }));

            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.saveFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    const handleBatchDisable = async (customSelectedIds?: Set<string>) => {
        const targetIds = customSelectedIds;
        if (!targetIds || targetIds.size === 0) return;
        try {
            for (const id of targetIds) {
                await window.ipcRenderer.db.updateRuleProvider(id, { enabled: false });
            }
            addNotification(t('ruleProviders.disabledCount', { count: targetIds.size }));

            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.saveFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    const handleBatchDeleteForTable = async (selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return;
        const confirmed = await confirm({
            title: t('ruleProviders.batchDeleteConfirm'),
            message: t('ruleProviders.batchDeleteConfirmMessage', { count: selectedIds.size }),
            confirmText: t('common.delete'),
            cancelText: t('common.cancel'),
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            for (const id of selectedIds) {
                await window.ipcRenderer.db.deleteRuleProvider(id);
            }
            addNotification(t('ruleProviders.deleted', { count: selectedIds.size }));

            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.deleteFailed', { error: getDisplayErrorMessage(err) }), 'error');
        }
    };

    // 为单个删除操作创建的批量删除函数
    const handleBatchDeleteForSingle = async (customSelectedIds: Set<string>) => {
        if (customSelectedIds.size === 0) return;
        try {
            for (const id of customSelectedIds) {
                await window.ipcRenderer.db.deleteRuleProvider(id);
            }
            addNotification(t('ruleProviders.ruleSetDeleted'));
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.deleteFailed', { error: getDisplayErrorMessage(err) }), 'error');
            console.error('Failed to delete rule provider:', err);
        }
    };

    // 拖拽排序回调
    const handleReorder = useCallback(async (itemId: string, _oldIndex: number, newIndex: number) => {
        const currentProviders = [...providers];
        const fromIndex = currentProviders.findIndex(p => p.id === itemId);
        if (fromIndex === -1 || fromIndex === newIndex) return;
        const [movedItem] = currentProviders.splice(fromIndex, 1);
        currentProviders.splice(newIndex, 0, movedItem);
        setProviders(currentProviders);
        const orderedIds = currentProviders.map(p => p.id);
        try {
            await window.ipcRenderer.db.updateRuleProvidersOrder(orderedIds);
            window.ipcRenderer.core.generateConfig().catch(console.error);
        } catch (err: any) {
            console.error('Failed to update rule providers order:', err);
            addNotification(t('ruleProviders.reorderFailed'), 'error');
            loadProviders();
        }
    }, [providers, addNotification, t]);

    // ---- PolicyListTable 配置 ----

    // 列定义
    const columns: ColumnDef<RuleProvider>[] = useMemo(() => [
        {
            id: 'name',
            header: t('ruleProviders.ruleSetName'),
            width: 'min-w-[140px]',
        },
        {
            id: 'type',
            header: t('ruleProviders.type'),
            width: 'w-[70px]',
        },
        {
            id: 'lastUpdate',
            header: t('ruleProviders.lastUpdate'),
            width: 'w-[110px]',
        },
    ], [t]);

    // 搜索字段
    const searchFields = useMemo(() => (provider: RuleProvider) => [
        provider.name,
        provider.url,
    ], []);

    // 单元格渲染
    const renderCell = (provider: RuleProvider, columnId: string, _index: number) => {
        const enabled = provider.enabled !== false;
        switch (columnId) {
            case 'name':
                return (
                    <span className="text-[13px] font-medium text-[var(--app-text)] truncate block max-w-[160px]" title={provider.name}>
                        {provider.name}
                    </span>
                );
            case 'type':
                return (
                    <Badge tone="accent" className="text-[12px] px-2.5 py-0.5">
                        {provider.type || 'clash'}
                    </Badge>
                );
            case 'lastUpdate':
                return (
                    <span className="text-[var(--app-text-quaternary)] text-[11px]">
                        {provider.last_update ? 
                            formatRelativeTime(provider.last_update) : 
                            '—'
                        }
                    </span>
                );
            default:
                return null;
        }
    };

    // 下拉菜单渲染
    const renderDropdown = (provider: RuleProvider, position: { top: number; left: number }, close: () => void) => (
        <RuleProviderRowDropdown
            provider={provider}
            position={position}
            onView={(p) => { close(); handleView(p); }}
            onEdit={(p) => { close(); handleEdit(p); }}
            onDelete={(id) => { close(); handleDelete(id); }}
        />
    );

    // 自定义操作列（含刷新按钮）
    const renderActions = (provider: RuleProvider, _index: number, dropdownButtonRef: (el: HTMLButtonElement | null) => void, onOpenDropdown: (e: React.MouseEvent, itemId: string) => void) => (
        <div className="flex items-center justify-end gap-0.5">
            {provider.type !== 'local' && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRefresh(provider)}
                    disabled={downloadingId === provider.id}
                    title={t('common.refresh')}
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", downloadingId === provider.id && "animate-spin")} />
                </Button>
            )}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                ref={dropdownButtonRef}
                onClick={(e) => onOpenDropdown(e, provider.id)}
            >
                <MoreVertical className="w-3.5 h-3.5" />
            </Button>
        </div>
    );


    return (
        <div className="page-shell text-[var(--app-text-secondary)] relative">
            {/* Notification */}
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            <div className="page-header relative" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="min-w-0">
                    <h1 className="page-title">{t('ruleProviders.title')}</h1>
                </div>
                <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            const s = await window.ipcRenderer.db.getAllSettings();
                            const raw = s['rule-provider-update-interval'];
                            const num = raw !== undefined && raw !== '' ? parseInt(raw, 10) : 86400;
                            setRuleProviderUpdateInterval(Number.isNaN(num) ? 86400 : num);
                            setShowSettingsModal(true);
                        }}
                    >
                        <Settings className="w-3.5 h-3.5 mr-1" />
                        {t('ruleProviders.settings')}
                    </Button>
                </div>
            </div>

            <div className="page-content flex flex-col !overflow-hidden">
                <PolicyListTable<RuleProvider>
                    items={providers}
                    columns={columns}
                    renderCell={renderCell}
                    searchFields={searchFields}
                    searchPlaceholder={t('ruleProviders.searchPlaceholder')}
                    statsLineKey="ruleProviders.statsLine"
                    addLabelKey="ruleProviders.add"
                    getEnabled={(p) => p.enabled !== false}
                    onAdd={handleAdd}
                    onToggleEnabled={handleToggleEnabled}
                    onBatchEnable={handleBatchEnable}
                    onBatchDisable={handleBatchDisable}
                    onBatchDelete={handleBatchDeleteForTable}
                    onEdit={handleEdit}
                    renderDropdown={renderDropdown}
                    renderActions={renderActions}
                    onReorder={handleReorder}
                    showIndexColumn
                    noMatchText={t('ruleProviders.noMatchRuleProviders')}
                    emptyState={
                        <div className="flex min-h-[180px] flex-col items-center justify-center py-8 text-center">
                            <Layers className="h-8 w-8 text-[var(--app-text-quaternary)] opacity-40" />
                            <p className="mt-3 text-[13px] text-[var(--app-text-tertiary)]">{t('ruleProviders.noRuleProviders')}</p>
                        </div>
                    }
                />
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog />

            {/* 规则集设置模态框 */}
            <Modal
                open={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                title={t('ruleProviders.settingsTitle')}
                maxWidth="max-w-md"
                contentClassName="p-6 space-y-4"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setShowSettingsModal(false)}>{t('common.cancel')}</Button>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await handleUpdateInterval(ruleProviderUpdateInterval);
                                setShowSettingsModal(false);
                            }}
                        >
                            {t('common.save')}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="text-[13px] font-medium text-[var(--app-text)]">{t('ruleProviders.updateIntervalLabel')}</div>
                    <p className="text-[11px] text-[var(--app-text-tertiary)]">{t('ruleProviders.updateIntervalDesc')}</p>
                    <Input
                        ref={settingsIntervalInputRef}
                        type="number"
                        value={ruleProviderUpdateInterval}
                        onChange={(e) => setRuleProviderUpdateInterval(Number(e.target.value) || 0)}
                        min={0}
                        placeholder="86400"
                        className="w-full"
                    />
                </div>
            </Modal>

            {/* 查看规则集内容模态框 */}
            {createPortal(
                <AnimatePresence>
                    {showViewModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowViewModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative z-10 my-4 w-full max-w-3xl max-h-[85vh] flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                    {viewProvider
                                        ? t('ruleProviders.viewRuleSetTitleWithName', { name: viewProvider.name })
                                        : t('ruleProviders.viewRuleSet')}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopyViewContent}
                                        disabled={viewLoading || !viewContent}
                                    >
                                        <Copy className="w-3.5 h-3.5 mr-1" />
                                        {t('common.copy')}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => setShowViewModal(false)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                        aria-label={t('common.close')}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 p-4 overflow-auto">
                                {viewLoading ? (
                                    <div className="flex items-center justify-center h-48 text-[var(--app-text-tertiary)]">
                                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                                        {t('ruleProviders.loadingView')}
                                    </div>
                                ) : viewError ? (
                                    <div className="p-4 bg-[var(--app-danger-soft)] border border-[var(--app-danger)]/30 rounded-lg text-[13px] text-[var(--app-danger)]">
                                        {viewError}
                                    </div>
                                ) : viewContent !== null ? (
                                    <pre className="min-h-full p-4 bg-[var(--app-bg)] rounded-lg text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap font-mono">
                                        {viewContent}
                                    </pre>
                                ) : null}
                            </div>
                        </motion.div>
                    </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {createPortal(
                <AnimatePresence>
                    {showModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                    {editingProvider ? t('ruleProviders.editRuleSet') : t('ruleProviders.addRuleSet')}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                    aria-label={t('common.close')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 p-6 space-y-4 overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('ruleProviders.ruleSetType')}</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setType('clash')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all cursor-pointer",
                                                type === 'clash'
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]"
                                                    : "border-[var(--app-stroke)] bg-[var(--app-panel)] hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <Cloud className={cn(
                                                "w-3.5 h-3.5",
                                                type === 'clash' ? "text-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-medium",
                                                type === 'clash' ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
                                            )}>
                                                Clash
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setType('singbox')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all cursor-pointer",
                                                type === 'singbox'
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]"
                                                    : "border-[var(--app-stroke)] bg-[var(--app-panel)] hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <Layers className={cn(
                                                "w-3.5 h-3.5",
                                                type === 'singbox' ? "text-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-medium",
                                                type === 'singbox' ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
                                            )}>
                                                Singbox
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setType('local')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all cursor-pointer",
                                                type === 'local'
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]"
                                                    : "border-[var(--app-stroke)] bg-[var(--app-panel)] hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <Box className={cn(
                                                "w-3.5 h-3.5",
                                                type === 'local' ? "text-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-medium",
                                                type === 'local' ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"
                                            )}>
                                                {t('ruleProviders.typeLocalButton')}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('ruleProviders.ruleSetName')}</label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={t('ruleProviders.namePlaceholder')}
                                    />
                                </div>

                                {type !== 'local' && (
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{t('ruleProviders.urlLabelOnlyHttp')}</label>
                                    <Input
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                        placeholder={t('ruleProviders.urlPlaceholderExample')}
                                    />
                                </div>
                                )}
                                {type === 'local' && (
                                <RuleEditorField
                                    value={logicRule}
                                    onChange={setLogicRule}
                                    label={t('ruleProviders.ruleContentLabel')}
                                    modalTitle={editingProvider ? t('ruleProviders.editLocalRuleSetModal', { name: editingProvider.name }) : t('ruleProviders.addLocalRuleSetModal')}
                                    showClearButton={false}
                                />
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                                <Button variant="ghost" onClick={() => setShowModal(false)} disabled={saving}>{t('common.cancel')}</Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSave}
                                    disabled={!name.trim() || (type !== 'local' && !url.trim()) || (type === 'local' && !editingProvider && !logicRule) || saving}
                                >
                                    {saving ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                                            {t('ruleProviders.saving')}
                                        </>
                                    ) : t('common.save')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

        </div>
    );
}
