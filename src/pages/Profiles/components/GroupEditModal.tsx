import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MousePointer2, Zap } from 'lucide-react';
import { cn } from '../../../components/Sidebar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Field';
import type { ProxyNode } from '../../../electron';
import { OutboundSelector } from '../../../components/OutboundSelector';

export interface GroupEditData {
    name: string;
    type: 'selector' | 'urltest';
    outbounds: string[];
    /** 用于编辑时记录原始名称（用于判断是否重名） */
    originalName?: string;
}

interface GroupEditModalProps {
    /** 是否显示 */
    open: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 保存回调 */
    onSave: (data: GroupEditData) => void;
    /** 可用节点列表 */
    availableNodes: ProxyNode[];
    /** 编辑模式：添加或编辑 */
    mode: 'add' | 'edit';
    /** 初始数据（编辑模式必填） */
    initialData?: GroupEditData;
    /** 已存在的分组名称列表（用于重名检测） */
    existingNames: string[];
}

export function GroupEditModal({
    open,
    onClose,
    onSave,
    availableNodes,
    mode,
    initialData,
    existingNames,
}: GroupEditModalProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'selector' | 'urltest'>('selector');
    const [outbounds, setOutbounds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const outboundOverride = useMemo(
        () => availableNodes.map(n => ({ tag: n.name, type: n.type })),
        [availableNodes]
    );

    // 初始化数据
    useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialData) {
                setName(initialData.name);
                setType(initialData.type);
                setOutbounds([...initialData.outbounds]);
            } else {
                setName('');
                setType('selector');
                setOutbounds([]);
            }
            setError(null);
        }
    }, [open, mode, initialData]);

    // 验证并保存
    const handleSave = () => {
        const trimmedName = name.trim();

        if (!trimmedName) {
            setError('分组名称不能为空');
            return;
        }
        if (outbounds.length === 0) {
            setError('请至少选择一个节点');
            return;
        }

        // 检查名称重复（编辑模式下排除原名称）
        const originalName = initialData?.originalName || initialData?.name;
        const duplicateCheckNames =
            mode === 'edit' ? existingNames.filter(n => n !== originalName) : existingNames;

        if (duplicateCheckNames.includes(trimmedName)) {
            setError('分组名称已存在');
            return;
        }

        setError(null);
        onSave({
            name: trimmedName,
            type,
            outbounds,
            originalName: mode === 'edit' ? originalName : undefined,
        });
    };

    return createPortal(
        <AnimatePresence>
            {open && (
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
                        className="relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                            <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                {mode === 'add' ? '添加分组' : '编辑分组'}
                            </h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors"
                                aria-label="关闭"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* 类型 - 放在最上面 */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setType('selector')}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 py-1 px-3 rounded-[6px] text-[12px] font-medium transition-all border',
                                        type === 'selector'
                                            ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]'
                                            : 'bg-white border-[var(--app-stroke)] text-[var(--app-text-tertiary)] hover:border-[var(--app-accent-border)]'
                                    )}
                                >
                                    <MousePointer2 className="w-3.5 h-3.5" />
                                    手动选择
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('urltest')}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 py-1 px-3 rounded-[6px] text-[12px] font-medium transition-all border',
                                        type === 'urltest'
                                            ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]'
                                            : 'bg-white border-[var(--app-stroke)] text-[var(--app-text-tertiary)] hover:border-[var(--app-accent-border)]'
                                    )}
                                >
                                    <Zap className="w-3.5 h-3.5" />
                                    自动测速
                                </button>
                            </div>

                            {/* 名称 */}
                            <div className="space-y-1.5">
                                <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">
                                    分组名称
                                </label>
                                <Input
                                    value={name}
                                    onChange={e => {
                                        setName(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="如: 我的分组"
                                />
                            </div>

                            {/* 节点选择（与策略/DNS 共用的 OutboundSelector，多选 + 订阅节点列表覆盖） */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">
                                        选择节点
                                    </span>
                                    {availableNodes.length > 0 && outbounds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                setOutbounds([]);
                                            }}
                                            className="text-[11px] text-[var(--app-accent-strong)] hover:underline"
                                        >
                                            清空
                                        </button>
                                    )}
                                </div>
                                <OutboundSelector
                                    multiple
                                    value={outbounds}
                                    onChange={setOutbounds}
                                    placeholder="点击选择节点..."
                                    hint="与订阅出站选择器一致，支持搜索、延迟与隐藏超时"
                                    filterDirectBlock
                                    disabled={availableNodes.length === 0}
                                    availableOutboundsOverride={outboundOverride}
                                    modalTitle="选择节点"
                                />
                            </div>

                            {/* 错误提示 */}
                            {error && (
                                <div className="text-[12px] text-[var(--app-danger)] bg-[rgba(177,79,94,0.08)] rounded-[8px] px-3 py-2">
                                    {error}
                                </div>
                            )}

                            {/* 无节点提示 */}
                            {availableNodes.length === 0 && (
                                <div className="text-center py-4 text-[var(--app-text-tertiary)] text-[13px]">
                                    当前订阅没有可用节点，请先更新订阅或检查配置
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                            <Button variant="ghost" onClick={onClose}>
                                取消
                            </Button>
                            <Button variant="primary" onClick={handleSave} disabled={availableNodes.length === 0}>
                                {mode === 'add' ? '添加' : '保存'}
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
