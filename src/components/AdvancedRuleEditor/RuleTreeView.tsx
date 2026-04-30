import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleTreeNode, LogicGroup, LeafRule } from './types';
import { isLogicGroup } from './types';
import type { RuleFieldConfig } from './types';

const THEMES = {
    all: {
        bg: 'bg-blue-50/50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-600',
    },
    any: {
        bg: 'bg-violet-50/50',
        border: 'border-violet-200',
        text: 'text-violet-700',
        badge: 'bg-violet-600',
    },
    not: {
        bg: 'bg-[var(--app-danger-soft)]/50',
        border: 'border-[var(--app-danger)]/30',
        text: 'text-[var(--app-danger)]',
        badge: 'bg-red-600',
    },
    leaf: {
        bg: 'bg-background',
        border: 'border-border',
        text: 'text-foreground',
        badge: '',
    },
} as const;

interface RuleTreeViewProps {
    node?: RuleTreeNode | null;
    formConfig?: RuleFieldConfig[];
}

function getFieldLabel(formKey: string, formConfig: RuleFieldConfig[] | undefined, t: (key: string) => string): string {
    if (!formConfig) return formKey;
    const config = formConfig.find(c => c.formKey === formKey);
    return config ? t(config.label) : formKey;
}

function RuleTreeNodeView({
    node,
    formConfig,
    t,
}: {
    node: RuleTreeNode;
    formConfig?: RuleFieldConfig[];
    t: (key: string) => string;
}) {
    const isGroup = isLogicGroup(node);
    const theme = isGroup
        ? THEMES[(node as LogicGroup).type] ?? THEMES.leaf
        : THEMES.leaf;

    if (isGroup) {
        const groupNode = node as LogicGroup;
        return <GroupView groupNode={groupNode} theme={theme} formConfig={formConfig} t={t} />;
    }

    const leafNode = node as LeafRule;
    const typeLabel = getFieldLabel(leafNode.type, formConfig, t);

    return (
        <div
            className={`flex items-center justify-between p-3 rounded-lg border shadow-sm ${theme.bg} ${theme.border} cursor-default`}
        >
            <div className="flex items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 min-w-[5rem] w-auto pr-4 break-keep whitespace-nowrap">
                    {typeLabel}
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight text-foreground break-all">
                    {leafNode.value || '—'}
                </span>
            </div>
            <div className="w-2 h-2 rounded-full bg-muted shrink-0 ml-4" />
        </div>
    );
}

function GroupView({
    groupNode,
    theme,
    formConfig,
    t,
}: {
    groupNode: LogicGroup;
    theme: (typeof THEMES)[keyof typeof THEMES];
    formConfig?: RuleFieldConfig[];
    t: (key: string) => string;
}) {
    return (
        <div
            className={`rule-group p-5 rounded-xl border-2 ${theme.bg} ${theme.border}`}
        >
            <div className="flex items-center mb-4">
                <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black text-white uppercase tracking-tighter ${theme.badge}`}
                >
                    {groupNode.type}
                </span>
                <div className="h-[1px] flex-grow ml-3 bg-border/50" />
            </div>
            <div className="flex gap-3">
                {/* 竖向线 */}
                <div className="w-[1px] bg-border/50 shrink-0" />
                <div className="group-content flex-1">
                    {groupNode.rules.map((child, idx) => (
                        <div key={(child as LogicGroup).id ?? (child as LeafRule).id ?? idx} className={idx < groupNode.rules.length - 1 ? 'mb-3' : ''}>
                            <RuleTreeNodeView
                                node={child}
                                formConfig={formConfig}
                                t={t}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * 规则树层级化逻辑视图（只读）
 * 基于嵌套逻辑流模板，展示 all/any/not 与叶子规则的层级关系
 */
export function RuleTreeView({ node, formConfig }: RuleTreeViewProps) {
    const { t } = useTranslation();
    if (!node) {
        return (
            <div className="flex items-center justify-center py-6 px-4 rounded-lg border-2 border-dashed border-border bg-muted/50 text-muted-foreground">
                <span className="text-[13px]">{t('common.noRules')}</span>
            </div>
        );
    }
    return (
        <div>
            <RuleTreeNodeView node={node} formConfig={formConfig} t={t} />
        </div>
    );
}
