import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Server, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DnsUnmatchedServerModalProps {
    open: boolean;
    dnsServers: Array<{ id: string; name?: string }>;
    currentServer: string;
    onClose: () => void;
    onConfirm: (serverId: string) => void;
}

/**
 * DNS未匹配服务器选择弹窗 - 一行一个单选卡片风格，参考 PolicySettingsModal
 */
export function DnsUnmatchedServerModal({
    open,
    dnsServers,
    currentServer,
    onClose,
    onConfirm,
}: DnsUnmatchedServerModalProps) {
    const { t } = useTranslation();
    const [localSelected, setLocalSelected] = useState<string>(currentServer);

    useEffect(() => {
        if (!open) return;
        setLocalSelected(currentServer);
    }, [open, currentServer]);

    const handleSelect = (serverId: string) => {
        setLocalSelected(serverId);
        onConfirm(serverId);
        onClose();
    };

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                {/* 背景遮罩 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* 弹窗主体 */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-md flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                            {t('dnsPolicies.unmatchedServer.label')}
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
                    <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                        {/* Section description */}
                        <div>
                            <p className="text-[12px] text-[var(--app-text-tertiary)] leading-relaxed">
                                {t('dnsPolicies.unmatchedServer.description')}
                            </p>
                        </div>

                        {/* Options as Cards - one per row */}
                        <div className="space-y-2">
                            {dnsServers.map(server => {
                                const isSelected = localSelected === server.id;
                                return (
                                    <button
                                        key={server.id}
                                        type="button"
                                        onClick={() => handleSelect(server.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border-2 transition-all text-left",
                                            isSelected
                                                ? "border-blue-400/60 bg-blue-500/10 text-blue-400 dark:text-blue-300"
                                                : "border-[var(--app-stroke)] bg-[var(--app-panel)] hover:bg-[var(--app-hover)] text-[var(--app-text-secondary)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                                            isSelected ? "bg-[var(--app-panel)]/60" : "bg-[var(--app-bg-secondary)]"
                                        )}>
                                            <Server className={cn("w-4 h-4", isSelected ? "text-blue-500 dark:text-blue-400" : "text-[var(--app-text-tertiary)]")} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium truncate">
                                                {server.name || server.id}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-current/20">
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
                                {t('dnsPolicies.unmatchedServer.hint')}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
