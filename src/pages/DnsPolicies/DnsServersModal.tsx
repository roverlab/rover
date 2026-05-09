/**
 * DNS 服务器管理弹窗
 * 基于 sing-box DNS Server 配置：https://sing-box.sagernet.org/configuration/dns/server/
 * 从 DnsServersTab 改造为弹窗形式，集成到 DNS 策略页面
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Select } from '../../components/ui/Field';

import { Plus, Check, AlertCircle, Server, MoreVertical, Settings, X, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '../../components/ui/Switch';
import { OutboundSelector } from '../../components/OutboundSelector';
import { JsonEditor } from '../../components/JsonEditor';
import { MultiLineServerList } from '../../components/MultiLineServerList';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/Surface';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';

/** sing-box DNS 服务器类型 */
export type DnsServerType =
  | 'local'
  | 'udp'
  | 'tls'
  | 'https'
  | 'rover'
  | 'raw';

/** DNS 服务器配置（通用结构） */
export interface DnsServerConfig {
  type: DnsServerType;
  id: string;
  /** 显示名称（用于UI展示） */
  name?: string;
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
  /** rover: 上游DNS地址列表（逗号分隔） */
  upstreams?: string;
  /** rover: 是否使用代理（使用DNS代理端口） */
  use_proxy?: boolean;
  /** 是否为默认DNS服务器 */
  [key: string]: unknown;
}

const DEFAULT_PORTS: Partial<Record<DnsServerType, number>> = {
  udp: 53,
  tls: 853,
  https: 443,
  rover: 53,
};

function getDefaultPath(type: DnsServerType): string {
  return type === 'https' ? '/dns-query' : '';
}

/** DNS 服务设置表单（用于弹窗内部） */
function DnsServiceSettingsForm({
  initialEnabled,
  initialPort,
  initialProxyPort,
  onSave,
  onCancel,
}: {
  initialEnabled: boolean;
  initialPort: number;
  initialProxyPort: number;
  onSave: (enabled: boolean, port: number, proxyPort: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [port, setPort] = useState(initialPort);
  const [proxyPort, setProxyPort] = useState(initialProxyPort);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(enabled, port, proxyPort);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Content */}
      <div className="p-6 space-y-5">
        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium text-[var(--app-text)]">
              {t('dnsServersTab.serviceLabel')}
            </div>
            <p className="text-[12px] text-[var(--app-text-tertiary)] leading-relaxed mt-0.5">
              {t('dnsServersTab.serviceSettingsHint')}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v)}
          />
        </div>

        {/* 服务端口 */}
        <div className="space-y-2">
          <div>
            <div className="text-[14px] font-medium text-[var(--app-text)]">
              {t('dnsServersTab.servicePort')}
            </div>
            <p className="text-[12px] text-[var(--app-text-tertiary)] leading-relaxed mt-0.5">
              {t('dnsServersTab.servicePortHint')}
            </p>
          </div>
          <Input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* 代理端口 */}
        <div className="space-y-2">
          <div>
            <div className="text-[14px] font-medium text-[var(--app-text)]">
              {t('dnsServersTab.proxyPort')}
            </div>
            <p className="text-[12px] text-[var(--app-text-tertiary)] leading-relaxed mt-0.5">
              {t('dnsServersTab.proxyPortHint')}
            </p>
          </div>
          <Input
            type="number"
            value={proxyPort}
            onChange={(e) => setProxyPort(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </>
  );
}

interface DnsServersModalProps {
  open: boolean;
  onClose: () => void;
  onRegenerateConfig?: () => Promise<void>;
  onServersChanged?: () => void;
}

