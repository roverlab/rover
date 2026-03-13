import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { TagInput } from '../../components/ui/TagInput';
import { X, List, ChevronDown } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import type { Policy, PolicyType } from '../../types/policy';
import { OUTBOUND_OPTIONS } from '../../types/policy';
import type { RuleProvider } from '../../types/rule-providers';
import { PolicyRuleSetModal } from './PolicyRuleSetModal';
import { PolicyBuiltinRuleSetModal } from './PolicyBuiltinRuleSetModal';
import { PolicyPreferredOutboundModal } from './PolicyPreferredOutboundModal';

export interface PolicyEditFormState {
    policyType: PolicyType;
    name: string;
    outbound: string;
    preferredOutbounds: string[];
    rawDataContent: string;
    selectedRuleProviderIds: Set<string>;
    selectedBuiltinRuleSetIds: Set<string>;
    processNames: string[];
    domain: string[];
    domainKeyword: string[];
    domainSuffix: string[];
    port: string[];
    ipCidr: string[];
    sourceIpCidr: string[];
}

export interface PolicyEditModalProps {
    open: boolean;
    editingPolicy: Policy | null;
    policiesCount: number;
    form: PolicyEditFormState;
    ruleProviders: RuleProvider[];
    builtinRulesets: RuleProvider[];
    availableOutbounds: Array<{ tag: string; type: string; all?: string[] }>;
    unavailableAclRefs: string[];
    showRuleSetModal: boolean;
    showBuiltinRuleSetModal: boolean;
    showPreferredOutboundModal: boolean;
    onClose: () => void;
    onFormChange: (updates: Partial<PolicyEditFormState>) => void;
    setShowRuleSetModal: (v: boolean) => void;
    setShowBuiltinRuleSetModal: (v: boolean) => void;
    setShowPreferredOutboundModal: (v: boolean) => void;
    onSave: () => void;
    onOpenMultiLineEdit: (title: string, value: string[], setter: (v: string[]) => void) => void;
}

