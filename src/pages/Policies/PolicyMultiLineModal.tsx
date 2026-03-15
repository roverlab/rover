import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { X } from 'lucide-react';

interface PolicyMultiLineModalProps {
    open: boolean;
    title: string;
    value: string;
    onValueChange: (v: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function PolicyMultiLineModal({
    open,
    title,
    value,
    onValueChange,
    onConfirm,
    onClose,
}: PolicyMultiLineModalProps) {
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
                    className="relative z-10 w-full max-w-lg flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                            编辑{title}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label="关闭"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 p-6">
                        <p className="text-[12px] text-[var(--app-text-tertiary)] mb-2">
                            每行输入一个值，确定后将更新到标签列表
                        </p>
                        <textarea
                            value={value}
                            onChange={e => onValueChange(e.target.value)}
                            className="w-full h-64 px-3 py-2 text-[13px] text-left border border-[rgba(39,44,54,0.12)] rounded-[10px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)]"
                            placeholder={`每行输入一个${title}...`}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                        <Button variant="ghost" onClick={onClose}>取消</Button>
                        <Button variant="primary" onClick={onConfirm}>确定</Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
