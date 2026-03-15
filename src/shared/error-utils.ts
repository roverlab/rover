/**
 * 错误信息处理工具
 * 用于从 Electron IPC 包装的错误中提取用户可读的业务错误信息
 */

/**
 * 从错误对象中提取用于展示的消息。
 * Electron IPC 会将主进程抛出的错误包装为 "Error invoking remote method 'xxx': Error: 实际消息"，
 * 此函数会去掉英文前缀，只保留我们抛出的业务错误信息。
 */
export function getDisplayErrorMessage(err: unknown, fallback = '未知错误'): string {
    const msg = (err as Error)?.message || fallback;
    // 去掉 Electron IPC 前缀 "Error invoking remote method 'xxx': Error: "，只保留业务错误
    const match = msg.match(/: ?Error: ?(.+)$/);
    return match ? match[1].trim() : msg;
}
