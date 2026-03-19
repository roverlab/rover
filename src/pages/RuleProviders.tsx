import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Badge } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Input, Select } from '../components/ui/Field';
import { cn } from '../components/Sidebar';
import { Plus, Trash2, Edit2, X, RefreshCw, Layers, MoreVertical, Eye, Copy, Search, Settings, Code2, Cloud, Box } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { RuleProvider, RuleProviderType, LocalRuleSetData } from '../types/rule-providers';
import type { HeadlessRule } from '../types/singbox';
import { RuleFieldsEditorModal } from './Policies/components/RuleFieldsEditorModal';
import { RuleTreeView } from './Policies/components/RuleTreeView';
import { RULE_FIELD_CONFIG } from './Policies/utils/ruleFieldConfig';
import type { RuleTreeNode, LogicGroup } from './Policies/types/ruleFields';
import { getDefaultRuleTreeNode } from './Policies/utils/ruleFieldsUtils';
import { singboxLogicalToRuleTreeNodeRoot, ruleTreeNodeToSingboxLogical } from './Policies/utils/ruleTreeNodeConversion';
import type { HeadlessPlainRule, RouteLogicRule } from '../types/singbox';
import { useNotificationState, NotificationList, useConfirm } from '../components/ui/Notification';
import { Modal } from '../components/ui/Modal';
import { formatRelativeTime } from '../shared/date-utils';
import { getDisplayErrorMessage } from '../shared/error-utils';

/** 将 HeadlessRule[] 转换为 RuleTreeNode */
function localRulesToRuleTreeNode(rules: HeadlessRule[]): RuleTreeNode {
    if (!rules || rules.length === 0) {
        return getDefaultRuleTreeNode();
    }
    // HeadlessRule 结构和 HeadlessPlainRule 兼容
    const logicalRule: RouteLogicRule = {
        type: 'logical',
        mode: 'or', // 多条规则之间是 OR 关系
        rules: rules as unknown as HeadlessPlainRule[],
    };
    return singboxLogicalToRuleTreeNodeRoot(logicalRule) ?? getDefaultRuleTreeNode();
}

/** 将 RuleTreeNode 转换为 HeadlessRule[] */
function ruleTreeNodeToLocalRules(node: RuleTreeNode): HeadlessRule[] {
    const result = ruleTreeNodeToSingboxLogical(node);
    if (!result || !result.rules || result.rules.length === 0) {
        return [];
    }
    const localRules: HeadlessRule[] = [];
    function extractRules(lr: RouteLogicRule) {
        for (const rule of lr.rules) {
            if ('type' in rule && rule.type === 'logical') {
                localRules.push(rule as unknown as HeadlessRule);
            } else {
                localRules.push(rule as unknown as HeadlessRule);
            }
        }
    }
    if (result.mode === 'or') {
        extractRules(result);
    } else {
        localRules.push(result as unknown as HeadlessRule);
    }
    return localRules;
}

interface RuleProvidersProps {
    /** 页面是否处于激活状态，用于进入时重新加载 */
    isActive?: boolean;
}

