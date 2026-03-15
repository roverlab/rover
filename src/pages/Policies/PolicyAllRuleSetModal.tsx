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
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onClose: () => void;
}

/**
 * 统一的规则集选择弹窗（内置 + 自定义合并，服务器返回分组数据）
 */
export function PolicyAllRuleSetModal({
    open,
    ruleSetGroups,
    selectedIds,
    onToggle,
    onClose,
}: PolicyAllRuleSetModalProps) {
    const [searchKeyword, setSearchKeyword] = useState('');
    const [activeTab, setActiveTab] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setSearchKeyword('');
            setActiveTab(null);
        }
    }, [open]);

    // 根据搜索关键词过滤
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

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-3xl flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择规则集</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label="关闭"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="shrink-0 px-6 py-3 border-b border-[rgba(39,44,54,0.06)]">
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

                    {filteredGroups.length > 0 && (
                        <div className="shrink-0 flex gap-1 px-6 pt-3 overflow-x-auto no-scrollbar border-b border-[rgba(39,44,54,0.06)]">
                            {filteredGroups.map(group => (
                                <button
                                    key={group.groupKey}
                                    type="button"
                                    onClick={() => setActiveTab(group.groupKey)}
                                    className={cn(
                                        "shrink-0 px-4 py-2 rounded-t-[10px] text-[13px] font-medium transition-colors",
                                        currentTabKey === group.groupKey
                                            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)] border-b-2 border-[var(--app-accent)] -mb-[1px]"
                                            : "text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                    )}
                                >
                                    {group.displayName}
                                    <span className="ml-1.5 text-[11px] font-normal text-[var(--app-text-quaternary)]">
                                        ({group.items.length})
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 p-6 max-h-[50vh] overflow-y-auto">
                        {filteredGroups.length === 0 ? (
                            <p className="text-[13px] text-[var(--app-text-quaternary)] text-center py-8">
                                {searchKeyword.trim() ? '未找到匹配的规则集' : '暂无规则集'}
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {currentItems.map(item => (
                                    <label
                                        key={item.id}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer hover:bg-[var(--app-hover)] transition-colors border shrink-0",
                                            selectedIds.has(item.id)
                                                ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                                                : "border-[var(--app-stroke)] bg-white"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                            selectedIds.has(item.id)
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                                : "border-[var(--app-stroke-strong)]"
                                        )}>
                                            {selectedIds.has(item.id) && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span className="text-[13px] text-[var(--app-text)]">{item.name}</span>
                                        {!item.enabled && (
                                            <span className="text-[10px] text-[var(--app-text-quaternary)]">(已禁用)</span>
                                        )}
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => onToggle(item.id)}
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                        <span className="text-[12px] text-[var(--app-text-quaternary)]">
                            已选择 {selectedIds.size} 个规则集
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={onClose}>取消</Button>
                            <Button variant="primary" onClick={onClose}>确定</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
