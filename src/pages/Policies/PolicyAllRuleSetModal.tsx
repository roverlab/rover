import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { X, Check, Search } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { RuleProvider } from '../../types/rule-providers';

export interface RuleSetGroupItem {
    groupKey: string;
    displayName: string;
    items: RuleProvider[];
}

interface PolicyAllRuleSetModalProps {
    open: boolean;
    ruleSetGroups: RuleSetGroupItem[];
    selectedIds: Set<string>; // 初始传入的已选 ID 集合
    onConfirm: (ids: Set<string>) => void; // 这里的回调改为 onConfirm 更加符合逻辑
    onClose: () => void;
}

/**
 * 统一的规则集选择弹窗 - 修复版
 * 解决了点击刷新丢失、布局塌陷及事件冒泡问题
 */
export function PolicyAllRuleSetModal({
    open,
    ruleSetGroups,
    selectedIds: initialSelectedIds,
    onConfirm,
    onClose,
}: PolicyAllRuleSetModalProps) {
    const [searchKeyword, setSearchKeyword] = useState('');
    const [activeTab, setActiveTab] = useState<string | null>(null);
    
    // 1. 本地状态管理：避免点击 Toggle 时直接触发父组件重绘
    const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (open) {
            setSearchKeyword('');
            setActiveTab(null);
            // 每次打开时从 props 初始化本地状态
            setLocalSelectedIds(new Set(initialSelectedIds));
        }
    }, [open, initialSelectedIds]);

    const handleToggle = (id: string) => {
        setLocalSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleConfirm = () => {
        onConfirm(localSelectedIds);
        onClose();
    };

    // 根据搜索关键词过滤逻辑 (保持不变)
    const filteredGroups = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase();
        if (!kw) return ruleSetGroups;

        return ruleSetGroups
            .map(g => ({
                ...g,
                items: g.items.filter(
                    p => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)
                ),
            }))
            .filter(g => g.items.length > 0);
    }, [ruleSetGroups, searchKeyword]);

    const currentTabKey = useMemo(() => {
        if (filteredGroups.length === 0) return null;
        const preferred = activeTab ?? filteredGroups[0].groupKey;
        const found = filteredGroups.find(g => g.groupKey === preferred);
        return found ? found.groupKey : filteredGroups[0].groupKey;
    }, [filteredGroups, activeTab]);

    const currentItems = useMemo(() => {
        const group = filteredGroups.find(g => g.groupKey === currentTabKey);
        return group ? group.items : [];
    }, [filteredGroups, currentTabKey]);

    // 计算每个分组的选中数量
    const groupSelectedCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const group of ruleSetGroups) {
            const count = group.items.filter(item => localSelectedIds.has(item.id)).length;
            counts[group.groupKey] = count;
        }
        return counts;
    }, [ruleSetGroups, localSelectedIds]);

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                {/* 背景遮罩 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* 弹窗主体 */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-3xl flex flex-col bg-white border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-window)] overflow-hidden"
                    style={{ 
                        minHeight: '480px', // 设定最小高度，保证视觉稳定
                        maxHeight: '85vh',
                        WebkitAppRegion: 'no-drag' 
                    } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header - 固定 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-sidebar)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择规则集</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* 搜索框 - 固定 */}
                    <div className="shrink-0 px-6 py-3 border-b border-[var(--app-divider)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)]" />
                            <Input
                                value={searchKeyword}
                                onChange={e => setSearchKeyword(e.target.value)}
                                placeholder="搜索规则集名称或 ID..."
                                className="w-full pl-9 pr-3 py-2 text-[13px]"
                            />
                        </div>
                    </div>

                    {/* Tab 栏 - 固定 */}
                    {filteredGroups.length > 0 && (
                        <div className="shrink-0 flex gap-1 px-6 pt-3 overflow-x-auto no-scrollbar border-b border-[var(--app-divider)]">
                            {filteredGroups.map(group => (
                                <button
                                    key={group.groupKey}
                                    type="button"
                                    onClick={() => setActiveTab(group.groupKey)}
                                    className={cn(
                                        "shrink-0 px-4 py-2 rounded-t-[10px] text-[13px] font-medium transition-colors border-b-2",
                                        currentTabKey === group.groupKey
                                            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)] border-[var(--app-accent)]"
                                            : "text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] border-transparent"
                                    )}
                                >
                                    {group.displayName}
                                    <span className="ml-1.5 text-[11px] font-normal opacity-60">
                                        ({groupSelectedCounts[group.groupKey]}/{group.items.length})
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 内容列表 - 滚动区域 */}
                    <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-white">
                        {filteredGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Search className="w-8 h-8 text-[var(--app-text-quaternary)] mb-2 opacity-20" />
                                <p className="text-[13px] text-[var(--app-text-quaternary)]">
                                    {searchKeyword.trim() ? '未找到匹配的规则集' : '暂无规则集'}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {currentItems.map(item => {
                                    const isSelected = localSelectedIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleToggle(item.id)}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer transition-all border shrink-0",
                                                isSelected
                                                    ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)]"
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                                isSelected
                                                    ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                                    : "border-[var(--app-stroke-strong)]"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            <span className="text-[13px] text-[var(--app-text)]">{item.name}</span>
                                            {!item.enabled && (
                                                <span className="text-[10px] text-[var(--app-text-quaternary)]">(已禁用)</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer - 固定 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-sidebar)]/30">
                        <span className="text-[12px] text-[var(--app-text-quaternary)] font-medium">
                            已选择 {localSelectedIds.size} 个规则集
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={onClose}>取消</Button>
                            <Button variant="primary" onClick={handleConfirm}>确定</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}