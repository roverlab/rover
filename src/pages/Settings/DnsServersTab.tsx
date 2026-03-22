/**
 * DNS 服务器管理
 * 基于 sing-box DNS Server 配置：https://sing-box.sagernet.org/configuration/dns/server/
 */
import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Select } from '../../components/ui/Field';
import { Card, SectionHeader } from '../../components/ui/Surface';
import { Modal } from '../../components/ui/Modal';
import { Plus, Pencil, Trash2, Check, AlertCircle, Power, CircleDot } from 'lucide-react';
import { OutboundSelector } from '../../components/OutboundSelector';
import { JsonEditor } from '../../components/JsonEditor';

/** sing-box DNS 服务器类型 */
export type DnsServerType =
  | 'local'
  | 'udp'
  | 'tls'
  | 'https'
  | 'raw';

/** DNS 服务器配置（通用结构） */
export interface DnsServerConfig {
  type: DnsServerType;
  id: string;
  server?: string;
  server_port?: number;
  path?: string;
  /** DNS 服务器的 detour（固定选项：selector_out 或不选） */
  detour?: string;
  prefer_go?: boolean;
  /** 域名解析器，当 server 为域名时必须指定 */
  domain_resolver?: string;
  /** 原始 JSON 配置（raw 类型使用） */
  raw_data?: Record<string, unknown>;
  /** 是否启用 */
  enabled?: boolean;
  /** 是否为默认DNS服务器 */
  is_default?: boolean;
  [key: string]: unknown;
}

const DNS_SERVER_TYPES: { value: DnsServerType; label: string }[] = [
  { value: 'local', label: 'Local（本地网关）' },
  { value: 'udp', label: 'UDP' },
  { value: 'tls', label: 'TLS (DoT)' },
  { value: 'https', label: 'HTTPS (DoH)' },
  { value: 'raw', label: 'Raw（原始JSON）' },
];


const DEFAULT_PORTS: Partial<Record<DnsServerType, number>> = {
  udp: 53,
  tls: 853,
  https: 443,
};

function getDefaultPath(type: DnsServerType): string {
  return type === 'https' ? '/dns-query' : '';
}

interface DnsServersTabProps {
  isActive?: boolean;
  onRegenerateConfig?: () => Promise<void>;
}

