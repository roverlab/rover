import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../components/Sidebar';
import { POLICY_FINAL_OPTION_DEFS } from '../../types/policy';

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
    const { t } = useTranslation();
    
    return (
        <div className="page-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div>
                <h1 className="page-title">{t('policies.title')}</h1>
                <p className="page-subtitle">{t('policies.subtitle')}</p>
            </div>
            <div className="toolbar flex flex-col items-end gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]/60 px-3 py-1.5">
                    <div className="flex flex-col items-end">
                        <span className="text-[12px] font-medium text-[var(--app-text)]">{t('policies.finalOutbound.label')}</span>
                        <span className="text-[10px] text-[var(--app-text-tertiary)]">{t('policies.finalOutbound.description')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {POLICY_FINAL_OPTION_DEFS.map(option => (
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
                                {t(option.labelKey)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
