/**
 * RuleTreeNode 与 SingboxLogicalRule 的转换
 * 支持嵌套逻辑规则
 */
import type { SingboxLogicalRule, SingboxRouteRule } from '../../../types/policy';
import type { RuleTreeNode, LogicGroup, LeafRule, LogicGroupType } from '../types/ruleFields';
import type { LogicNode, RuleGroup } from '../types/ruleFields';
import { isLeafRule } from '../types/ruleFields';
import { FORM_KEY_TO_SINGBOX } from '../ruleFieldMapping';

function parseCommaSeparated(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
}

/** 叶子规则转为 SingboxRouteRule（单字段） */
function leafRuleToSingbox(leaf: LeafRule): SingboxRouteRule {
    const sk = FORM_KEY_TO_SINGBOX[leaf.type];
    if (!sk || !leaf.value.trim()) return {};

    const vals = parseCommaSeparated(leaf.value);
    if (!vals.length) return {};

    const out: Record<string, unknown> = {};
    if (sk === 'port' || sk === 'source_port') {
        const nums = vals.map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        if (nums.length) out[sk] = nums;
    } else if (sk === 'query_type') {
        const mixed = vals.map(s => {
            const n = parseInt(s, 10);
            return !isNaN(n) ? n : s;
        }).filter(Boolean);
        if (mixed.length) out[sk] = mixed;
    } else if (sk === 'invert' || sk === 'network_is_expensive' || sk === 'network_is_constrained') {
        // 布尔字段：sing-box 要求 boolean 类型
        out[sk] = /^true$/i.test(leaf.value.trim());
    } else {
        out[sk] = vals;
    }
    return out as SingboxRouteRule;
}

/** RuleTreeNode 转为 SingboxLogicalRule 或 SingboxRouteRule */
function ruleTreeNodeToSingbox(node: RuleTreeNode): SingboxLogicalRule | SingboxRouteRule {
    if (isLeafRule(node)) {
        return leafRuleToSingbox(node);
    }
    const group = node as LogicGroup;
    const rules = group.rules
        .map(r => ruleTreeNodeToSingbox(r))
        .filter(r => {
            if ('type' in r && r.type === 'logical') return (r as SingboxLogicalRule).rules.length > 0;
            return Object.keys(r).length > 0;
        });

    if (rules.length === 0) return {};

    const mode = group.type === 'any' ? 'or' : 'and';
    const invert = group.type === 'not';
    return {
        type: 'logical',
        mode,
        ...(invert && { invert: true }),
        rules: rules as SingboxRouteRule[],
    };
}

/** RuleTreeNode 转为 SingboxLogicalRule（顶层必须是逻辑组） */
export function ruleTreeNodeToSingboxLogical(root: RuleTreeNode): SingboxLogicalRule | null {
    const result = ruleTreeNodeToSingbox(root);
    if ('type' in result && result.type === 'logical') {
        return result as SingboxLogicalRule;
    }
    const sr = result as SingboxRouteRule;
    if (Object.keys(sr).length === 0) return null;
    return {
        type: 'logical',
        mode: 'and',
        rules: [sr],
    };
}

import { SINGBOX_KEY_TO_FORM } from '../ruleFieldMapping';

/** SingboxRouteRule 转为 LeafRule[]（一个字段一条） */
function singboxRouteToLeafRules(sr: SingboxRouteRule): LeafRule[] {
    const leaves: LeafRule[] = [];

    for (const [sk, v] of Object.entries(sr)) {
        if (v === undefined) continue;
        if (sk === 'network_interface_address' && v && typeof v === 'object') {
            const nia = v as Record<string, string[]>;
            for (const [key, arr] of Object.entries(nia)) {
                if (arr?.length) {
                    const formKey = `networkInterfaceAddress${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                    leaves.push({ id: crypto.randomUUID(), type: formKey, value: arr.join(', ') });
                }
            }
            continue;
        }
        if (sk === 'network_is_expensive' || sk === 'network_is_constrained' || sk === 'invert') {
            if (typeof v === 'boolean') {
                const fk = SINGBOX_KEY_TO_FORM[sk];
                if (fk) leaves.push({ id: crypto.randomUUID(), type: fk, value: v ? 'true' : 'false' });
            }
            continue;
        }
        const fk = SINGBOX_KEY_TO_FORM[sk];
        if (!fk) continue;
        if (Array.isArray(v)) {
            const str = v.map(x => String(x)).join(', ');
            if (str) leaves.push({ id: crypto.randomUUID(), type: fk, value: str });
        } else if (typeof v === 'boolean' && v) {
            leaves.push({ id: crypto.randomUUID(), type: fk, value: 'true' });
        }
    }
    return leaves;
}

/** SingboxLogicalRule 转为 RuleTreeNode */
function singboxLogicalToRuleTreeNode(lr: SingboxLogicalRule): RuleTreeNode {
    const type: LogicGroupType = lr.invert ? 'not' : (lr.mode === 'or' ? 'any' : 'all');
    const rules: RuleTreeNode[] = lr.rules.map(r => {
        if (r && typeof r === 'object' && 'type' in r && (r as { type: string }).type === 'logical') {
            return singboxLogicalToRuleTreeNode(r as SingboxLogicalRule);
        }
        const leaves = singboxRouteToLeafRules(r as SingboxRouteRule);
        if (leaves.length === 0) return { id: crypto.randomUUID(), type: 'domain', value: '' };
        if (leaves.length === 1) return leaves[0];
        return { id: crypto.randomUUID(), type: 'all', rules: leaves };
    });
    return { id: crypto.randomUUID(), type, rules };
}

/** SingboxLogicalRule 转为 RuleTreeNode（入口），无数据时返回 null */
export function singboxLogicalToRuleTreeNodeRoot(lr: SingboxLogicalRule | undefined): RuleTreeNode | null {
    if (!lr || !lr.rules?.length) {
        return null;
    }
    return singboxLogicalToRuleTreeNode(lr);
}

/** 旧 LogicNode 转为 RuleTreeNode（迁移） */
export function legacyLogicNodeToRuleTreeNode(node: LogicNode): RuleTreeNode {
    const type: LogicGroupType = node.mode === 'or' ? 'any' : 'all';
    const rules: RuleTreeNode[] = node.children.map((group: RuleGroup): RuleTreeNode => {
        const leaves: LeafRule[] = [];
        for (const [formKey, val] of Object.entries(group.fields ?? {})) {
            if (val === undefined || val === '') continue;
            if (typeof val === 'boolean') {
                if (val) leaves.push({ id: crypto.randomUUID(), type: formKey, value: 'true' });
            } else {
                leaves.push({ id: crypto.randomUUID(), type: formKey, value: String(val) });
            }
        }
        if (leaves.length === 0) return { id: crypto.randomUUID(), type: 'domain', value: '' } as LeafRule;
        if (leaves.length === 1) return leaves[0];
        return { id: crypto.randomUUID(), type: 'all', rules: leaves } as LogicGroup;
    });
    return { id: crypto.randomUUID(), type, rules };
}

/** 判断是否为旧 LogicNode 格式 */
export function isLegacyLogicNode(v: unknown): v is LogicNode {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return 'mode' in o && 'children' in o && Array.isArray(o.children);
}

