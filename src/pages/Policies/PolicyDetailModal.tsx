import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Surface';
import { X, Copy, Edit2 } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { Policy } from '../../types/policy';
import type { RuleProvider } from '../../types/rule-providers';
import { getRuleSetBadgeClass, getOutboundLabel, getOutboundTone, getPolicyOutbound } from './utils';

interface PolicyDetailModalProps {
    open: boolean;
    policy: Policy | null;
    ruleProviders?: RuleProvider[];
    onCopy: () => void;
    onEdit: (policy: Policy) => void;
    onClose: () => void;
}

export function PolicyDetailModal({
    open,
    policy,
    ruleProviders = [],
    onCopy,
    onEdit,
    onClose,
}: PolicyDetailModalProps) {
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
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">策略详情</h2>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={onCopy}>
                                <Copy className="w-3.5 h-3.5 mr-1" />
                                复制
                            </Button>
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
                                    <p className="text-[11px] text-[var(--app-text-quaternary)] mb-1">出站</p>
                                    <p className="text-[13px] text-[var(--app-text)] font-medium">
                                        <Badge tone={getOutboundTone(getPolicyOutbound(detailPolicy) ?? '')}>
                                            {getOutboundLabel(getPolicyOutbound(detailPolicy))}
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
                                <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                    <span className="w-1 h-4 bg-purple-500 rounded-full" />
                                    原始规则
                                </h3>
                                <pre className="bg-gray-900 rounded-[10px] p-4 overflow-x-auto">
                                    <code className="text-[12px] font-mono text-green-400">
                                        {JSON.stringify(detailPolicy.raw_data || {}, null, 2)}
                                    </code>
                                </pre>
                            </div>
                        ) : (
                            <>
                                {detailPolicy.ruleSetBuildIn && detailPolicy.ruleSetBuildIn.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                            <span className="w-1 h-4 bg-emerald-500 rounded-full" />
                                            规则集 ({detailPolicy.ruleSetBuildIn.length})
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {detailPolicy.ruleSetBuildIn.map((rule, idx) => (
                                                <span key={idx} className={cn(
                                                    "inline-flex items-center pl-2 pr-2 py-1 rounded-[6px] text-[11px] border-l-2 border font-mono",
                                                    getRuleSetBadgeClass(rule)
                                                )}>
                                                    {rule}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(detailPolicy.domain?.length || detailPolicy.domain_keyword?.length || detailPolicy.domain_suffix?.length) ? (
                                    <div className="space-y-3">
                                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                            <span className="w-1 h-4 bg-blue-500 rounded-full" />
                                            域名规则
                                        </h3>
                                        <div className="space-y-2">
                                            {detailPolicy.domain && detailPolicy.domain.length > 0 && (
                                                <div className="bg-blue-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-blue-600 mb-2">域名 ({detailPolicy.domain.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.domain.map((d, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-blue-700">{d}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {detailPolicy.domain_keyword && detailPolicy.domain_keyword.length > 0 && (
                                                <div className="bg-purple-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-purple-600 mb-2">域名关键词 ({detailPolicy.domain_keyword.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.domain_keyword.map((d, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-purple-700">{d}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {detailPolicy.domain_suffix && detailPolicy.domain_suffix.length > 0 && (
                                                <div className="bg-indigo-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-indigo-600 mb-2">域名后缀 ({detailPolicy.domain_suffix.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.domain_suffix.map((d, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-indigo-700">{d}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {(detailPolicy.ip_cidr?.length || detailPolicy.source_ip_cidr?.length) ? (
                                    <div className="space-y-3">
                                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                            <span className="w-1 h-4 bg-orange-500 rounded-full" />
                                            IP 规则
                                        </h3>
                                        <div className="space-y-2">
                                            {detailPolicy.ip_cidr && detailPolicy.ip_cidr.length > 0 && (
                                                <div className="bg-orange-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-orange-600 mb-2">IP CIDR ({detailPolicy.ip_cidr.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.ip_cidr.map((ip, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-orange-700 font-mono">{ip}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {detailPolicy.source_ip_cidr && detailPolicy.source_ip_cidr.length > 0 && (
                                                <div className="bg-amber-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-amber-600 mb-2">源 IP CIDR ({detailPolicy.source_ip_cidr.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.source_ip_cidr.map((ip, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-amber-700 font-mono">{ip}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {detailPolicy.port && detailPolicy.port.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                            <span className="w-1 h-4 bg-cyan-500 rounded-full" />
                                            端口规则 ({detailPolicy.port.length})
                                        </h3>
                                        <div className="bg-cyan-50 rounded-[10px] p-3">
                                            <div className="flex flex-wrap gap-1">
                                                {detailPolicy.port.map((p, idx) => (
                                                    <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-cyan-700 font-mono">{p}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(detailPolicy.processName?.length || detailPolicy.package?.length) ? (
                                    <div className="space-y-3">
                                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] flex items-center gap-2">
                                            <span className="w-1 h-4 bg-green-500 rounded-full" />
                                            进程与应用
                                        </h3>
                                        <div className="space-y-2">
                                            {detailPolicy.processName && detailPolicy.processName.length > 0 && (
                                                <div className="bg-green-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-green-600 mb-2">进程名 ({detailPolicy.processName.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.processName.map((p, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-green-700">{p}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {detailPolicy.package && detailPolicy.package.length > 0 && (
                                                <div className="bg-teal-50 rounded-[10px] p-3">
                                                    <p className="text-[11px] text-teal-600 mb-2">包名 Android ({detailPolicy.package.length})</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {detailPolicy.package.map((p, idx) => (
                                                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-white rounded text-teal-700 font-mono">{p}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
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