export function DnsServersTab({ isActive = true, onRegenerateConfig }: DnsServersTabProps) {
  const [dnsServers, setDnsServers] = useState<any[]>([]);
  const [profileId, setProfileId] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<DnsServerConfig> & { preferred_detour: string }>({
    type: 'udp',
    id: '',
    server: '',
    server_port: 53,
    path: '',
    detour: '',
    preferred_detour: '',
    domain_resolver: '',
    enabled: true,
    is_default: false,
  });
  /** raw 类型的原始 JSON 文本 */
  const [rawJsonText, setRawJsonText] = useState('');

  const loadDnsServers = async () => {
    try {
      const [servers, selected] = await Promise.all([
        window.ipcRenderer.db.getDnsServers(),
        window.ipcRenderer.core.getSelectedProfile(),
      ]);
      const currentProfileId = (selected as any)?.profile?.id || '';
      setDnsServers(servers || []);
      setProfileId(currentProfileId);
    } catch (e) {
      console.error(e);
    }
  };

  /** 获取 DNS 服务器的 detour（从 profile 关联） */
  const getDnsServerDetour = async (serverId: string): Promise<string> => {
    if (!profileId) return '';
    try {
      const detour = await window.ipcRenderer.db.getProfileDnsServerDetour(profileId, serverId);
      return detour || '';
    } catch (e) {
      console.error('Failed to get DNS server detour:', e);
      return '';
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadDnsServers();
  }, [isActive]);

  const validateForm = (): string => {
    if (!form.id?.trim()) return '名称不能为空';
    const id = form.id.trim();
    const others = dnsServers.filter((s) => s.id !== editingId);
    if (others.some((s) => (s.id || '').toLowerCase() === id.toLowerCase())) {
      return `名称 "${id}" 已存在`;
    }
    const needsServer = ['udp', 'tls', 'https'].includes(form.type || '');
    if (needsServer && !form.server?.trim()) return '服务器地址不能为空';
    // 检查如果 server 是域名，则 domain_resolver 必须填写
    if (needsServer && form.server?.trim()) {
      const serverAddr = form.server.trim();
      // 判断是否为域名（非 IP 地址）
      const isDomain = !/^(\d{1,3}\.){3}\d{1,3}$/.test(serverAddr) &&
                       !/^\[([0-9a-fA-F:]+)\]$/.test(serverAddr) &&
                       !/^[0-9a-fA-F:]+$/.test(serverAddr);
      if (isDomain && !form.domain_resolver?.trim()) {
        return '服务器地址为域名时，必须指定域名解析器';
      }
    }
    if (form.type === 'raw') {
      try {
        if (!rawJsonText.trim()) return '原始 JSON 不能为空';
        JSON.parse(rawJsonText);
      } catch {
        return '原始 JSON 格式无效';
      }
    }
    return '';
  };

  const buildServerFromForm = () => {
    const type = (form.type || 'udp') as DnsServerType;
    // 构建完整的服务器对象，只包含当前类型需要的字段
    const server: Record<string, unknown> = {
      type,
      id: form.id?.trim() || 'dns',
      enabled: form.enabled ?? true,
      is_default: form.is_default ?? false,
    };
    if (type === 'raw') {
      // raw 类型直接保存原始 JSON
      try {
        const rawData = JSON.parse(rawJsonText);
        server.raw_data = rawData;
        // 从 raw_data 中提取 type 和 id（如果存在）
        if (rawData.type) server.type = rawData.type;
        if (rawData.tag) server.id = rawData.tag; // 使用模板中的 tag 作为 id
      } catch {
        // 验证时已检查，这里应该不会出错
      }
      return server;
    }
    if (['udp', 'tls', 'https'].includes(type)) {
      if (form.server) server.server = form.server.trim();
      const port = form.server_port ?? DEFAULT_PORTS[type];
      if (port !== undefined && port !== DEFAULT_PORTS[type]) server.server_port = port;
    }
    // 只有 https 类型才有 path 字段
    if (type === 'https' && form.path?.trim()) {
      server.path = form.path.trim();
    }
    // domain_resolver
    if (form.domain_resolver?.trim()) {
      server.domain_resolver = form.domain_resolver.trim();
    }
    // detour：空字符串表示直连，不设置该字段
    if (form.detour?.trim()) {
      server.detour = form.detour.trim();
    }
    // preferred_detour 保存到 profile 关联，在 handleSubmit 中处理
    if (type === 'local' && form.prefer_go !== undefined) server.prefer_go = form.prefer_go;
    return server;
  };

  const openAddModal = async () => {
    setEditingId(null);
    setForm({
      type: 'udp',
      id: '',
      server: '',
      server_port: 53,
      path: getDefaultPath('https'),
      detour: '',
      preferred_detour: '',
      domain_resolver: '',
      enabled: true,
      is_default: false,
    });
    setRawJsonText('');
    setModalOpen(true);
  };

  const openEditModal = async (s: any) => {
    setEditingId(s.id);
    const id = s.id || '';
    // 从 profile 获取 preferred_detour
    const preferredDetourVal = await getDnsServerDetour(s.id);
    // 判断是否为 raw 类型（存储时有 raw_data 字段）
    const isRaw = !!s.raw_data;
    setForm({
      type: isRaw ? 'raw' : ((s.type || 'udp') as DnsServerType),
      id,
      server: s.server || '',
      server_port: s.server_port ?? DEFAULT_PORTS[(s.type || 'udp') as DnsServerType],
      path: s.path ?? getDefaultPath((s.type || 'https') as DnsServerType),
      detour: s.detour || '',
      preferred_detour: preferredDetourVal,
      prefer_go: s.prefer_go,
      domain_resolver: s.domain_resolver || '',
      raw_data: s.raw_data,
    });
    setRawJsonText(s.raw_data ? JSON.stringify(s.raw_data, null, 2) : '');
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      setErrorMessage(err);
      setErrorModalOpen(true);
      return;
    }
    const serverData = buildServerFromForm();
    const preferredDetourVal = form.preferred_detour?.trim() || null;

    let serverId: string;
    if (editingId) {
      await window.ipcRenderer.db.updateDnsServer(editingId, serverData);
      serverId = editingId;
    } else {
      serverId = await window.ipcRenderer.db.addDnsServer(serverData);
    }

    // 保存 preferred_detour 到 profile 关联（与订阅相关）
    if (profileId) {
      try {
        await window.ipcRenderer.db.setProfileDnsServerDetour(profileId, serverId, preferredDetourVal);
      } catch (e) {
        console.error('Failed to save DNS server detour to profile:', e);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
    setModalOpen(false);
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'dns': return 'DNS 策略';
      case 'route': return '路由策略';
      case 'dns_server': return 'DNS 服务器域名解析';
      default: return source;
    }
  };

  const handleDelete = async (s: any) => {
    const id = (s.id || '').trim();
    const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
    if (refs.length > 0) {
      const lines = refs.map((r) => `#${r.index} ${r.name}（${getSourceLabel(r.source)}）`);
      setErrorMessage(`「${id}」正在被以下规则引用，无法删除：\n\n${lines.join('\n')}\n\n请先移除上述规则中的引用。`);
      setErrorModalOpen(true);
      return;
    }
    await window.ipcRenderer.db.deleteDnsServer(s.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const handleToggleEnabled = async (s: any) => {
    const newEnabled = s.enabled === false;
    if (!newEnabled) {
      const id = (s.id || '').trim();
      const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
      if (refs.length > 0) {
        const lines = refs.map((r) => `#${r.index} ${r.name}（${getSourceLabel(r.source)}）`);
        setErrorMessage(`「${id}」正在被以下规则引用，无法禁用：\n\n${lines.join('\n')}\n\n请先移除上述规则中的引用。`);
        setErrorModalOpen(true);
        return;
      }
    }
    // 使用独立接口切换启用状态
    await window.ipcRenderer.db.toggleDnsServerEnabled(s.id, newEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const handleSetDefault = async (s: any) => {
    // 使用独立接口设置默认服务器
    await window.ipcRenderer.db.setDefaultDnsServer(s.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const needsServerField = ['udp', 'tls', 'https'].includes(form.type || '');
  const needsPathField = form.type === 'https';
  const defaultPort = DEFAULT_PORTS[(form.type || 'udp') as DnsServerType] ?? 53;
  
  /** 判断服务器地址是否为域名 */
  const isServerDomain = (addr: string | undefined): boolean => {
    if (!addr?.trim()) return false;
    const s = addr.trim();
    // IPv4 地址
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return false;
    // IPv6 地址（带或不带方括号）
    if (/^\[([0-9a-fA-F:]+)\]$/.test(s)) return false;
    if (/^[0-9a-fA-F:]+$/.test(s)) return false;
    return true;
  };
  
  const needsDomainResolver = needsServerField && isServerDomain(form.server);

  return (
    <div className="max-w-5xl space-y-5">
      <Card>
        <SectionHeader>
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-quaternary)]">
              DNS 服务器
            </h2>
            <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">
              管理 sing-box DNS 服务器列表，参考{' '}
              <a
                href="https://sing-box.sagernet.org/configuration/dns/server/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--app-accent)] hover:underline"
              >
                sing-box 文档
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                <Check className="w-3.5 h-3.5" />
                已保存
              </span>
            )}
            <Button variant="primary" size="sm" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-1.5" />
              添加服务器
            </Button>
          </div>
        </SectionHeader>
        <div className="panel-section overflow-x-auto">
          {dnsServers.length === 0 ? (
            <div className="py-12 text-center text-[var(--app-text-tertiary)] text-[13px]">
              暂无 DNS 服务器，点击「添加服务器」开始配置
            </div>
          ) : (
            <table className="data-table w-full">
              <thead className="border-b border-[rgba(39,44,54,0.08)]">
                <tr className="h-9">
                  <th className="w-12 shrink-0 pl-4 pr-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">序号</th>
                  <th className="w-[72px] shrink-0 px-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">类型</th>
                  <th className="min-w-[100px] px-2 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">名称</th>
                  <th className="min-w-[140px] px-2 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">地址</th>
                  <th className="w-[60px] shrink-0 px-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">出站</th>
                  <th className="w-[140px] shrink-0 pl-2 pr-4 py-1.5 text-right text-[11px] font-medium text-[var(--app-text-quaternary)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {dnsServers.map((s, index) => (
                  <tr key={s.id} className="border-b border-[rgba(39,44,54,0.06)] hover:bg-[rgba(0,0,0,0.02)]">
                    <td className="w-12 shrink-0 pl-4 pr-2 py-1.5 text-center text-[11px] text-[var(--app-text-quaternary)] align-middle">
                      {index + 1}
                    </td>
                    <td className="w-[72px] shrink-0 px-2 py-1.5 text-center align-middle">
                      <span className={`badge shrink-0 ${s.enabled === false ? 'badge-neutral opacity-50' : 'badge-neutral'}`}>{s.type}</span>
                    </td>
                    <td className="min-w-[100px] px-2 py-1.5 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[13px] font-medium truncate ${s.enabled === false ? 'text-[var(--app-text-tertiary)] line-through' : 'text-[var(--app-text)]'}`}>{s.id}</span>
                        {s.is_default && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                            <CircleDot className="w-3 h-3 fill-emerald-600" />
                            默认
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-[140px] px-2 py-1.5 align-middle">
                      <span className="text-[12px] text-[var(--app-text-tertiary)] truncate block">
                        {s.raw_data ? null : s.server ? (
                          <>
                            {s.server}
                            {s.server_port && s.server_port !== DEFAULT_PORTS[s.type as DnsServerType] && `:${s.server_port}`}
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td className="w-[60px] shrink-0 px-2 py-1.5 text-center align-middle">
                      <span className={`badge text-[10px] ${s.detour ? 'badge-accent' : 'badge-neutral'}`}>
                        {s.detour ? '代理' : '直连'}
                      </span>
                    </td>
                    <td className="w-[140px] shrink-0 pl-2 pr-4 py-1.5 text-right align-middle">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleEnabled(s)}
                          aria-label={s.enabled === false ? '启用' : '禁用'}
                          title={s.enabled === false ? '启用' : '禁用'}
                        >
                          <Power className={`w-4 h-4 ${s.enabled === false ? 'text-[var(--app-text-quaternary)]' : 'text-green-600'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSetDefault(s)}
                          aria-label="设为默认"
                          title="设为默认"
                          disabled={s.is_default === true || s.enabled === false}
                        >
                          <CircleDot className={`w-4 h-4 ${s.is_default ? 'text-emerald-600 fill-emerald-600' : 'text-[var(--app-text-tertiary)]'}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(s)} aria-label="编辑">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} aria-label="删除">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* 添加/编辑弹窗 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '编辑 DNS 服务器' : '添加 DNS 服务器'}
        maxWidth="max-w-md"
        contentClassName="p-5"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">类型</label>
            <Select
              value={form.type}
              onChange={(e) => {
                const t = e.target.value as DnsServerType;
                // 切换类型时，重置所有字段为默认值
                setForm({
                  type: t,
                  id: form.id ?? '',
                  server: '',
                  server_port: DEFAULT_PORTS[t] ?? 53,
                  path: getDefaultPath(t),
                  detour: '',
                  preferred_detour: '',
                  domain_resolver: '',
                  enabled: true,
                  is_default: false,
                });
                setRawJsonText('');
              }}
              className="w-full"
            >
              {DNS_SERVER_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">名称</label>
            <Input
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="例如: local, remote, doh"
              className="w-full"
            />
            <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">用于 DNS 规则中引用此服务器</p>
          </div>

          {needsServerField && (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">服务器地址</label>
                <Input
                  value={form.server}
                  onChange={(e) => setForm((f) => ({ ...f, server: e.target.value }))}
                  placeholder={
                      '8.8.8.8 或 dns.example.com'
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">端口</label>
                <Input
                  type="number"
                  value={form.server_port ?? defaultPort}
                  onChange={(e) => setForm((f) => ({ ...f, server_port: parseInt(e.target.value, 10) || defaultPort }))}
                  className="w-full"
                />
              </div>
            </>
          )}

          {needsPathField && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">路径</label>
              <Input
                value={form.path}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                placeholder="/dns-query"
                className="w-full"
              />
            </div>
          )}

          {needsDomainResolver && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                域名解析 <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.domain_resolver || ''}
                onChange={(e) => setForm((f) => ({ ...f, domain_resolver: e.target.value }))}
                className="w-full"
              >
                <option value="">请选择 DNS 服务器</option>
                {dnsServers
                  .filter((s) => s.id !== editingId && s.enabled !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} ({s.type})
                    </option>
                  ))}
              </Select>
              <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                服务器地址为域名时必须指定，用于解析服务器的域名
              </p>
            </div>
          )}

          {needsServerField && (
            <>
              {/* 出站字段：只有 selector_out 或不选 */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">出站</label>
                <Select
                  value={form.detour || ''}
                  onChange={(e) => setForm((f) => ({ ...f, detour: e.target.value }))}
                  className="w-full"
                >
                  <option value="">直连</option>
                  <option value="selector_out">代理</option>
                </Select>
                <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                  可选，指定连接此 DNS 服务器的出站
                </p>
              </div>
              {/* 订阅出站节点 */}
              <OutboundSelector
                value={form.preferred_detour || null}
                onChange={(tag) => setForm((f) => ({ ...f, preferred_detour: tag || '' }))}
                label="订阅出站节点"
                placeholder="不指定"
                hint="选择后将覆盖上面的出站（当前订阅有效）"
                filterDirectBlock={true}
              />
            </>
          )}

          {form.type === 'local' && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">解析方式</label>
              <Select
                value={form.prefer_go ? 'true' : 'false'}
                onChange={(e) => setForm((f) => ({ ...f, prefer_go: e.target.value === 'true' }))}
                className="w-full"
              >
                <option value="false">系统原生解析</option>
                <option value="true">Go 解析（prefer_go）</option>
              </Select>
              <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                Go 解析可避免部分系统 DNS 问题，但可能稍慢
              </p>
            </div>
          )}

          {form.type === 'raw' && (
            <JsonEditor
              value={rawJsonText}
              onChange={setRawJsonText}
              placeholder={`输入 sing-box DNS 服务器 JSON 配置，例如：
{
  "type": "udp",
  "tag": "my-dns",
  "server": "8.8.8.8",
  "server_port": 53,
  "detour": "proxy"
}`}
              rows={12}
              hint="输入完整的JSON 配置，其中tag字段会被名称覆盖"
              onFormatError={(err) => {
                setErrorMessage(err);
                setErrorModalOpen(true);
              }}
            />
          )}
        </div>
      </Modal>

      {/* 错误弹窗 */}
      <Modal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        title="配置错误"
        maxWidth="max-w-md"
        contentClassName="p-5"
        footer={<Button onClick={() => setErrorModalOpen(false)}>确定</Button>}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[14px] text-[var(--app-text-secondary)] whitespace-pre-line">{errorMessage}</p>
        </div>
      </Modal>
    </div>
  );
}
