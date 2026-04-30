import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Trash2 } from 'lucide-react';

interface PolicyBatchDeleteConfirmModalProps {
    open: boolean;
    count: number;
    onConfirm: () => void;
    onClose: () => void;
}

export function PolicyBatchDeleteConfirmModal({
    open,
    count,
    onConfirm,
    onClose,
}: PolicyBatchDeleteConfirmModalProps) {
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
                    className="relative z-10 w-full max-w-sm flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                            <Trash2 className="w-6 h-6 text-[var(--app-danger)]" />
                        </div>
                        <h3 className="text-[15px] font-semibold text-[var(--app-text)] mb-2">{t('policies.batchDeleteConfirmTitle')}</h3>
                        <p className="text-[13px] text-[var(--app-text-secondary)]">
                            {t('policies.batchDeleteConfirmMessageShort', { count })}
                        </p>
                        <p className="text-[12px] text-[var(--app-text-quaternary)] mt-2">{t('policies.deleteConfirmSubtitle')}</p>
                    </div>

                    <div className="flex items-center gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                        <Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button variant="primary" className="flex-1 bg-[var(--app-danger-soft)]0 hover:bg-red-600" onClick={onConfirm}>
                            {t('policies.confirmDeleteAction')}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
