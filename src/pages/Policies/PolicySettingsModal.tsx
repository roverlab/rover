import React from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Ban, ArrowRightCircle, HelpCircle } from 'lucide-react';
import { cn } from '../../components/Sidebar';
import { POLICY_FINAL_OPTION_DEFS } from '../../types/policy';

interface PolicySettingsModalProps {
    open: boolean;
    policyFinalOutbound: 'direct_out' | 'block_out' | 'selector_out';
    saving: boolean;
    onClose: () => void;
    onPolicyFinalOutboundChange: (value: 'direct_out' | 'block_out' | 'selector_out') => void;
}

const outboundIcons = {
    direct_out: Globe,
    block_out: Ban,
    selector_out: ArrowRightCircle,
};

const outboundColors = {
    direct_out: {
        selected: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        icon: 'text-emerald-500',
    },
    block_out: {
        selected: 'border-red-300 bg-red-50 text-red-700',
        icon: 'text-red-500',
    },
    selector_out: {
        selected: 'border-blue-300 bg-blue-50 text-blue-700',
        icon: 'text-blue-500',
    },
};

export function PolicySettingsModal({
    open,
    policyFinalOutbound,
    saving,
    onClose,
    onPolicyFinalOutboundChange,
}: PolicySettingsModalProps) {
    const { t } = useTranslation();

    const handleOutboundChange = (value: 'direct_out' | 'block_out' | 'selector_out') => {
        onPolicyFinalOutboundChange(value);
        onClose();
    };

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
                    className="relative z-10 w-full max-w-md flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                            {t('policies.settingsTitle')}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label={t('common.close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* Section Header */}
                        <div>
                            <div className="text-[14px] font-medium text-[var(--app-text)]">
                                {t('policies.finalOutbound.label')}
                            </div>
                            <p className="mt-1 text-[12px] text-[var(--app-text-tertiary)] leading-relaxed">
                                {t('policies.finalOutbound.description')}
                            </p>
                        </div>

                        {/* Options as Cards */}
                        <div className="space-y-2">
                            {POLICY_FINAL_OPTION_DEFS.map(option => {
                                const Icon = outboundIcons[option.value];
                                const colors = outboundColors[option.value];
                                const isSelected = policyFinalOutbound === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={saving}
                                        onClick={() => handleOutboundChange(option.value)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border-2 transition-all text-left",
                                            isSelected
                                                ? colors.selected
                                                : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)] text-[var(--app-text-secondary)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                                            isSelected ? "bg-white/60" : "bg-[var(--app-bg-secondary)]"
                                        )}>
                                            <Icon className={cn("w-4 h-4", isSelected ? colors.icon : "text-[var(--app-text-tertiary)]")} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium">
                                                {t(option.labelKey)}
                                            </div>
                                            <div className="text-[11px] opacity-70 mt-0.5">
                                                {t(`policies.finalOutbound.${option.value}Desc` as any)}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className={cn(
                                                "shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                                                "bg-current/20"
                                            )}>
                                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                                                    <path d="M10.28 2.28L4.5 8.06 1.72 5.28a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l6.5-6.5a.75.75 0 00-1.06-1.06z" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Help hint */}
                        <div className="flex items-start gap-2 pt-2 px-1">
                            <HelpCircle className="w-3.5 h-3.5 text-[var(--app-text-quaternary)] shrink-0 mt-0.5" />
                            <p className="text-[11px] text-[var(--app-text-quaternary)] leading-relaxed">
                                {t('policies.finalOutbound.hint')}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
