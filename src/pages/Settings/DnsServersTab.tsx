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
import { OUTBOUND_LABELS } from '../../constants/outboundLabels';

/** sing-box DNS 服务器类型 */
export type DnsServerType =
  | 'local'
  | 'hosts'
  | 'udp'
  | 'tcp'
  | 'tls'
  | 'quic'
  | 'https'
  | 'h3'
  | 'fakeip'
  | 'dhcp'
  | 'tailscale'
  | 'resolved';

/** sing-box predefined 格式：hostname -> IP 或 hostname -> IP[] */
export type PredefinedHosts = Record<string, string | string[]>;

/** DNS 服务器配置（通用结构） */
export interface DnsServerConfig {
  type: DnsServerType;
  tag: string;
  server?: string;
  server_port?: number;
  path?: string;
  detour?: string;
  prefer_go?: boolean;
  inet4_range?: string;
  inet6_range?: string;
  predefined?: PredefinedHosts;
  /** 是否启用 */
  enabled?: boolean;
  /** 是否为默认DNS服务器 */
  is_default?: boolean;
  [key: string]: unknown;
}

const DNS_SERVER_TYPES: { value: DnsServerType; label: string }[] = [
  { value: 'local', label: 'Local（本地）' },
  { value: 'udp', label: 'UDP' },
  { value: 'tcp', label: 'TCP' },
  { value: 'tls', label: 'TLS (DoT)' },
  { value: 'https', label: 'HTTPS (DoH)' },
  { value: 'h3', label: 'HTTP/3' },
  { value: 'quic', label: 'QUIC' },
  { value: 'hosts', label: 'Hosts' },
  { value: 'fakeip', label: 'FakeIP' },
  { value: 'dhcp', label: 'DHCP' },
  { value: 'tailscale', label: 'Tailscale' },
  { value: 'resolved', label: 'Resolved' },
];

/** 出站选项（与策略编辑页一致） */
const DETOUR_OPTIONS = [
  { value: 'direct_out', label: OUTBOUND_LABELS.direct_out },
  { value: 'block_out', label: OUTBOUND_LABELS.block_out },
  { value: 'selector_out', label: OUTBOUND_LABELS.selector_out },
] as const;

const DEFAULT_PORTS: Partial<Record<DnsServerType, number>> = {
  udp: 53,
  tcp: 53,
  tls: 853,
  https: 443,
  h3: 443,
  quic: 853,
};

function getDefaultPath(type: DnsServerType): string {
  return type === 'https' || type === 'h3' ? '/dns-query' : '';
}

/** 将 sing-box predefined 对象转为 Windows hosts 风格多行文本 */
function predefinedToHostsText(predefined: PredefinedHosts | undefined): string {
  if (!predefined || typeof predefined !== 'object') return '';
  const lines: string[] = [];
  for (const [hostname, ips] of Object.entries(predefined)) {
    const ipList = Array.isArray(ips) ? ips : [ips];
    for (const ip of ipList) {
      if (ip && typeof ip === 'string') lines.push(`${ip}\t${hostname}`);
    }
  }
  return lines.join('\n');
}

