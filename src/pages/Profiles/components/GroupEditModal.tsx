import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Check, MousePointer2, Zap, ChevronDown } from 'lucide-react';
import { cn } from '../../../components/Sidebar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Field';
import type { ProxyNode } from '../../../electron';

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

    // 节点选择弹窗状态
    const [showNodePicker, setShowNodePicker] = useState(false);
    const [nodeSearchQuery, setNodeSearchQuery] = useState('');
    const [tempOutbounds, setTempOutbounds] = useState<string[]>([]);

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

    // 打开节点选择弹窗
    const openNodePicker = () => {
        setTempOutbounds([...outbounds]);
        setNodeSearchQuery('');
        setShowNodePicker(true);
    };

    // 关闭节点选择弹窗
    const closeNodePicker = () => {
        setShowNodePicker(false);
        setNodeSearchQuery('');
    };

    // 确认节点选择
    const confirmNodeSelection = () => {
        setOutbounds(tempOutbounds);
        closeNodePicker();
    };

    // 过滤节点搜索结果
    const filteredNodes = useMemo(() => {
        if (!nodeSearchQuery.trim()) return availableNodes;
        const query = nodeSearchQuery.toLowerCase();
        return availableNodes.filter(n =>
            n.name.toLowerCase().includes(query) ||
            n.type.toLowerCase().includes(query)
        );
    }, [availableNodes, nodeSearchQuery]);

    // 切换节点选择（在弹窗中）
    const toggleNode = (nodeName: string) => {
        setTempOutbounds(prev => {
            if (prev.includes(nodeName)) {
                return prev.filter(n => n !== nodeName);
            } else {
                return [...prev, nodeName];
            }
        });
    };

    // 全选/取消全选（在弹窗中，只针对当前显示的节点）
    const toggleSelectAll = () => {
        const filteredNodeNames = filteredNodes.map(n => n.name);
        const allFilteredSelected = filteredNodeNames.every(name => tempOutbounds.includes(name));

        if (allFilteredSelected) {
            // 取消全选当前显示的节点
            setTempOutbounds(prev => prev.filter(name => !filteredNodeNames.includes(name)));
        } else {
            // 全选当前显示的节点
            setTempOutbounds(prev => {
                const newSelection = [...prev];
                filteredNodeNames.forEach(name => {
                    if (!newSelection.includes(name)) {
                        newSelection.push(name);
                    }
                });
                return newSelection;
            });
        }
    };

    // 移除已选节点
    const removeNode = (nodeName: string) => {
        setOutbounds(prev => prev.filter(n => n !== nodeName));
    };

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
        const duplicateCheckNames = mode === 'edit'
            ? existingNames.filter(n => n !== originalName)
            : existingNames;

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
                                        "inline-flex items-center gap-1.5 py-1 px-3 rounded-[6px] text-[12px] font-medium transition-all border",
                                        type === 'selector'
                                            ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                                            : "bg-white border-[var(--app-stroke)] text-[var(--app-text-tertiary)] hover:border-[var(--app-accent-border)]"
                                    )}
                                >
                                    <MousePointer2 className="w-3.5 h-3.5" />
                                    手动选择
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('urltest')}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 py-1 px-3 rounded-[6px] text-[12px] font-medium transition-all border",
                                        type === 'urltest'
                                            ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-strong)]"
                                            : "bg-white border-[var(--app-stroke)] text-[var(--app-text-tertiary)] hover:border-[var(--app-accent-border)]"
                                    )}
                                >
                                    <Zap className="w-3.5 h-3.5" />
                                    自动测速
                                </button>
                            </div>

                            {/* 名称 */}
                            <div className="space-y-1.5">
                                <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">分组名称</label>
                                <Input
                                    value={name}
                                    onChange={e => {
                                        setName(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="如: 我的分组"
                                />
                            </div>

                            {/* 节点选择 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">
                                        选择节点
                                    </label>
                                    {availableNodes.length > 0 && outbounds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOutbounds([]);
                                            }}
                                            className="text-[11px] text-[var(--app-accent-strong)] hover:underline"
                                        >
                                            清空
                                        </button>
                                    )}
                                </div>

                                {/* 已选节点展示 + 点击打开选择弹窗 */}
                                <div
                                    onClick={openNodePicker}
                                    className={cn(
                                        "flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-[10px] bg-white border transition-colors cursor-pointer",
                                        outbounds.length === 0
                                            ? "text-[var(--app-text-quaternary)] border-[var(--app-stroke)] hover:border-[var(--app-text-tertiary)]"
                                            : "border-[var(--app-stroke)] hover:border-[var(--app-accent)]"
                                    )}
                                >
                                    <div className="flex items-center gap-2 flex-wrap py-2">
                                        {outbounds.length > 0 ? (
                                            <>
                                                {/* 显示前3个选中项 */}
                                                {outbounds.slice(0, 3).map(nodeName => (
                                                    <span
                                                        key={nodeName}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] bg-[#f3f4f6] text-[var(--app-text)] rounded-[6px] border border-[#e5e7eb]"
                                                    >
                                                        <span className="max-w-[100px] truncate">{nodeName}</span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeNode(nodeName);
                                                            }}
                                                            className="text-[var(--app-text-tertiary)] hover:text-[var(--app-danger)] transition-colors"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                                {/* 显示 +N 更多 */}
                                                {outbounds.length > 3 && (
                                                    <span className="text-[12px] text-[var(--app-text-tertiary)]">
                                                        +{outbounds.length - 3} 更多
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-[13px]">点击选择节点...</span>
                                        )}
                                    </div>
                                    {/* 下拉图标 */}
                                    <ChevronDown className="w-4 h-4 text-[var(--app-text-tertiary)] shrink-0" />
                                </div>
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

                    {/* 节点选择弹窗 */}
                    {showNodePicker && (
                        <NodePickerModal
                            availableNodes={availableNodes}
                            filteredNodes={filteredNodes}
                            tempOutbounds={tempOutbounds}
                            nodeSearchQuery={nodeSearchQuery}
                            setNodeSearchQuery={setNodeSearchQuery}
                            toggleNode={toggleNode}
                            toggleSelectAll={toggleSelectAll}
                            onClose={closeNodePicker}
                            onConfirm={confirmNodeSelection}
                        />
                    )}
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

// 节点选择弹窗组件
interface NodePickerModalProps {
    availableNodes: ProxyNode[];
    filteredNodes: ProxyNode[];
    tempOutbounds: string[];
    nodeSearchQuery: string;
    setNodeSearchQuery: (query: string) => void;
    toggleNode: (nodeName: string) => void;
    toggleSelectAll: () => void;
    onClose: () => void;
    onConfirm: () => void;
}

function NodePickerModal({
    availableNodes,
    filteredNodes,
    tempOutbounds,
    nodeSearchQuery,
    setNodeSearchQuery,
    toggleNode,
    toggleSelectAll,
    onClose,
    onConfirm,
}: NodePickerModalProps) {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
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
                className="relative z-10 w-full max-w-md max-h-[80vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                    <h2 className="text-[15px] font-semibold text-[var(--app-text)]">选择节点</h2>
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
                <div className="flex-1 overflow-hidden flex flex-col">
                    {/* 搜索框 */}
                    <div className="p-4 border-b border-[rgba(39,44,54,0.06)]">
                        <div className="flex items-center h-[40px] px-3 rounded-[10px] bg-white border border-[var(--app-stroke)] focus-within:border-[var(--app-accent)] transition-colors">
                            <Search className="w-4 h-4 text-[var(--app-text-tertiary)] shrink-0 mr-2" />
                            <input
                                type="text"
                                value={nodeSearchQuery}
                                onChange={e => setNodeSearchQuery(e.target.value)}
                                placeholder="搜索节点..."
                                className="flex-1 h-full bg-transparent text-[13px] text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] outline-none border-none appearance-none focus-visible:outline-none focus-visible:shadow-none"
                                style={{ boxShadow: 'none' }}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* 节点列表 */}
                    <div className="flex-1 overflow-y-auto p-2">
                        {filteredNodes.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {filteredNodes.map(node => (
                                    <button
                                        key={node.name}
                                        onClick={() => toggleNode(node.name)}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-left transition-all border",
                                            tempOutbounds.includes(node.name)
                                                ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-border)]"
                                                : "bg-white border-[var(--app-stroke)] hover:border-[var(--app-accent-border)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0",
                                            tempOutbounds.includes(node.name)
                                                ? "bg-[var(--app-accent)] border-[var(--app-accent)]"
                                                : "border-[var(--app-stroke)]"
                                        )}>
                                            {tempOutbounds.includes(node.name) && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span className={cn(
                                            "flex-1 text-[13px] truncate",
                                            tempOutbounds.includes(node.name)
                                                ? "text-[var(--app-accent-strong)]"
                                                : "text-[var(--app-text)]"
                                        )}>
                                            {node.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-32 text-[var(--app-text-tertiary)] text-[13px]">
                                未找到匹配的节点
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/30">
                    <div className="text-[12px] text-[var(--app-text-tertiary)]">
                        已选择 {tempOutbounds.length} 个节点
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-[12px] text-[var(--app-accent-strong)] hover:underline px-2"
                        >
                            {tempOutbounds.length === availableNodes.length ? '取消全选' : '全选'}
                        </button>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            取消
                        </Button>
                        <Button variant="primary" size="sm" onClick={onConfirm}>
                            确定
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