export function DnsServersModal({ open, onClose, onRegenerateConfig, onServersChanged }: DnsServersModalProps) {
  const { t } = useTranslation();

  // DNS 服务设置状态
  const [dnsServerEnabled, setDnsServerEnabled] = useState(true);
  const [dnsPort, setDnsPort] = useState(5353);
  const [dnsProxyPort, setDnsProxyPort] = useState(17890);
  const [dnsSettingsModalOpen, setDnsSettingsModalOpen] = useState(false);
  const dnsServerTypeOptions = useMemo(
    () =>
      [
        { value: 'local' as const, label: t('dnsServersTab.typeLocal') },
        { value: 'udp' as const, label: t('dnsServersTab.typeUdp') },
        { value: 'tls' as const, label: t('dnsServersTab.typeTls') },
        { value: 'https' as const, label: t('dnsServersTab.typeHttps') },
        { value: 'raw' as const, label: t('dnsServersTab.typeRaw') },
        { value: 'rover' as const, label: t('dnsServersTab.typeRover') },
      ] satisfies { value: DnsServerType; label: string }[],
    [t]
  );
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
    name: '',
    server: '',
    server_port: 53,
    path: '',
    detour: '',
    preferred_detour: '',
    domain_resolver: '',
    enabled: true,
    upstreams: '',
    use_proxy: false,
  });
  /** raw 类型的原始 JSON 文本 */
  const [rawJsonText, setRawJsonText] = useState('');

  const loadDnsServers = async () => {
    try {
      const [servers, selected, allSettings] = await Promise.all([
        window.ipcRenderer.db.getDnsServers(),
        window.ipcRenderer.core.getSelectedProfile(),
        window.ipcRenderer.db.getAllSettings(),
      ]);
      const currentProfileId = (selected as any)?.profile?.id || '';
      setDnsServers(servers || []);
      setProfileId(currentProfileId);
      // 加载 DNS 服务设置
      const enabledVal = allSettings['dns-server-enabled'] ?? 'true';
      const portVal = allSettings['dns-server-port'] || '5353';
      const proxyPortVal = allSettings['dns-proxy-port'] || '17890';
      setDnsServerEnabled(enabledVal === 'true');
      setDnsPort(parseInt(portVal, 10) || 5353);
      setDnsProxyPort(parseInt(proxyPortVal, 10) || 17890);
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
    if (!open) return;
    loadDnsServers();
  }, [open]);

  /** 去除协议前缀（如 tls://、https:// 等） */
  const stripProtocol = (addr: string): string => {
    return addr.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  };

  /** 校验是否为合法 IPv4 或 IPv6 地址（支持带端口，如 8.8.8.8:53） */
  const isValidIpAddr = (addr: string): boolean => {
    const trimmed = addr.trim();
    if (!trimmed) return false;
    // 去除协议前缀
    let host = stripProtocol(trimmed);
    const lastColon = host.lastIndexOf(':');
    if (lastColon > 0) {
      const afterColon = host.slice(lastColon + 1);
      // 如果冒号后面是纯数字，则视为端口
      if (/^\d+$/.test(afterColon)) {
        const port = parseInt(afterColon, 10);
        if (port < 1 || port > 65535) return false;
        host = host.slice(0, lastColon);
      }
    }
    // IPv4
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      const parts = host.split('.');
      if (parts.every((p) => {
        const n = parseInt(p, 10);
        return n >= 0 && n <= 255 && String(n) === p;
      })) {
        return true;
      }
    }
    // IPv6（含方括号形式）
    const ipv6Host = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,7}:$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$/.test(ipv6Host)) return true;
    if (/^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$/.test(ipv6Host)) return true;
    if (/^[0-9a-fA-F]{1,4}:(:[0-9a-fA-F]{1,4}){1,6}$/.test(ipv6Host)) return true;
    if (/^::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$/.test(ipv6Host)) return true;
    if (/^::$/.test(ipv6Host)) return true;
    // IPv4-mapped IPv6
    if (/^([0-9a-fA-F]{1,4}:){1,4}:(\d{1,3}\.){3}\d{1,3}$/.test(ipv6Host)) {
      const parts = ipv6Host.split(':');
      const ipv4Part = parts[parts.length - 1];
      const ipv4Parts = ipv4Part.split('.');
      if (ipv4Parts.every((p) => {
        const n = parseInt(p, 10);
        return n >= 0 && n <= 255 && String(n) === p;
      })) {
        return true;
      }
    }
    return false;
  };

  const validateForm = (): string => {
    if (!form.name?.trim()) return t('dnsServersTab.valNameRequired');
    const others = dnsServers.filter((s) => s.id !== editingId);
    const name = form.name.trim();
    if (others.some((s) => (s.name || '').toLowerCase() === name.toLowerCase())) {
      return t('dnsServersTab.valNameDuplicate', { name });
    }
    const needsServer = ['udp', 'tls', 'https'].includes(form.type || '');
    if (needsServer && !form.server?.trim()) return t('dnsServersTab.valServerRequired');
    if (needsServer && form.server?.trim()) {
      const serverAddr = form.server.trim();
      const isDomain = !/^(\d{1,3}\.){3}\d{1,3}$/.test(serverAddr) &&
                       !/^\[([0-9a-fA-F:]+)\]$/.test(serverAddr) &&
                       !/^[0-9a-fA-F:]+$/.test(serverAddr);
      if (isDomain && !form.domain_resolver?.trim()) {
        return t('dnsServersTab.valResolverRequired');
      }
    }
    if (form.type === 'raw') {
      try {
        if (!rawJsonText.trim()) return t('dnsServersTab.valRawEmpty');
        JSON.parse(rawJsonText);
      } catch {
        return t('dnsServersTab.valRawInvalid');
      }
    }
    // rover 类型：使用代理时 bootstrap_addrs 必填
    if (form.type === 'rover' && form.use_proxy && !form.bootstrap_addrs?.trim()) {
      return t('dnsServersTab.valBootstrapRequired');
    }
    // rover 类型：bootstrap_addrs 必须是合法的 IP 地址
    if (form.type === 'rover' && form.bootstrap_addrs?.trim()) {
      const addrs = form.bootstrap_addrs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const addr of addrs) {
        if (!isValidIpAddr(addr)) {
          return t('dnsServersTab.valBootstrapInvalid', { addr });
        }
      }
    }
    return '';
  };

  const buildServerFromForm = () => {
    const type = (form.type || 'udp') as DnsServerType;
    const server: Record<string, unknown> = {
      type,
      name: form.name?.trim() || '',
    };
    if (type === 'raw') {
      try {
        const rawData = JSON.parse(rawJsonText);
        server.raw_data = rawData;
        if (rawData.type) server.type = rawData.type;
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
    if (type === 'https' && form.path?.trim()) {
      server.path = form.path.trim();
    }
    if (form.domain_resolver?.trim()) {
      server.domain_resolver = form.domain_resolver.trim();
    }
    if (form.detour?.trim()) {
      server.detour = form.detour.trim();
    }
    if (type === 'local' && form.prefer_go !== undefined) server.prefer_go = form.prefer_go;
    // rover type fields
    if (type === 'rover') {
      server.upstreams = form.upstreams?.trim() || '';
      server.use_proxy = form.use_proxy === true;
      server.bootstrap_addrs = form.bootstrap_addrs?.trim() || '';
      server.fallback_addrs = form.fallback_addrs?.trim() || '';
    }
    return server;
  };

  const openAddModal = async () => {
    setEditingId(null);
    setForm({
      type: 'udp',
      id: '',
      name: '',
      server: '',
      server_port: 53,
      path: getDefaultPath('https'),
      detour: '',
      preferred_detour: '',
      domain_resolver: '',
      enabled: true,
      upstreams: '',
      use_proxy: false,
      bootstrap_addrs: '',
      fallback_addrs: '',
    });
    setRawJsonText('');
    setModalOpen(true);
  };

  const openEditModal = async (s: any) => {
    setEditingId(s.id);
    const id = s.id || '';
    const preferredDetourVal = await getDnsServerDetour(s.id);
    const isRaw = !!s.raw_data;
    setForm({
      type: isRaw ? 'raw' : ((s.type || 'udp') as DnsServerType),
      id,
      name: s.name || '',
      server: s.server || '',
      server_port: s.server_port ?? DEFAULT_PORTS[(s.type || 'udp') as DnsServerType],
      path: s.path ?? getDefaultPath((s.type || 'https') as DnsServerType),
      detour: s.detour || '',
      preferred_detour: preferredDetourVal,
      prefer_go: s.prefer_go,
      domain_resolver: s.domain_resolver || '',
      raw_data: s.raw_data,
      upstreams: s.upstreams || '',
      use_proxy: s.use_proxy === true,
      bootstrap_addrs: s.bootstrap_addrs || '',
      fallback_addrs: s.fallback_addrs || '',
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
      const originalServer = dnsServers.find((s) => s.id === editingId);
      if (originalServer) {
        serverData.id = originalServer.id;
        serverData.enabled = originalServer.enabled;
      }
      await window.ipcRenderer.db.updateDnsServer(editingId, serverData);
      serverId = editingId;
    } else {
      serverId = await window.ipcRenderer.db.addDnsServer(serverData);
    }

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
    onServersChanged?.();
    await onRegenerateConfig?.();
    setModalOpen(false);
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'dns': return t('dnsServersTab.refTypeDns');
      case 'route': return t('dnsServersTab.refTypeRoute');
      case 'dns_server': return t('dnsServersTab.refTypeDnsServer');
      case 'setting': return t('dnsServersTab.refTypeSetting');
      default: return source;
    }
  };

  const handleDelete = async (s: any) => {
    const id = (s.id || '').trim();
    const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
    if (refs.length > 0) {
      const lines = refs.map((r) => `#${r.index} ${r.name}（${getSourceLabel(r.source)}）`);
      setErrorMessage(t('dnsServersTab.refBlockDelete', { id, lines: lines.join('\n') }));
      setErrorModalOpen(true);
      return;
    }
    await window.ipcRenderer.db.deleteDnsServer(s.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    onServersChanged?.();
    await onRegenerateConfig?.();
  };

  const handleToggleEnabled = async (s: any) => {
    const newEnabled = s.enabled === false;
    if (!newEnabled) {
      const id = (s.id || '').trim();
      const refs = s.id ? await window.ipcRenderer.db.getDnsServerRefs(s.id) : [];
      if (refs.length > 0) {
        const lines = refs.map((r) => `#${r.index} ${r.name}（${getSourceLabel(r.source)}）`);
        setErrorMessage(t('dnsServersTab.refBlockDisable', { id, lines: lines.join('\n') }));
        setErrorModalOpen(true);
        return;
      }
    }
    await window.ipcRenderer.db.toggleDnsServerEnabled(s.id, newEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    onServersChanged?.();
    await onRegenerateConfig?.();
  };

  // 拖拽排序回调
  const handleReorder = useCallback(async (itemId: string, _oldIndex: number, newIndex: number, visibleOrderedIds: string[]) => {
    const currentServers = [...dnsServers];
    const fromIndex = currentServers.findIndex(s => s.id === itemId);
    if (fromIndex === -1 || fromIndex === newIndex) return;
    const visibleIdSet = new Set(visibleOrderedIds);
    const reorderedVisible = visibleOrderedIds
      .map(id => currentServers.find(s => s.id === id))
      .filter((s): s is DnsServerConfig => Boolean(s));
    let visibleIndex = 0;
    const reorderedServers = currentServers.map(server =>
      visibleIdSet.has(server.id) ? reorderedVisible[visibleIndex++] : server
    );
    setDnsServers(reorderedServers);
    const orderedIds = reorderedServers.map(s => s.id);
    try {
      await window.ipcRenderer.db.updateDnsServersOrder(orderedIds);
      window.ipcRenderer.core.generateConfig().catch(console.error);
    } catch (err: any) {
      console.error('Failed to update DNS servers order:', err);
      loadDnsServers();
    }
  }, [dnsServers]);

  const needsServerField = ['udp', 'tls', 'https'].includes(form.type || '');
  const needsPathField = form.type === 'https';
  const needsRoverField = form.type === 'rover';
  const defaultPort = DEFAULT_PORTS[(form.type || 'udp') as DnsServerType] ?? 53;
  
  /** 判断服务器地址是否为域名 */
  const isServerDomain = (addr: string | undefined): boolean => {
    if (!addr?.trim()) return false;
    const s = addr.trim();
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return false;
    if (/^\[([0-9a-fA-F:]+)\]$/.test(s)) return false;
    if (/^[0-9a-fA-F:]+$/.test(s)) return false;
    return true;
  };
  
  const needsDomainResolver = needsServerField && isServerDomain(form.server);

  // ---- PolicyListTable 配置 ----

  // 给每个 DNS 服务器加上 name 字段（兼容 PolicyListTable 的泛型约束）
  const tableItems = useMemo(() => {
    return dnsServers.map((s) => ({ ...s, name: s.name || s.id || '' }));
  }, [dnsServers]);

  // 列定义
  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      id: 'name',
      header: t('dnsServersTab.colName'),
      width: 'minmax(100px, 1fr)',
    },
    {
      id: 'type',
      header: t('dnsServersTab.colType'),
      width: '72px',
      align: 'center',
    },
    {
      id: 'address',
      header: t('dnsServersTab.colAddress'),
      width: 'minmax(140px, 1fr)',
    },
    {
      id: 'detour',
      header: t('dnsServersTab.colDetour'),
      width: '70px',
      align: 'center',
    },
  ], [t]);

  // 搜索字段
  const searchFields = useMemo(() => (s: any) => [
    s.name || '',
    s.id || '',
    s.type || '',
    s.server || '',
  ], []);

  // 单元格渲染
  const renderCell = (s: any, columnId: string, _index: number) => {
    const enabled = s.enabled !== false;
    switch (columnId) {
      case 'name':
        return (
          <span className={cn(
            "text-[13px] font-medium truncate",
            enabled ? "text-[var(--app-text)]" : "text-[var(--app-text-tertiary)] line-through"
          )}>
            {s.name || s.id}
          </span>
        );
      case 'type':
        return (
          <span className="inline-flex items-center rounded-md border border-[var(--app-stroke)]/70 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--app-text-secondary)] tracking-wide">
            {s.type}
          </span>
        );
case 'address':
return (
<span className="text-[12px] text-[var(--app-text-tertiary)] truncate block">
{s.raw_data ? null : s.type === 'rover' ? null : s.server ? (
<>
{s.server}
{s.server_port && s.server_port !== DEFAULT_PORTS[s.type as DnsServerType] && `:${s.server_port}`}
</>
) : null}
          </span>
        );
      case 'detour':
        return (
          <div className="flex items-center justify-center">
            <span
              className="inline-flex items-center rounded-full border border-[var(--app-accent-border)]/60 bg-gradient-to-b from-[var(--app-accent-soft)]/50 to-[var(--app-accent-soft)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--app-accent-strong)] shadow-sm"
              title={s.detour ? t('dnsServersTab.detourProxy') : t('dnsServersTab.detourDirect')}
            >
              {s.detour ? t('dnsServersTab.detourProxy') : t('dnsServersTab.detourDirect')}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  // 下拉菜单渲染
  const renderDropdown = (s: any, position: { top: number; left: number }, close: () => void) => (
    createPortal(
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -5 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -5 }}
        transition={{ duration: 0.15 }}
        className="dropdown-menu fixed z-[200] flex w-30 flex-col overflow-hidden rounded-[12px] border border-[var(--app-stroke)] bg-[var(--app-panel)] py-1.5 shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors text-left w-full"
          onClick={() => { close(); openEditModal(s); }}
        >
          <Pencil className="w-3.5 h-3.5 mr-2" />
          {t('dnsServersTab.edit')}
        </button>
        <div className="mx-2 my-1 border-t border-[var(--app-divider)]" />
        <button
          className="flex items-center px-3 py-1.5 text-[12px] text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] transition-colors text-left w-full"
          onClick={() => { close(); handleDelete(s); }}
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          {t('dnsServersTab.delete')}
        </button>
      </motion.div>,
      document.body
    )
  );

  // 自定义操作列（更多菜单按钮）
  const renderActions = (_s: any, _index: number, dropdownButtonRef: (el: HTMLButtonElement | null) => void, onOpenDropdown: (e: React.MouseEvent, itemId: string) => void) => {
    return (
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          ref={dropdownButtonRef}
          onClick={(e) => onOpenDropdown(e, _s.id)}
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  };

  // 工具栏右侧额外内容（保存提示）
  const toolbarRightExtra = saved ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--app-success)]">
      <Check className="w-3.5 h-3.5" />
      {t('dnsServersTab.saved')}
    </span>
  ) : null;

  // 保存 DNS 服务设置
  const handleSaveDnsSettings = async (enabled: boolean, port: number, proxyPort: number) => {
    try {
      await window.ipcRenderer.db.setSetting('dns-server-enabled', enabled.toString());
      await window.ipcRenderer.db.setSetting('dns-server-port', port.toString());
      await window.ipcRenderer.db.setSetting('dns-proxy-port', proxyPort.toString());
      setDnsServerEnabled(enabled);
      setDnsPort(port);
      setDnsProxyPort(proxyPort);
      setDnsSettingsModalOpen(false);
      await onRegenerateConfig?.();
    } catch (e) {
      console.error('Failed to save DNS settings', e);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag', maxHeight: '85vh' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
          <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
            {t('dnsServersTab.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* DNS 服务状态栏 + 设置按钮 */}
          <div className="shrink-0 px-5 py-2 flex items-center gap-2 border-b border-[var(--app-stroke)]/50">
            <span className={cn(
              "w-[7px] h-[7px] rounded-full shrink-0",
              dnsServerEnabled
                ? "bg-[var(--app-success)]"
                : "bg-[var(--app-text-quaternary)]"
            )} style={dnsServerEnabled ? { boxShadow: '0 0 0 3px var(--app-success-soft), 0 0 10px rgba(34, 201, 154, 0.40)' } : undefined} />
            <span className="text-[12px] text-[var(--app-text-tertiary)]">
              {t('dnsServersTab.serviceLabel')}
            </span>
            <span className="mx-0.5 h-3 w-px bg-[var(--app-stroke)]" />
            <span className="text-[11px] text-[var(--app-text-quaternary)]">{t('dnsServersTab.servicePort')}</span>
            <Badge tone="accent" className="h-5 px-1.5 text-[10px]">{dnsPort}</Badge>
            <span className="mx-0.5 h-3 w-px bg-[var(--app-stroke)]" />
            <button
              type="button"
              onClick={() => setDnsSettingsModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--app-text-quaternary)] hover:text-[var(--app-text-secondary)] transition-colors"
            >
              <Settings className="w-3 h-3" />
              {t('dnsServersTab.serviceSettingsBtn')}
            </button>
          </div>

          <PolicyListTable<any>
            items={tableItems}
            columns={columns}
            renderCell={renderCell}
            searchFields={searchFields}
            searchPlaceholder={t('dnsServersTab.searchPlaceholder')}
            addLabelKey="dnsServersTab.addServer"
            getEnabled={(s) => s.enabled !== false}
            onAdd={openAddModal}
            onToggleEnabled={handleToggleEnabled}
            onEdit={openEditModal}
            renderDropdown={renderDropdown}
            renderActions={renderActions}
            onReorder={handleReorder}
            showIndexColumn
            noMatchText={t('dnsServersTab.noMatch')}
            toolbarRightExtra={toolbarRightExtra}
            emptyState={
              <div className="flex min-h-[180px] flex-col items-center justify-center py-8 text-center">
                <Server className="h-8 w-8 text-[var(--app-text-quaternary)] opacity-40" />
                <p className="mt-3 text-[13px] text-[var(--app-text-tertiary)]">{t('dnsServersTab.emptyHint')}</p>
              </div>
            }
          />
        </div>

      {/* 添加/编辑弹窗（嵌套） */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div
            className="relative z-10 w-full max-w-md flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
              <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                {editingId ? t('dnsServersTab.modalEditTitle') : t('dnsServersTab.modalAddTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.typeLabel')}</label>
                <Select
                  value={form.type}
                  onChange={(e) => {
                    const nextType = e.target.value as DnsServerType;
                    setForm({
                      type: nextType,
                      id: form.id ?? '',
                      name: form.name ?? '',
                      server: '',
                      server_port: DEFAULT_PORTS[nextType] ?? 53,
                      path: getDefaultPath(nextType),
                      detour: '',
                      preferred_detour: '',
                      domain_resolver: '',
                      enabled: true,
                    });
                    setRawJsonText('');
                  }}
                  className="w-full"
                >
                  {dnsServerTypeOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.displayName')}</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('dnsServersTab.displayNamePlaceholder')}
                  className="w-full"
                />
                <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">{t('dnsServersTab.displayNameHint')}</p>
              </div>

              {needsServerField && (
                <>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.serverAddress')}</label>
                    <Input
                      value={form.server}
                      onChange={(e) => setForm((f) => ({ ...f, server: e.target.value }))}
                      placeholder={t('dnsServersTab.serverAddressPlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.port')}</label>
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
                  <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.path')}</label>
                  <Input
                    value={form.path}
                    onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                    placeholder="/dns-query"
                    className="w-full"
                  />
                </div>
              )}

              {needsRoverField && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-[12px] font-medium text-[var(--app-text-secondary)]">{t('dnsServersTab.roverUseProxy')}</label>
                      <p className="text-[11px] text-[var(--app-text-quaternary)] mt-0.5">{t('dnsServersTab.roverUseProxyHint')}</p>
                    </div>
                    <Switch
                      checked={form.use_proxy || false}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, use_proxy: v }))}
                    />
                  </div>
                  <MultiLineServerList
                    value={form.upstreams || ''}
                    onChange={(v) => setForm((f) => ({ ...f, upstreams: v }))}
                    label={t('dnsServersTab.roverUpstreams')}
                    placeholder={t('dnsServersTab.roverUpstreamsPlaceholder')}
                    hint={t('dnsServersTab.roverUpstreamsHint')}
                  />
                  <MultiLineServerList
                    value={form.fallback_addrs || ''}
                    onChange={(v) => setForm((f) => ({ ...f, fallback_addrs: v }))}
                    label={t('dnsServersTab.fallbackAddrs')}
                    placeholder={t('dnsServersTab.fallbackAddrsPlaceholder')}
                    hint={t('dnsServersTab.fallbackAddrsHint')}
                  />
                  <MultiLineServerList
                    value={form.bootstrap_addrs || ''}
                    onChange={(v) => setForm((f) => ({ ...f, bootstrap_addrs: v }))}
                    label={t('dnsServersTab.bootstrapAddrs')}
                    placeholder={t('dnsServersTab.bootstrapAddrsPlaceholder')}
                    hint={t('dnsServersTab.bootstrapAddrsHint')}
                  />
                </>
              )}

              {needsDomainResolver && (
                <div>
                  <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                    {t('dnsServersTab.domainResolver')} <span className="text-[var(--app-danger)]">*</span>
                  </label>
                  <Select
                    value={form.domain_resolver || ''}
                    onChange={(e) => setForm((f) => ({ ...f, domain_resolver: e.target.value }))}
                    className="w-full"
                  >
                    <option value="">{t('dnsServersTab.selectDnsServer')}</option>
                    {dnsServers
                      .filter((s) => s.id !== editingId && s.enabled !== false)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.id} ({s.type})
                        </option>
                      ))}
                  </Select>
                  <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                    {t('dnsServersTab.domainResolverRequired')}
                  </p>
                </div>
              )}

              {needsServerField && (
                <>
                  {/* 出站字段：只有 selector_out 或不选 */}
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.detourLabel')}</label>
                    <Select
                      value={form.detour || ''}
                      onChange={(e) => setForm((f) => ({ ...f, detour: e.target.value }))}
                      className="w-full"
                    >
                      <option value="">{t('dnsServersTab.detourDirect')}</option>
                      <option value="selector_out">{t('dnsServersTab.detourProxy')}</option>
                    </Select>
                    <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                      {t('dnsServersTab.detourOptionalHint')}
                    </p>
                  </div>
                  {/* 订阅出站节点 */}
                  <OutboundSelector
                    value={form.preferred_detour || null}
                    onChange={(tag) => setForm((f) => ({ ...f, preferred_detour: tag || '' }))}
                    label={t('dnsServersTab.preferredOutbound')}
                    placeholder={t('dnsServersTab.preferredOutboundPlaceholder')}
                    hint={t('dnsServersTab.preferredOutboundHint')}
                    filterDirectBlock={true}
                  />
                </>
              )}

              {form.type === 'local' && (
                <div>
                  <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">{t('dnsServersTab.resolverMode')}</label>
                  <Select
                    value={form.prefer_go ? 'true' : 'false'}
                    onChange={(e) => setForm((f) => ({ ...f, prefer_go: e.target.value === 'true' }))}
                    className="w-full"
                  >
                    <option value="false">{t('dnsServersTab.resolverSystem')}</option>
                    <option value="true">{t('dnsServersTab.resolverGo')}</option>
                  </Select>
                  <p className="text-[11px] text-[var(--app-text-quaternary)] mt-1">
                    {t('dnsServersTab.resolverGoHint')}
                  </p>
                </div>
              )}

              {form.type === 'raw' && (
                <JsonEditor
                  value={rawJsonText}
                  onChange={setRawJsonText}
                  placeholder={t('dnsServersTab.rawEditorPlaceholder')}
                  rows={12}
                  hint={t('dnsServersTab.rawHint')}
                  onFormatError={(err) => {
                    setErrorMessage(err);
                    setErrorModalOpen(true);
                  }}
                />
              )}
            </div>
            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSubmit}>{t('common.save')}</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DNS 服务设置弹窗 */}
      {dnsSettingsModalOpen && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDnsSettingsModalOpen(false)} />
          <div
            className="relative z-10 w-full max-w-sm flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
              <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                {t('dnsServersTab.serviceLabel')}
              </h2>
              <button
                type="button"
                onClick={() => setDnsSettingsModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Content */}
            <DnsServiceSettingsForm
              initialEnabled={dnsServerEnabled}
              initialPort={dnsPort}
              initialProxyPort={dnsProxyPort}
              onSave={handleSaveDnsSettings}
              onCancel={() => setDnsSettingsModalOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* 错误弹窗 */}
      {errorModalOpen && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setErrorModalOpen(false)} />
          <div
            className="relative z-10 w-full max-w-md flex flex-col bg-[var(--app-panel)] border border-[var(--app-stroke)] rounded-[20px] shadow-[var(--shadow-elevated)] overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/50">
              <h2 className="text-[15px] font-semibold text-[var(--app-text)]">
                {t('dnsServersTab.errorModalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setErrorModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-tertiary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] transition-colors -mr-2"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--app-danger)] shrink-0 mt-0.5" />
                <p className="text-[14px] text-[var(--app-text-secondary)] whitespace-pre-line">{errorMessage}</p>
              </div>
            </div>
            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4 border-t border-[var(--app-divider)] bg-[var(--app-bg-secondary)]/30">
              <Button onClick={() => setErrorModalOpen(false)}>{t('dnsServersTab.ok')}</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>,
    document.body
  );
}
