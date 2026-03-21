/** sing-box Headless Rule 所有数组类型字段 */
export type RuleFieldKey =
    | 'processNames' | 'processPath' | 'processPathRegex'
    | 'domain' | 'domainKeyword' | 'domainSuffix' | 'domainRegex'
    | 'port' | 'portRange' | 'sourcePort' | 'sourcePortRange'
    | 'ipCidr' | 'sourceIpCidr'
    | 'queryType' | 'network' | 'networkType'
    | 'packageName'
    | 'defaultInterfaceAddress' | 'wifiSsid' | 'wifiBssid'
    | 'networkInterfaceAddressWifi' | 'networkInterfaceAddressCellular' | 'networkInterfaceAddressEthernet' | 'networkInterfaceAddressOther';

/** 布尔类型字段 */
export type BoolFieldKey = 'invert' | 'networkIsExpensive' | 'networkIsConstrained';

/** 字段类型 */
export type FieldType = 'string' | 'boolean';

/** 规则字段配置项 */
export interface RuleFieldConfig {
    key: RuleFieldKey | BoolFieldKey;
    label: string;
    placeholder: string;
    formKey: string;
    /** 字段类型 */
    type: FieldType;
    /** sing-box 原字段名（snake_case），用于搜索 */
    singboxKey?: string;
}

/**
 * 规则组字段：每个字段类型只能选择一次
 * 字符串字段：多个值用逗号分隔
 * 布尔字段：true/false
 */
export interface RuleGroupFields {
    [key: string]: string | boolean | undefined;
}

/**
 * 规则组：最小单位
 * 包含规则字段
 */
export interface RuleGroup {
    /** 规则字段，每个字段类型只能选择一次 */
    fields: RuleGroupFields;
}

/**
 * 逻辑节点：表示规则组之间的关系
 * 只有一层，children 只能是 RuleGroup，不允许嵌套
 */
export interface LogicNode {
    mode: 'and' | 'or';
    children: RuleGroup[];
}

/** 扁平化的规则项，用于列表展示 */
export interface FlatRuleItem {
    formKey: string;
    label: string;
    placeholder: string;
    value: string | boolean;
    type: FieldType;
}

/** RuleFieldsEditor 组件 Props */
export interface RuleFieldsEditorProps {
    form: Record<string, unknown>;
    onFormChange: (updates: Record<string, unknown>) => void;
}

// ========== 规则树结构（参照 Sing-box 风格，支持嵌套） ==========

/** 逻辑组类型：all=符合全部, any=符合任一, not=不符合 */
export type LogicGroupType = 'all' | 'any' | 'not';

/** 叶子规则：单条 type+value */
export interface LeafRule {
    id: string; // 唯一标识符，用于 React 组件追踪
    type: string; // formKey，如 domain, port, processNames
    value: string;
}

/** 逻辑组：包含子规则，可嵌套 */
export interface LogicGroup {
    id: string; // 唯一标识符，用于 React 组件追踪
    type: LogicGroupType;
    rules: RuleTreeNode[];
}

/** 规则树节点：逻辑组或叶子规则 */
export type RuleTreeNode = LogicGroup | LeafRule;

/** 判断是否为逻辑组 */
export function isLogicGroup(node: RuleTreeNode): node is LogicGroup {
    return 'rules' in node && Array.isArray((node as LogicGroup).rules);
}

/** 判断是否为叶子规则 */
export function isLeafRule(node: RuleTreeNode): node is LeafRule {
    return 'value' in node && typeof (node as LeafRule).value === 'string';
}
