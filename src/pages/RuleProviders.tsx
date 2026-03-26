import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropdownPosition } from '../hooks/useDropdownPosition';
import { Card, Badge } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Input, Select } from '../components/ui/Field';
import { cn } from '../components/Sidebar';
import { Plus, Trash2, Edit2, X, RefreshCw, Layers, MoreVertical, Eye, Copy, Search, Settings, Code2, Cloud, Box } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { RuleProvider, RuleProviderType } from '../types/rule-providers';
import type { RouteLogicRule } from '../types/singbox';
import { RuleEditorField } from '../components/AdvancedRuleEditor';
import { useNotificationState, NotificationList, useConfirm } from '../components/ui/Notification';
import { Modal } from '../components/ui/Modal';
import { formatRelativeTime } from '../shared/date-utils';
import { getDisplayErrorMessage } from '../shared/error-utils';

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
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [saving, setSaving] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const { position: dropdownPosition, calculatePosition } = useDropdownPosition({ menuWidth: 120, menuHeight: 130 });
    const dropdownButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewProvider, setViewProvider] = useState<RuleProvider | null>(null);
    const [viewContent, setViewContent] = useState<string | null>(null);
    const [viewError, setViewError] = useState<string | null>(null);
    const [viewLoading, setViewLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'selected'>('all');
    const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());
    const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
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

    useEffect(() => {
        // 点击外部关闭下拉菜单
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.dropdown-menu')) return;
            setOpenDropdownId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

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
        const newEnabledState = !provider.enabled;
        
        try {
            if (newEnabledState) {
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
        const targetIds = customSelectedIds || selectedProviderIds;
        if (targetIds.size === 0) return;
        try {
            if (!customSelectedIds) {
                setDownloadingAll(true);
            }
            const ids = Array.from(targetIds) as string[];
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
            if (!customSelectedIds) {
                setSelectedProviderIds(new Set());
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            console.error('Failed to refresh selected rule providers:', err);
            addNotification(t('ruleProviders.refreshFailed', { error: err.message }), 'error');
        } finally {
            if (!customSelectedIds) {
                setDownloadingAll(false);
            }
        }
    };

    const handleView = async (provider: RuleProvider) => {
        setOpenDropdownId(null);
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

    const handleOpenDropdown = (e: React.MouseEvent, providerId: string) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[providerId];
        if (button) {
            calculatePosition(button);
        }
        setOpenDropdownId(openDropdownId === providerId ? null : providerId);
    };

    const toggleProviderSelection = (id: string) => {
        setSelectedProviderIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBatchEnable = async (customSelectedIds?: Set<string>) => {
        const targetIds = customSelectedIds || selectedProviderIds;
        if (targetIds.size === 0) return;
        try {
            for (const id of targetIds) {
                await window.ipcRenderer.db.updateRuleProvider(id, { enabled: true });
            }
            addNotification(t('ruleProviders.enabledCount', { count: targetIds.size }));

            if (!customSelectedIds) {
                setSelectedProviderIds(new Set());
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.saveFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    const handleBatchDisable = async (customSelectedIds?: Set<string>) => {
        const targetIds = customSelectedIds || selectedProviderIds;
        if (targetIds.size === 0) return;
        try {
            for (const id of targetIds) {
                await window.ipcRenderer.db.updateRuleProvider(id, { enabled: false });
            }
            addNotification(t('ruleProviders.disabledCount', { count: targetIds.size }));

            if (!customSelectedIds) {
                setSelectedProviderIds(new Set());
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(t('ruleProviders.saveFailed', { error: err?.message || t('ruleProviders.unknownError') }), 'error');
        }
    };

    const handleBatchDelete = async () => {
        if (selectedProviderIds.size === 0) return;
        const confirmed = await confirm({
            title: t('ruleProviders.batchDeleteConfirm'),
            message: t('ruleProviders.batchDeleteConfirmMessage', { count: selectedProviderIds.size }),
            confirmText: t('common.delete'),
            cancelText: t('common.cancel'),
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            for (const id of selectedProviderIds) {
                await window.ipcRenderer.db.deleteRuleProvider(id);
            }
            addNotification(t('ruleProviders.deleted', { count: selectedProviderIds.size }));

            setSelectedProviderIds(new Set());
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

    const filteredProviders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return providers.filter((p) => {
            if (statusFilter === 'enabled' && p.enabled === false) return false;
            if (statusFilter === 'disabled' && p.enabled !== false) return false;
            if (statusFilter === 'selected' && !selectedProviderIds.has(p.id)) return false;
            if (!query) return true;
            return p.name.toLowerCase().includes(query) || p.url.toLowerCase().includes(query);
        });
        // 保持后端返回的顺序（后添加的在前）
    }, [providers, searchQuery, statusFilter, selectedProviderIds]);

    const providerStats = useMemo(() => ({
        total: providers.length,
        enabled: providers.filter(p => p.enabled !== false).length,
        disabled: providers.filter(p => p.enabled === false).length,
        selected: selectedProviderIds.size
    }), [providers, selectedProviderIds]);

    useEffect(() => {
        const el = selectAllCheckboxRef.current;
        if (!el || filteredProviders.length === 0) return;
        const selectedInFiltered = filteredProviders.filter(p => selectedProviderIds.has(p.id)).length;
        el.indeterminate = selectedInFiltered > 0 && selectedInFiltered < filteredProviders.length;
    }, [filteredProviders, selectedProviderIds]);

    return (
        <div className="page-shell text-[var(--app-text-secondary)] relative">
            {/* Notification - 使用 Portal 渲染到 body，避免被弹窗遮挡 */}
            <NotificationList notifications={notifications} onRemove={removeNotification} />

            <div className="page-header relative" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="min-w-0">
                    <h1 className="page-title">{t('ruleProviders.title')}</h1>
                    <p className="page-subtitle">{t('ruleProviders.subtitle')}</p>
                </div>
                <div className="toolbar relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

            <div className="page-content space-y-3">
                {/* 搜索、筛选、操作栏 */}
                <Card className="overflow-hidden p-0">
                    <div className="flex flex-col gap-2 border-b border-[var(--app-divider)] bg-[rgba(255,255,255,0.6)] px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative min-w-[180px]">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('ruleProviders.searchPlaceholder')}
                                    className="input-field h-8 pl-8 pr-2.5 text-[12px]"
                                />
                            </div>
                            {([
                                { key: 'all' as const, labelKey: 'ruleProviders.filterAll' },
                                { key: 'enabled' as const, labelKey: 'ruleProviders.filterEnabled' },
                                { key: 'disabled' as const, labelKey: 'ruleProviders.filterDisabled' },
                                { key: 'selected' as const, labelKey: 'ruleProviders.filterSelected' }
                            ]).map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setStatusFilter(option.key as typeof statusFilter)}
                                    className={cn(
                                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                                        statusFilter === option.key
                                            ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                            : "border-[var(--app-stroke)] bg-white/75 text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                                    )}
                                >
                                    {t(option.labelKey)}
                                </button>
                            ))}
                            <span className="text-[11px] text-[var(--app-text-quaternary)]">
                                {t('ruleProviders.statsLine', { total: providerStats.total, filtered: filteredProviders.length })}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => !downloadingAll && selectedProviderIds.size > 0 && handleRefreshSelected()}
                                disabled={downloadingAll || selectedProviderIds.size === 0}
                                className={cn(
                                    "text-[11px] transition-colors",
                                    downloadingAll || selectedProviderIds.size === 0
                                        ? "text-[var(--app-text-quaternary)] cursor-not-allowed"
                                        : "text-[var(--app-accent-strong)] hover:text-[var(--app-accent)] cursor-pointer"
                                )}
                            >
                                {downloadingAll ? <><RefreshCw className="w-3 h-3 mr-0.5 inline align-middle animate-spin" />{t('ruleProviders.updating')}</> : t('ruleProviders.update')}
                            </button>
                            <div className="mx-1 w-px h-5 bg-[var(--app-divider)]" />
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700" onClick={() => handleBatchEnable()} disabled={selectedProviderIds.size === 0}>{t('ruleProviders.enable')}</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700" onClick={() => handleBatchDisable()} disabled={selectedProviderIds.size === 0}>{t('ruleProviders.disable')}</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-500 hover:text-red-600" onClick={handleBatchDelete} disabled={selectedProviderIds.size === 0}>{t('ruleProviders.delete')}</Button>
                            <Button variant="primary" size="sm" className="h-7 px-2 text-[11px]" onClick={handleAdd}>
                                <Plus className="w-3 h-3 mr-1" />
                                {t('ruleProviders.add')}
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="sticky top-0 z-10 border-b border-[var(--app-divider)] bg-[rgba(248,249,251,0.95)]">
                                            <th className="w-8 shrink-0 pl-4 pr-2 py-1.5 text-left">
                                                {filteredProviders.length > 0 && (
                                                    <input
                                                        type="checkbox"
                                                        checked={filteredProviders.every(p => selectedProviderIds.has(p.id))}
                                                        ref={selectAllCheckboxRef}
                                                        onChange={() => {
                                                            const allSelected = filteredProviders.every(p => selectedProviderIds.has(p.id));
                                                            if (allSelected) {
                                                                setSelectedProviderIds(prev => {
                                                                    const next = new Set(prev);
                                                                    filteredProviders.forEach(p => next.delete(p.id));
                                                                    return next;
                                                                });
                                                            } else {
                                                                setSelectedProviderIds(prev => {
                                                                    const next = new Set(prev);
                                                                    filteredProviders.forEach(p => next.add(p.id));
                                                                    return next;
                                                                });
                                                            }
                                                        }}
                                                        className="h-3.5 w-3.5 rounded border-[rgba(39,44,54,0.2)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                                        aria-label={t('ruleProviders.selectAll')}
                                                    />
                                                )}
                                            </th>
                                            <th className="text-left py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] w-[44px]">#</th>
                                            <th className="text-left py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] w-[1%]">{t('ruleProviders.columnEnabled')}</th>
                                            <th className="text-left py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] min-w-[140px]">{t('ruleProviders.ruleSetName')}</th>
                                            <th className="text-left py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] w-[70px]">{t('ruleProviders.type')}</th>
                                            <th className="text-left py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] w-[110px]">{t('ruleProviders.lastUpdate')}</th>
                                            <th className="text-right py-1.5 px-3 text-[11px] font-medium text-[var(--app-text-quaternary)] w-[90px]">{t('ruleProviders.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProviders.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-[var(--app-text-tertiary)] text-[13px]">
                                                    {providers.length === 0 ? (
                                                        <>
                                                            <Layers className="mx-auto h-8 w-8 opacity-40" />
                                                            <p className="mt-2">{t('ruleProviders.noRuleProviders')}</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Search className="mx-auto h-6 w-6 opacity-50" />
                                                            <p className="mt-2">{t('ruleProviders.noMatchRuleProviders')}</p>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ) : filteredProviders.map((provider, index) => (
                                            <tr
                                                key={provider.id}
                                                className={cn(
                                                    "border-b border-[var(--app-divider)] last:border-b-0 transition-colors hover:bg-[var(--app-hover)]/50 cursor-pointer",
                                                    selectedProviderIds.has(provider.id) && "bg-[var(--app-accent-soft-card)]"
                                                )}
                                                onDoubleClick={(e) => {
                                                    if (!(e.target as HTMLElement).closest('button, input')) {
                                                        handleEdit(provider);
                                                    }
                                                }}
                                            >
                                                <td className="w-8 shrink-0 pl-4 pr-2 py-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProviderIds.has(provider.id)}
                                                        onChange={() => toggleProviderSelection(provider.id)}
                                                        className="h-3.5 w-3.5 rounded border-[rgba(39,44,54,0.2)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                                        aria-label={t('ruleProviders.selectRowAria', { name: provider.name })}
                                                    />
                                                </td>
                                                <td className="py-1.5 px-3 text-[var(--app-text-quaternary)] text-[11px] tabular-nums">
                                                    {index + 1}
                                                </td>
                                                <td className="py-1.5 px-3 align-middle">
                                                    <Switch
                                                        checked={provider.enabled !== false}
                                                        onCheckedChange={() => handleToggleEnabled(provider)}
                                                        className="scale-90"
                                                    />
                                                </td>
                                                <td className={cn("py-1.5 px-3", provider.enabled === false && "opacity-60")}>
                                                    <span className="text-[13px] font-medium text-[var(--app-text)] truncate block max-w-[160px]" title={provider.name}>
                                                        {provider.name}
                                                    </span>
                                                </td>
                                                <td className={cn("py-1.5 px-3", provider.enabled === false && "opacity-60")}>
                                                    <Badge tone="accent" className="text-[10px] px-1.5 py-0 !bg-[rgba(85,96,111,0.2)]">
                                                        {provider.type || 'clash'}
                                                    </Badge>
                                                </td>
                                                <td className={cn("py-1.5 px-3 text-[var(--app-text-quaternary)] text-[11px]", provider.enabled === false && "opacity-60")}>
                                                    {provider.last_update ? 
                                                        formatRelativeTime(provider.last_update) : 
                                                        '—'
                                                    }
                                                </td>
                                                <td className="py-1.5 px-3 text-right">
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
                                                            ref={(el) => { dropdownButtonRefs.current[provider.id] = el; }}
                                                            onClick={(e) => handleOpenDropdown(e, provider.id)}
                                                        >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        {/* 下拉菜单 */}
                        {openDropdownId && (() => {
                            const provider = providers.find(p => p.id === openDropdownId);
                            if (!provider) return null;
                            return createPortal(
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                    transition={{ duration: 0.15 }}
                                    className="dropdown-menu fixed bg-white border border-[rgba(39,44,54,0.08)] rounded-[12px] shadow-[var(--shadow-elevated)] overflow-hidden z-[200] flex flex-col py-1.5 w-30"
                                    style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                                        onClick={() => handleView(provider)}
                                    >
                                        <Eye className="w-3.5 h-3.5 mr-2" />
                                        {t('ruleProviders.view')}
                                    </button>
                                    <button
                                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                                        onClick={() => {
                                            setOpenDropdownId(null);
                                            handleEdit(provider);
                                        }}
                                    >
                                        <Edit2 className="w-3.5 h-3.5 mr-2" />
                                        {t('ruleProviders.edit')}
                                    </button>
                                    <div className="mx-2 my-1 border-t border-[rgba(39,44,54,0.06)]" />
                                    <button
                                        className="flex items-center px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 transition-colors text-left"
                                        onClick={() => {
                                            setOpenDropdownId(null);
                                            handleDelete(provider.id);
                                        }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                                        {t('ruleProviders.delete')}
                                    </button>
                                </motion.div>,
                                document.body
                            );
                        })()}
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
                            className="relative z-10 my-4 w-full max-w-3xl max-h-[85vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
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
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-700">
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
                            className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
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
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
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
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
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
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
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

                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
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
