import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { X, Check } from 'lucide-react';
import { cn } from '../../components/Sidebar';

type OutboundItem = { tag: string; type: string; all?: string[] };

interface PolicyPreferredOutboundModalProps {
    open: boolean;
    availableOutbounds: OutboundItem[];
    preferredOutbounds: string[];
    onConfirm: (tags: string[]) => void;
    onClose: () => void;
}

/**
 * 订阅优先选择节点 - 全屏选择弹窗（与自定义规则集全屏按钮通用风格）
 */
export function PolicyPreferredOutboundModal({
    open,
    availableOutbounds,
    preferredOutbounds,
    onConfirm,
    onClose,
}: PolicyPreferredOutboundModalProps) {
    const toggleOutbound = (tag: string) => {
        if (preferredOutbounds.includes(tag)) {
            onConfirm(preferredOutbounds.filter(t => t !== tag));
        } else {
            onConfirm([...preferredOutbounds, tag]);
        }
    };

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
                    className="relative z-10 w-full max-w-2xl flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择优先节点</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                            aria-label="关闭"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 p-6 max-h-[60vh] overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                            {availableOutbounds.map(ob => (
                                <label
                                    key={ob.tag}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer hover:bg-[var(--app-hover)] transition-colors border shrink-0",
                                        preferredOutbounds.includes(ob.tag)
                                            ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft-card)]"
                                            : "border-[var(--app-stroke)] bg-white"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                        preferredOutbounds.includes(ob.tag)
                                            ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                            : "border-[var(--app-stroke-strong)]"
                                    )}>
                                        {preferredOutbounds.includes(ob.tag) && (
                                            <Check className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                    <span className="text-[13px] text-[var(--app-text)] truncate">{ob.tag}</span>
                                    <span className="text-[10px] text-[var(--app-text-quaternary)]">({ob.type})</span>
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={preferredOutbounds.includes(ob.tag)}
                                        onChange={() => toggleOutbound(ob.tag)}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                        <span className="text-[12px] text-[var(--app-text-quaternary)]">
                            已选择 {preferredOutbounds.length} 个节点，按顺序优先连接
                        </span>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose}>取消</Button>
                            <Button variant="primary" onClick={onClose}>确定</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
