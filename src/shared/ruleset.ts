/**
 * 规则集共享工具函数
 * 可在渲染进程和主进程中使用
 */

/** 判断规则集是否为内置规则集（标签包含冒号） */
export function isBuiltinRuleSet(tag: string): boolean {
    return tag.includes(':');
}

/** 获取规则集文件的基础名称 */
export function getRuleProviderFileBaseName(providerId: string): string {
    const safeId = (providerId || '').replace(/[<>:"/\\|?*]/g, '_');
    return `ruleset_${safeId}`;
}
