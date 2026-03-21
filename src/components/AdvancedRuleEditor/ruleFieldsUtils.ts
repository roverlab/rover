import type {
    RuleGroup,
    LogicNode,
    FlatRuleItem,
    RuleFieldConfig,
    RuleTreeNode,
} from './types';

/** 获取默认的逻辑节点（and 组，包含一个空规则组） */
export function getDefaultLogicNode(): LogicNode {
    return { mode: 'and', children: [{ fields: {} }] };
}

/** 获取默认的规则树节点（any 组，包含一个空域名规则） */
export function getDefaultRuleTreeNode(): RuleTreeNode {
    return {
        id: crypto.randomUUID(),
        type: 'any',
        rules: [{ id: crypto.randomUUID(), type: 'domain', value: '' }]
    };
}

/** 统计规则树中的节点数量（逻辑组+叶子） */
export function countRuleTreeNodes(node: RuleTreeNode): number {
    if ('rules' in node && Array.isArray(node.rules)) {
        return 1 + node.rules.reduce((sum, r) => sum + countRuleTreeNodes(r), 0);
    }
    return 1;
}

/** 统计规则组数量 */
export function countRuleGroups(node: LogicNode): number {
    return node.children.length;
}

/** 扁平化规则组中的字段，用于列表展示 */
export function flattenFields(
    fields: RuleGroup['fields'],
    formConfig: RuleFieldConfig[]
): FlatRuleItem[] {
    const items: FlatRuleItem[] = [];
    for (const c of formConfig) {
        const val = fields[c.formKey];
        if (val !== undefined && val !== '' && val !== false) {
            items.push({
                formKey: c.formKey,
                label: c.label,
                placeholder: c.placeholder,
                value: val,
                type: c.type,
            });
        }
    }
    return items;
}

/** 从 form 提取规则字段的纯数据对象 */
export function extractRuleFields(form: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    out.ruleGroupsTree = form.ruleGroupsTree
        ? JSON.parse(JSON.stringify(form.ruleGroupsTree))
        : getDefaultRuleTreeNode();
    return out;
}

/** 获取已使用的字段类型列表 */
export function getUsedFieldKeys(fields: RuleGroup['fields']): Set<string> {
    return new Set(
        Object.keys(fields).filter(k => {
            const v = fields[k];
            return v !== undefined && v !== '' && v !== false;
        })
    );
}

/** 获取可用的字段类型列表 */
export function getAvailableFieldConfigs(
    fields: RuleGroup['fields'],
    formConfig: RuleFieldConfig[]
): RuleFieldConfig[] {
    const usedKeys = getUsedFieldKeys(fields);
    return formConfig.filter(c => !usedKeys.has(c.formKey));
}
