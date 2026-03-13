export async function fetchProxies(apiUrl: string, secret: string) {
  try {
    const res = await fetch(`${apiUrl}/proxies`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {}
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('API 密钥验证失败，请检查密钥设置');
      }
      throw new Error(`API 请求失败 (${res.status}): ${res.statusText}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('无法连接到代理核心，请确认核心已启动且 API 地址正确');
    }
    throw err;
  }
}

export async function selectProxy(apiUrl: string, secret: string, group: string, proxy: string) {
  const res = await fetch(`${apiUrl}/proxies/${encodeURIComponent(group)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {})
    },
    body: JSON.stringify({ name: proxy })
  });
  if (!res.ok) throw new Error('Failed to select proxy');
}

export async function getProxyDelay(apiUrl: string, secret: string, proxy: string, url: string = 'http://www.gstatic.com/generate_204', timeout: number = 5000) {
  const res = await fetch(`${apiUrl}/proxies/${encodeURIComponent(proxy)}/delay?timeout=${timeout}&url=${encodeURIComponent(url)}`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
  if (!res.ok) throw new Error('Failed to get delay');
  return res.json();
}

export async function fetchConfigs(apiUrl: string, secret: string) {
  const res = await fetch(`${apiUrl}/configs`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
  if (!res.ok) throw new Error('Failed to fetch configs');
  return res.json();
}

// 检测 API 端口是否可用（用于检测外部启动的内核）
export async function checkApiAvailable(apiUrl: string, secret: string, timeout: number = 3000): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/configs`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(timeout)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateConfigs(apiUrl: string, secret: string, configs: any) {
  const res = await fetch(`${apiUrl}/configs`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {})
    },
    body: JSON.stringify(configs)
  });
  if (!res.ok) throw new Error('Failed to update configs');
}

export async function closeAllConnections(apiUrl: string, secret: string) {
  const res = await fetch(`${apiUrl}/connections`, {
    method: 'DELETE',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
  if (!res.ok) throw new Error('Failed to close connections');
}

export async function closeConnection(apiUrl: string, secret: string, id: string) {
  const res = await fetch(`${apiUrl}/connections/${id}`, {
    method: 'DELETE',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
  if (!res.ok) throw new Error('Failed to close connection');
}

export function getWsUrl(apiUrl: string, path: string, secret: string) {
  const base = (apiUrl || '').trim();
  const normalized = base.startsWith('http://') || base.startsWith('https://') ? base : `http://${base}`;
  const url = new URL(normalized);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  // Cleanly handle path and potential query strings
  const [pathname, search] = path.split('?');
  url.pathname = pathname;

  if (search) {
    const params = new URLSearchParams(search);
    params.forEach((val, key) => url.searchParams.append(key, val));
  }

  if (secret) {
    url.searchParams.append('token', secret);
  }

  return url.toString();
}
