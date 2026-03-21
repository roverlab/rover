/**
 * 高级规则编辑器组件导出
 */
export { AdvancedRuleEditor } from './AdvancedRuleEditor.tsx';
export type { AdvancedRuleEditorProps } from './AdvancedRuleEditor.tsx';

export { RuleEditorField, RuleEditorView } from './RuleEditorField.tsx';
export type { RuleEditorFieldProps, RuleEditorViewProps } from './RuleEditorField.tsx';

export { RuleTreeView } from './RuleTreeView.tsx';
export { NativeStyleRuleEditor } from './NativeStyleRuleEditor.tsx';

export type {
    RuleFieldConfig,
    RuleFieldKey,
    BoolFieldKey,
    FieldType,
    RuleGroupFields,
    RuleGroup,
    LogicNode,
    FlatRuleItem,
    RuleFieldsEditorProps,
    LogicGroupType,
    LeafRule,
    LogicGroup,
    RuleTreeNode,
} from './types.ts';
export { isLogicGroup, isLeafRule } from './types.ts';

export {
    getDefaultLogicNode,
    getDefaultRuleTreeNode,
    countRuleTreeNodes,
    countRuleGroups,
    flattenFields,
    extractRuleFields,
    getUsedFieldKeys,
    getAvailableFieldConfigs,
} from './ruleFieldsUtils.ts';

export {
    ruleTreeNodeToSingboxLogical,
    singboxLogicalToRuleTreeNodeRoot,
    legacyLogicNodeToRuleTreeNode,
    isLegacyLogicNode,
} from './ruleTreeNodeConversion.ts';
export type { SingboxRouteRule } from './ruleTreeNodeConversion.ts';

export {
    RULE_FIELD_CONFIG,
    getRuleFieldConfigByKey,
    getRuleFieldConfigByFormKey,
    isBoolField,
} from './ruleFieldConfig.ts';

export { FORM_KEY_TO_SINGBOX, SINGBOX_KEY_TO_FORM } from './ruleFieldMapping.ts';

export { default } from './AdvancedRuleEditor.tsx';
