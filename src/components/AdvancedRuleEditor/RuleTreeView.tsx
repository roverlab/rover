import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleTreeNode, LogicGroup, LeafRule } from './types';
import { isLogicGroup } from './types';
import type { RuleFieldConfig } from './types';

const THEMES = {
    all: {
        bg: 'bg-indigo-50/50',
        border: 'border-indigo-200',
        text: 'text-indigo-700',
        badge: 'bg-indigo-600',
    },
    any: {
        bg: 'bg-purple-50/50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        badge: 'bg-purple-600',
    },
    not: {
        bg: 'bg-rose-50/50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        badge: 'bg-rose-600',
    },
    leaf: {
        bg: 'bg-white',
        border: 'border-slate-200',
        text: 'text-slate-700',
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
            className={`flex items-center justify-between p-3 rounded-xl border shadow-sm ${theme.bg} ${theme.border} cursor-default`}
        >
            <div className="flex items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 min-w-[5rem] w-auto pr-4 break-keep whitespace-nowrap">
                    {typeLabel}
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight text-slate-800 break-all">
                    {leafNode.value || '—'}
                </span>
            </div>
            <div className="w-2 h-2 rounded-full bg-slate-200 shrink-0 ml-4" />
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
            className={`rule-group p-5 rounded-2xl border-2 ${theme.bg} ${theme.border}`}
        >
            <div className="flex items-center mb-4">
                <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black text-white uppercase tracking-tighter ${theme.badge}`}
                >
                    {groupNode.type}
                </span>
                <div className="h-[1px] flex-grow ml-3 bg-slate-200/50" />
            </div>
            <div className="flex gap-3">
                {/* 竖向线 */}
                <div className="w-[1px] bg-slate-200/50 shrink-0" />
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
            <div className="flex items-center justify-center py-6 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 text-[var(--app-text-tertiary)]">
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
