import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Sortable from 'sortablejs';
import { useTranslation } from 'react-i18next';
import './PolicyListTable.css';
import { useDropdownPosition } from '../hooks/useDropdownPosition';
/* Card removed — 无边框设计，融入页面 */
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Select } from '../components/ui/Field';
import { GripVertical, MoreVertical, Plus, Search, ShieldCheck, X } from 'lucide-react';
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
    /**
     * Grid 列宽，支持 CSS grid-template-column 语法。
     * - 固定宽度: "100px"
     * - 最小宽度: "minmax(100px, 1fr)"
     * - 弹性占比: "1fr" / "2fr"
     */
    width?: string;
    /** 额外 className 追加到列头 */
    thClassName?: string;
    /** 是否该列不换行 */
    nowrap?: boolean;
    /** 列对齐，默认 "start" */
    align?: 'start' | 'center' | 'end';
}

export interface PolicyListTableProps<T extends { id: string; name: string }> {
    /** 数据源 */
    items: T[];
    /** 搜索 + 筛选后的数据（如果外部管理筛选）；不传则组件内部管理 */
    filteredItems?: T[];
    /** 筛选字段提取器（用于搜索） */
    searchFields?: (item: T) => string[];
    /** 表格列定义（中间自定义列，不含拖拽/开关/操作列） */
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
    /** 右侧额外工具栏内容（放在添加按钮之前） */
    toolbarRightExtra?: React.ReactNode;
    /** 自定义添加按钮文本 key，默认 'common.add' */
    addLabelKey?: string;

    /* ---- 操作回调 ---- */
    onAdd: () => void;
    /** 获取启用状态，默认 (item) => item.enabled */
    getEnabled?: (item: T) => boolean;
    onToggleEnabled: (item: T) => void;
    onEdit: (item: T) => void;
    /** 行操作下拉菜单渲染（与 renderActions 二选一） */
    renderDropdown?: (item: T, position: { top: number; left: number }, close: () => void) => React.ReactNode;
    /** 自定义操作列渲染（替代默认下拉菜单按钮，如需刷新按钮等） */
    renderActions?: (item: T, index: number, dropdownButtonRef: (el: HTMLButtonElement | null) => void, onOpenDropdown: (e: React.MouseEvent, itemId: string) => void) => React.ReactNode;

