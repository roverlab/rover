/**
 * 链式代理（SOCKS5）设置
 *
 * 链路：本地 → [前置 SOCKS5 + 可选网卡] → 订阅节点 → [后置 SOCKS5] → 目标
 * - 前置：挂在真实节点 detour 上（节点经前置连出）
 * - 后置：后置.detour = selector_out，业务出口改为后置（节点 → 后置）
 */

export const CHAIN_PROXY_SETTING_KEY = 'chain-proxy';

/** sing-box 出站 tag：前置 */
export const CHAIN_FRONT_TAG = 'chain_front_out';

/** sing-box 出站 tag：后置 */
export const CHAIN_BACK_TAG = 'chain_back_out';

/** 单跳 SOCKS5（前置可带 bind_interface） */
export type ChainSocksHop = {
  enabled: boolean;
  server: string;
  server_port: number;
  username?: string;
  password?: string;
  /** 仅前置：出口网卡名（可选） */
  bind_interface?: string;
};

export type ChainProxySettings = {
  front: ChainSocksHop;
  back: ChainSocksHop;
};

export const emptyChainHop = (port = 1080): ChainSocksHop => ({
  enabled: false,
  server: '',
  server_port: port,
  username: '',
  password: '',
  bind_interface: '',
});

export const defaultChainProxySettings = (): ChainProxySettings => ({
  front: emptyChainHop(1080),
  back: emptyChainHop(1081),
});

function normalizeHop(raw: unknown, fallbackPort: number): ChainSocksHop {
  const base = emptyChainHop(fallbackPort);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const port = Number(o.server_port);
  return {
    enabled: o.enabled === true,
    server: typeof o.server === 'string' ? o.server : '',
    server_port: Number.isFinite(port) && port > 0 && port <= 65535 ? Math.floor(port) : fallbackPort,
    username: typeof o.username === 'string' ? o.username : '',
    password: typeof o.password === 'string' ? o.password : '',
    bind_interface: typeof o.bind_interface === 'string' ? o.bind_interface : '',
  };
}

/** 从 settings 字符串解析；非法则返回默认关闭态 */
export function parseChainProxySettings(raw?: string | null): ChainProxySettings {
  if (!raw?.trim()) return defaultChainProxySettings();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultChainProxySettings();
    const obj = parsed as Record<string, unknown>;
    return {
      front: normalizeHop(obj.front, 1080),
      back: normalizeHop(obj.back, 1081),
    };
  } catch {
    return defaultChainProxySettings();
  }
}

/** 是否具备可写入配置的有效跳（已启用且 server/port 合法） */
export function isChainHopActive(hop: ChainSocksHop): boolean {
  const server = hop.server?.trim() ?? '';
  const port = hop.server_port;
  return hop.enabled === true && server.length > 0 && Number.isFinite(port) && port > 0 && port <= 65535;
}

export function serializeChainProxySettings(settings: ChainProxySettings): string {
  return JSON.stringify({
    front: {
      enabled: settings.front.enabled === true,
      server: settings.front.server?.trim() ?? '',
      server_port: settings.front.server_port,
      username: settings.front.username?.trim() ?? '',
      password: settings.front.password ?? '',
      bind_interface: settings.front.bind_interface?.trim() ?? '',
    },
    back: {
      enabled: settings.back.enabled === true,
      server: settings.back.server?.trim() ?? '',
      server_port: settings.back.server_port,
      username: settings.back.username?.trim() ?? '',
      password: settings.back.password ?? '',
    },
  });
}