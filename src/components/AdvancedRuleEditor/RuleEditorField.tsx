/**
 * 规则编辑字段组件
 * 封装"打开规则编辑器"按钮、规则预览和提示文本
 * 供策略编辑和规则集编辑复用
 */
import React, { useState } from 'react';
import type { RouteLogicRule } from '../../types/singbox';
import type { RuleFieldConfig } from './types';
import { AdvancedRuleEditor } from './AdvancedRuleEditor.tsx';
import { RuleTreeView } from './RuleTreeView';
import { RULE_FIELD_CONFIG } from './ruleFieldConfig';
import {
    singboxLogicalToRuleTreeNodeRoot,
} from './ruleTreeNodeConversion';

export interface RuleEditorFieldProps {
    /** 当前逻辑规则值 */
    value?: RouteLogicRule | null;
    /** 值变化回调 */
    onChange: (value: RouteLogicRule | null) => void;
    /** 字段标签，默认"规则内容" */
    label?: string;
    /** 提示文本，默认"点击打开规则编辑器，支持复杂规则逻辑" */
    hint?: string;
    /** 字段配置，默认使用 RULE_FIELD_CONFIG */
    fieldConfig?: RuleFieldConfig[];
    /** 弹窗标题 */
    modalTitle?: string;
    /** 是否显示清空按钮 */
    showClearButton?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
}

/**
 * 规则编辑字段组件
 * 包含标签栏（标签 + 按钮）、规则预览、提示文本
 */
export function RuleEditorField({
    value,
    onChange,
    label = '规则内容',
    hint = '点击打开规则编辑器，支持复杂规则逻辑',
    fieldConfig = RULE_FIELD_CONFIG,
    modalTitle = '规则编辑器',
    showClearButton = true,
    disabled = false,
}: RuleEditorFieldProps) {
    const [showEditor, setShowEditor] = useState(false);

    const handleOpenEditor = () => {
        if (!disabled) {
            setShowEditor(true);
        }
    };

    const handleConfirm = (newValue: RouteLogicRule | null) => {
        onChange(newValue);
        setShowEditor(false);
    };

    // 将 RouteLogicRule 转换为 RuleTreeNode 用于预览
    const previewNode = value ? singboxLogicalToRuleTreeNodeRoot(value) : null;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 pl-1">
                <label className="text-[12px] font-medium text-[var(--app-text-secondary)]">{label}</label>
                <div className="flex items-center gap-2">
                    {showClearButton && value && (
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            disabled={disabled}
                            className="px-3 py-1.5 rounded-[8px] border border-[rgba(39,44,54,0.12)] bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors text-[12px] text-[var(--app-text-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            清空规则
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleOpenEditor}
                        disabled={disabled}
                        className="px-3 py-1.5 rounded-[8px] border border-[rgba(39,44,54,0.12)] bg-white hover:bg-[var(--app-hover)] transition-colors text-[12px] text-[var(--app-text)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        打开规则编辑器
                    </button>
                </div>
            </div>
            <RuleTreeView
                node={previewNode}
                formConfig={fieldConfig}
            />
            <p className="text-[11px] text-[var(--app-text-quaternary)] pl-1">{hint}</p>

            {/* 高级规则编辑器弹窗 */}
            <AdvancedRuleEditor
                open={showEditor}
                onClose={() => setShowEditor(false)}
                onConfirm={handleConfirm}
                initialLogicRule={value}
                title={modalTitle}
                fieldConfig={fieldConfig}
            />
        </div>
    );
}

export default RuleEditorField;

// ==================== 只读展示组件 ====================

export interface RuleEditorViewProps {
    /** 当前逻辑规则值 */
    value?: RouteLogicRule | null;
    /** 字段标签，默认"规则内容" */
    label?: string;
    /** 字段配置，默认使用 RULE_FIELD_CONFIG */
    fieldConfig?: RuleFieldConfig[];
}

/**
 * 规则编辑器只读展示组件
 * 用于详情页等只需要展示规则内容的场景
 */
export function RuleEditorView({
    value,
    label = '规则内容',
    fieldConfig = RULE_FIELD_CONFIG,
}: RuleEditorViewProps) {
    // 将 RouteLogicRule 转换为 RuleTreeNode 用于展示
    const previewNode = value ? singboxLogicalToRuleTreeNodeRoot(value) : null;

    return (
        <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--app-text-secondary)] pl-1">{label}</label>
            <RuleTreeView
                node={previewNode}
                formConfig={fieldConfig}
            />
        </div>
    );
}