/** 将 Windows hosts 风格多行文本解析为 sing-box predefined 对象 */
function hostsTextToPredefined(text: string): PredefinedHosts {
  const result: Record<string, string[]> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const ip = parts[0];
    const hostnames = parts.slice(1).filter((h) => h && !h.startsWith('#'));
    for (const hostname of hostnames) {
      if (!result[hostname]) result[hostname] = [];
      if (!result[hostname].includes(ip)) result[hostname].push(ip);
    }
  }
  const predefined: PredefinedHosts = {};
  for (const [hostname, ips] of Object.entries(result)) {
    predefined[hostname] = ips.length === 1 ? ips[0] : ips;
  }
  return predefined;
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
  const [form, setForm] = useState<Partial<DnsServerConfig>>({
    type: 'udp',
    tag: '',
    server: '',
    server_port: 53,
    path: '',
    detour: 'direct_out',
    enabled: true,
    is_default: false,
  });
  /** hosts 类型的 predefined，以 Windows hosts 风格多行文本编辑 */
  const [hostsPredefinedText, setHostsPredefinedText] = useState('');

  const loadDnsServers = async () => {
    try {
      const [servers, selected] = await Promise.all([
        window.ipcRenderer.db.getDnsServers(),
        window.ipcRenderer.core.getSelectedProfile(),
      ]);
      setDnsServers(servers || []);
      setProfileId((selected as any)?.profile?.id || '');
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadDnsServers();
  }, [isActive]);

  const validateForm = (): string => {
    if (!form.tag?.trim()) return '名称不能为空';
    const tag = form.tag.trim();
    const others = dnsServers.filter((s) => s.id !== editingId);
    if (others.some((s) => (s.tag || '').toLowerCase() === tag.toLowerCase())) {
      return `名称 "${tag}" 已存在`;
    }
    const needsServer = ['udp', 'tcp', 'tls', 'https', 'h3', 'quic'].includes(form.type || '');
    if (needsServer && !form.server?.trim()) return '服务器地址不能为空';
    return '';
  };

  const buildServerFromForm = () => {
    const type = (form.type || 'udp') as DnsServerType;
    const server: Record<string, unknown> = {
      type,
      tag: form.tag?.trim() || 'dns',
    };
    if (['udp', 'tcp', 'tls', 'https', 'h3', 'quic'].includes(type)) {
      if (form.server) server.server = form.server.trim();
      const port = form.server_port ?? DEFAULT_PORTS[type];
      if (port !== undefined && port !== 53 && type === 'udp') server.server_port = port;
      if (port !== undefined && port !== 53 && type === 'tcp') server.server_port = port;
      if (port !== undefined && port !== 853 && type === 'tls') server.server_port = port;
      if (port !== undefined && port !== 443 && (type === 'https' || type === 'h3')) server.server_port = port;
      if (port !== undefined && port !== 853 && type === 'quic') server.server_port = port;
    }
    if ((type === 'https' || type === 'h3') && form.path?.trim()) {
      server.path = form.path.trim();
    }
    const detourVal = form.detour?.trim();
    if (detourVal && DETOUR_OPTIONS.some((o) => o.value === detourVal)) {
      server.detour = detourVal;
    }
    if (type === 'local' && form.prefer_go !== undefined) server.prefer_go = form.prefer_go;
    if (type === 'fakeip') {
      if (form.inet4_range?.trim()) server.inet4_range = form.inet4_range.trim();
      if (form.inet6_range?.trim()) server.inet6_range = form.inet6_range.trim();
    }
    if (type === 'hosts') {
      const predefined = hostsTextToPredefined(hostsPredefinedText);
      if (Object.keys(predefined).length > 0) server.predefined = predefined;
    }
    return server;
  };

  const openAddModal = async () => {
    setEditingId(null);
    setForm({
      type: 'udp',
      tag: '',
      server: '',
      server_port: 53,
      path: getDefaultPath('https'),
      detour: '',
      enabled: true,
      is_default: false,
    });
    setHostsPredefinedText('');
    setModalOpen(true);
  };

  const openEditModal = async (s: any) => {
    setEditingId(s.id);
    const tag = s.tag || '';
    const detourVal = s.detour?.trim();
    const validDetour = detourVal && DETOUR_OPTIONS.some((o) => o.value === detourVal) ? detourVal : '';
    setForm({
      type: (s.type || 'udp') as DnsServerType,
      tag,
      server: s.server || '',
      server_port: s.server_port ?? DEFAULT_PORTS[(s.type || 'udp') as DnsServerType],
      path: s.path ?? getDefaultPath((s.type || 'https') as DnsServerType),
      detour: validDetour,
      prefer_go: s.prefer_go,
      inet4_range: s.inet4_range,
      inet6_range: s.inet6_range,
    });
    setHostsPredefinedText(predefinedToHostsText(s.predefined));
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

    if (editingId) {
      await window.ipcRenderer.db.updateDnsServer(editingId, serverData);
    } else {
      await window.ipcRenderer.db.addDnsServer(serverData);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
    setModalOpen(false);
  };

  const handleDelete = async (s: any) => {
    const tag = (s.tag || '').trim();
    const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
    if (refs.length > 0) {
      const lines = refs.map((r) => `#${r.index} ${r.name}（${r.source === 'dns' ? 'DNS 策略' : '路由策略'}）`);
      setErrorMessage(`「${tag}」正在被以下规则引用，无法删除：\n\n${lines.join('\n')}\n\n请先移除上述规则中的引用。`);
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
      const tag = (s.tag || '').trim();
      const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
      if (refs.length > 0) {
        const lines = refs.map((r) => `#${r.index} ${r.name}（${r.source === 'dns' ? 'DNS 策略' : '路由策略'}）`);
        setErrorMessage(`「${tag}」正在被以下规则引用，无法禁用：\n\n${lines.join('\n')}\n\n请先移除上述规则中的引用。`);
        setErrorModalOpen(true);
        return;
      }
    }
    // 如果禁用服务器，同时取消默认状态
    if (!newEnabled && s.is_default) {
      await window.ipcRenderer.db.updateDnsServer(s.id, { enabled: newEnabled, is_default: false });
    } else {
      await window.ipcRenderer.db.updateDnsServer(s.id, { enabled: newEnabled });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const handleSetDefault = async (s: any) => {
    // 先将所有服务器设置为非默认
    for (const server of dnsServers) {
      if (server.is_default && server.id !== s.id) {
        await window.ipcRenderer.db.updateDnsServer(server.id, { is_default: false });
      }
    }
    // 设置当前服务器为默认，如果当前被禁用则同时启用
    const updates: any = { is_default: true };
    if (s.enabled === false) {
      updates.enabled = true;
    }
    await window.ipcRenderer.db.updateDnsServer(s.id, updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const needsServerField = ['udp', 'tcp', 'tls', 'https', 'h3', 'quic'].includes(form.type || '');
  const needsPathField = ['https', 'h3'].includes(form.type || '');
  const defaultPort = DEFAULT_PORTS[(form.type || 'udp') as DnsServerType] ?? 53;

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
              <thead className="border-b border-[rgba(39,44,54,0.08)] bg-[rgba(248,249,251,0.95)]">
                <tr className="h-9">
                  <th className="w-12 shrink-0 pl-4 pr-2 py-2 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">序号</th>
                  <th className="w-[72px] shrink-0 px-2 py-2 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">类型</th>
                  <th className="min-w-[100px] px-2 py-2 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">名称</th>
                  <th className="min-w-[140px] px-2 py-2 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">地址 / 配置</th>
                  <th className="w-[140px] shrink-0 pl-2 pr-4 py-2 text-right text-[11px] font-medium text-[var(--app-text-quaternary)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {dnsServers.map((s, index) => (
                  <tr key={s.id} className="border-b border-[rgba(39,44,54,0.06)] hover:bg-[rgba(0,0,0,0.02)]">
                    <td className="w-12 shrink-0 pl-4 pr-2 py-2 text-center text-[12px] text-[var(--app-text-quaternary)] align-middle">
                      {index + 1}
                    </td>
                    <td className="w-[72px] shrink-0 px-2 py-2 text-center align-middle">
                      <span className={`badge shrink-0 ${s.enabled === false ? 'badge-neutral opacity-50' : 'badge-neutral'}`}>{s.type}</span>
                    </td>
                    <td className="min-w-[100px] px-2 py-2 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-medium truncate ${s.enabled === false ? 'text-[var(--app-text-tertiary)] line-through' : 'text-[var(--app-text)]'}`}>{s.tag}</span>
                        {s.is_default && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                            <CircleDot className="w-3 h-3 fill-emerald-600" />
                            默认
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-[140px] px-2 py-2 align-middle">
                      <span className="text-[12px] text-[var(--app-text-tertiary)] truncate block">
                        {s.server && (
                          <>
                            {s.server}
                            {s.server_port && s.server_port !== DEFAULT_PORTS[s.type as DnsServerType] && `:${s.server_port}`}
                          </>
                        )}
                        {!s.server && s.type === 'fakeip' && s.inet4_range && s.inet4_range}
                        {!s.server && s.type === 'hosts' && s.predefined && Object.keys(s.predefined).length > 0 && `${Object.keys(s.predefined).length} 条`}
                      </span>
                    </td>
                    <td className="w-[140px] shrink-0 pl-2 pr-4 py-2 text-right align-middle">
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
                setForm((f) => ({
                  ...f,
                  type: t,
                  server_port: DEFAULT_PORTS[t] ?? f.server_port,
                  path: getDefaultPath(t),
                }));
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
              value={form.tag}
              onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
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
                    form.type === 'https' || form.type === 'h3'
                      ? 'https://cloudflare-dns.com/dns-query'
                      : '8.8.8.8 或 dns.example.com'
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

          {needsServerField && (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">出站</label>
                <Select
                  value={form.detour || ''}
                  onChange={(e) => setForm((f) => ({ ...f, detour: e.target.value }))}
                  className="w-full"
                >
                  <option value="">不指定</option>
                  {DETOUR_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">可选，直连 / 拦截 / 代理</p>
              </div>
            </>
          )}

          {form.type === 'local' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="prefer_go"
                checked={form.prefer_go ?? false}
                onChange={(e) => setForm((f) => ({ ...f, prefer_go: e.target.checked }))}
                className="rounded border-[rgba(39,44,54,0.2)]"
              />
              <label htmlFor="prefer_go" className="text-[13px] text-[var(--app-text-secondary)]">
                prefer_go（优先使用 Go 解析）
              </label>
            </div>
          )}

          {form.type === 'fakeip' && (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">IPv4 范围</label>
                <Input
                  value={form.inet4_range}
                  onChange={(e) => setForm((f) => ({ ...f, inet4_range: e.target.value }))}
                  placeholder="198.18.0.0/15"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">IPv6 范围</label>
                <Input
                  value={form.inet6_range}
                  onChange={(e) => setForm((f) => ({ ...f, inet6_range: e.target.value }))}
                  placeholder="fc00::/18"
                  className="w-full"
                />
              </div>
            </>
          )}

          {form.type === 'hosts' && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                Predefined（预定义 hosts）
              </label>
              <textarea
                value={hostsPredefinedText}
                onChange={(e) => setHostsPredefinedText(e.target.value)}
                placeholder={`格式与 Windows hosts 文件相同，每行：IP 地址 + 空格/制表符 + 域名
# 注释以 # 开头
127.0.0.1   localhost
::1         localhost
127.0.0.1   www.example.com`}
                rows={10}
                className="w-full px-3 py-2 text-[13px] font-mono border rounded-[10px] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent bg-white text-[var(--app-text)] placeholder:text-[var(--app-text-quaternary)] border-[rgba(39,44,54,0.12)]"
              />
              <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                每行格式：IP 地址 + 空格/制表符 + 一个或多个域名，支持 # 注释
              </p>
            </div>
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
