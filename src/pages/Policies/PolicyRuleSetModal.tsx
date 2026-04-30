import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RuleProvider } from '../../types/rule-providers';

interface PolicyRuleSetModalProps {
    open: boolean;
    ruleProviders: RuleProvider[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onClose: () => void;
}

export function PolicyRuleSetModal({
    open,
    ruleProviders,
    selectedIds,
    onToggle,
    onClose,
}: PolicyRuleSetModalProps) {
    const { t } = useTranslation();
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
                    className="relative z-10 w-full max-w-2xl flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">{t('policies.ruleSetPickerTitle')}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label={t('common.close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 p-6 max-h-[60vh] overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                            {ruleProviders.map(provider => (
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
                                    <span className="text-[13px] text-[var(--app-text)]">{provider.name}</span>
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
                    </div>

                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                        <Button variant="primary" onClick={onClose}>{t('common.confirm')}</Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