export function RuleProviders({ isActive = true }: RuleProvidersProps) {
    const [providers, setProviders] = useState<RuleProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProvider, setEditingProvider] = useState<RuleProvider | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
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
    const [showRuleEditor, setShowRuleEditor] = useState(false);
    const [ruleEditorForm, setRuleEditorForm] = useState<{ ruleGroupsTree: RuleTreeNode | null }>({ ruleGroupsTree: null });
    const [editingLocalProviderId, setEditingLocalProviderId] = useState<string | null>(null);

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
        addNotification('更新间隔已保存');
    };

    // 设置弹窗打开时自动聚焦输入框
    useEffect(() => {
        if (showSettingsModal) {
            const t = setTimeout(() => settingsIntervalInputRef.current?.focus(), 50);
            return () => clearTimeout(t);
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
        setRuleEditorForm({ ruleGroupsTree: null });
        setShowModal(true);
    };

    const handleEdit = (provider: RuleProvider) => {
        setEditingProvider(provider);
        setName(provider.name);
        setUrl(provider.url);
        setType(provider.type || 'clash');
        // 本地类型：从 raw_data 初始化规则树，以便 RuleTreeView 首次打开时可见
        if (provider.type === 'local') {
            const rules = provider.raw_data?.rules || [];
            const treeNode = localRulesToRuleTreeNode(rules);
            setRuleEditorForm({ ruleGroupsTree: treeNode });
        } else {
            setRuleEditorForm({ ruleGroupsTree: null });
        }
        setShowModal(true);
    };

    // 打开本地规则集编辑器（编辑已有规则集）
    const handleOpenRuleEditor = (provider: RuleProvider) => {
        const rules = provider.raw_data?.rules || [];
        const treeNode = localRulesToRuleTreeNode(rules);
        setRuleEditorForm({ ruleGroupsTree: treeNode });
        setEditingLocalProviderId(provider.id);
        setShowRuleEditor(true);
    };

    // 打开高级规则编辑器（新建时使用草稿）
    const handleOpenRuleEditorForNew = () => {
        const draft = ruleEditorForm.ruleGroupsTree ?? getDefaultRuleTreeNode();
        setRuleEditorForm({ ruleGroupsTree: draft });
        setEditingLocalProviderId(null); // null 表示草稿模式
        setShowRuleEditor(true);
    };

    // 保存本地规则集（编辑已有）或关闭弹窗（新建草稿）
    const handleSaveRuleEditor = async () => {
        if (editingLocalProviderId && ruleEditorForm.ruleGroupsTree) {
            const localRules = ruleTreeNodeToLocalRules(ruleEditorForm.ruleGroupsTree);
            const data: LocalRuleSetData = {
                version: 3,
                rules: localRules,
            };
            try {
                await window.ipcRenderer.core.saveLocalRuleProvider(editingLocalProviderId, data);
                setShowRuleEditor(false);
                setEditingLocalProviderId(null);
                loadProviders();
                addNotification('规则集已保存');
            } catch (err: any) {
                addNotification(`保存失败: ${err?.message || '未知错误'}`, 'error');
            }
        } else {
            // 草稿模式：仅关闭弹窗，规则已通过 onFormChange 更新到 ruleEditorForm
            setShowRuleEditor(false);
            setEditingLocalProviderId(null);
        }
    };

    const handleSave = async () => {
        // 本地类型：只需要名称，但必须有规则内容
        if (type === 'local') {
            if (!name.trim()) return;

            // 检查是否有规则内容
            const localRules = ruleEditorForm.ruleGroupsTree
                ? ruleTreeNodeToLocalRules(ruleEditorForm.ruleGroupsTree)
                : [];

            // 对于新建的本地规则集，必须有规则内容
            if (!editingProvider && localRules.length === 0) {
                addNotification('本地规则集必须包含至少一条规则', 'error');
                return;
            }

            // 对于编辑已有的本地规则集，检查现有规则是否为空
            if (editingProvider) {
                const existingRules = editingProvider.raw_data?.rules || [];
                const hasRules = localRules.length > 0 || existingRules.length > 0;
                if (!hasRules) {
                    addNotification('本地规则集必须包含至少一条规则', 'error');
                    return;
                }
            }

            try {
                if (editingProvider) {
                    await window.ipcRenderer.db.updateRuleProvider(editingProvider.id, {
                        name: name.trim(),
                    });
                    // 如果有新规则，保存规则数据
                    if (localRules.length > 0) {
                        const data: LocalRuleSetData = {
                            version: 3,
                            rules: localRules,
                        };
                        await window.ipcRenderer.core.saveLocalRuleProvider(editingProvider.id, data);
                    }
                } else {
                    const providerId = await window.ipcRenderer.core.addLocalRuleProvider({
                        name: name.trim(),
                        enabled: true
                    });
                    // 新建时保存规则数据
                    if (localRules.length > 0) {
                        const data: LocalRuleSetData = {
                            version: 3,
                            rules: localRules,
                        };
                        await window.ipcRenderer.core.saveLocalRuleProvider(providerId, data);
                    }
                }
                setShowModal(false);
                loadProviders();
                addNotification('规则集已保存');
            } catch (err: any) {
                addNotification(`操作失败: ${err?.message || '未知错误'}`, 'error');
            }
            return;
        }

        if (!name.trim() || !url.trim()) return;

        try {
            if (editingProvider) {
                await window.ipcRenderer.db.updateRuleProvider(editingProvider.id, {
                    name: name.trim(),
                    url: url.trim(),
                    type
                });
                setShowModal(false);
                loadProviders();
            } else {
                try {
                    await window.ipcRenderer.core.addRuleProviderWithDownload({
                        name: name.trim(),
                        url: url.trim(),
                        type,
                        enabled: true
                    });
                    setShowModal(false);
                    loadProviders();
                    addNotification('规则集已添加');
                } catch (dlErr: any) {
                    addNotification(`添加失败: ${dlErr?.message || '未知错误'}`, 'error');
                } finally {
                    loadProviders();
                }
            }
        } catch (err: any) {
            console.error('Failed to save rule provider:', err);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: '删除规则集',
            message: '确定要删除这个规则集吗？',
            confirmText: '删除',
            cancelText: '取消',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            // 转换为批量操作：创建一个包含当前规则集的临时选中集
            const tempSelectedIds = new Set([id]);
            await handleBatchDeleteForSingle(tempSelectedIds);
        } catch (err: any) {
            console.error('Failed to delete rule provider:', err);
            addNotification('删除失败: ' + getDisplayErrorMessage(err), 'error');
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
            addNotification('操作失败: ' + (err?.message || '未知错误'), 'error');
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
            addNotification(`刷新失败: ${err.message}`, 'error');
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
                addNotification(`更新完成: 成功 ${successCount} 条，失败 ${failCount} 条`, failCount === ids.length ? 'error' : undefined);
            } else {
                const notificationMessage = ids.length === 1 
                    ? `${providers.find(p => p.id === ids[0])?.name || '规则集'} 刷新成功` 
                    : `已更新 ${successCount} 条规则集`;
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
            addNotification(`更新失败: ${err.message}`, 'error');
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
            setViewError(err.message || '加载失败');
            setViewContent(null);
        } finally {
            setViewLoading(false);
        }
    };

    const handleCopyViewContent = async () => {
        if (!viewContent) return;
        try {
            await navigator.clipboard.writeText(viewContent);
            addNotification('内容已复制到剪贴板');
        } catch (err: any) {
            addNotification(`复制失败: ${err?.message || '未知错误'}`, 'error');
        }
    };

    const handleOpenDropdown = (e: React.MouseEvent, providerId: string) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[providerId];
        if (button) {
            const rect = button.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + 4,
                left: rect.right - 120
            });
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
            addNotification(`已启用 ${targetIds.size} 条`);

            if (!customSelectedIds) {
                setSelectedProviderIds(new Set());
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(`操作失败: ${err?.message || '未知错误'}`, 'error');
        }
    };

    const handleBatchDisable = async (customSelectedIds?: Set<string>) => {
        const targetIds = customSelectedIds || selectedProviderIds;
        if (targetIds.size === 0) return;
        try {
            for (const id of targetIds) {
                await window.ipcRenderer.db.updateRuleProvider(id, { enabled: false });
            }
            addNotification(`已禁用 ${targetIds.size} 条`);

            if (!customSelectedIds) {
                setSelectedProviderIds(new Set());
            }
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(`操作失败: ${err?.message || '未知错误'}`, 'error');
        }
    };

    const handleBatchDelete = async () => {
        if (selectedProviderIds.size === 0) return;
        const confirmed = await confirm({
            title: '批量删除',
            message: `确定要删除选中的 ${selectedProviderIds.size} 条规则集吗？`,
            confirmText: '删除',
            cancelText: '取消',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            for (const id of selectedProviderIds) {
                await window.ipcRenderer.db.deleteRuleProvider(id);
            }
            addNotification(`已删除 ${selectedProviderIds.size} 条`);

            setSelectedProviderIds(new Set());
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(`删除失败: ${getDisplayErrorMessage(err)}`, 'error');
        }
    };

    // 为单个删除操作创建的批量删除函数
    const handleBatchDeleteForSingle = async (customSelectedIds: Set<string>) => {
        if (customSelectedIds.size === 0) return;
        try {
            for (const id of customSelectedIds) {
                await window.ipcRenderer.db.deleteRuleProvider(id);
            }
            addNotification('规则集已删除');
            loadProviders();
            // 触发配置生成
            window.ipcRenderer.core.generateConfig();
        } catch (err: any) {
            addNotification(`删除失败: ${getDisplayErrorMessage(err)}`, 'error');
            console.error('Failed to delete rule provider:', err);
        }
    };

    const filteredProviders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const list = providers.filter((p) => {
            if (statusFilter === 'enabled' && p.enabled === false) return false;
            if (statusFilter === 'disabled' && p.enabled !== false) return false;
            if (statusFilter === 'selected' && !selectedProviderIds.has(p.id)) return false;
            if (!query) return true;
            return p.name.toLowerCase().includes(query) || p.url.toLowerCase().includes(query);
        });
        return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
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
                    <h1 className="page-title">规则集</h1>
                    <p className="page-subtitle">管理外部规则集订阅，支持批量更新、启用与禁用。</p>
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
                        设置
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
                                    placeholder="搜索名称、URL..."
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
                                    onClick={() => setStatusFilter(option.key as typeof statusFilter)}
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
                                {providerStats.total} 条 · 展示 {filteredProviders.length}
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
                                {downloadingAll ? <><RefreshCw className="w-3 h-3 mr-0.5 inline align-middle animate-spin" />更新中...</> : '更新'}
                            </button>
                            <div className="mx-1 w-px h-5 bg-[var(--app-divider)]" />
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700" onClick={() => handleBatchEnable()} disabled={selectedProviderIds.size === 0}>启用</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700" onClick={() => handleBatchDisable()} disabled={selectedProviderIds.size === 0}>禁用</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-500 hover:text-red-600" onClick={handleBatchDelete} disabled={selectedProviderIds.size === 0}>删除</Button>
                            <Button variant="primary" size="sm" className="h-7 px-2 text-[11px]" onClick={handleAdd}>
                                <Plus className="w-3 h-3 mr-1" />
                                添加
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                                            <th className="w-8 shrink-0 pl-4 pr-2 py-2.5 text-left">
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
                                                        aria-label="全选"
                                                    />
                                                )}
                                            </th>
                                            <th className="text-left py-2.5 px-3 font-medium text-[var(--app-text-secondary)] w-[44px]">#</th>
                                            <th className="text-left py-2.5 px-3 font-medium text-[var(--app-text-secondary)] w-[1%]">启用</th>
                                            <th className="text-left py-2.5 px-3 font-medium text-[var(--app-text-secondary)] min-w-[140px]">名称</th>
                                            <th className="text-left py-2.5 px-3 font-medium text-[var(--app-text-secondary)] w-[70px]">类型</th>
                                            <th className="text-left py-2.5 px-3 font-medium text-[var(--app-text-secondary)] w-[110px]">最后更新</th>
                                            <th className="text-right py-2.5 px-3 font-medium text-[var(--app-text-secondary)] w-[90px]">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProviders.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-[var(--app-text-tertiary)] text-[13px]">
                                                    {providers.length === 0 ? (
                                                        <>
                                                            <Layers className="mx-auto h-8 w-8 opacity-40" />
                                                            <p className="mt-2">暂无规则集，请添加或导入</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Search className="mx-auto h-6 w-6 opacity-50" />
                                                            <p className="mt-2">没有匹配的规则集</p>
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
                                                <td className="w-8 shrink-0 pl-4 pr-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProviderIds.has(provider.id)}
                                                        onChange={() => toggleProviderSelection(provider.id)}
                                                        className="h-3.5 w-3.5 rounded border-[rgba(39,44,54,0.2)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                                        aria-label={`选择 ${provider.name}`}
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-[var(--app-text-quaternary)] text-[12px] tabular-nums">
                                                    {index + 1}
                                                </td>
                                                <td className="py-2 px-3 align-middle">
                                                    <Switch
                                                        checked={provider.enabled !== false}
                                                        onCheckedChange={() => handleToggleEnabled(provider)}
                                                        className="scale-90"
                                                    />
                                                </td>
                                                <td className={cn("py-2 px-3", provider.enabled === false && "opacity-60")}>
                                                    <span className="font-medium text-[var(--app-text)] truncate block max-w-[160px]" title={provider.name}>
                                                        {provider.name}
                                                    </span>
                                                </td>
                                                <td className={cn("py-2 px-3", provider.enabled === false && "opacity-60")}>
                                                    <Badge tone="accent" className="text-[10px] px-1.5 py-0 !bg-[rgba(85,96,111,0.2)]">
                                                        {provider.type || 'clash'}
                                                    </Badge>
                                                </td>
                                                <td className={cn("py-2 px-3 text-[var(--app-text-quaternary)] text-[11px]", provider.enabled === false && "opacity-60")}>
                                                    {provider.last_update ? 
                                                        formatRelativeTime(provider.last_update) : 
                                                        '—'
                                                    }
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-0.5">
                                                        {provider.type !== 'local' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => handleRefresh(provider)}
                                                            disabled={downloadingId === provider.id}
                                                            title="刷新"
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
                                        查看
                                    </button>
                                    <button
                                        className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                                        onClick={() => {
                                            setOpenDropdownId(null);
                                            handleEdit(provider);
                                        }}
                                    >
                                        <Edit2 className="w-3.5 h-3.5 mr-2" />
                                        编辑
                                    </button>
                                    {provider.type === 'local' && (
                                        <button
                                            className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-secondary)] hover:text-[var(--app-text)] transition-colors text-left w-full"
                                            onClick={() => {
                                                setOpenDropdownId(null);
                                                handleOpenRuleEditor(provider);
                                            }}
                                        >
                                            <Code2 className="w-3.5 h-3.5 mr-2" />
                                            高级规则编辑
                                        </button>
                                    )}
                                    <div className="mx-2 my-1 border-t border-[rgba(39,44,54,0.06)]" />
                                    <button
                                        className="flex items-center px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 transition-colors text-left"
                                        onClick={() => {
                                            setOpenDropdownId(null);
                                            handleDelete(provider.id);
                                        }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                                        删除
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
                title="规则集设置"
                maxWidth="max-w-md"
                contentClassName="p-6 space-y-4"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setShowSettingsModal(false)}>取消</Button>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await handleUpdateInterval(ruleProviderUpdateInterval);
                                setShowSettingsModal(false);
                            }}
                        >
                            保存
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="text-[13px] font-medium text-[var(--app-text)]">更新间隔</div>
                    <p className="text-[11px] text-[var(--app-text-tertiary)]">所有规则集的自动更新间隔（秒），0 表示不自动更新</p>
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
                                    查看规则集 {viewProvider ? `· ${viewProvider.name}` : ''}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopyViewContent}
                                        disabled={viewLoading || !viewContent}
                                    >
                                        <Copy className="w-3.5 h-3.5 mr-1" />
                                        复制
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => setShowViewModal(false)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                        aria-label="关闭"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 p-4 overflow-auto">
                                {viewLoading ? (
                                    <div className="flex items-center justify-center h-48 text-[var(--app-text-tertiary)]">
                                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                                        加载中...
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
                                    {editingProvider ? '编辑规则集' : '添加规则集'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                    aria-label="关闭"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 p-6 space-y-4 overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">类型</label>
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
                                                本地
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">名称</label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="例如：BilibiliHMT"
                                    />
                                </div>

                                {type !== 'local' && (
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">URL (仅支持 HTTP(S))</label>
                                    <Input
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                        placeholder="https://raw.githubusercontent.com/.../BilibiliHMT.list"
                                    />
                                </div>
                                )}
                                {type === 'local' && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 pl-1">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">规则内容</label>
                                        <button
                                            type="button"
                                            onClick={() => editingProvider ? handleOpenRuleEditor(editingProvider) : handleOpenRuleEditorForNew()}
                                            className="px-3 py-1.5 rounded-[8px] border border-[rgba(39,44,54,0.12)] bg-white hover:bg-[var(--app-hover)] transition-colors text-[12px] text-[var(--app-text)]"
                                        >
                                            打开规则编辑器
                                        </button>
                                    </div>
                                    <RuleTreeView
                                        node={ruleEditorForm.ruleGroupsTree ?? null}
                                        formConfig={RULE_FIELD_CONFIG}
                                    />
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">点击打开规则编辑器，支持域名、IP、端口等多种匹配规则</p>
                                </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                                <Button variant="ghost" onClick={() => setShowModal(false)}>取消</Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSave}
                                    disabled={!name.trim() || (type !== 'local' && !url.trim()) || (type === 'local' && !editingProvider && !ruleEditorForm.ruleGroupsTree)}
                                >
                                    保存
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 规则编辑器（用于本地类型规则集） */}
            <RuleFieldsEditorModal
                open={showRuleEditor}
                onClose={() => {
                    setShowRuleEditor(false);
                    setEditingLocalProviderId(null);
                }}
                onConfirm={handleSaveRuleEditor}
                form={ruleEditorForm}
                onFormChange={(changes) => {
                    setRuleEditorForm(prev => ({ ...prev, ...changes }));
                }}
                formConfig={RULE_FIELD_CONFIG}
                title="编辑本地规则集"
            />
        </div>
    );
}
