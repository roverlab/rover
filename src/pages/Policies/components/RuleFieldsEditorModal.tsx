import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useNotificationState, NotificationList } from '../../../components/ui/Notification';
import type { RuleFieldsEditorProps, RuleTreeNode, LogicGroup, LeafRule } from '../types/ruleFields';
import { isLogicGroup, isLeafRule } from '../types/ruleFields';
import type { RuleFieldConfig } from '../types/ruleFields';
import { getDefaultRuleTreeNode, countRuleTreeNodes } from '../utils/ruleFieldsUtils';
import {
    ruleTreeNodeToSingboxLogical,
    singboxLogicalToRuleTreeNodeRoot,
    legacyLogicNodeToRuleTreeNode,
    isLegacyLogicNode,
} from '../utils/ruleTreeNodeConversion';
import { NativeStyleRuleEditor } from './NativeStyleRuleEditor';

const LOGIC_OPTIONS: { value: 'all' | 'any' | 'not'; label: string }[] = [
    { value: 'all', label: '符合全部' },
    { value: 'any', label: '符合任一' },
    { value: 'not', label: '不符合' },
];

interface RuleFieldsEditorModalProps extends RuleFieldsEditorProps {
    open: boolean;
    onClose: () => void;
    formConfig: RuleFieldConfig[];
    /** 弹窗标题，默认「规则集编辑器」 */
    title?: string;
    /** 点击确定按钮时的回调，如果不传则默认关闭弹窗 */
    onConfirm?: () => void;
}

export function RuleFieldsEditorModal({
    form,
    onFormChange,
    open,
    onClose,
    formConfig,
    title = '规则集编辑器',
    onConfirm,
}: RuleFieldsEditorModalProps) {
    const { notifications, addNotification, removeNotification } = useNotificationState();

    const getTreeNode = useCallback((): RuleTreeNode => {
        const raw = form?.ruleGroupsTree as RuleTreeNode | undefined;
        if (!raw) return getDefaultRuleTreeNode();
        if (isLegacyLogicNode(raw)) return legacyLogicNodeToRuleTreeNode(raw);
        if (isLogicGroup(raw) || isLeafRule(raw)) return raw;
        return getDefaultRuleTreeNode();
    }, [form?.ruleGroupsTree]);

    const [node, setNode] = useState<RuleTreeNode>(getTreeNode);

    useEffect(() => {
        if (open) setNode(getTreeNode());
    }, [open, getTreeNode]);

    const handleNodeChange = useCallback(
        (path: string, newNode: RuleTreeNode) => {
            setNode(prevNode => {
                const next = setNodeAtPath(prevNode, path, newNode);
                onFormChange({ ruleGroupsTree: next });
                return next;
            });
        },
        [onFormChange]
    );

    const handleRemoveNode = useCallback(
        (path: string) => {
            setNode(prevNode => {
                const parts = path ? path.split(',').map(Number) : [];
                if (parts.length === 0) return prevNode;
                const idx = parts.pop()!;
                const parentPath = parts.join(',');
                const parent = parentPath ? getNodeAtPath(prevNode, parentPath) : prevNode;
                if (!parent || !isLogicGroup(parent)) return prevNode;
                const newRules = parent.rules.filter((_, i) => i !== idx);
                const next = setNodeAtPath(prevNode, parentPath, {
                    ...parent,
                    rules: newRules.length ? newRules : [{ id: crypto.randomUUID(), type: 'domain', value: '' }],
                });
                onFormChange({ ruleGroupsTree: next });
                return next;
            });
        },
        [onFormChange]
    );

    const groupCount = countRuleTreeNodes(node);
    const jsonPreview = ruleTreeNodeToSingboxLogical(node);

    return createPortal(
        <>
            <NotificationList notifications={notifications} onRemove={removeNotification} />
            <AnimatePresence>
                {open && (
                    <div className="fixed inset-0 z-[500] flex items-center justify-center overflow-y-auto p-4">
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
                        className="relative z-10 my-4 w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border border-[rgba(39,44,54,0.08)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[rgba(39,44,54,0.06)] bg-[var(--app-bg-secondary)]/50">
                            <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                {title}
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors"
                                    aria-label="关闭"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content: Editor + Preview */}
                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            <div className="flex-1 p-6 overflow-y-auto bg-[var(--app-bg)]/30">
                                <NativeStyleRuleEditor
                                    node={node}
                                    path=""
                                    onNodeChange={handleNodeChange}
                                    onRemoveNode={handleRemoveNode}
                                    stringFields={formConfig}
                                    isRoot={true}
                                />
                            </div>

                            <aside className="w-[320px] shrink-0 border-l border-[var(--app-stroke)] flex flex-col bg-[var(--app-panel-soft)]/50 min-h-0">
                                <div className="px-4 py-2 border-b border-[var(--app-divider)] flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-mono text-[var(--app-text-quaternary)] uppercase tracking-wider">
                                        Preview
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(
                                                    JSON.stringify(jsonPreview, null, 2)
                                                );
                                                addNotification('JSON预览已复制到剪贴板');
                                            } catch (err: any) {
                                                addNotification(`复制失败: ${err?.message || '未知错误'}`, 'error');
                                            }
                                        }}
                                        className="text-[11px] font-medium px-3 py-1.5 rounded-[8px] bg-[var(--app-accent-soft)] hover:bg-[var(--app-accent-soft-card)] text-[var(--app-accent-strong)] border border-[var(--app-accent-border)] transition"
                                    >
                                        复制
                                    </button>
                                </div>
                                <pre className="flex-1 p-4 text-[12px] text-[var(--app-text-secondary)] overflow-auto font-mono leading-relaxed">
                                    {jsonPreview
                                        ? JSON.stringify(jsonPreview, null, 4)
                                        : '{}'}
                                </pre>
                            </aside>
                        </div>

                        {/* Footer */}
                        <div className="flex shrink-0 items-center justify-between px-6 py-3 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
                            <span className="text-[11px] text-[var(--app-text-quaternary)]">
                                共 {groupCount} 个规则
                            </span>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={onClose}>
                                    取消
                                </Button>
                                <Button variant="primary" size="sm" onClick={onConfirm || onClose}>
                                    确定
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
            </AnimatePresence>
        </>,
        document.body
    );
}

// --- 路径操作 ---

function getNodeAtPath(root: RuleTreeNode, path: string): RuleTreeNode | null {
    if (!path) return root;
    const indices = path.split(',').map(Number);
    let cur: RuleTreeNode = root;
    for (const i of indices) {
        if (!isLogicGroup(cur)) return null;
        cur = cur.rules[i];
        if (!cur) return null;
    }
    return cur;
}

function setNodeAtPath(root: RuleTreeNode, path: string, newNode: RuleTreeNode): RuleTreeNode {
    if (!path) return newNode;
    const indices = path.split(',').map(Number);

    const replaceAt = (n: RuleTreeNode, idxs: number[]): RuleTreeNode => {
        if (idxs.length === 1) {
            if (!isLogicGroup(n)) return n;
            const rules = [...n.rules];
            rules[idxs[0]] = newNode;
            return { ...n, rules };
        }
        const [i, ...rest] = idxs;
        if (!isLogicGroup(n)) return n;
        const rules = [...n.rules];
        rules[i] = replaceAt(rules[i], rest);
        return { ...n, rules };
    };

    return replaceAt(JSON.parse(JSON.stringify(root)), indices);
}