export function PolicyEditModal({
    open,
    editingPolicy,
    policiesCount,
    form,
    ruleProviders,
    builtinRulesets,
    availableOutbounds,
    unavailableAclRefs,
    showRuleSetModal,
    showBuiltinRuleSetModal,
    showPreferredOutboundModal,
    onClose,
    onFormChange,
    setShowRuleSetModal,
    setShowBuiltinRuleSetModal,
    setShowPreferredOutboundModal,
    onSave,
    onOpenMultiLineEdit,
}: PolicyEditModalProps) {
    const toggleRuleProvider = (id: string) => {
        const next = new Set(form.selectedRuleProviderIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onFormChange({ selectedRuleProviderIds: next });
    };

    const toggleRuleSetModalSelection = (id: string) => {
        toggleRuleProvider(id);
    };

    const toggleBuiltinRuleSetSelection = (id: string) => {
        const next = new Set(form.selectedBuiltinRuleSetIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onFormChange({ selectedBuiltinRuleSetIds: next });
    };

    if (!open) return null;

    return (
        <>
            {createPortal(
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
                            className="relative z-10 w-full max-w-lg flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                    {editingPolicy ? '编辑策略' : '添加策略'}
                                </h2>
                                <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2" aria-label="关闭">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">策略类型</label>
                                    {editingPolicy ? (
                                        <div className="px-3 py-2 rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-[var(--app-bg-secondary)] text-[13px] text-[var(--app-text-secondary)]">
                                            {form.policyType === 'raw' ? '原始编辑' : '标准'}
                                            <span className="text-[11px] text-[var(--app-text-quaternary)] ml-2">(编辑时不可修改类型)</span>
                                        </div>
                                    ) : (
                                        <Select value={form.policyType} onChange={e => onFormChange({ policyType: e.target.value as PolicyType })}>
                                            <option value="default">标准</option>
                                            <option value="raw">原始</option>
                                        </Select>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">策略名称</label>
                                    <Input value={form.name} onChange={e => onFormChange({ name: e.target.value })} placeholder="例如：🌍 国外穿墙" />
                                </div>


                                {form.policyType === 'default' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">出站</label>
                                        <Select value={form.outbound} onChange={e => onFormChange({ outbound: e.target.value })}>
                                            {OUTBOUND_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </Select>
                                    </div>
                                )}

                                {form.policyType === 'default' && availableOutbounds.length > 0 && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">订阅出站节点</label>
                                        <div
                                            className={cn(
                                                "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer overflow-hidden",
                                                "border-[rgba(39,44,54,0.12)]"
                                            )}
                                            onClick={() => setShowPreferredOutboundModal(true)}
                                        >
                                            {form.preferredOutbounds.length === 0 ? (
                                                <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择节点</span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                                                    {form.preferredOutbounds.map((tag, idx) => (
                                                        <span
                                                            key={`${tag}-${idx}`}
                                                            className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <span className="truncate">{tag}</span>
                                                            <button
                                                                type="button"
                                                                className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                                onClick={e => { e.stopPropagation(); onFormChange({ preferredOutbounds: form.preferredOutbounds.filter((_, i) => i !== idx) }); }}
                                                                aria-label="删除"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                                        </div>
                                        <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">选择订阅的出站节点后，将覆盖上面的默认出站</p>
                                    </div>
                                )}

                                {form.policyType === 'raw' ? (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">原始规则</label>
                                        <textarea
                                            value={form.rawDataContent}
                                            onChange={e => onFormChange({ rawDataContent: e.target.value })}
                                            placeholder={`{\n  "domain": ["example.com"],\n  "domain_suffix": [".google.com"],\n  "ip_cidr": ["192.168.1.0/24"]\n}`}
                                            className="w-full h-48 px-3 py-2 text-[13px] font-mono rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-white focus:border-[var(--app-accent-border)] focus:outline-none resize-none"
                                            spellCheck={false}
                                        />
                                        <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">输入 sing-box 路由规则 JSON 格式，outbound 字段会被自动设置为上方选择的出站</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">规则集（自定义）</label>
                                            {ruleProviders.length === 0 ? (
                                                <p className="px-3 py-4 text-[12px] text-[var(--app-text-quaternary)] border border-[rgba(39,44,54,0.12)] rounded-[10px] bg-white">暂无规则集，请先在「规则集」页面添加</p>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer overflow-hidden",
                                                        "border-[rgba(39,44,54,0.12)]"
                                                    )}
                                                    onClick={() => setShowRuleSetModal(true)}
                                                >
                                                    {form.selectedRuleProviderIds.size === 0 ? (
                                                        <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择规则集</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                                                            {Array.from(form.selectedRuleProviderIds).map(id => {
                                                                const p = ruleProviders.find(r => r.id === id);
                                                                if (!p) return null;
                                                                return (
                                                                    <span
                                                                        key={p.id}
                                                                        className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <span className="truncate">{p.name}</span>
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                const next = new Set(form.selectedRuleProviderIds);
                                                                                next.delete(p.id);
                                                                                onFormChange({ selectedRuleProviderIds: next });
                                                                            }}
                                                                            aria-label="删除"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                                                </div>
                                            )}
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">点击选择自定义的规则集</p>
                                        </div>

                                        {/* 内置规则集选择 */}
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">内置规则集</label>
                                            {builtinRulesets.length === 0 ? (
                                                <p className="px-3 py-4 text-[12px] text-[var(--app-text-quaternary)] border border-[rgba(39,44,54,0.12)] rounded-[10px] bg-white">暂无内置规则集</p>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "relative flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 pr-8 rounded-[10px] border bg-white transition-all cursor-pointer overflow-hidden",
                                                        "border-[rgba(39,44,54,0.12)]"
                                                    )}
                                                    onClick={() => setShowBuiltinRuleSetModal(true)}
                                                >
                                                    {form.selectedBuiltinRuleSetIds.size === 0 ? (
                                                        <span className="text-[13px] text-[var(--app-text-quaternary)]">请选择内置规则集</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                                                            {Array.from(form.selectedBuiltinRuleSetIds).map(id => {
                                                                const p = builtinRulesets.find(r => r.id === id);
                                                                const displayName = p ? p.name : id;
                                                                return (
                                                                    <span
                                                                        key={id}
                                                                        className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] bg-[var(--app-accent-soft)] text-[var(--app-text)] border border-[var(--app-accent-border)] max-w-[140px]"
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <span className="truncate">{displayName}</span>
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 p-0.5 rounded hover:bg-[var(--app-stroke)] hover:text-[var(--app-text)] transition-colors"
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                const next = new Set(form.selectedBuiltinRuleSetIds);
                                                                                next.delete(id);
                                                                                onFormChange({ selectedBuiltinRuleSetIds: next });
                                                                            }}
                                                                            aria-label="删除"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)] pointer-events-none" />
                                                </div>
                                            )}
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">从内置规则集列表中选择，按类别分组展示</p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">进程名（可选）</label>
                                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onOpenMultiLineEdit('进程名', form.processNames, v => onFormChange({ processNames: v }))}>
                                                    <List className="w-3 h-3 mr-1" />多行编辑
                                                </Button>
                                            </div>
                                            <TagInput value={form.processNames} onChange={v => onFormChange({ processNames: v })} placeholder="Telegram.exe" />
                                        </div>

                                        <div className="border-t border-[rgba(39,44,54,0.06)] pt-4 mt-4">
                                            <p className="text-[11px] text-[var(--app-text-quaternary)] mb-3 pl-1">以下字段通常从配置文件导入，用于精确匹配规则</p>
                                            <div className="space-y-4">
                                                {[
                                                    { label: '域名', value: form.domain, setter: (v: string[]) => onFormChange({ domain: v }) },
                                                    { label: '域名关键词', value: form.domainKeyword, setter: (v: string[]) => onFormChange({ domainKeyword: v }) },
                                                    { label: '域名后缀', value: form.domainSuffix, setter: (v: string[]) => onFormChange({ domainSuffix: v }) },
                                                    { label: '端口', value: form.port, setter: (v: string[]) => onFormChange({ port: v }) },
                                                    { label: 'IP CIDR', value: form.ipCidr, setter: (v: string[]) => onFormChange({ ipCidr: v }) },
                                                    { label: '源 IP CIDR', value: form.sourceIpCidr, setter: (v: string[]) => onFormChange({ sourceIpCidr: v }) },
                                                ].map(({ label, value, setter }) => (
                                                    <div key={label} className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{label}</label>
                                                            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => onOpenMultiLineEdit(label, value, setter)}>
                                                                <List className="w-2.5 h-2.5 mr-0.5" />多行编辑
                                                            </Button>
                                                        </div>
                                                        <TagInput value={value} onChange={setter} placeholder={label === '域名' ? 'google.com' : label === '端口' ? '80, 443' : label === 'IP CIDR' ? '192.168.1.0/24' : '10.0.0.0/8'} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                                <Button variant="ghost" onClick={onClose}>取消</Button>
                                <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>保存</Button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>,
                document.body
            )}

            <PolicyRuleSetModal
                open={showRuleSetModal}
                ruleProviders={ruleProviders}
                selectedIds={form.selectedRuleProviderIds}
                onToggle={toggleRuleSetModalSelection}
                onClose={() => setShowRuleSetModal(false)}
            />

            <PolicyBuiltinRuleSetModal
                open={showBuiltinRuleSetModal}
                builtinRulesets={builtinRulesets}
                selectedIds={form.selectedBuiltinRuleSetIds}
                onToggle={toggleBuiltinRuleSetSelection}
                onClose={() => setShowBuiltinRuleSetModal(false)}
            />

            <PolicyPreferredOutboundModal
                open={showPreferredOutboundModal}
                availableOutbounds={availableOutbounds}
                preferredOutbounds={form.preferredOutbounds}
                onConfirm={tags => onFormChange({ preferredOutbounds: tags })}
                onClose={() => setShowPreferredOutboundModal(false)}
            />
        </>
    );
}