    /* ---- Sortable ---- */
    tbodyRef?: ((node: HTMLTableSectionElement | null) => void) | null;
    /** 拖拽排序回调，返回移动项 id、可见列表下标，以及拖拽后的可见 id 顺序 */
    onReorder?: (itemId: string, oldIndex: number, newIndex: number, visibleOrderedIds: string[]) => void;

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
    /** 容器额外 className */
    containerClassName?: string;
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
    onEdit,
    renderDropdown,
    renderActions,
    tbodyRef,
    onReorder,
    emptyState,
    noMatchText,
    showIndexColumn = false,
    showEnabledColumn = true,
    containerClassName,
}: PolicyListTableProps<T>) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const { position: dropdownPosition, calculatePosition } = useDropdownPosition({ menuWidth: 120, menuHeight: 130 });
    const dropdownButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
    const sortableRef = useRef<Sortable | null>(null);
    const listBodyRef = useRef<HTMLDivElement | null>(null);

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
            if (!query) return true;
            const fields = searchFields ? searchFields(item) : [item.name];
            return fields.some((value) => value?.toLowerCase().includes(query));
        });
    }, [externalFilteredItems, items, debouncedSearchQuery, statusFilter, searchFields, getEnabled]);

    const stats = useMemo(() => {
        const enabledCount = items.filter((p) => getEnabled(p)).length;
        return {
            total: items.length,
            filtered: filteredItems.length,
            enabled: enabledCount,
            disabled: items.length - enabledCount,
        };
    }, [items, filteredItems.length, getEnabled]);

    const statsText = t(statsLineKey, {
        total: stats.total,
        filtered: stats.filtered,
        enabled: stats.enabled,
        disabled: stats.disabled,
    });

    const handleOpenDropdown = useCallback((e: React.MouseEvent, itemId: string) => {
        e.stopPropagation();
        const button = dropdownButtonRefs.current[itemId];
        if (button) {
            calculatePosition(button);
        }
        setOpenDropdownId(prev => prev === itemId ? null : itemId);
    }, [calculatePosition]);

    const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

    const setListBodyNode = useCallback((node: HTMLDivElement | null) => {
        listBodyRef.current = node;
        if (tbodyRef) tbodyRef(node as any);
    }, [tbodyRef]);

    useEffect(() => {
        sortableRef.current?.destroy();
        sortableRef.current = null;

        const listBody = listBodyRef.current;
        if (!listBody || !onReorder || listBody.children.length < 2) return;

        sortableRef.current = Sortable.create(listBody, {
            animation: 200,
            draggable: '.policy-list-row',
            filter: 'input, button, select, textarea, [role="switch"], .policy-actions-group',
            preventOnFilter: false,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: (evt) => {
                if (evt.oldIndex === evt.newIndex) return;
                const movedEl = evt.item as HTMLElement;
                const itemId = movedEl.getAttribute('data-id') || '';
                const visibleOrderedIds = Array.from(listBody.children)
                    .map((child) => (child as HTMLElement).getAttribute('data-id'))
                    .filter((id): id is string => Boolean(id));
                onReorder(itemId, evt.oldIndex!, evt.newIndex!, visibleOrderedIds);
            },
        });

        return () => {
            sortableRef.current?.destroy();
            sortableRef.current = null;
        };
    }, [filteredItems.length, onReorder]);

    // 计算 grid-template-columns
    const gridColumns = useMemo(() => {
        const cols: string[] = [];
        // 拖拽手柄列
        if (onReorder) cols.push('28px');
        // 序号列
        if (showIndexColumn) cols.push('36px');
        // 启用开关列
        if (showEnabledColumn) cols.push('56px');
        // 自定义列
        for (const col of columns) {
            cols.push(col.width || 'minmax(80px, 1fr)');
        }
        // 操作列
        cols.push('72px');
        return cols.join(' ');
    }, [onReorder, showIndexColumn, showEnabledColumn, columns]);

    return (
        <div className={cn("policy-list-card flex flex-col flex-1 min-h-0", containerClassName)}>
            {/* ---- 工具栏 ---- */}
            <div className="policy-list-toolbar relative z-10 flex items-center justify-between gap-3 px-3.5 py-2.5 shrink-0">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="policy-search-control relative w-[220px] shrink-0">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={searchPlaceholder || t('policies.listSearchPlaceholder')}
                            className="input-field h-8 min-h-8 rounded-lg border-[var(--app-stroke)] bg-[var(--app-panel)] pl-7 pr-7 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] focus:border-[var(--app-accent-border)]"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--app-hover)] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
                        className="h-8 min-h-8 w-[100px] rounded-lg border-[var(--app-stroke)] bg-[var(--app-panel)] py-1 pl-2.5 pr-7 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        <option value="enabled">{t('common.enabled')}</option>
                        <option value="disabled">{t('common.disabled')}</option>
                    </Select>
                    <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
                        <span className="policy-stat-pill">
                            <span className="truncate">{statsText}</span>
                        </span>
                        <span className="policy-stat-pill policy-stat-pill-success">
                            <ShieldCheck className="h-3 w-3" />
                            <span>{stats.enabled}</span>
                        </span>
                    </div>
                    {toolbarLeftExtra}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {toolbarRightExtra}
                    <Button variant="primary" size="sm" className="h-8 rounded-lg px-3 text-[12px] shadow-[0_8px_18px_rgba(31,119,255,0.18)]" onClick={onAdd}><Plus className="w-3.5 h-3.5" />{t(addLabelKey)}</Button>
                </div>
            </div>

            {/* ---- 列表 ---- */}
            {filteredItems.length === 0 ? (
                items.length === 0 && emptyState ? (
                    emptyState
                ) : (
                    <div className="policy-empty-state flex min-h-[180px] flex-col items-center justify-center py-8 text-center">
                        <Search className="h-5 w-5 text-[var(--app-text-quaternary)]" />
                        <p className="mt-2 text-[12px] text-[var(--app-text-quaternary)]">{noMatchText || t('policies.noMatchingPolicies')}</p>
                    </div>
                )
            ) : (
                <div className="policy-list-container flex-1 min-h-0 overflow-auto flex flex-col">
                    <div className="min-w-fit flex flex-col flex-1">
                        {/* 列表头 */}
                        <div className="policy-list-header" style={{ gridTemplateColumns: gridColumns }}>
                            {onReorder && <div className="policy-list-th"></div>}
                            {showIndexColumn && <div className="policy-list-th policy-list-th-center">#</div>}
                            {showEnabledColumn && <div className="policy-list-th policy-list-th-center">{t('policies.tableColEnabled')}</div>}
                            {columns.map((col) => (
                                <div
                                    key={col.id}
                                    className={cn(
                                        "policy-list-th",
                                        col.align === 'center' && "policy-list-th-center",
                                        col.align === 'end' && "policy-list-th-end",
                                        col.thClassName,
                                    )}
                                >
                                    {col.header}
                                </div>
                            ))}
                            <div className="policy-list-th policy-list-th-end">{t('policies.tableColActions')}</div>
                        </div>

                        {/* 可滚动的数据区域 */}
                        <div className="policy-list-scroll flex-1 min-h-0 overflow-y-auto">
                            <div className="policy-list-body" ref={setListBodyNode}>
                            {filteredItems.map((item, index) => {
                                const enabled = getEnabled(item);
                                return (
                                    <div
                                        key={item.id}
                                        data-id={item.id}
                                        className={cn(
                                            "policy-list-row group",
                                            !enabled && "policy-list-row-disabled",
                                        )}
                                        style={{ gridTemplateColumns: gridColumns }}
                                        onDoubleClick={(e) => {
                                            const target = e.target as HTMLElement;
                                            if (target.closest('input, button, [role="switch"]')) return;
                                            onEdit(item);
                                        }}
                                    >
                                    {/* 拖拽手柄 */}
                                    {onReorder && (
                                        <div className="policy-list-cell policy-list-cell-drag">
                                            <div className="drag-handle sortable-handle inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-[var(--app-text-tertiary)] transition-all hover:bg-[var(--app-hover)] hover:text-[var(--app-accent-strong)] active:cursor-grabbing">
                                                <GripVertical className="w-3 h-3" />
                                            </div>
                                        </div>
                                    )}
                                    {/* 序号列 */}
                                    {showIndexColumn && (
                                        <div className="policy-list-cell policy-list-cell-center">
                                            <span className="policy-index-pill">{index + 1}</span>
                                        </div>
                                    )}
                                    {/* 启用开关 */}
                                    {showEnabledColumn && (
                                        <div className="policy-list-cell policy-list-cell-center">
                                            <Switch
                                                checked={enabled}
                                                onCheckedChange={() => onToggleEnabled(item)}
                                                size="sm"
                                            />
                                        </div>
                                    )}
                                    {/* 自定义列 */}
                                    {columns.map((col) => (
                                        <div
                                            key={col.id}
                                            className={cn(
                                                "policy-list-cell",
                                                col.align === 'center' && "policy-list-cell-center",
                                                col.align === 'end' && "policy-list-cell-end",
                                                !enabled && "opacity-60",
                                                col.nowrap && "policy-list-cell-nowrap",
                                            )}
                                        >
                                            {renderCell(item, col.id, index)}
                                        </div>
                                    ))}
                                    {/* 操作按钮 */}
                                    <div className="policy-list-cell policy-list-cell-end" onClick={(e) => e.stopPropagation()}>
                                        <div className="policy-actions-group">
                                            {renderActions ? (
                                                renderActions(
                                                    item,
                                                    index,
                                                    (el) => { dropdownButtonRefs.current[item.id] = el; },
                                                    handleOpenDropdown,
                                                )
                                            ) : (
                                                <button
                                                    type="button"
                                                    ref={(el) => { dropdownButtonRefs.current[item.id] = el; }}
                                                    onClick={(e) => { e.stopPropagation(); handleOpenDropdown(e, item.id); }}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--app-text-quaternary)] opacity-70 transition-all hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] hover:opacity-100"
                                                    title={t('logs.more')}
                                                >
                                                    <MoreVertical className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    </div>
                                );
                            })}
                            </div>
                    </div>
                </div>
            </div>
            )}

            {/* ---- 行操作下拉菜单 ---- */}
            {renderDropdown && openDropdownId !== null && (() => {
                const item = items.find(p => p.id === openDropdownId);
                if (!item) return null;
                return renderDropdown(item, dropdownPosition, closeDropdown);
            })()}
        </div>
    );
}
