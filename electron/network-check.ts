/**
 * 网络出口 IP 检测
 * - 内核运行中：通过 selector_out 代理检测
 * - 内核未启动：直连检测（不使用代理）
 */
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dbUtils from './db';
import { createLogger } from './logger';
import { t } from './i18n-main';

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
  log.info(`[NetworkCheck] Starting check, mode: ${mode === 'proxy' ? 'proxy(selector_out)' : 'direct'}`);

  let fallback: NetworkCheckResult | null = null;

  for (const api of IP_APIS) {
    try {
      const res = await axios.get(api.url, {
        ...axiosConfig,
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (res.status !== 200 || !res.data) {
        log.debug(`[NetworkCheck] ${api.name} returned abnormal status=${res.status}`);
        continue;
      }
      const { ip, country, code } = api.parse(res.data);
      if (ip) {
        const hasGeo = hasAddressInfo(country || '', code || '');
        log.info(`[NetworkCheck] Success ${api.name} → IP=${ip} Country=${country || '—'} Code=${code || '—'}`);
        if (hasGeo) {
          return { ip, country: country || t('main.network.unknownCountry'), countryCode: (code || '').toUpperCase() || 'UN' };
        }
        log.debug(`[NetworkCheck] ${api.name} no address info, trying other API`);
        fallback = { ip, country: country || t('main.network.unknownCountry'), countryCode: (code || '').toUpperCase() || 'UN' };
      }
    } catch (err: any) {
      log.debug(`[NetworkCheck] ${api.name} request failed: ${err?.message || err}`);
    }
  }

  if (fallback) {
    log.info(`[NetworkCheck] No API returned address info, using IP result`);
    return fallback;
  }
  log.warn('[NetworkCheck] All APIs failed');
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
  log.debug(`[NetworkCheck] Using proxy ${proxyUrl}`);
  const agent = new HttpsProxyAgent(proxyUrl);
  return fetchWithApis({ httpsAgent: agent, httpAgent: agent }, 'proxy');
}
