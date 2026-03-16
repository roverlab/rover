/**
 * 管理员权限状态缓存
 * 启动时计算一次，供其他模块使用
 */

/** 缓存的管理员权限检测结果 */
let cachedIsAdmin = false;

/** 设置管理员权限缓存值（启动时调用一次） */
export function setCachedIsAdmin(value: boolean): void {
    cachedIsAdmin = value;
}

/** 获取管理员权限缓存值 */
export function getCachedIsAdmin(): boolean {
    return cachedIsAdmin;
}
