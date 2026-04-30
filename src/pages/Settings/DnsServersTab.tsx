/**
 * DNS 服务器管理
 * 基于 sing-box DNS Server 配置：https://sing-box.sagernet.org/configuration/dns/server/
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Select } from '../../components/ui/Field';

import { Modal } from '../../components/ui/Modal';
import { Plus, Check, AlertCircle, Star, Server, MoreVertical } from 'lucide-react';
import { OutboundSelector } from '../../components/OutboundSelector';
import { JsonEditor } from '../../components/JsonEditor';
import { cn } from '../../lib/utils';
import { PolicyListTable, type ColumnDef } from '../../components/PolicyListTable';
import { DnsServerRowDropdown } from './DnsServerRowDropdown';

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
        serverData.is_default = originalServer.is_default;
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
    await window.ipcRenderer.db.toggleDnsServerEnabled(s.id, newEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
    await onRegenerateConfig?.();
  };

  const handleSetDefault = async (s: any) => {
    await window.ipcRenderer.db.setDefaultDnsServer(s.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadDnsServers();
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
          <span className="policy-type-badge">
            {s.type}
          </span>
        );
      case 'address':
        return (
          <span className="text-[12px] text-[var(--app-text-tertiary)] truncate block">
            {s.raw_data ? null : s.server ? (
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
            <span className="policy-chip" title={s.detour ? t('dnsServersTab.detourProxy') : t('dnsServersTab.detourDirect')}>
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
    <DnsServerRowDropdown
      server={s}
      position={position}
      onEdit={(srv) => { close(); openEditModal(srv); }}
      onDelete={(srv) => { close(); handleDelete(srv); }}
    />
  );

  // 自定义操作列（设为默认按钮 + 更多菜单按钮）
  const renderActions = (s: any, _index: number, dropdownButtonRef: (el: HTMLButtonElement | null) => void, onOpenDropdown: (e: React.MouseEvent, itemId: string) => void) => {
    const isDefault = s.is_default === true;
    const isDisabled = s.enabled === false;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleSetDefault(s)}
          aria-label={t('dnsServersTab.setDefault')}
          title={isDefault ? t('dnsServersTab.isDefault') : t('dnsServersTab.setDefault')}
          disabled={isDefault || isDisabled}
          className={cn(
            "h-7 w-7",
            isDefault && "text-[var(--app-accent)]"
          )}
        >
          <Star className={cn(
            "w-3.5 h-3.5",
            isDefault ? "text-[var(--app-accent)] fill-[var(--app-accent)]" : "text-[var(--app-text-tertiary)]"
          )} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          ref={dropdownButtonRef}
          onClick={(e) => onOpenDropdown(e, s.id)}
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PolicyListTable<any>
        items={tableItems}
        columns={columns}
        renderCell={renderCell}
        searchFields={searchFields}
        searchPlaceholder={t('dnsServersTab.searchPlaceholder')}
        statsLineKey="dnsServersTab.statsLine"
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
          <AlertCircle className="w-5 h-5 text-[var(--app-danger)] shrink-0 mt-0.5" />
          <p className="text-[14px] text-[var(--app-text-secondary)] whitespace-pre-line">{errorMessage}</p>
        </div>
      </Modal>
    </div>
  );
}
