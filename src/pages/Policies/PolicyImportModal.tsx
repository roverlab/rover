import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Surface';
import { X, Check } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { SingboxRouteRuleWithOutbound } from '../../types/policy';
import type { RuleProvider } from '../../types/rule-providers';
import { formatRuleSetDisplay, getRuleSetBadgeClass, getOutboundLabel, getOutboundTone } from './utils';

interface PolicyImportModalProps {
    open: boolean;
    importSource: 'template' | 'config';
    templates: Array<{ name: string; description: string; path: string }>;
    configRules: SingboxRouteRuleWithOutbound[];
    selectedRules: Set<number>;
    importing: boolean;
    importResult: { success: number; skipped: number } | null;
    ruleProviders?: RuleProvider[];
    onSelectTemplate: (path: string) => void;
    onToggleRuleSelection: (index: number) => void;
    onToggleSelectAll: () => void;
    onImport: () => void;
    onClose: () => void;
}

export function PolicyImportModal({
    open,
    importSource,
    templates,
    configRules,
    selectedRules,
    importing,
    importResult,
    ruleProviders = [],
    onSelectTemplate,
    onToggleRuleSelection,
    onToggleSelectAll,
    onImport,
    onClose,
}: PolicyImportModalProps) {
    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                            {importSource === 'template' ? '从预设导入策略' : '从配置导入策略'}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label="关闭"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                        {importSource === 'template' && !importResult && (
                            <div className="space-y-3">
                                <p className="text-[13px] text-[var(--app-text-tertiary)] mb-4">选择一个预设模板，将导入全部策略：</p>
                                {templates.length === 0 ? (
                                    <div className="text-center py-8 text-[var(--app-text-tertiary)]">暂无可用的预设模板</div>
                                ) : (
                                    templates.map((template, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex flex-col gap-1 p-4 rounded-[12px] border bg-white cursor-pointer transition-all",
                                                importing ? "opacity-50 cursor-wait" : "border-[var(--app-stroke)] hover:bg-[var(--app-hover)] hover:border-[var(--app-accent-border)]"
                                            )}
                                            onClick={() => !importing && onSelectTemplate(template.path)}
                                        >
                                            <span className="text-[14px] font-medium text-[var(--app-text)]">{template.name}</span>
                                            <span className="text-[12px] text-[var(--app-text-tertiary)] whitespace-pre-wrap">{template.description}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {importSource === 'config' && (
                            <>
                                <div className="flex items-center justify-between text-[12px]">
                                    <Button variant="ghost" size="sm" onClick={onToggleSelectAll}>
                                        {selectedRules.size === configRules.length ? '取消全选' : '全选'}
                                    </Button>
                                    <span className="text-[var(--app-text-tertiary)]">
                                        已选择 <strong className="text-[var(--app-text)]">{selectedRules.size}</strong> 条
                                        {` / 共 ${configRules.length} 条`}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {configRules.map((rule, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex items-start gap-3 p-3 rounded-[12px] border cursor-pointer transition-all",
                                                selectedRules.has(index)
                                                    ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                                                    : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                            )}
                                            onClick={() => onToggleRuleSelection(index)}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 mt-0.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                                selectedRules.has(index)
                                                    ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                                    : "border-[var(--app-stroke-strong)]"
                                            )}>
                                                {selectedRules.has(index) && (
                                                    <Check className="w-3 h-3 text-white" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[13px] font-medium text-[var(--app-text)]">规则 {index + 1}</span>
                                                    <Badge tone={getOutboundTone(rule.outbound)} className="text-[10px]">
                                                        {getOutboundLabel(rule.outbound)}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {rule.rule_set?.slice(0, 3).map((r, idx) => (
                                                        <span key={idx} className={cn(
                                                            "text-[11px] pl-2 pr-1.5 py-0.5 rounded border-l-2 border",
                                                            getRuleSetBadgeClass(r)
                                                        )}>
                                                            {formatRuleSetDisplay(r, ruleProviders)}
                                                        </span>
                                                    ))}
                                                    {rule.domain && rule.domain.length > 0 && (
                                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                                            域名({rule.domain.length})
                                                        </span>
                                                    )}
                                                    {rule.domain_keyword && rule.domain_keyword.length > 0 && (
                                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                                                            关键词({rule.domain_keyword.length})
                                                        </span>
                                                    )}
                                                    {rule.ip_cidr && rule.ip_cidr.length > 0 && (
                                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">
                                                            IP({rule.ip_cidr.length})
                                                        </span>
                                                    )}
                                                    {rule.process_name && rule.process_name.length > 0 && (
                                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                                                            进程({rule.process_name.length})
                                                        </span>
                                                    )}
                                                    {(rule.rule_set?.length || 0) + (rule.domain?.length || 0) + (rule.domain_keyword?.length || 0) + (rule.ip_cidr?.length || 0) > 4 && (
                                                        <span className="text-[11px] text-[var(--app-text-quaternary)]">更多...</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {importResult && (
                            <div className="flex items-center gap-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[13px] text-emerald-700">
                                <Check className="w-4 h-4" />
                                <span>
                                    成功导入 <strong>{importResult.success}</strong> 条策略
                                    {importResult.skipped > 0 && <span className="text-[var(--app-text-tertiary)]">，跳过 <strong>{importResult.skipped}</strong> 条重复项</span>}
                                </span>
                            </div>
                        )}

                        {importing && !importResult && importSource === 'template' && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--app-accent)]"></div>
                                <span className="ml-3 text-[14px] text-[var(--app-text-secondary)]">正在导入...</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                        {importSource === 'config' && !importResult && (
                            <>
                                <Button variant="ghost" onClick={onClose}>关闭</Button>
                                <Button
                                    variant="primary"
                                    onClick={onImport}
                                    disabled={selectedRules.size === 0 || importing}
                                >
                                    {importing ? '导入中...' : `导入选中 (${selectedRules.size})`}
                                </Button>
                            </>
                        )}
                        {(importSource === 'template' || importResult) && (
                            <Button variant="ghost" onClick={onClose}>关闭</Button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
