import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Sortable from 'sortablejs';
import { useTranslation } from 'react-i18next';
import './PolicyListTable.css';
import { useDropdownPosition } from '../hooks/useDropdownPosition';
import { Card } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Select } from '../components/ui/Field';
import { CheckCircle2, GripVertical, Layers3, MoreVertical, Plus, Search, ShieldCheck, Slash, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDebounce } from '../hooks/useDebounce';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ColumnDef<T> {
    /** 唯一标识，用作 key */
    id: string;
    /** 列头显示文字，传 null 则无表头文字 */
    header: React.ReactNode;
    /** 列宽 className，如 "min-w-[140px]" */
    width?: string;
    /** 列对齐 className，默认 "text-left" */
    align?: string;
    /** 额外 className 追加到 <th> */
    thClassName?: string;
    /** 是否该列不换行 */
    nowrap?: boolean;
}

export interface PolicyListTableProps<T extends { id: string; name: string }> {
    /** 数据源 */
    items: T[];
    /** 搜索 + 筛选后的数据（如果外部管理筛选）；不传则组件内部管理 */
    filteredItems?: T[];
    /** 筛选字段提取器（用于搜索） */
    searchFields?: (item: T) => string[];
    /** 表格列定义（中间自定义列，不含拖拽/复选/开关/操作列） */
    columns: ColumnDef<T>[];
    /** 渲染某一行的某一自定义列单元格 */
    renderCell: (item: T, columnId: string, index: number) => React.ReactNode;

    /* ---- 工具栏 ---- */
    /** 搜索框占位文本 */
    searchPlaceholder?: string;
    /** 统计行 i18n key，接收 { total, filtered } */
    statsLineKey?: string;
    /** 左侧额外工具栏内容（如导入按钮） */
    toolbarLeftExtra?: React.ReactNode;
    /** 右侧额外工具栏内容（放在批量操作和添加按钮之间） */
    toolbarRightExtra?: React.ReactNode;
    /** 自定义添加按钮文本 key，默认 'common.add' */
    addLabelKey?: string;

    /* ---- 操作回调 ---- */
    onAdd: () => void;
    /** 获取启用状态，默认 (item) => item.enabled */
    getEnabled?: (item: T) => boolean;
    onToggleEnabled: (item: T) => void;
    onBatchEnable: (selectedIds: Set<string>) => void;
    onBatchDisable: (selectedIds: Set<string>) => void;
    onBatchDelete: (selectedIds: Set<string>) => void;
    onEdit: (item: T) => void;
    /** 行操作下拉菜单渲染（与 renderActions 二选一） */
    renderDropdown?: (item: T, position: { top: number; left: number }, close: () => void) => React.ReactNode;
    /** 自定义操作列渲染（替代默认下拉菜单按钮，如需刷新按钮等） */
    renderActions?: (item: T, index: number, dropdownButtonRef: (el: HTMLButtonElement | null) => void, onOpenDropdown: (e: React.MouseEvent, itemId: string) => void) => React.ReactNode;

    /* ---- Sortable ---- */
    tbodyRef?: ((node: HTMLTableSectionElement | null) => void) | null;
    /** 拖拽排序回调，返回移动项的 id、旧索引和新索引（基于 filteredItems） */
    onReorder?: (itemId: string, oldIndex: number, newIndex: number) => void;

    /* ---- 空状态 ---- */
    emptyState?: React.ReactNode;
    /** 搜索无结果时显示的文本 */
    noMatchText?: string;

    /* ---- 列显隐 ---- */
    /** 是否显示序号列，默认 false */
    showIndexColumn?: boolean;
    /** 是否显示启用开关列，默认 true */
    showEnabledColumn?: boolean;

