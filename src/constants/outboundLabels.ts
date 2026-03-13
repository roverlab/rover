/**
 * 出站标签文本常量
 * 统一管理各种出站选项的显示文本
 */

export const OUTBOUND_LABELS = {
    direct_out: '直连',
    block_out: '拦截',
    selector_out: '代理',
} as const;

export const POLICY_FINAL_LABELS = {
    direct_out: '直连',
    block_out: '拦截',
    selector_out: '当前选择',
} as const;

export type OutboundValue = keyof typeof OUTBOUND_LABELS;
export type PolicyFinalValue = keyof typeof POLICY_FINAL_LABELS;