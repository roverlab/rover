/**
  * 高级规则编辑器组件
 * 从策略编辑中提取，供策略和规则集共用
 * 统一使用 RuleTreeNode 格式，保存为 RouteLogicRule
 */
import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useNotificationState, NotificationList } from '../ui/Notification';
import type { RuleTreeNode, LogicGroup, RuleFieldConfig } from './types';
import { isLogicGroup } from './types';
import { getDefaultRuleTreeNode, countRuleTreeNodes } from './ruleFieldsUtils';
import {
    ruleTreeNodeToSingboxLogical,
    singboxLogicalToRuleTreeNodeRoot,
} from './ruleTreeNodeConversion';
import { NativeStyleRuleEditor } from './NativeStyleRuleEditor';
import { RULE_FIELD_CONFIG } from './ruleFieldConfig';
import type { RouteLogicRule } from '../../types/singbox';

export interface AdvancedRuleEditorProps {
    /** 是否打开 */
    open: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 确认回调，返回 RouteLogicRule */
    onConfirm: (logicRule: RouteLogicRule | null) => void;
    /** 初始逻辑规则 */
    initialLogicRule?: RouteLogicRule | null;
    /** 弹窗标题 */
    title?: string;
    /** 字段配置，默认使用 RULE_FIELD_CONFIG */
    fieldConfig?: RuleFieldConfig[];
}

/**
 * 将 RouteLogicRule 转换为 RuleTreeNode
 */
function logicRuleToRuleTreeNode(logicRule: RouteLogicRule | null | undefined): RuleTreeNode | null {
    if (!logicRule) return null;
    return singboxLogicalToRuleTreeNodeRoot(logicRule);
}

/**
 * 将 RuleTreeNode 转换为 RouteLogicRule
 */
function ruleTreeNodeToLogicRule(node: RuleTreeNode | null): RouteLogicRule | null {
    if (!node) return null;
    return ruleTreeNodeToSingboxLogical(node);
}

export function AdvancedRuleEditor({
    open,
    onClose,
    onConfirm,
    initialLogicRule,
    title,
    fieldConfig = RULE_FIELD_CONFIG,
}: AdvancedRuleEditorProps) {
    const { t } = useTranslation();
    const defaultTitle = title ?? t('common.ruleEditor');
    const { notifications, addNotification, removeNotification } = useNotificationState();

    // Visual mode state
    const getInitialNode = useCallback((): RuleTreeNode => {
        const node = logicRuleToRuleTreeNode(initialLogicRule);
        if (node) return node;
        return getDefaultRuleTreeNode();
    }, [initialLogicRule]);

    const [node, setNode] = useState<RuleTreeNode>(getInitialNode);

    // Reset state when open
    useEffect(() => {
        if (open) {
            const initialNode = logicRuleToRuleTreeNode(initialLogicRule);
            setNode(initialNode || getDefaultRuleTreeNode());
        }
    }, [open, initialLogicRule]);

    const handleNodeChange = useCallback((path: string, newNode: RuleTreeNode) => {
        setNode(prevNode => setNodeAtPath(prevNode, path, newNode));
    }, []);

    const handleRemoveNode = useCallback((path: string) => {
        setNode(prevNode => {
            const parts = path ? path.split(',').map(Number) : [];
            if (parts.length === 0) return prevNode;
            const idx = parts.pop()!;
            const parentPath = parts.join(',');
            const parent = parentPath ? getNodeAtPath(prevNode, parentPath) : prevNode;
            if (!parent || !isLogicGroup(parent)) return prevNode;
            const newRules = parent.rules.filter((_, i) => i !== idx);
            return setNodeAtPath(prevNode, parentPath, {
                ...parent,
                rules: newRules.length ? newRules : [{ id: crypto.randomUUID(), type: 'domain', value: '' }],
            });
        });
    }, []);

    const handleConfirm = () => {
        const logicRule = ruleTreeNodeToLogicRule(node);
        onConfirm(logicRule);
    };

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
                            className="relative z-10 my-4 w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
                                <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                                    {defaultTitle}
                                </h2>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors"
                                    aria-label={t('common.close')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                <div className="flex-1 p-6 overflow-y-auto bg-[var(--app-bg)]/30">
                                    <NativeStyleRuleEditor
                                        node={node}
                                        path=""
                                        onNodeChange={handleNodeChange}
                                        onRemoveNode={handleRemoveNode}
                                        stringFields={fieldConfig}
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
                                                    addNotification(t('common.jsonCopied'));
                                                } catch (err: any) {
                                                    addNotification(t('common.copyFailed', { error: err?.message || 'Unknown' }), 'error');
                                                }
                                            }}
                                            className="text-[11px] font-medium px-3 py-1.5 rounded-[8px] bg-[var(--app-accent-soft)] hover:bg-[var(--app-accent-soft-card)] text-[var(--app-accent-strong)] border border-[var(--app-accent-border)] transition"
                                        >
                                            {t('common.copy')}
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
                                        {t('common.totalRules', { count: groupCount })}
                                    </span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={onClose}>
                                        {t('common.cancel')}
                                    </Button>
                                    <Button variant="primary" size="sm" onClick={handleConfirm}>
                                        {t('common.confirm')}
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

// --- 路径操作工具函数 ---

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

export default AdvancedRuleEditor;
