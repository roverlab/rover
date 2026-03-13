import React from 'react';
import { cn } from '../../components/Sidebar';
import { POLICY_FINAL_OPTIONS } from './utils';

interface PolicyHeaderProps {
    policyFinalOutbound: 'direct_out' | 'block_out' | 'selector_out';
    savingPolicyFinalOutbound: boolean;
    onPolicyFinalOutboundChange: (value: 'direct_out' | 'block_out' | 'selector_out') => void;
}

export function PolicyHeader({
    policyFinalOutbound,
    savingPolicyFinalOutbound,
    onPolicyFinalOutboundChange,
}: PolicyHeaderProps) {
    return (
        <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">策略</h1>
                <p className="page-subtitle">配置分流策略规则，设置未匹配时的默认出站。</p>
            </div>
            <div className="toolbar flex flex-col items-end gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]/60 px-3 py-1.5">
                    <div className="flex flex-col items-end">
                        <span className="text-[12px] font-medium text-[var(--app-text)]">未匹配时的出站</span>
                        <span className="text-[10px] text-[var(--app-text-tertiary)]">无规则命中时使用的默认出口</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {POLICY_FINAL_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                disabled={savingPolicyFinalOutbound}
                                onClick={() => onPolicyFinalOutboundChange(option.value)}
                                className={cn(
                                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
                                    policyFinalOutbound === option.value
                                        ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]"
                                        : "border-[var(--app-stroke)] bg-white/70 text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
