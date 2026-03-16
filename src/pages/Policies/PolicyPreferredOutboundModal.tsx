import React, { useState, useEffect } from 'react';
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
 * 订阅优先选择节点 - 完整修复版
 * 解决了高度塌陷、点击丢失元素以及 CSS 变量对齐问题
 */
export function PolicyPreferredOutboundModal({
    open,
    availableOutbounds = [],
    preferredOutbounds = [],
    onConfirm,
    onClose,
}: PolicyPreferredOutboundModalProps) {
    // 1. 使用本地状态，避免每次点击都触发父组件重绘导致弹窗卸载
    const [localSelected, setLocalSelected] = useState<string[]>([]);

    // 2. 每次打开弹窗时，从 props 同步初始选中的值
    useEffect(() => {
        if (open) {
            setLocalSelected(preferredOutbounds);
        }
    }, [open, preferredOutbounds]);

    const toggleOutbound = (tag: string) => {
        setLocalSelected(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleConfirm = () => {
        onConfirm(localSelected); // 只有点确定才提交最终结果
        onClose();
    };

    if (!open) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
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
                    className="relative z-10 w-full max-w-2xl flex flex-col bg-white border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-window)] overflow-hidden"
                    style={{ 
                        minHeight: '320px', // 设定最小高度，解决节点少时的塌陷感
                        maxHeight: '85vh',  // 限制弹窗整体最大高度
                        WebkitAppRegion: 'no-drag' 
                    } as React.CSSProperties}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header - 固定高度 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-sidebar)]/50">
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择优先节点</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content - 滚动区域 */}
                    <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-white">
                        <div className="flex flex-wrap gap-2">
                            {availableOutbounds.map(ob => {
                                const active = localSelected.includes(ob.tag);
                                return (
                                    <div
                                        key={ob.tag}
                                        onClick={() => toggleOutbound(ob.tag)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer transition-all border shrink-0",
                                            active
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)]"
                                                : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                                            active
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                                : "border-[var(--app-stroke-strong)]"
                                        )}>
                                            {active && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-[13px] text-[var(--app-text)]">{ob.tag}</span>
                                        <span className="text-[10px] text-[var(--app-text-quaternary)]">({ob.type})</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer - 固定高度 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-sidebar)]/30">
                        <span className="text-[12px] text-[var(--app-text-quaternary)]">
                            已选择 {localSelected.length} 个节点，按顺序优先连接
                        </span>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose}>取消</Button>
                            <Button variant="primary" onClick={handleConfirm}>确定</Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}