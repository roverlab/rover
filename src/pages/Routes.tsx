import React, { useState, useEffect, useMemo } from 'react';
import { Card, Badge } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { cn } from '../components/Sidebar';
import { Modal } from '../components/ui/Modal';
import { Route, Server, Database, Globe, Shield, ChevronDown, ChevronRight, RefreshCw, AlertCircle, CheckCircle, Search, GitBranch, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RouteRule {
    action?: string;
    outbound?: string;
    protocol?: string | string[];
    network?: string;
    clash_mode?: string;
    rule_set?: string[];
    domain?: string[];
    domain_suffix?: string[];
    domain_keyword?: string[];
    ip_cidr?: string[];
    source_ip_cidr?: string[];
    port?: number[];
    source_port?: number[];
    process_name?: string[];
    process_path?: string[];
    [key: string]: any;
}

interface RuleSetConfig {
    tag: string;
    type: 'remote' | 'local';
    format?: 'binary' | 'source';
    url?: string;
    download_detour?: string;
    update_interval?: string;
}

interface RouteConfig {
    rules?: RouteRule[];
    rule_set?: RuleSetConfig[];
    auto_detect_interface?: boolean;
    final?: string;
    default_domain_resolver?: {
        server: string;
    };
}

interface ConfigData {
    route?: RouteConfig;
    dns?: {
        servers?: any[];
        rules?: any[];
        [key: string]: any;
    };
    [key: string]: any;
}

// 获取出站 Badge 颜色
const getOutboundTone = (outbound?: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' => {
    if (!outbound) return 'neutral';
    const lower = outbound.toLowerCase();
    if (lower.includes('direct') || lower === '🎯 direct') return 'success';
    if (lower.includes('block') || lower.includes('reject') || lower === '🛑 block') return 'danger';
    if (lower.includes('select') || lower.includes('proxy')) return 'accent';
    return 'neutral';
};

// 获取动作 Badge 颜色
const getActionTone = (action?: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' => {
    if (!action) return 'neutral';
    if (action === 'hijack-dns') return 'warning';
    if (action === 'route') return 'accent';
    return 'neutral';
};

// 获取规则集类型图标
const getRuleSetIcon = (tag: string) => {
    const lower = tag.toLowerCase();
    if (lower.includes('geoip')) return <Globe className="w-3.5 h-3.5" />;
    if (lower.includes('geosite')) return <Server className="w-3.5 h-3.5" />;
    if (lower.includes('private')) return <Shield className="w-3.5 h-3.5" />;
    if (lower.includes('ads') || lower.includes('ad')) return <Shield className="w-3.5 h-3.5" />;
    return <Database className="w-3.5 h-3.5" />;
};

// 数组截断预览（最多显示前 N 项）
const PREVIEW_LIMIT = 2;
const truncatePreview = (arr: string[], limit = PREVIEW_LIMIT) =>
    arr.slice(0, limit).join(', ') + (arr.length > limit ? ` 等${arr.length}项` : '');

// 获取规则描述（列表仅展示一小部分内容）
function getRuleDescription(rule: RouteRule): string {
    const action = rule.action || 'route';
    if (rule.protocol === 'dns' && action === 'hijack-dns') return 'DNS 劫持';
    if (rule.clash_mode === 'direct') return '直连模式';
    if (rule.clash_mode === 'global') return '全局模式';
    if (rule.protocol === 'quic') return 'QUIC 协议';
    if (rule.network === 'icmp') return 'ICMP 协议';
    if (rule.rule_set && rule.rule_set.length > 0) {
        const names = rule.rule_set.map(r => {
            if (r.startsWith('GeoIP-')) return r.replace('GeoIP-', '');
            if (r.startsWith('GeoSite-')) return r.replace('GeoSite-', '');
            return r;
        });
        return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
    }
    if (rule.domain?.length) return `域名: ${truncatePreview(rule.domain)}`;
    if (rule.domain_suffix?.length) return `域名后缀: ${truncatePreview(rule.domain_suffix)}`;
    if (rule.domain_keyword?.length) return `关键词: ${truncatePreview(rule.domain_keyword)}`;
    if (rule.ip_cidr?.length) return `IP: ${truncatePreview(rule.ip_cidr)}`;
    if (rule.source_ip_cidr?.length) return `源IP: ${truncatePreview(rule.source_ip_cidr)}`;
    if (rule.port?.length) return `端口: ${rule.port.slice(0, 2).join(', ')}${rule.port.length > 2 ? ` 等${rule.port.length}项` : ''}`;
    if (rule.process_name?.length) return `进程: ${truncatePreview(rule.process_name)}`;
    return '自定义规则';
}

// 详情中数组最多展示项数（内联展开用）
const DETAIL_ARRAY_LIMIT = 5;

// 规则详情弹窗（显示所有内容，无截断）
function RuleDetailModal({ rule, index, open, onClose }: { rule: RouteRule; index: number; open: boolean; onClose: () => void }) {
    const detailItems: { label: string; value: any }[] = [];

    // 按固定顺序展示常用字段
    const orderedKeys = ['action', 'outbound', 'protocol', 'network', 'clash_mode', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'process_name', 'process_path', 'package_name', 'ip_is_private', 'invert'];
    const seen = new Set<string>();

    orderedKeys.forEach(key => {
        if (rule[key] !== undefined && rule[key] !== null) {
            seen.add(key);
            detailItems.push({ label: key, value: rule[key] });
        }
    });

    // 其他未列出的字段
    Object.keys(rule).forEach(key => {
        if (!seen.has(key) && rule[key] !== undefined) {
            detailItems.push({ label: key, value: rule[key] });
        }
    });

    const formatValue = (val: any): React.ReactNode => {
        if (Array.isArray(val)) {
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {val.map((v, i) => (
                        <span
                            key={i}
                            className="inline-flex items-center px-2 py-1 rounded-md bg-[var(--app-bg-secondary)] text-[var(--app-text-secondary)] text-[12px]"
                        >
                            {String(v)}
                        </span>
                    ))}
                </div>
            );
        }
        if (typeof val === 'object' && val !== null) {
            return <pre className="text-[11px] text-[var(--app-text-tertiary)] overflow-x-auto">{JSON.stringify(val, null, 2)}</pre>;
        }
        return <span className="text-[var(--app-text-secondary)]">{String(val)}</span>;
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`规则 #${index + 1} 详情`}
            maxWidth="max-w-2xl"
            contentClassName="overflow-y-auto max-h-[70vh]"
        >
            <div className="px-6 py-4 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <Badge tone={getActionTone(rule.action)}>{rule.action || 'route'}</Badge>
                    {rule.outbound && <Badge tone={getOutboundTone(rule.outbound)}>{rule.outbound}</Badge>}
                </div>
                <div className="space-y-3">
                    {detailItems.map((item, idx) => (
                        <div key={idx} className="text-[13px]">
                            <span className="text-[var(--app-text-quaternary)] font-medium">{item.label}:</span>
                            <div className="mt-1 text-[var(--app-text-secondary)]">{formatValue(item.value)}</div>
                        </div>
                    ))}
                </div>
                <div className="pt-4 border-t border-[var(--app-divider)]">
                    <div className="text-[11px] text-[var(--app-text-quaternary)] font-medium mb-2">原始 JSON</div>
                    <pre className="text-[11px] text-[var(--app-text-tertiary)] bg-[var(--app-bg-secondary)] rounded-lg p-4 overflow-x-auto max-h-48 overflow-y-auto">
                        {JSON.stringify(rule, null, 2)}
                    </pre>
                </div>
            </div>
        </Modal>
    );
}

    // 规则详情展开组件（数组仅展示前 N 项，避免内容过长）
