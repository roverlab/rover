import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { X, Check, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RuleProvider } from '../../types/rule-providers';

interface PolicyBuiltinRuleSetModalProps {
    open: boolean;
    builtinRulesets: RuleProvider[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onClose: () => void;
}

/**
 * 根据规则集 ID 的分组键提取分类
 * 例如: "clash:applications" -> "clash"
 *       "acl:360" -> "acl"
 *       "geoip:cn" -> "geoip"
 */
function getGroupKey(id: string): string {
    const colonIndex = id.indexOf(':');
    if (colonIndex > 0) {
        return id.substring(0, colonIndex);
    }
    return 'other';
}

function getBuiltinGroupNameKey(groupKey: string): string {
    const map: Record<string, string> = {
        clash: 'policies.builtinGroupClash',
        acl: 'policies.builtinGroupAcl',
        geoip: 'policies.builtinGroupGeoip',
        geosite: 'policies.builtinGroupGeosite',
        singbox: 'policies.builtinGroupSingbox',
        other: 'policies.builtinGroupOther',
    };
    return map[groupKey] ?? 'policies.builtinGroupOther';
}

/**
 * 分组显示的内置规则集选择弹窗
 * 支持搜索，分类按 Tab 展示
 */
export function PolicyBuiltinRuleSetModal({
    open,
    builtinRulesets,
    selectedIds,
    onToggle,
    onClose,
}: PolicyBuiltinRuleSetModalProps) {
    const { t } = useTranslation();
    const [searchKeyword, setSearchKeyword] = useState('');
    const [activeTab, setActiveTab] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setSearchKeyword('');
            setActiveTab(null);
        }
    }, [open]);

    // 按分组键对规则集进行分组
    const groupedRulesets = useMemo(() => {
        const groups = new Map<string, RuleProvider[]>();

        for (const provider of builtinRulesets) {
            const groupKey = getGroupKey(provider.id);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(provider);
        }

        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [builtinRulesets]);

    // 根据搜索关键词过滤
    const filteredGroupedRulesets = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase();
        if (!kw) return groupedRulesets;

        return groupedRulesets
            .map(([groupKey, providers]) => {
                const filtered = providers.filter(
                    p => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)
                );
                return [groupKey, filtered] as [string, RuleProvider[]];
            })
            .filter(([, providers]) => providers.length > 0);
    }, [groupedRulesets, searchKeyword]);

    // 当前激活的 tab 对应的分组数据（若 activeTab 不在过滤结果中则回退到第一项）
    const currentTabKey = useMemo(() => {
        if (filteredGroupedRulesets.length === 0) return null;
        const preferred = activeTab ?? filteredGroupedRulesets[0][0];
        const found = filteredGroupedRulesets.find(([k]) => k === preferred);
        return found ? found[0] : filteredGroupedRulesets[0][0];
    }, [filteredGroupedRulesets, activeTab]);

    const currentProviders = useMemo(() => {
        const entry = filteredGroupedRulesets.find(([k]) => k === currentTabKey);
        return entry ? entry[1] : [];
    }, [filteredGroupedRulesets, currentTabKey]);

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
                    className="relative z-10 w-full max-w-3xl flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('policies.builtinRuleSetTitle')}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label={t('common.close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* 搜索框 */}
                    <div className="shrink-0 px-6 py-3 border-b border-[var(--app-divider)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)]" />
                            <Input
                                value={searchKeyword}
                                onChange={e => setSearchKeyword(e.target.value)}
                                placeholder={t('policies.builtinRuleSetSearch')}
                                className="w-full pl-9 pr-3 py-2 text-[13px]"
                            />
                        </div>
                    </div>

                    {/* Tab 分类 */}
                    {filteredGroupedRulesets.length > 0 && (
                        <div className="shrink-0 flex gap-1 px-6 pt-3 overflow-x-auto no-scrollbar border-b border-[var(--app-divider)]">
                            {filteredGroupedRulesets.map(([groupKey, providers]) => (
                                <button
                                    key={groupKey}
                                    type="button"
                                    onClick={() => setActiveTab(groupKey)}
                                    className={cn(
                                        "shrink-0 px-4 py-2 rounded-t-[10px] text-[13px] font-medium transition-colors",
                                        currentTabKey === groupKey
                                            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)] border-b-2 border-[var(--app-accent)] -mb-[1px]"
                                            : "text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                    )}
                                >
                                    {t(getBuiltinGroupNameKey(groupKey))}
                                    <span className="ml-1.5 text-[11px] font-normal text-[var(--app-text-quaternary)]">
                                        ({providers.length})
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 p-6 max-h-[50vh] overflow-y-auto">
                        {filteredGroupedRulesets.length === 0 ? (
                            <p className="text-[13px] text-[var(--app-text-quaternary)] text-center py-8">
                                {searchKeyword.trim() ? t('policies.builtinNoMatch') : t('policies.builtinNoBuiltins')}
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {currentProviders.map(provider => (
                                    <label
                                        key={provider.id}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer hover:bg-[var(--app-hover)] transition-colors border shrink-0",
                                            selectedIds.has(provider.id)
                                                ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                                                : "border-[var(--app-stroke)] bg-[var(--app-panel)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                            selectedIds.has(provider.id)
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                                : "border-[var(--app-stroke-strong)]"
                                        )}>
                                            {selectedIds.has(provider.id) && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span className="text-[13px] text-[var(--app-text)]">
                                        <span className="text-[var(--app-text-tertiary)]">{t(getBuiltinGroupNameKey(getGroupKey(provider.id)))}</span>
                                        <span className="text-[var(--app-text-quaternary)] mx-1">/</span>
                                        {provider.name}
                                    </span>
                                        {!provider.enabled && (
                                            <span className="text-[11px] text-[var(--app-text-quaternary)]">{t('policies.ruleSetDisabledBadge')}</span>
                                        )}
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={selectedIds.has(provider.id)}
                                            onChange={() => onToggle(provider.id)}
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                        <span className="text-[12px] text-[var(--app-text-quaternary)]">
                            {t('policies.builtinSelectedCount', { count: selectedIds.size })}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                            <Button variant="primary" onClick={onClose}>{t('common.confirm')}</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
