/**
 * 网络出口 IP 检测
 * - 内核运行中：通过 selector_out 代理检测
 * - 内核未启动：直连检测（不使用代理）
 */
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dbUtils from './db';
import { createLogger } from './logger';

const log = createLogger('NetworkCheck');

const IP_APIS = [
  { name: 'ipapi.co', url: 'https://ipapi.co/json/', parse: (d: any) => ({ ip: d.ip, country: d.country_name || '—', code: (d.country_code || '').toUpperCase() }) },
  { name: 'ipwho.is', url: 'https://ipwho.is/', parse: (d: any) => ({ ip: d.ip, country: d.country || '—', code: (d.country_code || '').toUpperCase() }) }
];

const TIMEOUT_MS = 8000;

export interface NetworkCheckResult {
  ip: string;
  country: string;
  countryCode: string;
}

/** 判断是否有有效的地址信息（国家/代码） */
function hasAddressInfo(country: string, code: string): boolean {
  const c = (country || '').trim();
  const cd = (code || '').trim();
  return c !== '' && c !== '—' && cd !== '';
}

async function fetchWithApis(axiosConfig: object, mode: 'direct' | 'proxy'): Promise<NetworkCheckResult | null> {
  log.info(`[网络检测] 开始检测，模式: ${mode === 'proxy' ? '代理(selector_out)' : '直连'}`);

  let fallback: NetworkCheckResult | null = null;

  for (const api of IP_APIS) {
    try {
      const res = await axios.get(api.url, {
        ...axiosConfig,
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (res.status !== 200 || !res.data) {
        log.debug(`[网络检测] ${api.name} 返回异常 status=${res.status}`);
        continue;
      }
      const { ip, country, code } = api.parse(res.data);
      if (ip) {
        const hasGeo = hasAddressInfo(country || '', code || '');
        log.info(`[网络检测] 成功 ${api.name} → IP=${ip} 国家=${country || '—'} 代码=${code || '—'}`);
        if (hasGeo) {
          return { ip, country: country || '未知', countryCode: (code || '').toUpperCase() || 'UN' };
        }
        log.debug(`[网络检测] ${api.name} 无地址信息，尝试其他 API`);
        fallback = { ip, country: country || '未知', countryCode: (code || '').toUpperCase() || 'UN' };
      }
    } catch (err: any) {
      log.debug(`[网络检测] ${api.name} 请求失败: ${err?.message || err}`);
    }
  }

  if (fallback) {
    log.info(`[网络检测] 无 API 返回地址信息，使用 IP 结果`);
    return fallback;
  }
  log.warn('[网络检测] 所有 API 均失败');
  return null;
}

/** 直连检测（不使用代理） */
export async function fetchIpDirect(): Promise<NetworkCheckResult | null> {
  return fetchWithApis({}, 'direct');
}

/** 通过 selector_out 代理检测 */
export async function fetchIpThroughProxy(): Promise<NetworkCheckResult | null> {
  const settings = dbUtils.getAllSettings();
  const port = parseInt(settings['mixed-port'], 10) || 7890;
  const proxyUrl = `http://127.0.0.1:${port}`;
  log.debug(`[网络检测] 使用代理 ${proxyUrl}`);
  const agent = new HttpsProxyAgent(proxyUrl);
  return fetchWithApis({ httpsAgent: agent, httpAgent: agent }, 'proxy');
}
