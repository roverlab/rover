import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Surface';
import { X, Copy, Edit2 } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { DnsPolicy } from '../../types/dns-policy';
import { getDnsPolicyRuleSet, getDnsPolicyMatchableFields } from '../../types/dns-policy';
import type { RuleProvider } from '../../types/rule-providers';
import { getRuleSetBadgeClass, getServerLabel, getServerTone, getPolicyServer } from './utils';

interface DnsPolicyDetailModalProps {
    open: boolean;
    policy: DnsPolicy | null;
    ruleProviders?: RuleProvider[];
    onCopy: () => void;
    onEdit: (policy: DnsPolicy) => void;
    onClose: () => void;
}

export function DnsPolicyDetailModal({
    open,
    policy,
    ruleProviders = [],
    onCopy,
    onEdit,
    onClose,
}: DnsPolicyDetailModalProps) {
    if (!open || !policy) return null;

    const detailPolicy = policy;

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
                    className="relative z-10 w-full max-w-2xl flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">DNS策略详情</h2>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                                aria-label="关闭"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-3">
                            <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                <span className="w-1 h-4 bg-[var(--app-accent)] rounded-full" />
                                基本信息
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">策略名称</p>
                                    <p className="text-[13px] text-[var(--app-text)] font-medium">{detailPolicy.name}</p>
                                </div>
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">类型</p>
                                    <p className="text-[13px] text-[var(--app-text)] font-medium">
                                        {detailPolicy.type === 'raw' ? '原始' : '标准'}
                                    </p>
                                </div>
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">DNS服务器</p>
                                    <p className="text-[13px] text-[var(--app-text)] font-medium">
                                        <Badge tone={getServerTone(getPolicyServer(detailPolicy) ?? '')}>
                                            {getServerLabel(getPolicyServer(detailPolicy))}
                                        </Badge>
                                    </p>
                                </div>
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">状态</p>
                                    <p className="text-[13px] text-[var(--app-text)] font-medium">
                                        <Badge tone={detailPolicy.enabled ? 'success' : 'neutral'}>
                                            {detailPolicy.enabled ? '已启用' : '已禁用'}
                                        </Badge>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {detailPolicy.type === 'raw' ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                        <span className="w-1 h-4 bg-purple-500 rounded-full" />
                                        原始规则
                                    </h3>
                                    <Button variant="ghost" size="sm" onClick={onCopy}>
                                        <Copy className="w-3.5 h-3.5 mr-1" />
                                        复制
                                    </Button>
                                </div>
                                <pre className="bg-[var(--app-bg-secondary)] rounded-[10px] p-4 overflow-x-auto border border-[rgba(39,44,54,0.08)]">
                                    <code className="text-[12px] font-mono text-[var(--app-text-secondary)]">
                                        {JSON.stringify(detailPolicy.raw_data || {}, null, 2)}
                                    </code>
                                </pre>
                            </div>
                        ) : (
                            <>
                                {(() => {
                                    const arr = getDnsPolicyRuleSet(detailPolicy);
                                    if (arr.length === 0) return null;
                                    return (
                                        <div className="space-y-3">
                                            <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                                <span className="w-1 h-4 bg-emerald-500 rounded-full" />
                                                规则集 ({arr.length})
                                            </h3>
                                            <div className="flex flex-wrap gap-1.5">
                                                {arr.map((rule: string, idx: number) => (
                                                    <span key={idx} className={cn(
                                                        "inline-flex items-center pl-2 pr-2 py-1 rounded-[6px] text-[11px] border-l-2 border font-mono",
                                                        getRuleSetBadgeClass(rule)
                                                    )}>
                                                        {rule}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {(() => {
                                    const matchable = getDnsPolicyMatchableFields(detailPolicy);
                                    const domain = (matchable.domain ?? []) as string[];
                                    const domainKeyword = (matchable.domain_keyword ?? []) as string[];
                                    const domainSuffix = (matchable.domain_suffix ?? []) as string[];
                                    const hasDomain = domain.length > 0 || domainKeyword.length > 0 || domainSuffix.length > 0;
                                    if (!hasDomain) return null;
                                    return (
                                        <div className="space-y-3">
                                            <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                                <span className="w-1 h-4 bg-blue-500 rounded-full" />
                                                域名规则
                                            </h3>
                                            <div className="space-y-2">
                                                {domain.length > 0 && (
                                                    <div className="bg-blue-50 rounded-[10px] p-3">
                                                        <p className="text-[11px] text-blue-600 mb-2">域名 ({domain.length})</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {domain.map((d, idx) => (
                                                                <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-blue-700">{d}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {domainKeyword.length > 0 && (
                                                    <div className="bg-purple-50 rounded-[10px] p-3">
                                                        <p className="text-[11px] text-purple-600 mb-2">域名关键词 ({domainKeyword.length})</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {domainKeyword.map((d, idx) => (
                                                                <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-purple-700">{d}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {domainSuffix.length > 0 && (
                                                    <div className="bg-indigo-50 rounded-[10px] p-3">
                                                        <p className="text-[11px] text-indigo-600 mb-2">域名后缀 ({domainSuffix.length})</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {domainSuffix.map((d, idx) => (
                                                                <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-indigo-700">{d}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        )}

                        <div className="space-y-3">
                            <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                <span className="w-1 h-4 bg-gray-400 rounded-full" />
                                时间信息
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">创建时间</p>
                                    <p className="text-[12px] text-[var(--app-text-secondary)]">
                                        {new Date(detailPolicy.createdAt).toLocaleString('zh-CN')}
                                    </p>
                                </div>
                                <div className="bg-[var(--app-bg-secondary)] rounded-[10px] p-3">
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">更新时间</p>
                                    <p className="text-[12px] text-[var(--app-text-secondary)]">
                                        {new Date(detailPolicy.updatedAt).toLocaleString('zh-CN')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                        <Button variant="ghost" onClick={onClose}>关闭</Button>
                        <Button variant="primary" onClick={() => { onClose(); onEdit(detailPolicy); }}>
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            编辑
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
