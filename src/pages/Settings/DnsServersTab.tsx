/**
 * DNS 服务器管理
 * 基于 sing-box DNS Server 配置：https://sing-box.sagernet.org/configuration/dns/server/
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  /** 是否为默认DNS服务器 */
  is_default?: boolean;
  [key: string]: unknown;
}

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
  const { t } = useTranslation();
  const dnsServerTypeOptions = useMemo(
    () =>
      [
        { value: 'local' as const, label: t('dnsServersTab.typeLocal') },
        { value: 'udp' as const, label: t('dnsServersTab.typeUdp') },
        { value: 'tls' as const, label: t('dnsServersTab.typeTls') },
        { value: 'https' as const, label: t('dnsServersTab.typeHttps') },
        { value: 'raw' as const, label: t('dnsServersTab.typeRaw') },
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
    return '';
  };

  const buildServerFromForm = () => {
    const type = (form.type || 'udp') as DnsServerType;
    // 构建完整的服务器对象，只包含当前类型需要的字段
    // 注意：不提交 id/enabled/is_default，这些由后端控制或保持不变
    const server: Record<string, unknown> = {
      type,
      name: form.name?.trim() || '',
    };
    if (type === 'raw') {
      // raw 类型直接保存原始 JSON
      try {
        const rawData = JSON.parse(rawJsonText);
        server.raw_data = rawData;
        // 从 raw_data 中提取 type（不提取 id，id 由后端控制）
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
      name: '',
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
      name: s.name || '',
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
      // 编辑时，从原始服务器获取 id、enabled、is_default
      const originalServer = dnsServers.find((s) => s.id === editingId);
      if (originalServer) {
        serverData.id = originalServer.id;
        serverData.enabled = originalServer.enabled;
        serverData.is_default = originalServer.is_default;
      }
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
      case 'dns': return t('dnsServersTab.refTypeDns');
      case 'route': return t('dnsServersTab.refTypeRoute');
      case 'dns_server': return t('dnsServersTab.refTypeDnsServer');
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
              {t('dnsServersTab.title')}
            </h2>
            <p className="text-[12px] text-[var(--app-text-quaternary)] mt-1">
              {t('dnsServersTab.subtitle')}{' '}
              <a
                href="https://sing-box.sagernet.org/configuration/dns/server/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--app-accent)] hover:underline"
              >
                {t('dnsServersTab.docLink')}
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                <Check className="w-3.5 h-3.5" />
                {t('dnsServersTab.saved')}
              </span>
            )}
            <Button variant="primary" size="sm" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-1.5" />
              {t('dnsServersTab.addServer')}
            </Button>
          </div>
        </SectionHeader>
        <div className="panel-section overflow-x-auto">
          {dnsServers.length === 0 ? (
            <div className="py-12 text-center text-[var(--app-text-tertiary)] text-[13px]">
              {t('dnsServersTab.emptyHint')}
            </div>
          ) : (
            <table className="data-table w-full">
              <thead className="border-b border-[rgba(39,44,54,0.08)]">
                <tr className="h-9">
                  <th className="w-12 shrink-0 pl-4 pr-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colIndex')}</th>
                  <th className="w-[72px] shrink-0 px-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colType')}</th>
                    <th className="min-w-[100px] px-2 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colName')}</th>
                  <th className="min-w-[140px] px-2 py-1.5 text-left text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colAddress')}</th>
                  <th className="w-[60px] shrink-0 px-2 py-1.5 text-center text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colDetour')}</th>
                  <th className="w-[140px] shrink-0 pl-2 pr-4 py-1.5 text-right text-[11px] font-medium text-[var(--app-text-quaternary)]">{t('dnsServersTab.colActions')}</th>
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
                        <span className={`text-[13px] font-medium truncate ${s.enabled === false ? 'text-[var(--app-text-tertiary)] line-through' : 'text-[var(--app-text)]'}`}>
                          {s.name || s.id}
                        </span>
                        {s.is_default && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                            <CircleDot className="w-3 h-3 fill-emerald-600" />
                            {t('dnsServersTab.defaultBadge')}
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
                        {s.detour ? t('dnsServersTab.detourProxy') : t('dnsServersTab.detourDirect')}
                      </span>
                    </td>
                    <td className="w-[140px] shrink-0 pl-2 pr-4 py-1.5 text-right align-middle">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleEnabled(s)}
                          aria-label={s.enabled === false ? t('dnsServersTab.enable') : t('dnsServersTab.disable')}
                          title={s.enabled === false ? t('dnsServersTab.enable') : t('dnsServersTab.disable')}
                        >
                          <Power className={`w-4 h-4 ${s.enabled === false ? 'text-[var(--app-text-quaternary)]' : 'text-green-600'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSetDefault(s)}
                          aria-label={t('dnsServersTab.setDefault')}
                          title={t('dnsServersTab.setDefault')}
                          disabled={s.is_default === true || s.enabled === false}
                        >
                          <CircleDot className={`w-4 h-4 ${s.is_default ? 'text-emerald-600 fill-emerald-600' : 'text-[var(--app-text-tertiary)]'}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(s)} aria-label={t('dnsServersTab.edit')}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} aria-label={t('dnsServersTab.delete')}>
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
        title={editingId ? t('dnsServersTab.modalEditTitle') : t('dnsServersTab.modalAddTitle')}
        maxWidth="max-w-md"
        contentClassName="p-5"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
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
                  is_default: false,
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

          {needsDomainResolver && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--app-text-secondary)] mb-1.5">
                {t('dnsServersTab.domainResolver')} <span className="text-red-500">*</span>
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
      </Modal>

      {/* 错误弹窗 */}
      <Modal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        title={t('dnsServersTab.errorModalTitle')}
        maxWidth="max-w-md"
        contentClassName="p-5"
        footer={<Button onClick={() => setErrorModalOpen(false)}>{t('dnsServersTab.ok')}</Button>}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[14px] text-[var(--app-text-secondary)] whitespace-pre-line">{errorMessage}</p>
        </div>
      </Modal>
    </div>
  );
}
