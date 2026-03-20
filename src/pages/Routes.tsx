import React, { useState, useEffect, useMemo } from 'react';
import { Card, Badge } from '../components/ui/Surface';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { cn } from '../components/Sidebar';
import { Modal } from '../components/ui/Modal';
import { Route, Server, Database, Globe, Shield, RefreshCw, AlertCircle, Search, GitBranch, Eye, Wifi, FileJson, Copy, Check } from 'lucide-react';
import type {  OriginRouteRule, RuleSetConfig, SingboxConfig, DnsRule } from '../types/singbox';

interface ConfigData extends SingboxConfig {}

// 获取出站 Badge 颜色
const getOutboundTone = (outbound?: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' => {
    if (!outbound) return 'neutral';
    const lower = outbound.toLowerCase();
    if (lower.includes('direct')) return 'success';
    if (lower.includes('block')) return 'danger';
    if (lower.includes('select')) return 'accent';
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

// 辅助函数：安全地获取规则字段值（处理联合类型）
function getRuleField<T>(rule: OriginRouteRule, field: string): T | undefined {
    return (rule as any)[field];
}

// 获取规则描述（列表仅展示一小部分内容）
function getRuleDescription(rule: OriginRouteRule): string {
    const action = getRuleField<string>(rule, 'action') || 'route';
    const protocol = getRuleField<string | string[]>(rule, 'protocol');
    const network = getRuleField<string>(rule, 'network');
    const rule_set = getRuleField<string[]>(rule, 'rule_set');
    const domain = getRuleField<string[]>(rule, 'domain');
    const domain_suffix = getRuleField<string[]>(rule, 'domain_suffix');
    const domain_keyword = getRuleField<string[]>(rule, 'domain_keyword');
    const ip_cidr = getRuleField<string[]>(rule, 'ip_cidr');
    const source_ip_cidr = getRuleField<string[]>(rule, 'source_ip_cidr');
    const port = getRuleField<number[]>(rule, 'port');
    const process_name = getRuleField<string[]>(rule, 'process_name');

    if (protocol === 'dns' && action === 'hijack-dns') return 'DNS 劫持';
    if (protocol === 'quic') return 'QUIC 协议';
    if (network === 'icmp') return 'ICMP 协议';
    if (rule_set && rule_set.length > 0) {
        const names = rule_set.map(r => {
            if (r.startsWith('GeoIP-')) return r.replace('GeoIP-', '');
            if (r.startsWith('GeoSite-')) return r.replace('GeoSite-', '');
            return r;
        });
        return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
    }
    if (domain?.length) return `域名: ${truncatePreview(domain)}`;
    if (domain_suffix?.length) return `域名后缀: ${truncatePreview(domain_suffix)}`;
    if (domain_keyword?.length) return `关键词: ${truncatePreview(domain_keyword)}`;
    if (ip_cidr?.length) return `IP: ${truncatePreview(ip_cidr)}`;
    if (source_ip_cidr?.length) return `源IP: ${truncatePreview(source_ip_cidr)}`;
    if (port?.length) return `端口: ${port.slice(0, 2).join(', ')}${port.length > 2 ? ` 等${port.length}项` : ''}`;
    if (process_name?.length) return `进程: ${truncatePreview(process_name)}`;
    return '自定义规则';
}

// 详情中数组最多展示项数（内联展开用）
const DETAIL_ARRAY_LIMIT = 5;

// 规则详情弹窗（显示所有内容，无截断）
function RuleDetailModal({ rule, index, open, onClose }: { rule: OriginRouteRule; index: number; open: boolean; onClose: () => void }) {
    const detailItems: { label: string; value: any }[] = [];

    // 按固定顺序展示常用字段
    const orderedKeys = ['action', 'outbound', 'protocol', 'network', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'process_name', 'process_path', 'package_name', 'ip_is_private', 'invert'];
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
function RuleDetail({ rule }: { rule: OriginRouteRule }) {
    const detailItems: { label: string; value: any }[] = [];

    const protocol = getRuleField<string | string[]>(rule, 'protocol');
    const network = getRuleField<string>(rule, 'network');
    const rule_set = getRuleField<string[]>(rule, 'rule_set');
    const domain = getRuleField<string[]>(rule, 'domain');
    const domain_suffix = getRuleField<string[]>(rule, 'domain_suffix');
    const domain_keyword = getRuleField<string[]>(rule, 'domain_keyword');
    const ip_cidr = getRuleField<string[]>(rule, 'ip_cidr');
    const source_ip_cidr = getRuleField<string[]>(rule, 'source_ip_cidr');
    const port = getRuleField<number[]>(rule, 'port');
    const source_port = getRuleField<number[]>(rule, 'source_port');
    const process_name = getRuleField<string[]>(rule, 'process_name');
    const process_path = getRuleField<string[]>(rule, 'process_path');

    if (protocol) {
        detailItems.push({ label: '协议', value: Array.isArray(protocol) ? protocol.join(', ') : protocol });
    }
    if (network) {
        detailItems.push({ label: '网络', value: network });
    }
    if (rule_set && rule_set.length > 0) {
        detailItems.push({ label: '规则集', value: rule_set });
    }
    if (domain && domain.length > 0) {
        detailItems.push({ label: '域名', value: domain });
    }
    if (domain_suffix && domain_suffix.length > 0) {
        detailItems.push({ label: '域名后缀', value: domain_suffix });
    }
    if (domain_keyword && domain_keyword.length > 0) {
        detailItems.push({ label: '域名关键词', value: domain_keyword });
    }
    if (ip_cidr && ip_cidr.length > 0) {
        detailItems.push({ label: 'IP CIDR', value: ip_cidr });
    }
    if (source_ip_cidr && source_ip_cidr.length > 0) {
        detailItems.push({ label: '源 IP', value: source_ip_cidr });
    }
    if (port && port.length > 0) {
        detailItems.push({ label: '端口', value: port.join(', ') });
    }
    if (source_port && source_port.length > 0) {
        detailItems.push({ label: '源端口', value: source_port.join(', ') });
    }
    if (process_name && process_name.length > 0) {
        detailItems.push({ label: '进程名', value: process_name });
    }
    if (process_path && process_path.length > 0) {
        detailItems.push({ label: '进程路径', value: process_path });
    }

    const knownKeys = ['action', 'outbound', 'protocol', 'network', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'process_name', 'process_path'];
    const ruleAny = rule as any;
    Object.keys(ruleAny).forEach(key => {
        if (!knownKeys.includes(key) && ruleAny[key] !== undefined) {
            detailItems.push({ label: key, value: ruleAny[key] });
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
                                        {String(v)}
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
function RuleItem({ rule, index }: { rule: OriginRouteRule; index: number; key?: React.Key }) {
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
function RuleSetCard({ ruleSet }: { ruleSet: RuleSetConfig; key?: React.Key }) {
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

// DNS 服务器卡片组件
function DnsServerCard({ server }: { server: any; key?: React.Key }) {
    const serverType = server.type || 'udp';
    const serverAddr = server.server || '';
    const serverPort = server.server_port;
    const serverPath = server.path;
    
    // 获取服务器类型图标
    const getServerTypeIcon = () => {
        const type = serverType.toLowerCase();
        if (type === 'local' || type === 'hosts') return <Shield className="w-3.5 h-3.5" />;
        if (type === 'https') return <Globe className="w-3.5 h-3.5" />;
        return <Server className="w-3.5 h-3.5" />;
    };

    // 构建显示地址
    const getDisplayAddress = () => {
        if (serverType === 'local' || serverType === 'hosts') {
            return server.path ? `路径: ${server.path}` : '本地解析';
        }
        if (serverType === 'https') {
            return serverAddr + (serverPath || '');
        }
        return serverAddr + (serverPort ? `:${serverPort}` : '');
    };

    return (
        <Card className="p-4 hover:border-[var(--app-accent-border)]/60 transition-colors group">
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--app-accent-soft)] flex items-center justify-center text-[var(--app-accent-strong)] group-hover:bg-[var(--app-accent-soft)]">
                    {getServerTypeIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-[13px] font-semibold text-[var(--app-text)] truncate">
                            {server.id}
                        </h3>
                        <Badge tone={getDnsServerTone(server.id)}>
                            {serverType}
                        </Badge>
                    </div>
                    <p className="text-[11px] text-[var(--app-text-tertiary)] truncate mb-1.5" title={getDisplayAddress()}>
                        {getDisplayAddress()}
                    </p>
                    <div className="flex items-center gap-4 text-[11px] text-[var(--app-text-quaternary)]">
                        {server.detour && (
                            <span>出站: {server.detour}</span>
                        )}
                        {server.domain_resolver && (
                            <span>解析器: {server.domain_resolver}</span>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

// Tab 类型定义
type TabType = 'rules' | 'dnsRules' | 'ruleSets' | 'dnsServers';

// Tab 按钮组件（设置页面样式）
function TabButton({ active, onClick, icon: Icon, label }: { 
    active: boolean; 
    onClick: () => void; 
    icon: React.ComponentType<{ className?: string }>; 
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium rounded-lg transition-colors ${
                active
                    ? 'bg-white text-[var(--app-text)] shadow-sm'
                    : 'text-[var(--app-text-tertiary)] hover:text-[var(--app-text)]'
            }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}

// 配置详情弹窗
function ConfigDetailModal({ config, open, onClose }: { config: ConfigData | null; open: boolean; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
        if (!config) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    
    return (
        <Modal
            open={open}
            onClose={onClose}
            title="当前配置"
            maxWidth="max-w-4xl"
            contentClassName="overflow-hidden p-0"
        >
            <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                    <Button variant="secondary" size="sm" onClick={handleCopy}>
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                                已复制
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5 mr-1.5" />
                                复制
                            </>
                        )}
                    </Button>
                </div>
                <pre className="text-[12px] text-[var(--app-text-secondary)] bg-[var(--app-bg-secondary)] p-4 overflow-auto max-h-[70vh] font-mono">
                    {config ? JSON.stringify(config, null, 2) : '暂无配置'}
                </pre>
            </div>
        </Modal>
    );
}

interface RoutesProps {
    isActive?: boolean;
}

// 获取 DNS 服务器 Badge 颜色
const getDnsServerTone = (server?: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' => {
    if (!server) return 'neutral';
    const lower = server.toLowerCase();
    if (lower.includes('local')) return 'success';
    if (lower.includes('direct')) return 'success';
    if (lower.includes('block') || lower.includes('reject')) return 'danger';
    if (lower.includes('fakeip')) return 'warning';
    return 'accent';
};

// 获取 DNS 规则描述
function getDnsRuleDescription(rule: DnsRule): string {
    const plainRule = rule as any;
    const ruleSet = plainRule.rule_set;
    const domain = plainRule.domain;
    const domainSuffix = plainRule.domain_suffix;
    const domainKeyword = plainRule.domain_keyword;
    const ipCidr = plainRule.ip_cidr;
    const sourceIpCidr = plainRule.source_ip_cidr;
    const queryType = plainRule.query_type;
    const protocol = plainRule.protocol;
    const processName = plainRule.process_name;

    if (ruleSet && ruleSet.length > 0) {
        const names = ruleSet.map((r: string) => {
            if (r.startsWith('GeoIP-')) return r.replace('GeoIP-', '');
            if (r.startsWith('GeoSite-')) return r.replace('GeoSite-', '');
            if (r.startsWith('geosite:')) return r.replace('geosite:', '');
            if (r.startsWith('geoip:')) return r.replace('geoip:', '');
            if (r.startsWith('acl:')) return r.replace('acl:', '');
            return r;
        });
        return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
    }
    if (domain?.length) return `域名: ${truncatePreview(domain)}`;
    if (domainSuffix?.length) return `域名后缀: ${truncatePreview(domainSuffix)}`;
    if (domainKeyword?.length) return `关键词: ${truncatePreview(domainKeyword)}`;
    if (ipCidr?.length) return `IP: ${truncatePreview(ipCidr)}`;
    if (sourceIpCidr?.length) return `源IP: ${truncatePreview(sourceIpCidr)}`;
    if (queryType?.length) return `查询类型: ${truncatePreview(queryType.map(String))}`;
    if (protocol?.length) return `协议: ${truncatePreview(protocol)}`;
    if (processName?.length) return `进程: ${truncatePreview(processName)}`;
    if (plainRule.ip_accept_any) return '任意 IP 响应';
    return '自定义规则';
}

// DNS 规则详情弹窗
function DnsRuleDetailModal({ rule, index, open, onClose }: { rule: DnsRule; index: number; open: boolean; onClose: () => void }) {
    const plainRule = rule as any;
    const detailItems: { label: string; value: any }[] = [];

    // 按固定顺序展示常用字段
    const orderedKeys = ['server', 'action', 'rcode', 'answer', 'ip_accept_any', 'protocol', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'query_type', 'process_name', 'process_path', 'package_name'];
    const seen = new Set<string>();

    orderedKeys.forEach(key => {
        if (plainRule[key] !== undefined && plainRule[key] !== null) {
            seen.add(key);
            detailItems.push({ label: key, value: plainRule[key] });
        }
    });

    // 其他未列出的字段
    Object.keys(plainRule).forEach(key => {
        if (!seen.has(key) && plainRule[key] !== undefined) {
            detailItems.push({ label: key, value: plainRule[key] });
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
            title={`DNS 规则 #${index + 1} 详情`}
            maxWidth="max-w-2xl"
            contentClassName="overflow-y-auto max-h-[70vh]"
        >
            <div className="px-6 py-4 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    {plainRule.server && <Badge tone={getDnsServerTone(plainRule.server)}>服务器: {plainRule.server}</Badge>}
                    {plainRule.action && <Badge tone={plainRule.action === 'reject' ? 'danger' : 'neutral'}>{plainRule.action}</Badge>}
                    {plainRule.rcode && <Badge tone="warning">{plainRule.rcode}</Badge>}
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

// DNS 规则详情展开组件
function DnsRuleDetail({ rule }: { rule: DnsRule }) {
    const plainRule = rule as any;
    const detailItems: { label: string; value: any }[] = [];

    const ruleSet = plainRule.rule_set;
    const domain = plainRule.domain;
    const domainSuffix = plainRule.domain_suffix;
    const domainKeyword = plainRule.domain_keyword;
    const ipCidr = plainRule.ip_cidr;
    const sourceIpCidr = plainRule.source_ip_cidr;
    const queryType = plainRule.query_type;
    const protocol = plainRule.protocol;
    const processName = plainRule.process_name;

    if (ruleSet && ruleSet.length > 0) {
        detailItems.push({ label: '规则集', value: ruleSet });
    }
    if (domain && domain.length > 0) {
        detailItems.push({ label: '域名', value: domain });
    }
    if (domainSuffix && domainSuffix.length > 0) {
        detailItems.push({ label: '域名后缀', value: domainSuffix });
    }
    if (domainKeyword && domainKeyword.length > 0) {
        detailItems.push({ label: '域名关键词', value: domainKeyword });
    }
    if (ipCidr && ipCidr.length > 0) {
        detailItems.push({ label: 'IP CIDR', value: ipCidr });
    }
    if (sourceIpCidr && sourceIpCidr.length > 0) {
        detailItems.push({ label: '源 IP', value: sourceIpCidr });
    }
    if (queryType && queryType.length > 0) {
        detailItems.push({ label: '查询类型', value: queryType.map(String) });
    }
    if (protocol && protocol.length > 0) {
        detailItems.push({ label: '协议', value: protocol });
    }
    if (processName && processName.length > 0) {
        detailItems.push({ label: '进程名', value: processName });
    }

    const knownKeys = ['server', 'action', 'rcode', 'answer', 'ip_accept_any', 'protocol', 'rule_set', 'domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr', 'source_ip_cidr', 'port', 'source_port', 'query_type', 'process_name', 'process_path', 'package_name'];
    Object.keys(plainRule).forEach(key => {
        if (!knownKeys.includes(key) && plainRule[key] !== undefined) {
            detailItems.push({ label: key, value: plainRule[key] });
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
                                        {String(v)}
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

// DNS 规则行组件
function DnsRuleItem({ rule, index }: { rule: DnsRule; index: number; key?: React.Key }) {
    const plainRule = rule as any;
    const server = plainRule.server;
    const action = plainRule.action;
    const rcode = plainRule.rcode;
    const [detailOpen, setDetailOpen] = useState(false);

    return (
        <div className="list-row flex-col items-stretch gap-2 py-3">
            <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-[var(--app-accent-soft)] flex items-center justify-center text-[11px] font-semibold text-[var(--app-accent-strong)]">
                        {index + 1}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--app-text)] truncate">
                        {getDnsRuleDescription(rule)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {server && <Badge tone={getDnsServerTone(server)}>服务器: {server}</Badge>}
                        {action && <Badge tone={action === 'reject' ? 'danger' : 'neutral'}>{action}</Badge>}
                        {rcode && <Badge tone="warning">{rcode}</Badge>}
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
            <DnsRuleDetail rule={rule} />
            <DnsRuleDetailModal rule={rule} index={index} open={detailOpen} onClose={() => setDetailOpen(false)} />
        </div>
    );
}

// 列表默认展示的规则数量
const RULES_LIST_LIMIT = 50;
const DNS_RULES_LIST_LIMIT = 50;

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
    const dns = config?.dns;
    const dnsRules = dns?.rules || [];
    const dnsServers = dns?.servers || [];

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

    // Tab 状态
    const [activeTab, setActiveTab] = useState<TabType>('rules');
    
    // 配置详情弹窗状态
    const [configModalOpen, setConfigModalOpen] = useState(false);

    // 列表展示的规则（默认只显示前 N 条）
    const displayedRules = showAllRules ? filteredRules : filteredRules.slice(0, RULES_LIST_LIMIT);
    const hasMoreRules = filteredRules.length > RULES_LIST_LIMIT;

    // DNS 规则搜索过滤
    const [dnsSearchQuery, setDnsSearchQuery] = useState('');
    const [showAllDnsRules, setShowAllDnsRules] = useState(false);

    const filteredDnsRules = useMemo(() => {
        if (!dnsSearchQuery.trim()) return dnsRules;
        const q = dnsSearchQuery.toLowerCase();
        return dnsRules.filter((rule) => {
            const desc = getDnsRuleDescription(rule).toLowerCase();
            const server = ((rule as any).server || '').toLowerCase();
            const action = ((rule as any).action || '').toLowerCase();
            const ruleSetStr = ((rule as any).rule_set || []).join(' ').toLowerCase();
            return desc.includes(q) || server.includes(q) || action.includes(q) || ruleSetStr.includes(q);
        });
    }, [dnsRules, dnsSearchQuery]);

    const displayedDnsRules = showAllDnsRules ? filteredDnsRules : filteredDnsRules.slice(0, DNS_RULES_LIST_LIMIT);
    const hasMoreDnsRules = filteredDnsRules.length > DNS_RULES_LIST_LIMIT;

    return (
        <div className="page-shell text-[var(--app-text-secondary)]">
            <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div>
                    <h1 className="page-title">路由</h1>
                    <p className="page-subtitle">查看当前配置的路由规则列表与规则集详情。</p>
                </div>
                <div className="toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <Button variant="secondary" size="sm" onClick={() => setConfigModalOpen(true)}>
                        <FileJson className="w-3.5 h-3.5 mr-1.5" />
                        查看配置
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
                        {/* Tab 切换栏 */}
                        <div className="flex gap-1 mb-4 p-1 bg-[rgba(39,44,54,0.06)] rounded-xl w-fit">
                            <TabButton
                                active={activeTab === 'rules'}
                                onClick={() => setActiveTab('rules')}
                                icon={GitBranch}
                                label="路由规则"
                            />
                            <TabButton
                                active={activeTab === 'dnsRules'}
                                onClick={() => setActiveTab('dnsRules')}
                                icon={Wifi}
                                label="DNS 规则"
                            />
                            <TabButton
                                active={activeTab === 'ruleSets'}
                                onClick={() => setActiveTab('ruleSets')}
                                icon={Database}
                                label="规则集"
                            />
                            <TabButton
                                active={activeTab === 'dnsServers'}
                                onClick={() => setActiveTab('dnsServers')}
                                icon={Server}
                                label="DNS 服务器"
                            />
                        </div>

                        {/* 路由规则 Tab */}
                        {activeTab === 'rules' && (
                            <>
                                {/* 默认出站 */}
                                {route.final && (
                                    <div className="flex items-center gap-2 mb-4 text-[13px]">
                                        <span className="text-[var(--app-text-tertiary)]">默认出站</span>
                                        <Badge tone={getOutboundTone(route.final)} className="text-[12px]">{route.final}</Badge>
                                    </div>
                                )}

                                <Card className="overflow-hidden">
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
                            </>
                        )}

                        {/* 规则集 Tab */}
                        {activeTab === 'ruleSets' && (
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
                        )}

                        {/* DNS 规则 Tab */}
                        {activeTab === 'dnsRules' && (
                            <>
                                {/* 默认 DNS 服务器 */}
                                {dns?.final && (
                                    <div className="flex items-center gap-2 mb-4 text-[13px]">
                                        <span className="text-[var(--app-text-tertiary)]">默认 DNS 服务器</span>
                                        <Badge tone={getDnsServerTone(dns.final)} className="text-[12px]">{dns.final}</Badge>
                                    </div>
                                )}

                                <Card className="overflow-hidden">
                                    <div className="panel-header">
                                        <div className="panel-title">
                                            <div className="panel-title-icon">
                                                <Wifi className="w-3.5 h-3.5" />
                                            </div>
                                            DNS 规则
                                        </div>
                                        <div className="relative w-48">
                                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-quaternary)]" />
                                            <Input
                                                type="text"
                                                placeholder="搜索 DNS 规则..."
                                                className="pl-8 text-[12px] h-8"
                                                value={dnsSearchQuery}
                                                onChange={(e) => setDnsSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    {filteredDnsRules.length === 0 ? (
                                        <div className="empty-state min-h-[160px]">
                                            <p className="text-[13px] text-[var(--app-text-tertiary)]">
                                                {dnsSearchQuery ? '未找到匹配的 DNS 规则' : '暂无 DNS 规则'}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="panel-section">
                                                {displayedDnsRules.map((rule, i) => {
                                                    const originalIndex = dnsRules.indexOf(rule);
                                                    return (
                                                        <DnsRuleItem key={originalIndex} rule={rule} index={originalIndex} />
                                                    );
                                                })}
                                            </div>
                                            {hasMoreDnsRules && (
                                                <div className="p-3 border-t border-[var(--app-divider)] flex justify-center">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => setShowAllDnsRules(!showAllDnsRules)}
                                                    >
                                                        {showAllDnsRules
                                                            ? `收起（显示前 ${DNS_RULES_LIST_LIMIT} 条）`
                                                            : `显示全部 ${filteredDnsRules.length} 条`}
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </Card>
                            </>
                        )}

                        {/* DNS 服务器 Tab */}
                        {activeTab === 'dnsServers' && (
                            <Card className="overflow-hidden">
                                <div className="panel-header">
                                    <div className="panel-title">
                                        <div className="panel-title-icon">
                                            <Server className="w-3.5 h-3.5" />
                                        </div>
                                        DNS 服务器
                                    </div>
                                </div>
                                {dnsServers.length === 0 ? (
                                    <div className="empty-state min-h-[120px] p-8">
                                        <p className="text-[13px] text-[var(--app-text-tertiary)]">暂无 DNS 服务器</p>
                                    </div>
                                ) : (
                                    <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {dnsServers.map((server, index) => (
                                            <DnsServerCard key={index} server={server} />
                                        ))}
                                    </div>
                                )}
                            </Card>
                        )}
                    </>
                )}
            </div>
            
            {/* 配置详情弹窗 */}
            <ConfigDetailModal config={config} open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
        </div>
    );
}
