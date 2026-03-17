/**
 * RoverService 服务安装状态缓存
 * 启动时计算一次，供其他模块使用
 */

/** 缓存的 RoverService 服务是否已安装 */
let cachedIsServiceInstalled = false;

/** 设置 RoverService 服务安装状态缓存值（启动时调用一次） */
export function setCachedIsServiceInstalled(value: boolean): void {
    cachedIsServiceInstalled = value;
}

/** 获取 RoverService 服务安装状态缓存值 */
export function getCachedIsServiceInstalled(): boolean {
    return cachedIsServiceInstalled;
}