function RuleDetail({ rule }: { rule: RouteRule }) {
    const detailItems: { label: string; value: any }[] = [];

    if (rule.protocol) {
        detailItems.push({ label: '协议', value: Array.isArray(rule.protocol) ? rule.protocol.join(', ') : rule.protocol });
    }
    if (rule.network) {
        detailItems.push({ label: '网络', value: rule.network });
    }
    if (rule.clash_mode) {
        detailItems.push({ label: '模式', value: rule.clash_mode });
    }
    if (rule.rule_set && rule.rule_set.length > 0) {
        detailItems.push({ label: '规则集', value: rule.rule_set });
    }
    if (rule.domain && rule.domain.length > 0) {
        detailItems.push({ label: '域名', value: rule.domain });
    }
    if (rule.domain_suffix && rule.domain_suffix.length > 0) {
        detailItems.push({ label: '域名后缀', value: rule.domain_suffix });
    }
    if (rule.domain_keyword && rule.domain_keyword.length > 0) {
        detailItems.push({ label: '域名关键词', value: rule.domain_keyword });
    }
    if (rule.ip_cidr && rule.ip_cidr.length > 0) {
        detailItems.push({ label: 'IP CIDR', value: rule.ip_cidr });
    }
    if (rule.source_ip_cidr && rule.source_ip_cidr.length > 0) {
        detailItems.push({ label: '源 IP', value: rule.source_ip_cidr });
    }
    if (rule.port && rule.port.length > 0) {
        detailItems.push({ label: '端口', value: rule.port.join(', ') });
    }
    if (rule.source_port && rule.source_port.length > 0) {
        detailItems.push({ label: '源端口', value: rule.source_port.join(', ') });
    }
    if (rule.process_name && rule.process_name.length > 0) {
        detailItems.push({ label: '进程名', value: rule.process_name });
    }
    if (rule.process_path && rule.process_path.length > 0) {
        detailItems.push({ label: '进程路径', value: rule.process_path });
    }

    const knownKeys = ['action', 'outbound', 'protocol', 'network', 'clash_mode', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'process_name', 'process_path'];
    Object.keys(rule).forEach(key => {
        if (!knownKeys.includes(key) && rule[key] !== undefined) {
            detailItems.push({ label: key, value: rule[key] });
        }
    });

    if (detailItems.length === 0) return null;

    return (
        <div className="mt-2">
            <div className="space-y-1.5 pl-1">
                {detailItems.map((item, idx) => (
                    <div key={idx} className="text-[11px]">
                        <span className="text-[var(--app-text-quaternary)]">{item.label}: </span>
                        {Array.isArray(item.value) ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {(item.value.length > DETAIL_ARRAY_LIMIT ? item.value.slice(0, DETAIL_ARRAY_LIMIT) : item.value).map((v, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] bg-[var(--app-bg-secondary)] text-[var(--app-text-tertiary)]"
                                    >
                                        {v}
                                    </span>
                                ))}
                                {item.value.length > DETAIL_ARRAY_LIMIT && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] bg-[var(--app-bg-secondary)] text-[var(--app-text-quaternary)]">
                                        等{item.value.length}项
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-[var(--app-text-secondary)]">{String(item.value)}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// 规则行组件（紧凑列表样式）
function RuleItem({ rule, index }: { rule: RouteRule; index: number }) {
    const action = rule.action || 'route';
    const outbound = rule.outbound || '-';
    const [detailOpen, setDetailOpen] = useState(false);

    return (
        <div className="list-row flex-col items-stretch gap-2 py-3">
            <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-[var(--app-accent-soft)] flex items-center justify-center text-[11px] font-semibold text-[var(--app-accent-strong)]">
                        {index + 1}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--app-text)] truncate">
                        {getRuleDescription(rule)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        <Badge tone={getActionTone(action)}>{action}</Badge>
                        {outbound && outbound !== '-' && (
                            <Badge tone={getOutboundTone(outbound)}>{outbound}</Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-[var(--app-text-tertiary)] hover:text-[var(--app-accent)]"
                        onClick={() => setDetailOpen(true)}
                    >
                        <Eye className="w-3 h-3 mr-1" />
                        查看详情
                    </Button>
                </div>
            </div>
            <RuleDetail rule={rule} />
            <RuleDetailModal rule={rule} index={index} open={detailOpen} onClose={() => setDetailOpen(false)} />
        </div>
    );
}

// 规则集卡片组件
function RuleSetCard({ ruleSet }: { ruleSet: RuleSetConfig }) {
    return (
        <Card className="p-4 hover:border-[var(--app-accent-border)]/60 transition-colors group">
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--app-accent-soft)] flex items-center justify-center text-[var(--app-accent-strong)] group-hover:bg-[var(--app-accent-soft)]">
                    {getRuleSetIcon(ruleSet.tag)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] truncate">
                            {ruleSet.tag}
                        </h3>
                        <Badge tone={ruleSet.type === 'remote' ? 'accent' : 'neutral'}>
                            {ruleSet.type}
                        </Badge>
                        {ruleSet.format && (
                            <Badge tone="neutral">{ruleSet.format}</Badge>
                        )}
                    </div>
                    {ruleSet.url && (
                        <p className="text-[11px] text-[var(--app-text-tertiary)] truncate mb-1.5" title={ruleSet.url}>
                            {ruleSet.url}
                        </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-[var(--app-text-quaternary)]">
                        {ruleSet.download_detour && (
                            <span>下载: {ruleSet.download_detour}</span>
                        )}
                        {ruleSet.update_interval && (
                            <span>更新: {ruleSet.update_interval}</span>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

// 紧凑统计栏（单行）
function StatsBar({ rules, ruleSets, final, autoDetect }: { rules: number; ruleSets: number; final?: string; autoDetect?: boolean }) {
    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2 text-[12px] text-[var(--app-text-tertiary)]">
            <span className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-[var(--app-text-quaternary)]" />
                <span className="text-[var(--app-text-secondary)] font-medium">{rules}</span>
                条规则
            </span>
            <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[var(--app-text-quaternary)]" />
                <span className="text-[var(--app-text-secondary)] font-medium">{ruleSets}</span>
                个规则集
            </span>
            {final && (
                <span className="flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5 text-[var(--app-text-quaternary)]" />
                    默认出站
                    <Badge tone={getOutboundTone(final)} className="text-[11px]">{final}</Badge>
                </span>
            )}
            {autoDetect && (
                <span className="flex items-center gap-1.5 text-[var(--app-success)]">
                    <CheckCircle className="w-3.5 h-3.5" />
                    接口检测已启用
                </span>
            )}
        </div>
    );
}

interface RoutesProps {
    isActive?: boolean;
}

// 列表默认展示的规则数量
const RULES_LIST_LIMIT = 50;

export function Routes({ isActive = true }: RoutesProps) {
    const [config, setConfig] = useState<ConfigData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAllRules, setShowAllRules] = useState(false);

    const loadConfig = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await window.ipcRenderer.core.getActiveConfig();
            setConfig(data);
        } catch (err: any) {
            console.error('Failed to load config:', err);
            setError(err.message || '加载配置失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isActive) {
            loadConfig();
        }
    }, [isActive]);

    const route = config?.route;
    const rules = route?.rules || [];
    const ruleSets = route?.rule_set || [];

    // 过滤规则
    const filteredRules = useMemo(() => {
        if (!searchQuery.trim()) return rules;
        const q = searchQuery.toLowerCase();
        return rules.filter((rule) => {
            const desc = getRuleDescription(rule).toLowerCase();
            const outbound = (rule.outbound || '').toLowerCase();
            const action = (rule.action || '').toLowerCase();
            const ruleSetStr = (rule.rule_set || []).join(' ').toLowerCase();
            return desc.includes(q) || outbound.includes(q) || action.includes(q) || ruleSetStr.includes(q);
        });
    }, [rules, searchQuery]);

    // 列表展示的规则（默认只显示前 N 条）
    const displayedRules = showAllRules ? filteredRules : filteredRules.slice(0, RULES_LIST_LIMIT);
    const hasMoreRules = filteredRules.length > RULES_LIST_LIMIT;

    return (
        <div className="page-shell text-[var(--app-text-secondary)]">
            <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div>
                    <h1 className="page-title">路由</h1>
                    <p className="page-subtitle">查看当前配置的路由规则列表与规则集详情。</p>
                </div>
                <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <Button variant="secondary" size="sm" onClick={loadConfig} disabled={loading}>
                        <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
                        刷新
                    </Button>
                </div>
            </div>

            <div className="page-content">
                {loading ? (
                    <div className="empty-state">
                        <RefreshCw className="w-10 h-10 text-[var(--app-text-quaternary)] animate-spin" />
                        <p className="mt-4 text-[13px] text-[var(--app-text-tertiary)]">正在加载配置...</p>
                    </div>
                ) : error ? (
                    <div className="empty-state">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--app-danger-soft)] flex items-center justify-center">
                            <AlertCircle className="w-7 h-7 text-[var(--app-danger)]" />
                        </div>
                        <p className="mt-4 text-[14px] font-medium text-[var(--app-text)]">{error}</p>
                        <Button variant="secondary" size="sm" className="mt-4" onClick={loadConfig}>
                            重试
                        </Button>
                    </div>
                ) : !route ? (
                    <div className="empty-state">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--app-bg-secondary)] flex items-center justify-center">
                            <Route className="w-7 h-7 text-[var(--app-text-quaternary)]" />
                        </div>
                        <p className="mt-4 text-[14px] font-medium text-[var(--app-text)]">暂无路由配置</p>
                        <p className="mt-1 text-[12px] text-[var(--app-text-quaternary)]">请先启动内核或生成配置文件</p>
                    </div>
                ) : (
                    <>
                        {/* 紧凑统计栏 */}
                        <StatsBar
                            rules={rules.length}
                            ruleSets={ruleSets.length}
                            final={route.final}
                            autoDetect={route.auto_detect_interface}
                        />

                        {/* 功能区块一：路由规则 */}
                        <Card className="overflow-hidden mb-5">
                            <div className="panel-header">
                                <div className="panel-title">
                                    <div className="panel-title-icon">
                                        <GitBranch className="w-3.5 h-3.5" />
                                    </div>
                                    路由规则
                                </div>
                                <div className="relative w-48">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                                    <Input
                                        type="text"
                                        placeholder="搜索规则..."
                                        className="pl-8 text-[12px] h-8"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            {filteredRules.length === 0 ? (
                                <div className="empty-state min-h-[160px]">
                                    <p className="text-[13px] text-[var(--app-text-tertiary)]">
                                        {searchQuery ? '未找到匹配的规则' : '暂无路由规则'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="panel-section">
                                        {displayedRules.map((rule, i) => {
                                            const originalIndex = rules.indexOf(rule);
                                            return (
                                                <RuleItem key={originalIndex} rule={rule} index={originalIndex} />
                                            );
                                        })}
                                    </div>
                                    {hasMoreRules && (
                                        <div className="p-3 border-t border-[var(--app-divider)] flex justify-center">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setShowAllRules(!showAllRules)}
                                            >
                                                {showAllRules
                                                    ? `收起（显示前 ${RULES_LIST_LIMIT} 条）`
                                                    : `显示全部 ${filteredRules.length} 条`}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </Card>

                        {/* 功能区块二：规则集 */}
                        <Card className="overflow-hidden">
                            <div className="panel-header">
                                <div className="panel-title">
                                    <div className="panel-title-icon">
                                        <Database className="w-3.5 h-3.5" />
                                    </div>
                                    规则集
                                </div>
                            </div>
                            {ruleSets.length === 0 ? (
                                <div className="empty-state min-h-[120px] p-8">
                                    <p className="text-[13px] text-[var(--app-text-tertiary)]">暂无规则集</p>
                                </div>
                            ) : (
                                <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {ruleSets.map((ruleSet, index) => (
                                        <RuleSetCard key={index} ruleSet={ruleSet} />
                                    ))}
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}