    /* ---- 样式变体 ---- */
    /** 表格 className，默认 "data-table policy-table w-full" */
    tableClassName?: string;
    /** 选中行 className，默认 "policy-row-selected" */
    selectedRowClassName?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PolicyListTable<T extends { id: string; name: string }>({
    items,
    filteredItems: externalFilteredItems,
    searchFields,
    columns,
    renderCell,
    searchPlaceholder,
    statsLineKey = 'policies.statsLine',
    toolbarLeftExtra,
    toolbarRightExtra,
    addLabelKey = 'common.add',
    getEnabled = (item: T) => (item as any).enabled === true || (item as any).enabled !== false,
    onAdd,
    onToggleEnabled,
    onBatchEnable,
    onBatchDisable,
    onBatchDelete,
    onEdit,
    renderDropdown,
    renderActions,
    tbodyRef,
    onReorder,
    emptyState,
    noMatchText,
    showIndexColumn = false,
    showEnabledColumn = true,
    tableClassName = 'data-table policy-table w-full',
    selectedRowClassName = 'policy-row-selected',
}: PolicyListTableProps<T>) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'selected'>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const { position: dropdownPosition, calculatePosition } = useDropdownPosition({ menuWidth: 120, menuHeight: 130 });
    const dropdownButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
    const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
    const sortableRef = useRef<Sortable | null>(null);

    // 清理已不存在的选中项
    useEffect(() => {
        setSelectedIds(prev => {
            if (prev.size === 0) return prev;
            const validIds = new Set(items.map(p => p.id));
            const next = new Set(Array.from(prev).filter((id: string) => validIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [items]);

    // 点击外部关闭下拉菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.dropdown-menu')) return;
            setOpenDropdownId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // 过滤逻辑
    const filteredItems = useMemo(() => {
        if (externalFilteredItems !== undefined) return externalFilteredItems;
        const query = debouncedSearchQuery.trim().toLowerCase();
        return items.filter((item) => {
            const enabled = getEnabled(item);
            if (statusFilter === 'enabled' && !enabled) return false;
            if (statusFilter === 'disabled' && enabled) return false;
            if (statusFilter === 'selected' && !selectedIds.has(item.id)) return false;
            if (!query) return true;
            const fields = searchFields ? searchFields(item) : [item.name];
            return fields.some((value) => value?.toLowerCase().includes(query));
        });
    }, [externalFilteredItems, items, debouncedSearchQuery, statusFilter, selectedIds, searchFields, getEnabled]);

    const stats = useMemo(() => {
        const enabledCount = items.filter((p) => getEnabled(p)).length;
        return {
            total: items.length,
            filtered: filteredItems.length,
            enabled: enabledCount,
            disabled: items.length - enabledCount,
            selected: selectedIds.size,
        };
    }, [items, filteredItems.length, selectedIds, getEnabled]);

    const selectedInFiltered = useMemo(
        () => filteredItems.filter(p => selectedIds.has(p.id)).length,
        [filteredItems, selectedIds],
    );

    const allFilteredSelected = filteredItems.length > 0 && selectedInFiltered === filteredItems.length;

    const statsText = t(statsLineKey, {
        total: stats.total,
        filtered: stats.filtered,
        enabled: stats.enabled,
        disabled: stats.disabled,
        selected: stats.selected,
    });

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleOpenDropdown = useCallback((e: React.MouseEvent, itemId: string) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[itemId];
        if (button) {
            calculatePosition(button);
        }
        setOpenDropdownId(prev => prev === itemId ? null : itemId);
    }, [calculatePosition]);

    const handleToggleSelectAll = useCallback(() => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                filteredItems.forEach(p => next.delete(p.id));
            } else {
                filteredItems.forEach(p => next.add(p.id));
            }
            return next;
        });
    }, [allFilteredSelected, filteredItems]);

    // 全选复选框 indeterminate 状态
    useEffect(() => {
        const el = selectAllCheckboxRef.current;
        if (!el || filteredItems.length === 0) return;
        el.indeterminate = selectedInFiltered > 0 && selectedInFiltered < filteredItems.length;
    }, [filteredItems, selectedInFiltered]);

    const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

