import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { X, Search } from 'lucide-react';
import { cn } from './Sidebar';

export type OutboundItem = { tag: string; type: string; all?: string[] };

export interface OutboundSelectorModalProps {
    open: boolean;
    availableOutbounds: OutboundItem[];
    preferredOutbound: string | null;
    onConfirm: (tag: string | null) => void;
    onClose: () => void;
}

/**
 * 出站节点选择弹窗 - 单选模式
 */
export function OutboundSelectorModal({
    open,
    availableOutbounds = [],
    preferredOutbound = null,
    onConfirm,
    onClose,
}: OutboundSelectorModalProps) {
    // 1. 使用本地状态，避免每次点击都触发父组件重绘导致弹窗卸载
    const [localSelected, setLocalSelected] = useState<string | null>(null);
    // 搜索关键词
    const [searchQuery, setSearchQuery] = useState('');

    // 2. 每次打开弹窗时，从 props 同步初始选中的值，并清空搜索
    useEffect(() => {
        if (open) {
            setLocalSelected(preferredOutbound);
            setSearchQuery('');
        }
    }, [open, preferredOutbound]);

    // 过滤后的出站节点列表
    const filteredOutbounds = searchQuery.trim()
        ? availableOutbounds.filter(ob => {
            const query = searchQuery.toLowerCase();
            return (
                ob.tag.toLowerCase().includes(query) ||
                ob.type.toLowerCase().includes(query)
            );
        })
        : availableOutbounds;

    const selectOutbound = (tag: string) => {
        setLocalSelected(prev => prev === tag ? null : tag);
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
                        <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择订阅出站节点</h2>
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
                        {/* 搜索框 */}
                        <div className="mb-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-quaternary)]" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="搜索节点名称或类型..."
                                    className="w-full pl-9 pr-3 py-2 text-[13px] rounded-[10px] border border-[rgba(39,44,54,0.12)] bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] focus:outline-none focus:border-[var(--app-accent-border)] hover:border-[rgba(39,44,54,0.18)] transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {filteredOutbounds.map(ob => {
                                const active = localSelected === ob.tag;
                                return (
                                    <div
                                        key={ob.tag}
                                        onClick={() => selectOutbound(ob.tag)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] cursor-pointer transition-all border shrink-0",
                                            active
                                                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft-card)]"
                                                : "border-[var(--app-stroke)] bg-white hover:bg-[var(--app-hover)]"
                                        )}
                                    >
                                        {/* 单选用圆形指示器 */}
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                                            active
                                                ? "border-[var(--app-accent)]"
                                                : "border-[var(--app-stroke-strong)]"
                                        )}>
                                            {active && <div className="w-2 h-2 rounded-full bg-[var(--app-accent)]" />}
                                        </div>
                                        <span className="text-[13px] text-[var(--app-text)]">{ob.tag}</span>
                                        <span className="text-[10px] text-[var(--app-text-quaternary)]">({ob.type})</span>
                                    </div>
                                );
                            })}
                        </div>
                        {filteredOutbounds.length === 0 && (
                            <div className="text-center py-8 text-[var(--app-text-tertiary)] text-[13px]">
                                {searchQuery ? '未找到匹配的节点' : '暂无可用节点'}
                            </div>
                        )}
                    </div>

                    {/* Footer - 固定高度 */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-sidebar)]/30">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] text-[var(--app-text-quaternary)]">
                                {localSelected ? `已选择: ${localSelected}` : '未选择节点'}
                            </span>
                            {localSelected && (
                                <button
                                    type="button"
                                    onClick={() => setLocalSelected(null)}
                                    className="text-[11px] text-[var(--app-text-tertiary)] hover:text-red-500 transition-colors"
                                >
                                    清除选择
                                </button>
                            )}
                        </div>
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