    return (
        <Card className="policy-list-card overflow-hidden p-0 flex flex-col flex-1 min-h-0">
            {/* ---- 工具栏 ---- */}
            <div className="policy-list-toolbar relative z-10 flex items-center justify-between gap-3 border-b border-[var(--app-divider)] px-3.5 py-3 shrink-0">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="policy-search-control relative w-[250px] shrink-0">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={searchPlaceholder || t('policies.listSearchPlaceholder')}
                            className="input-field h-9 min-h-9 rounded-[10px] border-[var(--app-stroke)] bg-[var(--app-panel)] pl-8 pr-2.5 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] focus:border-[var(--app-accent-border)]"
                        />
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled' | 'selected')}
                        className="h-9 min-h-9 w-[120px] rounded-[10px] border-[var(--app-stroke)] bg-[var(--app-panel)] py-1.5 pl-3 pr-8 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        <option value="enabled">{t('common.enabled')}</option>
                        <option value="disabled">{t('common.disabled')}</option>
                        <option value="selected">{t('ruleProviders.filterSelected')}</option>
                    </Select>
                    <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
                        <span className="policy-stat-pill">
                            <Layers3 className="h-3.5 w-3.5" />
                            <span className="truncate">{statsText}</span>
                        </span>
                        <span className="policy-stat-pill policy-stat-pill-success">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>{stats.enabled}</span>
                        </span>
                        {selectedIds.size > 0 && (
                            <span className="policy-stat-pill policy-stat-pill-accent">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{selectedIds.size}</span>
                            </span>
                        )}
                    </div>
                    {toolbarLeftExtra}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {selectedIds.size > 0 && (
                        <div className="policy-batch-actions flex items-center gap-0.5 rounded-[11px] border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]/70 p-0.5 shadow-[0_8px_20px_rgba(31,119,255,0.08)]">
                            <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] text-[var(--app-accent-strong)] hover:bg-[var(--app-panel)] hover:text-[var(--app-accent-strong)]" onClick={() => onBatchEnable(selectedIds)}><CheckCircle2 className="h-3.5 w-3.5" />{t('common.enable')}</Button>
                            <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] text-[var(--app-text-tertiary)] hover:bg-[var(--app-panel)] hover:text-[var(--app-text)]" onClick={() => onBatchDisable(selectedIds)}><Slash className="h-3.5 w-3.5" />{t('common.disable')}</Button>
                            <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] text-[var(--app-danger)] hover:bg-[var(--app-panel)] hover:text-[var(--app-danger)]" onClick={() => onBatchDelete(selectedIds)}><Trash2 className="h-3.5 w-3.5" />{t('common.delete')}</Button>
                        </div>
                    )}
                    {toolbarRightExtra}
                    <Button variant="primary" size="sm" className="h-9 rounded-[10px] px-3 text-[12px] shadow-[0_8px_18px_rgba(31,119,255,0.18)]" onClick={onAdd}><Plus className="w-3.5 h-3.5" />{t(addLabelKey)}</Button>
                </div>
            </div>

            {/* ---- 表格 ---- */}
            {filteredItems.length === 0 ? (
                items.length === 0 && emptyState ? (
                    emptyState
                ) : (
                    <div className="policy-empty-state flex min-h-[220px] flex-col items-center justify-center py-8 text-center">
                        <div className="policy-empty-icon">
                            <Search className="h-5 w-5" />
                        </div>
                        <p className="mt-3 text-[13px] text-[var(--app-text-tertiary)]">{noMatchText || t('policies.noMatchingPolicies')}</p>
                    </div>
                )
            ) : (
                <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                    {/* 固定表头 - 不参与滚动 */}
                    <div className="hidden px-2 pt-2 shrink-0">
                        <table className={tableClassName}>
                            <colgroup>
                                <col className="w-8" />
                                <col className="w-8" />
                                {showIndexColumn && <col className="w-[44px]" />}
                                {showEnabledColumn && <col className="w-[60px]" />}
                                {columns.map((col) => (
                                    <col key={col.id} className={col.width} />
                                ))}
                                <col className="w-[90px]" />
                            </colgroup>
                            <thead>
                                <tr className="h-8">
                                    {/* 拖拽手柄列 */}
                                    <th className="w-8 shrink-0 px-2 py-1.5 text-[11px] font-medium text-[var(--app-text-quaternary)]"></th>
                                    {/* 全选复选框列 */}
                                    <th className="w-8 shrink-0 pl-4 pr-3 py-1.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={filteredItems.every(p => selectedIds.has(p.id))}
                                            ref={selectAllCheckboxRef}
                                            onChange={() => {
                                                const allSelected = filteredItems.every(p => selectedIds.has(p.id));
                                                if (allSelected) {
                                                    setSelectedIds(prev => {
                                                        const next = new Set(prev);
                                                        filteredItems.forEach(p => next.delete(p.id));
                                                        return next;
                                                    });
                                                } else {
                                                    setSelectedIds(prev => {
                                                        const next = new Set(prev);
                                                        filteredItems.forEach(p => next.add(p.id));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="h-3.5 w-3.5 rounded border-[var(--app-stroke-strong)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                            aria-label={t('actions.selectAll')}
                                        />
                                    </th>
                                    {/* 序号列（可选） */}
                                    {showIndexColumn && (
                                        <th className="w-[44px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]"></th>
                                    )}
                                    {/* 启用列（可选） */}
                                    {showEnabledColumn && (
                                        <th className="w-[60px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)] whitespace-nowrap">{t('policies.tableColEnabled')}</th>
                                    )}
                                    {/* 自定义列头 */}
                                    {columns.map((col) => (
                                        <th
                                            key={col.id}
                                            className={cn(
                                                "px-3 py-1.5 text-[11px] font-medium text-[var(--app-text-quaternary)] text-center",
                                                col.width,
                                                col.nowrap && 'whitespace-nowrap',
                                                col.thClassName,
                                            )}
                                        >
                                            {col.header}
                                        </th>
                                    ))}
                                    {/* 操作列 */}
                                    <th className="w-[90px] pl-3 pr-4 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('policies.tableColActions')}</th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                    {/* 可滚动的数据区域 */}
                    <div className="policy-table-scroll table-scroll-x flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
                        <table className={tableClassName}>
                            <colgroup>
                                <col className="w-8" />
                                <col className="w-8" />
                                {showIndexColumn && <col className="w-[44px]" />}
                                {showEnabledColumn && <col className="w-[60px]" />}
                                {columns.map((col) => (
                                    <col key={col.id} className={col.width} />
                                ))}
                                <col className="w-[90px]" />
                            </colgroup>
                            <thead>
                                <tr className="h-8">
                                    <th className="w-8 shrink-0 px-2 py-1.5 text-[11px] font-medium text-[var(--app-text-quaternary)]"></th>
                                    <th className="w-8 shrink-0 pl-4 pr-3 py-1.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            ref={selectAllCheckboxRef}
                                            onChange={handleToggleSelectAll}
                                            className="policy-checkbox h-3.5 w-3.5 rounded border-[var(--app-stroke-strong)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                            aria-label={t('actions.selectAll')}
                                        />
                                    </th>
                                    {showIndexColumn && (
                                        <th className="w-[44px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]"></th>
                                    )}
                                    {showEnabledColumn && (
                                        <th className="w-[60px] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)] whitespace-nowrap">{t('policies.tableColEnabled')}</th>
                                    )}
                                    {columns.map((col) => (
                                        <th
                                            key={col.id}
                                            className={cn(
                                                "px-3 py-1.5 text-[11px] font-medium text-[var(--app-text-quaternary)] text-center",
                                                col.width,
                                                col.nowrap && 'whitespace-nowrap',
                                                col.thClassName,
                                            )}
                                        >
                                            {col.header}
                                        </th>
                                    ))}
                                    <th className="w-[90px] pl-3 pr-4 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('policies.tableColActions')}</th>
                                </tr>
                            </thead>
                            <tbody ref={(node) => {
                                // 调用外部 tbodyRef 以保持向后兼容
                                if (tbodyRef) tbodyRef(node);
                                // 内部维护 Sortable 实例，确保排序基于 filteredItems
                                sortableRef.current?.destroy();
                                sortableRef.current = null;
                                if (node && onReorder) {
                                    sortableRef.current = Sortable.create(node, {
                                        animation: 200,
                                        handle: '.drag-handle',
                                        ghostClass: 'sortable-ghost',
                                        chosenClass: 'sortable-chosen',
                                        onEnd: (evt) => {
                                            if (evt.oldIndex === evt.newIndex) return;
                                            const movedEl = evt.item as HTMLElement;
                                            const itemId = movedEl.getAttribute('data-id') || '';
                                            onReorder(itemId, evt.oldIndex!, evt.newIndex!);
                                        },
                                    });
                                }
                            }}>
                                {filteredItems.map((item, index) => {
                                    const enabled = getEnabled(item);
                                    return (
                                        <tr
                                            key={item.id}
                                            data-id={item.id}
                                            className={cn(
                                                "group cursor-pointer",
                                                !enabled && "policy-row-disabled",
                                                selectedIds.has(item.id) && selectedRowClassName
                                            )}
                                            onDoubleClick={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.closest('input, button, [role="switch"]')) return;
                                                onEdit(item);
                                            }}
                                        >
                                            {/* 拖拽手柄 */}
                                            <td className="w-8 shrink-0 px-2 py-1.5 text-center text-[11px] text-[var(--app-text-quaternary)] align-middle">
                                                <div className="drag-handle sortable-handle inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-[var(--app-text-quaternary)] opacity-60 transition-all hover:bg-[var(--app-hover)] hover:text-[var(--app-accent-strong)] hover:opacity-100 active:cursor-grabbing">
                                                    <GripVertical className="w-3.5 h-3.5" />
                                                </div>
                                            </td>
                                            {/* 复选框 */}
                                            <td className="w-8 shrink-0 pl-4 pr-3 py-1.5 text-center align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(item.id)}
                                                    onChange={() => toggleSelection(item.id)}
                                                    className="policy-checkbox h-3.5 w-3.5 rounded border-[var(--app-stroke-strong)] text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                                                    aria-label={t('policies.selectRowAria', { name: item.name })}
                                                />
                                            </td>
                                            {/* 序号列（可选） */}
                                            {showIndexColumn && (
                                                <td className="py-1.5 px-3 text-center align-middle">
                                                    <span className="policy-index-pill">{index + 1}</span>
                                                </td>
                                            )}
                                            {/* 启用开关（可选） */}
                                            {showEnabledColumn && (
                                                <td className="w-[60px] shrink-0 px-3 py-1.5 text-center align-middle">
                                                    <Switch
                                                        checked={enabled}
                                                        onCheckedChange={() => onToggleEnabled(item)}
                                                        size="sm"
                                                    />
                                                </td>
                                            )}
                                            {/* 自定义列 */}
                                            {columns.map((col) => (
                                                <td
                                                    key={col.id}
                                                    className={cn(
                                                        "px-3 py-1.5 align-middle",
                                                        col.id !== 'name' && 'text-center',
                                                        !enabled && "opacity-60",
                                                    )}
                                                >
                                                    {renderCell(item, col.id, index)}
                                                </td>
                                            ))}
                                            {/* 操作按钮 */}
                                            <td className="shrink-0 pl-3 pr-4 py-1.5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                                                {renderActions ? (
                                                    renderActions(
                                                        item,
                                                        index,
                                                        (el) => { dropdownButtonRefs.current[item.id] = el; },
                                                        handleOpenDropdown,
                                                    )
                                                ) : (
                                                    <div className="flex items-center justify-end gap-0.5">
                                                        <button
                                                            type="button"
                                                            ref={(el) => { dropdownButtonRefs.current[item.id] = el; }}
                                                            onClick={(e) => { e.stopPropagation(); handleOpenDropdown(e, item.id); }}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--app-text-quaternary)] opacity-70 transition-all hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] hover:opacity-100"
                                                            title={t('logs.more')}
                                                        >
                                                            <MoreVertical className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ---- 行操作下拉菜单 ---- */}
            {renderDropdown && openDropdownId !== null && (() => {
                const item = items.find(p => p.id === openDropdownId);
                if (!item) return null;
                return renderDropdown(item, dropdownPosition, closeDropdown);
            })()}
        </Card>
    );
}
